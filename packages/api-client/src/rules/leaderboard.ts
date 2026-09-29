import type { Leaderboard } from "@bg/protocol";

// Leaderboard display rules shared by both apps (CLAUDE.md §2 rule 14; leaderboard.md §3).

export type LeaderboardScope = Leaderboard["scope"];
export const LEADERBOARD_SCOPES: readonly LeaderboardScope[] = ["all", "weekly", "monthly", "predict"];

/** A missing or unknown `?scope=` → `all` (leaderboard.md §3 step 1). */
export function parseScope(value: string | null): LeaderboardScope {
  return value && (LEADERBOARD_SCOPES as readonly string[]).includes(value) ? (value as LeaderboardScope) : "all";
}

export type MyRank =
  | { kind: "inList"; rank: number }
  | { kind: "outside"; rank: number; value: number }
  | { kind: "unrated" }
  | { kind: "noPeriod"; period: "weekly" | "monthly" }
  | { kind: "predict"; count: number | null; needed: number | null };

/**
 * The my-rank row (LB-01, leaderboard.md §3 step 4): highlighted in the list when in the top rows,
 * a sticky row with rank and value when outside, or the scope's reason when unranked.
 */
export function myRank(board: Leaderboard, username: string | null | undefined): MyRank {
  const me = board.me;
  if (board.scope === "predict") {
    if (me && me.rank !== null && me.value !== null) {
      return inList(board, username, me.rank) ? { kind: "inList", rank: me.rank } : { kind: "outside", rank: me.rank, value: me.value };
    }
    return { kind: "predict", count: me?.count ?? null, needed: me?.needed ?? null };
  }
  if (!me || me.rank === null || me.value === null) {
    return board.scope === "all" ? { kind: "unrated" } : { kind: "noPeriod", period: board.scope };
  }
  return inList(board, username, me.rank) ? { kind: "inList", rank: me.rank } : { kind: "outside", rank: me.rank, value: me.value };
}

function inList(board: Leaderboard, username: string | null | undefined, rank: number): boolean {
  const name = username?.toLowerCase();
  return board.results.some((r) => r.rank === rank || (name !== undefined && r.username?.toLowerCase() === name));
}

/** Weekly and monthly values are signed gains (leaderboard.md §4): "gained" / "lost" / none. */
export function gainDirection(value: number): "gained" | "lost" | "none" {
  return value > 0 ? "gained" : value < 0 ? "lost" : "none";
}

/** Each scope's result is reused for 60 s within the session (leaderboard.md §3 step 2). */
export const LEADERBOARD_CACHE_MS = 60_000;
