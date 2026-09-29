import type { Replay, ReplayEvent } from "@bg/protocol";
import { describe, expect, it } from "vitest";
import vectors from "../fixtures/dice.json";
import { encode, initialPosition } from "./position";
import { buildReplay, frameAt, step, verifyDice } from "./replay";

const clock = { actor: 0, deadline: null, bank: [90, 90], turn_seconds: 30, server_now: 0 };

function rolled(seq: number, dice: number[], throwSeed: number, opening = false): ReplayEvent {
  return {
    seq,
    type: "turn.rolled",
    actor: opening ? "system" : "player_a",
    payload: { player: opening ? null : 0, opening, dice, throw_seed: throwSeed, legal: [], clock },
    server_ts: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
  };
}

describe("verifyDice", () => {
  it("reproduces every server roll and throw seed from the published seed", async () => {
    for (const v of vectors) {
      const events = v.rolls.map((r, i) => rolled(i + 1, r.dice, r.throw_seed, i === 0));
      const result = await verifyDice(v.seed, v.seed_commit, v.match_id, events);
      expect(result.commitOk).toBe(true);
      expect(result.rolls).toHaveLength(40);
      expect(result.ok).toBe(true);
    }
  });

  it("catches a changed die, a changed throw seed, and a wrong commitment", async () => {
    const v = vectors[0]!;
    const events = v.rolls.map((r, i) => rolled(i + 1, r.dice, r.throw_seed));
    const bad = events.map((e, i) =>
      i === 5 ? { ...e, payload: { ...e.payload, dice: [7 - (e.payload.dice as number[])[0]!, (e.payload.dice as number[])[1]] } } : e,
    );
    const r1 = await verifyDice(v.seed, v.seed_commit, v.match_id, bad);
    expect(r1.ok).toBe(false);
    expect(r1.rolls.filter((r) => !r.ok).map((r) => r.n)).toEqual([5]);
    const badThrow = events.map((e, i) => (i === 2 ? { ...e, payload: { ...e.payload, throw_seed: 1 } } : e));
    expect((await verifyDice(v.seed, v.seed_commit, v.match_id, badThrow)).rolls[2]!.throwSeedOk).toBe(false);
    const wrong = await verifyDice(v.seed, "00".repeat(32), v.match_id, events);
    expect(wrong.commitOk).toBe(false);
    expect(wrong.ok).toBe(false);
  });
});

describe("buildReplay", () => {
  const start = encode(initialPosition());
  const ts = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
  const replay: Replay = {
    id: "m1",
    variant: "standard_nocube",
    length: 1,
    entry: 0,
    status: "finished",
    is_bot: false,
    players: [
      { username: "a", avatar: "x", elo: 1500, is_bot: false, bot_level: null },
      { username: "b", avatar: "y", elo: 1500, is_bot: false, bot_level: null },
    ],
    you: 0,
    winner: 0,
    score: [1, 0],
    end_reason: "resign",
    seed_commit: "c",
    created_at: ts(0),
    ended_at: ts(9),
    seed: "00",
    events: [
      { seq: 1, type: "game.started", actor: "system", payload: { game_no: 1, crawford: false, score: [0, 0], position: start }, server_ts: ts(0) },
      rolled(2, [5, 2], 1, true),
      { seq: 3, type: "react.recv", actor: "player_b", payload: { key: "hello", kind: "phrase", sender: 1 }, server_ts: ts(3) },
      { seq: 4, type: "turn.moved", actor: "player_a", payload: { player: 0, moves: [[13, 8], [24, 22]], hits: [false, false], position: start, auto: null, clock }, server_ts: ts(5) },
      { seq: 5, type: "game.ended", actor: "system", payload: { game_no: 1, winner: 0, kind: "single", cube: 1, points: 1, reason: "resign", score: [1, 0] }, server_ts: ts(8) },
      { seq: 6, type: "match.ended", actor: "system", payload: { winner: 0, score: [1, 0], reason: "resign", seed: "00", elo: null, xp: null, settlement: null }, server_ts: ts(9) },
    ],
    purged_at: null,
  } as Replay;

  it("re-applies the log to the live store, with timing, games, and reactions", () => {
    const t = buildReplay(replay);
    expect(t.frames).toHaveLength(6);
    expect(t.frames[1]!.view.dice).toEqual([5, 2]);
    expect(t.frames[1]!.view.turn).toBe(0);
    expect(t.frames[3]!.view.phase).toBe("roll");
    expect(t.frames[5]!.view.winner).toBe(0);
    expect(t.frames[5]!.view.status).toBe("finished");
    expect(t.games).toEqual([{ gameNo: 1, frame: 0 }]);
    expect(t.reactions).toEqual([{ frame: 2, atMs: 3000, key: "hello", kind: "phrase", sender: 1 }]);
    expect(t.durationMs).toBe(9000);
  });

  it("seeks by time and steps over reactions", () => {
    const t = buildReplay(replay);
    expect(frameAt(t, -1)).toBe(-1);
    expect(frameAt(t, 4000)).toBe(2);
    expect(frameAt(t, 60_000)).toBe(5);
    expect(step(t, 1, 1)).toBe(3); // the reaction is not a step
    expect(step(t, 3, -1)).toBe(1);
    expect(step(t, 5, 1)).toBe(5);
  });

  it("keeps going over a gap in the log", () => {
    const gapped = { ...replay, events: replay.events.filter((e) => e.seq !== 3) } as Replay;
    expect(buildReplay(gapped).frames.at(-1)!.view.phase).toBe("match_over");
  });
});
