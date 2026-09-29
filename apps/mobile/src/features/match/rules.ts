// Display-only previews for the match screen (match.md §3.4, §3.8, §3.13). The server decides
// every result; these mirror its rules so the sheets can state the consequences before the tap.
import { timeLeft, view, BAR, OFF, type Player, type Position } from "@bg/game-core";
import type { Clock, MatchRulesOut } from "@bg/protocol";

export type LossKind = "single" | "gammon" | "backgammon";

/** The engine's `loss_kind` for `loser` if the game ended now. */
export function lossKind(position: Position, loser: Player): LossKind {
  const v = view(position, loser);
  if (v.mine[OFF]! > 0) return "single";
  if (v.mine[BAR]! > 0) return "backgammon";
  for (let p = 19; p <= 24; p++) if (v.mine[p]! > 0) return "backgammon"; // the winner's home board
  return "gammon";
}

/** Points for a game of `kind` at cube value `cube` under the match's point table. */
export function gamePoints(rules: MatchRulesOut | null, kind: LossKind, cube: number): number | null {
  const base = rules?.points[kind];
  return typeof base === "number" ? base * cube : null;
}

export interface ClockReading {
  /** Whose clock runs, or null (forced move, pass, between games, opening). */
  actor: number | null;
  /** Milliseconds left in the whole turn (turn time + bank). */
  remaining: number | null;
  turnLeft: number;
  bankLeft: number;
  /** The per-turn allowance in ms (for the ring). */
  turnMs: number;
}

/** Turn time first, then the time bank (§3.4), corrected for the server clock. */
export function readClock(clock: Clock, receivedAt: number, now: number): ClockReading {
  const remaining = timeLeft(clock, receivedAt, now);
  const actor = clock.actor;
  const bankMs = actor === null ? 0 : (clock.bank[actor] ?? 0) * 1000;
  if (remaining === null || actor === null) {
    return { actor: null, remaining: null, turnLeft: 0, bankLeft: 0, turnMs: clock.turn_seconds * 1000 };
  }
  return {
    actor,
    remaining,
    turnLeft: Math.max(0, remaining - bankMs),
    bankLeft: Math.min(bankMs, remaining),
    turnMs: clock.turn_seconds * 1000,
  };
}
