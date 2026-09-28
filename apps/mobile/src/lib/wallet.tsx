"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import { isolate } from "@bg/i18n";
import type { LedgerRow, WalletSummary, Withdrawal } from "@bg/protocol";
import { useToast } from "@/components/feedback/Toast";
import { useSession } from "./session";
import { readJson, writeJson } from "./storage";
import { useFormat } from "./useFormat";

// Wallet summary shared by the balance chip, the account hub, and the wallet screens
// (wallet.md §3.1, §3.8). Server values only: nothing here computes a balance.
//
// Refresh triggers: sign-in, the app regaining focus, the connection coming back, and explicit
// calls after a flow (no polling timer). The last summary is cached per tab so offline screens
// stay readable with "Last updated".
//
// Notices (§3.8): the newest ledger id the user has seen is kept per account. When a refresh shows
// that `balance` or `locked` changed, the first ledger page is compared with it: one incoming
// transfer, a support top-up, or a withdrawal refund gets its own snackbar; several get one
// "{count} new transactions". Snackbars wait while a task flow or a match is on screen.
// Withdrawal decisions: requests last seen as pending that are now paid or rejected mark the
// Account tab with a dot until their detail screen is opened.

interface Cache {
  userId: number;
  summary: WalletSummary;
  at: number;
}

interface Tracking {
  pending: number[];
  updated: number[];
}

const CACHE_KEY = "bg.wallet.cache";
const seenKey = (userId: number) => `bg.wallet.lastSeenLedgerId.${userId}`;
const trackKey = (userId: number) => `bg.wallet.withdrawals.${userId}`;

/** Routes where snackbars must wait (P§1): task flows and matches. */
function isQuietRoute(pathname: string): boolean {
  return /^\/(wallet\/transfer|wallet\/withdraw(?!als)|match|signup|login|password)(\/|$)/.test(pathname);
}

type Notice = { message: string; href: string };

interface WalletValue {
  summary: WalletSummary | null;
  /** Epoch ms of the last successful read. */
  updatedAt: number | null;
  /** The last read failed (network or server); `summary` may still hold cached values. */
  failed: boolean;
  refresh: () => Promise<WalletSummary | null>;
  /** After a transfer: the server's new balance, until the next refresh. */
  setBalance: (balance: number) => void;
  /** WA-01 rendered these rows: they are no longer "new". */
  markLedgerSeen: (rows: LedgerRow[]) => void;
  /** Withdrawal ids whose status changed since last seen as pending (Account-tab dot). */
  withdrawalUpdates: number[];
  markWithdrawalSeen: (id: number) => void;
  /** Feed a loaded withdrawals page into the pending → decided tracking. */
  noteWithdrawals: (rows: Withdrawal[]) => void;
}

