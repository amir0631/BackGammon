// Display-side previews of server rules (match.md §3.4, §3.8, §3.12, §3.13, MA-19). The server
// decides every result (CLAUDE.md §2 rule 1); these mirror its rules so a screen can state the
// consequences before a tap. Shared by every surface (§2 rule 14).
import type { Clock, MatchRulesOut } from "@bg/protocol";
import { BAR, OFF, view, type Player, type Position } from "./position";
import { timeLeft, type MatchView } from "./store";

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

export interface ResignPreview {
  kind: LossKind;
  points: number | null;
  /** [yours, opponent's] after the resignation. */
  scoreAfter: [number, number];
  endsMatch: boolean;
}

/** What resigning the current game gives the opponent (§5.4: the full value, gammons and cube). */
export function resignPreview(v: MatchView, you: Player, rules: MatchRulesOut | null): ResignPreview {
  const kind = lossKind(v.position, you);
  const points = gamePoints(rules, kind, v.cubeValue);
  const oppAfter = v.score[1 - you]! + (points ?? 0);
  return { kind, points, scoreAfter: [v.score[you]!, oppAfter], endsMatch: oppAfter >= v.length };
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

/** Turn time first, then the time bank (§5.4), corrected for the server clock. */
export function readClock(clock: Clock, receivedAt: number, now: number): ClockReading {
  const remaining = timeLeft(clock, receivedAt, now);
  const actor = clock.actor;
  const turnMs = clock.turn_seconds * 1000;
  if (remaining === null || actor === null) return { actor: null, remaining: null, turnLeft: 0, bankLeft: 0, turnMs };
  const bankMs = (clock.bank[actor] ?? 0) * 1000;
  return {
    actor,
    remaining,
    turnLeft: Math.max(0, remaining - bankMs),
    bankLeft: Math.min(bankMs, remaining),
    turnMs,
  };
}

/** Checkers of `side` on point `p` in `numbering`'s numbering (25 = that side's bar). */
export function countAt(position: Position, side: Player, p: number, numbering: Player = side): number {
  if (p === BAR) return position.bar[side];
  const abs = numbering === 0 ? p : 25 - p;
  const v = position.board[abs - 1] ?? 0;
  return side === 0 ? Math.max(0, v) : Math.max(0, -v);
}

/** A point in the opponent's numbering seen in the viewer's: points mirror; bar and off stay. */
export function toViewerPoint(point: number): number {
  return point === BAR || point === OFF ? point : 25 - point;
}

/** Before the match's first roll: resigning cancels the match with refunds (§5.2). `turnsPlayed`
 * counts moves, passes and cube actions seen in this match. */
export function isBeforeFirstRoll(v: MatchView, turnsPlayed: number): boolean {
  return v.gameNo === 1 && v.phase === "opening" && !v.dice && v.results.length === 0 && turnsPlayed === 0;
}

/** MA-19: the match waits for a human opponent who hasn't joined yet (§5.2). */
export function isWaitingForOpponent(
  v: MatchView,
  opponent: { is_bot: boolean; connected: boolean } | null,
  turnsPlayed: number,
): boolean {
  return v.status === "active" && isBeforeFirstRoll(v, turnsPlayed) && !!opponent && !opponent.is_bot && !opponent.connected;
}
