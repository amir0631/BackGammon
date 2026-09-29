"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  blockedReason,
  newIdempotencyKey,
  parseAmount,
  refusalReason,
  remainingStake,
  stakeProblem,
  type BlockedReason,
  type RefusalReason,
} from "@bg/api-client";
import type { MatchPool, PoolUpdateOut, PredictionRow } from "@bg/protocol";
import { toApiError } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { useWallet } from "@/lib/wallet";

// State of PR-01 … PR-03 for one match (predictions.md §3, live.md §3.4–§3.7). The spectator view
// owns one instance so entries survive closing the sheet, switching to PR-02, and back. Data:
// `GET predictions/pool/{match_id}` (totals, terms, blocked, own stakes), the `pool.update` event,
// and `GET me/predictions` for the result after the end. The only write is `POST predictions` with
// one Idempotency-Key per confirmation (kept for its retries and "Check status").

export type PredictStep = "panel" | "confirm" | "insufficient";

export type FieldProblem = { kind: "invalid" } | { kind: "overRemaining"; remaining: number } | { kind: "maxReached" } | null;

export interface PredictionFlow {
  enabled: boolean;
  /** undefined while loading; null when this match has no pool. */
  entry: MatchPool | null | undefined;
  totals: PoolUpdateOut | null;
  /** The viewer's stake rows on this match after the end (for PR-03); null until read. */
  rows: PredictionRow[] | null;
  own: { side: 0 | 1; total: number } | null;
  loadError: boolean;
  blocked: BlockedReason | null;
  /** A refusal from `POST` that switched the panel (nothing was charged). */
  refused: RefusalReason | null;
  suspended: boolean;
  remaining: number;
  balance: number | null;
  side: 0 | 1 | null;
  stakeText: string;
  stake: number | null;
  field: FieldProblem;
  step: PredictStep | null;
  inFlight: boolean;
  actionError: string | null;
  insufficientBalance: number | null;
  /** The pool closed while the user was entering a stake (no request in flight). */
  closedWhileEntering: boolean;
  /** After the match ended: still waiting for settlement past the 60 s budget. */
  resultPending: boolean;
  placed: { amount: number; side: 0 | 1 } | null;
  reload: () => void;
  applyPool: (p: PoolUpdateOut) => void;
  closeNow: () => void;
  chooseSide: (s: 0 | 1) => void;
  setStakeText: (v: string) => void;
  toContinue: () => void;
  confirm: () => Promise<void>;
  checkStatus: () => Promise<void>;
  back: () => void;
  changeStake: () => void;
  dismiss: () => void;
  openPanel: () => void;
}