const WalletContext = createContext<WalletValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { status, me, handleAuthError } = useSession();
  const t = useTranslations();
  const f = useFormat();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const userId = status === "user" ? (me?.id ?? null) : null;

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [updates, setUpdates] = useState<number[]>([]);
  const [queued, setQueued] = useState<Notice[]>([]);
  const previous = useRef<WalletSummary | null>(null);
  const inFlight = useRef<Promise<WalletSummary | null> | null>(null);

  // Restore the cached summary for this account (offline readability) and the dot state.
  useEffect(() => {
    if (userId === null) {
      setSummary(null);
      setUpdatedAt(null);
      previous.current = null;
      setUpdates([]);
      return;
    }
    const cache = readJson<Cache>("session", CACHE_KEY);
    if (cache && cache.userId === userId) {
      setSummary(cache.summary);
      setUpdatedAt(cache.at);
    }
    setUpdates(readJson<Tracking>("local", trackKey(userId))?.updated ?? []);
  }, [userId]);

  const noteWithdrawals = useCallback(
    (rows: Withdrawal[]) => {
      if (userId === null) return;
      const stored = readJson<Tracking>("local", trackKey(userId)) ?? { pending: [], updated: [] };
      const byId = new Map(rows.map((w) => [w.id, w]));
      const decided = stored.pending.filter((id) => {
        const w = byId.get(id);
        return w && (w.status === "paid" || w.status === "rejected");
      });
      const stillListed = stored.pending.filter((id) => !byId.has(id));
      const next: Tracking = {
        pending: [...new Set([...stillListed, ...rows.filter((w) => w.status === "pending").map((w) => w.id)])],
        updated: [...new Set([...stored.updated, ...decided])],
      };
      writeJson("local", trackKey(userId), next);
      setUpdates(next.updated);
    },
    [userId],
  );

  const markWithdrawalSeen = useCallback(
    (id: number) => {
      if (userId === null) return;
      const stored = readJson<Tracking>("local", trackKey(userId));
      if (!stored?.updated.includes(id)) return;
      const next = { ...stored, updated: stored.updated.filter((x) => x !== id) };
      writeJson("local", trackKey(userId), next);
      setUpdates(next.updated);
    },
    [userId],
  );

  const markLedgerSeen = useCallback(
    (rows: LedgerRow[]) => {
      if (userId === null || rows.length === 0) return;
      const newest = Math.max(...rows.map((r) => r.id));
      const stored = readJson<number>("local", seenKey(userId)) ?? 0;
      if (newest > stored) writeJson("local", seenKey(userId), newest);
    },
    [userId],
  );

  /** §3.8 step 2: rows newer than the last seen id → at most one snackbar. */
  const checkNotices = useCallback(async () => {
    if (userId === null) return;
    const stored = readJson<number>("local", seenKey(userId));
    let rows: LedgerRow[];
    try {
      rows = (await api.wallet.ledger()).results;
    } catch {
      return;
    }
    if (rows.length === 0) return;
    const newest = Math.max(...rows.map((r) => r.id));
    writeJson("local", seenKey(userId), Math.max(newest, stored ?? 0));
    // First load for this account: only record, never announce old rows.
    if (stored === null) return;
    const fresh = rows.filter(
      (r) =>
        r.id > stored &&
        ((r.type === "transfer" && r.amount > 0) || r.type === "admin_topup" || r.type === "withdrawal_refund"),
    );
    if (fresh.length === 0) return;
    let notice: Notice;
    if (fresh.length > 1) {
      notice = { message: t("wallet.notice.many", { count: fresh.length }), href: "/wallet" };
    } else {
      const r = fresh[0]!;
      const amount = f.number(Math.abs(r.amount));
      notice =
        r.type === "transfer"
          ? { message: t("wallet.notice.transferIn", { username: isolate(`@${r.counterparty ?? ""}`), amount }), href: `/wallet?tx=${r.id}` }
          : r.type === "admin_topup"
            ? { message: t("wallet.notice.topup", { amount }), href: `/wallet?tx=${r.id}` }
            : { message: t("wallet.notice.refund", { amount }), href: `/wallet?tx=${r.id}` };
    }
    setQueued((q) => [...q, notice]);
  }, [userId, t, f]);

  const refresh = useCallback(async () => {
    if (userId === null) return null;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const next = await api.wallet.get();
        const before = previous.current;
        previous.current = next;
        setSummary(next);
        setFailed(false);
        const at = Date.now();
        setUpdatedAt(at);
        writeJson("session", CACHE_KEY, { userId, summary: next, at } satisfies Cache);
        const moved = !before || before.balance !== next.balance || before.locked !== next.locked;
        if (moved) {
          void checkNotices();
          // A pending request may have been decided (the held coins changed).
          if (!before || before.locked !== next.locked) {
            api.wallet
              .withdrawals()
              .then((page) => noteWithdrawals(page.results))
              .catch(() => undefined);
          }
        }
        return next;
      } catch (error) {
        if (!handleAuthError(error)) setFailed(true);
        return null;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [userId, checkNotices, noteWithdrawals, handleAuthError]);

  const setBalance = useCallback((balance: number) => {
    setSummary((s) => (s ? { ...s, balance } : s));
    if (previous.current) previous.current = { ...previous.current, balance };
  }, []);

  // Sign-in, focus, and reconnect refreshes (§3.1 step 2).
  useEffect(() => {
    if (userId === null) return;
    void refresh();
    const onFocus = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, refresh]);

  // Show queued notices only on regular screens (§3.8 step 4).
  useEffect(() => {
    if (queued.length === 0 || isQuietRoute(pathname)) return;
    for (const notice of queued) {
      toast.show({ message: notice.message, action: { label: t("wallet.notice.view"), onClick: () => router.push(notice.href) } });
    }
    setQueued([]);
  }, [queued, pathname, toast, t, router]);

  const value = useMemo<WalletValue>(
    () => ({
      summary,
      updatedAt,
      failed,
      refresh,
      setBalance,
      markLedgerSeen,
      withdrawalUpdates: updates,
      markWithdrawalSeen,
      noteWithdrawals,
    }),
    [summary, updatedAt, failed, refresh, setBalance, markLedgerSeen, updates, markWithdrawalSeen, noteWithdrawals],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside <WalletProvider>");
  return value;
}
