// Client-side match state (CLAUDE.md §4 game-core). Built from a full `match.state` and kept current by
// applying server events in seq order. Nothing here decides dice, moves, timers, or results
// (CLAUDE.md §2 rule 1): positions, dice, and clocks come from the server.
import type {
  Clock,
  GameResultOut,
  MatchStateOut,
  PlayerInfo,
  ServerEnvelope,
} from "@bg/protocol";
import { type Player, type Position, decode } from "./position";

export type Phase = MatchStateOut["phase"];

export interface MatchView {
  matchId: string;
  seq: number;
  status: MatchStateOut["status"];
  you: Player | null;
  players: PlayerInfo[];
  variant: string;
  length: number;
  entry: number;
  seedCommit: string;
  score: [number, number];
  gameNo: number;
  crawford: boolean;
  phase: Phase;
  position: Position;
  turn: Player | null;
  dice: [number, number] | null;
  /** Whose dice the last roll was (null for the opening roll, one die each). */
  opening: boolean;
  throwSeed: number | null;
  cubeValue: number;
  cubeOwner: Player | null;
  legal: number[][][];
  clock: Clock;
  timeouts: [number, number];
  results: GameResultOut[];
  winner: Player | null;
  endReason: string | null;
  seed: string | null;
  spectators: number;
}

export function fromState(env: { seq: number; payload: MatchStateOut }): MatchView {
  const s = env.payload;
  return {
    matchId: s.match_id,
    seq: env.seq,
    status: s.status,
    you: s.you as Player | null,
    players: s.players,
    variant: s.variant,
    length: s.length,
    entry: s.entry,
    seedCommit: s.seed_commit,
    score: [s.score[0] ?? 0, s.score[1] ?? 0],
    gameNo: s.game_no,
    crawford: s.crawford_game,
    phase: s.phase,
    position: decode(s.position),
    turn: s.turn as Player | null,
    dice: s.dice ? [s.dice[0]!, s.dice[1]!] : null,
    opening: false,
    throwSeed: null,
    cubeValue: s.cube_value,
    cubeOwner: s.cube_owner as Player | null,
    legal: s.legal,
    clock: s.clock,
    timeouts: [s.timeouts[0] ?? 0, s.timeouts[1] ?? 0],
    results: s.results,
    winner: s.winner as Player | null,
    endReason: s.end_reason,
    seed: null,
    spectators: s.spectators,
  };
}

/** Types that advance the match seq; others (errors, per-socket state) do not. */
const SEQUENCED = new Set<string>([
  "turn.rolled",
  "turn.moved",
  "turn.passed",
  "turn.timeout",
  "cube.update",
  "game.started",
  "game.ended",
  "react.recv",
  "opponent.disconnected",
  "opponent.back",
  "match.ended",
  "spectators.count",
]);

export interface Applied {
  view: MatchView;
  /** A gap in seq: request `match.sync` with `view.seq`. */
  needsSync: boolean;
  /** The event was already applied (duplicate or stale). */
  ignored: boolean;
}

/** Applies one server envelope. `match.state` and `spectate.state` replace the view. */
export function apply(view: MatchView | null, env: ServerEnvelope): Applied {
  if (env.type === "match.state" || env.type === "spectate.state") {
    return { view: fromState(env), needsSync: false, ignored: false };
  }
  if (!view || !SEQUENCED.has(env.type) || env.match_id !== view.matchId) {
    return { view: view as MatchView, needsSync: false, ignored: true };
  }
  if (env.seq <= view.seq) return { view, needsSync: false, ignored: true };
  if (env.seq > view.seq + 1) return { view, needsSync: true, ignored: true };
  return { view: { ...reduce(view, env), seq: env.seq }, needsSync: false, ignored: false };
}

function other(p: number): Player {
  return (1 - p) as Player;
}

function reduce(v: MatchView, env: ServerEnvelope): MatchView {
  switch (env.type) {
    case "turn.rolled": {
      const p = env.payload;
      const dice: [number, number] = [p.dice[0]!, p.dice[1]!];
      if (p.opening) {
        if (dice[0] === dice[1]) return { ...v, dice, opening: true, throwSeed: p.throw_seed, legal: [], clock: p.clock };
        const starter: Player = dice[0] > dice[1] ? 0 : 1;
        return { ...v, dice, opening: true, throwSeed: p.throw_seed, turn: starter, phase: "move", legal: p.legal, clock: p.clock };
      }
      return { ...v, dice, opening: false, throwSeed: p.throw_seed, phase: "move", legal: p.legal, clock: p.clock };
    }
    case "turn.moved": {
      const p = env.payload;
      return { ...v, position: decode(p.position), phase: "roll", turn: other(p.player), dice: null, legal: [], clock: p.clock };
    }
    case "turn.passed":
      return { ...v, phase: "roll", turn: other(env.payload.player), dice: null, legal: [], clock: env.payload.clock };
    case "turn.timeout": {
      const t: [number, number] = [...v.timeouts];
      t[env.payload.player] = env.payload.count;
      return { ...v, timeouts: t };
    }
    case "cube.update": {
      const p = env.payload;
      if (p.action === "offer") return { ...v, phase: "cube_offered", clock: p.clock };
      if (p.action === "take")
        return { ...v, phase: "roll", cubeValue: p.value, cubeOwner: p.owner as Player | null, clock: p.clock };
      return { ...v, clock: p.clock }; // drop: game.ended follows
    }
    case "game.started": {
      const p = env.payload;
      return {
        ...v,
        gameNo: p.game_no,
        crawford: p.crawford,
        score: [p.score[0] ?? 0, p.score[1] ?? 0],
        position: decode(p.position),
        phase: "opening",
        turn: null,
        dice: null,
        legal: [],
        cubeValue: 1,
        cubeOwner: null,
      };
    }
    case "game.ended": {
      const p = env.payload;
      return {
        ...v,
        score: [p.score[0] ?? 0, p.score[1] ?? 0],
        results: [...v.results, { game_no: p.game_no, winner: p.winner, kind: p.kind, cube: p.cube, points: p.points, reason: p.reason }],
        phase: "game_over",
        dice: null,
        legal: [],
      };
    }
    case "match.ended": {
      const p = env.payload;
      return {
        ...v,
        // No winner: ended before the first roll, entries refunded.
        status: p.winner === null ? "aborted" : "finished",
        phase: "match_over",
        winner: p.winner as Player | null,
        score: [p.score[0] ?? 0, p.score[1] ?? 0],
        endReason: p.reason,
        seed: p.seed,
        dice: null,
        legal: [],
      };
    }
    case "opponent.disconnected":
    case "opponent.back": {
      const players = v.players.map((pl, i) =>
        i === env.payload.player ? { ...pl, connected: env.type === "opponent.back" } : pl,
      );
      return { ...v, players };
    }
    case "spectators.count":
      return { ...v, spectators: env.payload.count };
    default:
      return v;
  }
}

/** Whether `player` may offer a double now (mirrors the engine's rule; the server re-checks). */
export function canDouble(v: MatchView, player: Player): boolean {
  return (
    v.variant === "standard_cube" &&
    v.status === "active" &&
    v.phase === "roll" &&
    v.turn === player &&
    !v.crawford &&
    (v.cubeOwner === null || v.cubeOwner === player) &&
    v.cubeValue < 64
  );
}

/** Milliseconds left on the turn clock, corrected for the difference between server and local clocks. */
export function timeLeft(clock: Clock, receivedAt: number, now: number): number | null {
  if (clock.deadline === null) return null;
  const serverNow = clock.server_now + (now - receivedAt);
  return Math.max(0, clock.deadline - serverNow);
}