export function usePredictionFlow({
  matchId,
  enabled,
  ended,
  errorText,
}: {
  matchId: string;
  enabled: boolean;
  ended: boolean;
  /** Localized text for an unexpected error code. */
  errorText: (code: string) => string;
}): PredictionFlow {
  const { me, reload: reloadMe } = useSession();
  const wallet = useWallet();
  const [entry, setEntry] = useState<MatchPool | null | undefined>(undefined);
  const [totals, setTotals] = useState<PoolUpdateOut | null>(null);
  const [rows, setRows] = useState<PredictionRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refused, setRefused] = useState<RefusalReason | null>(null);
  const [side, setSide] = useState<0 | 1 | null>(null);
  const [stakeText, setStakeTextRaw] = useState("");
  const [field, setField] = useState<FieldProblem>(null);
  const [step, setStep] = useState<PredictStep | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState<number | null>(null);
  const [closedWhileEntering, setClosedWhileEntering] = useState(false);
  const [resultPending, setResultPending] = useState(false);
  const [placed, setPlaced] = useState<{ amount: number; side: 0 | 1 } | null>(null);
  const keyRef = useRef<string | null>(null);

  const readMine = useCallback(async () => {
    const page = await api.predictions.mine();
    const mine = page.results.filter((r) => r.match_id === matchId);
    setRows(mine);
    return mine;
  }, [matchId]);

  const readPool = useCallback(async (): Promise<MatchPool | null> => {
    try {
      const p = await api.predictions.pool(matchId);
      setEntry(p);
      setTotals({ total_a: p.total_a, total_b: p.total_b, open: p.open });
      return p;
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "PREDICTION_REFUSED" && err.details.reason === "no_pool") {
        setEntry(null);
        return null;
      }
      throw e;
    }
  }, [matchId]);

  const reload = useCallback(() => {
    if (!enabled) return;
    setLoadError(false);
    readPool().catch(() => setLoadError(true));
  }, [enabled, readPool]);
  useEffect(reload, [reload]);

  const mineStakes = entry?.mine ?? [];
  const own = mineStakes.length ? { side: mineStakes[0]!.side, total: mineStakes.reduce((s, m) => s + m.amount, 0) } : null;

  // The viewer's side is the only one allowed once they have a stake (live.md §3.5 step 1.3).
  useEffect(() => {
    if (own) setSide(own.side);
  }, [own?.side]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = Boolean(totals?.open) && !ended;
  const markClosed = useCallback(() => {
    setTotals((x) => (x ? { ...x, open: false } : x));
    if (!inFlight && (step === "panel" || step === "confirm")) setClosedWhileEntering(true);
  }, [inFlight, step]);

  const applyPool = useCallback(
    (p: PoolUpdateOut) => {
      setTotals(p);
      if (!p.open) markClosed();
    },
    [markClosed],
  );

  // Results (live.md §3.6): re-read after the end; poll every 5 s for up to 60 s while unsettled.
  useEffect(() => {
    if (!ended || !enabled) return;
    let tries = 0;
    let timer = 0;
    const tick = () => {
      void readMine()
        .then((mine) => {
          const waiting = mine.some((r) => r.pool_status === "open" || r.pool_status === "closed");
          if (waiting && tries < 12) {
            tries += 1;
            timer = window.setTimeout(tick, 5000);
          } else setResultPending(waiting);
        })
        .catch(() => undefined);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [ended, enabled, readMine]);

  const balance = wallet.summary?.balance ?? null;
  const maxPer = entry?.max_stake_per_user ?? 0;
  const remaining = remainingStake(maxPer, own?.total ?? 0);
  const parsed = parseAmount(stakeText);
  const stake = typeof parsed === "number" ? parsed : null;

  const setStakeText = (v: string) => {
    setStakeTextRaw(v);
    setField(null);
    setActionError(null);
  };

  const toContinue = () => {
    if (side === null) return;
    const p = stakeProblem(stakeText, remaining, balance);
    if (!p) {
      keyRef.current = newIdempotencyKey();
      setActionError(null);
      setStep("confirm");
      return;
    }
    if (p.kind === "invalid") setField({ kind: "invalid" });
    else if (p.kind === "overRemaining") setField(remaining > 0 ? { kind: "overRemaining", remaining } : { kind: "maxReached" });
    else if (p.kind === "insufficient") {
      setInsufficientBalance(p.balance);
      setStep("insufficient");
    }
  };

  const succeed = (placedSide: 0 | 1, amount: number) => {
    setEntry((p) => (p ? { ...p, mine: [...p.mine, { side: placedSide, amount, payout: null }] } : p));
    setPlaced({ amount, side: placedSide });
    setStakeTextRaw("");
    setStep("panel");
    keyRef.current = null;
    void wallet.refresh();
  };

  const confirm = async () => {
    if (inFlight || side === null || stake === null) return;
    keyRef.current ??= newIdempotencyKey();
    setInFlight(true);
    setActionError(null);
    try {
      const row = await api.predictions.place(matchId, side, stake, keyRef.current);
      succeed(row.side, row.amount);
      void readPool().catch(() => undefined);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "PREDICTION_REFUSED") {
        const reason = refusalReason(err.details);
        keyRef.current = null;
        if (reason === "max_stake") {
          const left = typeof err.details.remaining === "number" ? err.details.remaining : 0;
          setField(left > 0 ? { kind: "overRemaining", remaining: left } : { kind: "maxReached" });
          setStep("panel");
          void readPool().catch(() => undefined);
        } else if (reason === "other_side") {
          setRefused("other_side");
          setStep("panel");
          void readPool().catch(() => undefined);
        } else if (reason === "pool_full") {
          setRefused("pool_full");
          setActionError("pool_full");
        } else if (reason === "closed") {
          setTotals((x) => (x ? { ...x, open: false } : x));
          setRefused("closed");
          setActionError("closed");
        } else {
          setRefused(reason);
          setStep("panel");
        }
      } else if (err.code === "WALLET_INSUFFICIENT") {
        keyRef.current = null;
        setInsufficientBalance(typeof err.details.balance === "number" ? err.details.balance : balance);
        void wallet.refresh();
        setStep("insufficient");
      } else if (err.code === "ACCOUNT_SUSPENDED") {
        keyRef.current = null;
        setStep("panel");
        void reloadMe();
      } else if (err.code === "AMOUNT_INVALID") {
        keyRef.current = null;
        setField({ kind: "invalid" });
        setStep("panel");
      } else if (err.code === "NETWORK") {
        // Keep the key: "Check status" or a retry must not charge twice.
        setActionError("network");
      } else {
        keyRef.current = null;
        setActionError(errorText(err.code));
      }
    } finally {
      setInFlight(false);
    }
  };

  /** "Check status" (live.md §3.5 step 5): the own total grew by this stake → done; else the same key again. */
  const checkStatus = async () => {
    if (stake === null || side === null) return;
    const before = own?.total ?? 0;
    try {
      const p = await api.predictions.pool(matchId);
      const after = p.mine.reduce((s, m) => s + m.amount, 0);
      if (after >= before + stake) {
        setInFlight(false);
        setEntry(p);
        setTotals({ total_a: p.total_a, total_b: p.total_b, open: p.open });
        setPlaced({ amount: stake, side });
        setStakeTextRaw("");
        setStep("panel");
        keyRef.current = null;
        void wallet.refresh();
      } else {
        await confirm();
      }
    } catch {
      setActionError("network");
    }
  };

  const suspended = me?.status === "suspended";
  const blocked = entry ? blockedReason(entry.blocked) : null;

  return {
    enabled,
    entry,
    totals,
    rows,
    own,
    loadError,
    blocked,
    refused,
    suspended,
    remaining,
    balance,
    side,
    stakeText,
    stake,
    field,
    step,
    inFlight,
    actionError,
    insufficientBalance,
    closedWhileEntering: closedWhileEntering && !open,
    resultPending,
    placed,
    reload,
    applyPool,
    closeNow: markClosed,
    chooseSide: (s) => {
      if (own && own.side !== s) return;
      setSide(s);
      setActionError(null);
    },
    setStakeText,
    toContinue,
    confirm,
    checkStatus,
    back: () => {
      if (inFlight) return;
      setActionError(null);
      setStep("panel");
    },
    changeStake: () => {
      setStakeTextRaw("");
      setField(null);
      setStep("panel");
    },
    dismiss: () => {
      if (inFlight) return;
      setStep(null);
      setPlaced(null);
    },
    openPanel: () => {
      setClosedWhileEntering(false);
      setStep("panel");
    },
  };
}
