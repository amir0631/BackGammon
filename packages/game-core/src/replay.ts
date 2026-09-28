// Replay player and dice verification (CLAUDE.md §6, §20.2). A replay is the match's recorded event log
// re-applied to the same store the live game uses; the dice are re-derived from the published seed.
import type { PlayerInfo, Replay, ReplayEvent, ServerEnvelope } from "@bg/protocol";
import { encode, initialPosition } from "./position";
import { type MatchView, apply, fromState } from "./store";

export interface ReplayFrame {
  /** The match as it was right after `event`. */
  view: MatchView;
  event: ReplayEvent;
  /** Milliseconds since the first event (server clock). */
  atMs: number;
}

export interface ReplayTimeline {
  /** Frame 0 is the empty board before the first event. */
  frames: ReplayFrame[];
  /** The frame each game starts at. */
  games: { gameNo: number; frame: number }[];
  /** Reactions and phrases, shown at their time (§20.2). */
  reactions: { frame: number; atMs: number; key: string; kind: "emoji" | "phrase"; sender: number }[];
  durationMs: number;
}

/** Events a "step" moves between: what changes the board, the dice, or the cube. */
export const STEP_TYPES = new Set([
  "turn.rolled",
  "turn.moved",
  "turn.passed",
  "cube.update",
  "game.started",
  "game.ended",
  "match.ended",
]);

function startView(r: Replay): MatchView {
  const players: PlayerInfo[] = r.players.map((p) => ({
    username: p.username ?? "",
    avatar: p.avatar,
    elo: p.elo,
    level: 0,
    is_bot: p.is_bot,
    bot_level: p.bot_level,
    board_theme: "",
    checker_theme: "",
    connected: true,
  }));
  return fromState({
    seq: 0,
    payload: {
      match_id: r.id,
      status: "active",
      you: r.you,
      players,
      variant: r.variant,
      length: r.length,
      entry: r.entry,
      seed_commit: r.seed_commit,
      score: [0, 0],
      game_no: 1,
      crawford_game: false,
      phase: "opening",
      position: encode(initialPosition()),
      turn: null,
      dice: null,
      cube_value: 1,
      cube_owner: null,
      can_double: false,
      legal: [],
      clock: { actor: null, deadline: null, bank: [0, 0], turn_seconds: 0, server_now: 0 },
      timeouts: [0, 0],
      results: [],
      winner: null,
      end_reason: null,
      spectators: 0,
      rules: {
        turn_seconds: 0,
        timebank_seconds: 0,
        max_consecutive_timeouts: 0,
        reconnect_grace_seconds: 0,
        points: {},
        rake_pct: 0,
        payout: 0,
      },
      grace: [null, null],
    },
  });
}

export function buildReplay(r: Replay): ReplayTimeline {
  const events = [...r.events].sort((a, b) => a.seq - b.seq);
  const t0 = events.length ? Date.parse(events[0]!.server_ts) : 0;
  let view = startView(r);
  const frames: ReplayFrame[] = [];
  const games: ReplayTimeline["games"] = [];
  const reactions: ReplayTimeline["reactions"] = [];
  for (const event of events) {
    // A gap (a purged or unrecorded event) must not stall the replay: continue from the next one.
    const applied = apply({ ...view, seq: event.seq - 1 }, {
      type: event.type,
      match_id: r.id,
      seq: event.seq,
      payload: event.payload,
    } as unknown as ServerEnvelope);
    view = applied.view;
    const atMs = Date.parse(event.server_ts) - t0;
    frames.push({ view, event, atMs });
    if (event.type === "game.started") games.push({ gameNo: view.gameNo, frame: frames.length - 1 });
    if (event.type === "react.recv") {
      const p = event.payload as { key: string; kind: "emoji" | "phrase"; sender: number };
      reactions.push({ frame: frames.length - 1, atMs, key: p.key, kind: p.kind, sender: p.sender });
    }
  }
  return { frames, games, reactions, durationMs: frames.length ? frames[frames.length - 1]!.atMs : 0 };
}

/** The last frame at or before `ms` (for timed playback at any speed); -1 before the first event. */
export function frameAt(t: ReplayTimeline, ms: number): number {
  let lo = 0;
  let hi = t.frames.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t.frames[mid]!.atMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The next (dir 1) or previous (dir -1) step frame from `frame`, or `frame` itself at either end. */
export function step(t: ReplayTimeline, frame: number, dir: 1 | -1): number {
  for (let i = frame + dir; i >= 0 && i < t.frames.length; i += dir) {
    if (STEP_TYPES.has(t.frames[i]!.event.type)) return i;
  }
  return frame;
}

// ---- dice verification (§6.3) ----

export interface RollCheck {
  n: number;
  recorded: number[];
  expected: number[];
  throwSeedOk: boolean;
  ok: boolean;
}

export interface DiceVerification {
  /** sha256(seed) equals the commitment published before the first roll. */
  commitOk: boolean;
  rolls: RollCheck[];
  ok: boolean;
}

const ACCEPT_BELOW = 252; // 252 = 42 * 6: larger bytes would bias the faces

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(seed: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", seed, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmac(key: CryptoKey, message: string): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** Roll number `n` exactly as the server derives it (§6.2). */
export async function rollDice(key: CryptoKey, matchId: string, n: number): Promise<[number, number]> {
  const dice: number[] = [];
  for (let k = 0; dice.length < 2; k++) {
    for (const b of await hmac(key, `${matchId}:${n}:${k}`)) {
      if (b < ACCEPT_BELOW) {
        dice.push((b % 6) + 1);
        if (dice.length === 2) break;
      }
    }
  }
  return [dice[0]!, dice[1]!];
}

/** The visual throw seed for roll `n` (§6.4). */
export async function throwSeed(key: CryptoKey, matchId: string, n: number): Promise<number> {
  const h = await hmac(key, `${matchId}:${n}:throw`);
  return ((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0;
}

/**
 * Recomputes every roll of a finished match from its published seed and checks it against the recorded
 * `turn.rolled` events (roll n is the n-th of them, opening rolls included) and the seed commitment.
 */
export async function verifyDice(seedHex: string, seedCommit: string, matchId: string, events: ReplayEvent[]): Promise<DiceVerification> {
  const seed = hexToBytes(seedHex);
  const commitOk = toHex(await globalThis.crypto.subtle.digest("SHA-256", seed)) === seedCommit.toLowerCase();
  const key = await hmacKey(seed);
  const rolled = [...events].sort((a, b) => a.seq - b.seq).filter((e) => e.type === "turn.rolled");
  const rolls: RollCheck[] = [];
  for (const [n, e] of rolled.entries()) {
    const p = e.payload as { dice: number[]; throw_seed: number };
    const expected = await rollDice(key, matchId, n);
    const throwSeedOk = (await throwSeed(key, matchId, n)) === p.throw_seed;
    const ok = throwSeedOk && p.dice.length === 2 && p.dice[0] === expected[0] && p.dice[1] === expected[1];
    rolls.push({ n, recorded: p.dice, expected, throwSeedOk, ok });
  }
  return { commitOk, rolls, ok: commitOk && rolls.every((r) => r.ok) };
}
