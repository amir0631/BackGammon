import type { OpenPool, PredictionRow } from "@bg/protocol";
import { parseAmount } from "./wallet";

// Prediction rules shared by both apps (CLAUDE.md §2 rule 14, §7.5; predictions.md §3, live.md
// §3.4–§3.9). Display only: the server validates every stake and settles every pool.

export type BlockedReason = "player" | "review" | "linked" | "referral";

/** `OpenPool.blocked` with unknown values treated as `linked` (predictions.md §3.5). */
export function blockedReason(value: OpenPool["blocked"] | string | null | undefined): BlockedReason | null {
  if (value === null || value === undefined) return null;
  return value === "player" || value === "review" || value === "referral" ? value : "linked";
}

export type RefusalReason = "closed" | "player" | "review" | "linked" | "referral" | "other_side" | "max_stake" | "pool_full";

/** `PREDICTION_REFUSED {reason}` → the panel state it switches to (predictions.md §3.1). */
export function refusalReason(details: Record<string, unknown> | undefined): RefusalReason {
  const r = details?.reason;
  const known: RefusalReason[] = ["closed", "player", "review", "linked", "referral", "other_side", "max_stake", "pool_full"];
  return typeof r === "string" && (known as string[]).includes(r) ? (r as RefusalReason) : "linked";
}

/** The viewer's own stakes on one match: side and total (stakes are always on one side). */
export function ownStake(rows: readonly PredictionRow[], matchId: string): { side: 0 | 1; total: number } | null {
  const mine = rows.filter((r) => r.match_id === matchId);
  if (mine.length === 0) return null;
  return { side: mine[0]!.side, total: mine.reduce((s, r) => s + r.amount, 0) };
}

/** Coins the viewer may still add on this match. */
export function remainingStake(maxPerUser: number, own: number): number {
  return Math.max(0, maxPerUser - own);
}

/** Quick picks at 10%, 25%, and 50% of the per-user cap, rounded down; only those ≤ remaining and ≥ 1. */
export function quickPicks(maxPerUser: number, remaining: number): number[] {
  const out: number[] = [];
  for (const pct of [10, 25, 50]) {
    const v = Math.floor((maxPerUser * pct) / 100);
    if (v >= 1 && v <= remaining && !out.includes(v)) out.push(v);
  }
  return out;
}

export type StakeProblem = { kind: "empty" } | { kind: "invalid" } | { kind: "overRemaining"; remaining: number } | { kind: "insufficient"; balance: number };

/** Client checks before Continue (live.md §3.5 step 2); `insufficient` opens the PL-05 sheet. */
export function stakeProblem(value: string, remaining: number, balance: number | null): StakeProblem | null {
  const n = parseAmount(value);
  if (n === "empty") return { kind: "empty" };
  if (n === "invalid") return { kind: "invalid" };
  if (n > remaining) return { kind: "overRemaining", remaining };
  if (balance !== null && n > balance) return { kind: "insufficient", balance };
  return null;
}

export interface EstimateInput {
  totalA: number;
  totalB: number;
  side: 0 | 1;
  /** The viewer's existing stake on `side`. */
  own: number;
  /** The new stake. */
  stake: number;
  /** The pool's fee percent; null when the server doesn't expose it (predictions.md §10 Q2). */
  rakePct: number | null;
}

export type Estimate =
  | { kind: "oneSided" }
  | { kind: "unknown" }
  | { kind: "ok"; estimate: number; total: number }
  | { kind: "belowStake"; estimate: number; total: number }
  | { kind: "zero"; total: number };

/**
 * live.md §3.5 step 3 with predictions.md §3.2: `pool' = a + b + s`, `rake' = floor(pool' × pct / 100)`,
 * `estimate = floor((own + s) × (pool' − rake') / (side + s))`. Integers only. The other side empty →
 * every stake would be refunded. An unknown fee → no estimate (never guess the fee).
 */
export function estimatePayout(i: EstimateInput): Estimate {
  const other = i.side === 0 ? i.totalB : i.totalA;
  const sideTotal = i.side === 0 ? i.totalA : i.totalB;
  if (other === 0) return { kind: "oneSided" };
  if (i.rakePct === null || i.stake <= 0) return { kind: "unknown" };
  const pool = i.totalA + i.totalB + i.stake;
  const rake = Math.floor((pool * i.rakePct) / 100);
  const total = i.own + i.stake;
  const estimate = Math.floor((total * (pool - rake)) / (sideTotal + i.stake));
  if (estimate === 0) return { kind: "zero", total };
  if (estimate < total) return { kind: "belowStake", estimate, total };
  return { kind: "ok", estimate, total };
}

export type OutcomeKind = "open" | "closed" | "held" | "won" | "wonLess" | "wonZero" | "lost" | "refunded";

export interface Outcome {
  kind: OutcomeKind;
  side: 0 | 1;
  /** Total staked on this match. */
  stake: number;
  /** Total paid back (settled or refunded), or null while unknown. */
  payout: number | null;
  /** payout − stake for settled matches; 0 for refunds; null otherwise. */
  net: number | null;
}

/**
 * One outcome per match from all its stakes (predictions.md §3.3): the winner and the side decide
 * won / not won, never `payout > 0`. `winnerSide` falls back to the rows' `winner_side`.
 */
export function predictionOutcome(rows: readonly PredictionRow[], winnerSide?: 0 | 1 | null): Outcome {
  const first = rows[0]!;
  const side = first.side;
  const stake = rows.reduce((s, r) => s + r.amount, 0);
  const statuses = rows.map((r) => r.pool_status);
  const status = statuses.includes("held") ? "held" : statuses.includes("open") ? "open" : statuses.includes("closed") ? "closed" : first.pool_status;
  const winner = winnerSide ?? rows.find((r) => r.winner_side !== null && r.winner_side !== undefined)?.winner_side ?? null;
  const payout = rows.every((r) => r.payout !== null) ? rows.reduce((s, r) => s + (r.payout ?? 0), 0) : null;
  if (status === "open" || status === "closed" || status === "held") return { kind: status, side, stake, payout: null, net: null };
  if (status === "refunded") return { kind: "refunded", side, stake, payout: payout ?? stake, net: 0 };
  const paid = payout ?? 0;
  const won = winner !== null ? winner === side : paid > 0;
  if (!won) return { kind: "lost", side, stake, payout: paid, net: paid - stake };
  if (paid === 0) return { kind: "wonZero", side, stake, payout: 0, net: -stake };
  if (paid < stake) return { kind: "wonLess", side, stake, payout: paid, net: paid - stake };
  return { kind: "won", side, stake, payout: paid, net: paid - stake };
}

export interface PredictionGroup {
  matchId: string;
  rows: PredictionRow[];
  /** The first (oldest) stake's time. */
  firstAt: string;
}

/** PR-04 (predictions.md §3.4 step 1): one group per match, in first-seen (newest-first) order. */
export function groupPredictions(rows: readonly PredictionRow[]): PredictionGroup[] {
  const map = new Map<string, PredictionRow[]>();
  for (const r of rows) {
    const list = map.get(r.match_id);
    if (list) list.push(r);
    else map.set(r.match_id, [r]);
  }
  return [...map.entries()].map(([matchId, list]) => ({
    matchId,
    rows: list,
    firstAt: list.reduce((min, r) => (r.created_at < min ? r.created_at : min), list[0]!.created_at),
  }));
}
