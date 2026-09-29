import type { MatchStateOut, ServerEnvelope } from "@bg/protocol";
import { describe, expect, it } from "vitest";
import { encode, initialPosition } from "./position";
import { type MatchView, apply, canDouble, fromState, timeLeft } from "./store";

const clock = { actor: null, deadline: null, bank: [90, 90], turn_seconds: 30, server_now: 1000 };

function state(overrides: Partial<MatchStateOut> = {}): { type: "match.state"; match_id: string; seq: number; payload: MatchStateOut } {
  return {
    type: "match.state",
    match_id: "m1",
    seq: 3,
    payload: {
      match_id: "m1",
      status: "active",
      you: 0,
      players: [
        { username: "a", avatar: "x", elo: 1500, level: 1, is_bot: false, bot_level: null, board_theme: "walnut", checker_theme: "classic", connected: true },
        { username: "b", avatar: "y", elo: 1500, level: 1, is_bot: false, bot_level: null, board_theme: "walnut", checker_theme: "classic", connected: true },
      ],
      variant: "standard_cube",
      length: 5,
      entry: 0,
      seed_commit: "c",
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
      clock,
      timeouts: [0, 0],
      results: [],
      winner: null,
      end_reason: null,
      rules: {
        turn_seconds: 30,
        timebank_seconds: 90,
        max_consecutive_timeouts: 3,
        reconnect_grace_seconds: 90,
        points: { single: 1, gammon: 2, backgammon: 3 },
        rake_pct: 10,
        payout: 0,
      },
      grace: [null, null],
      history: [],
      spectators: 0,
      ...overrides,
    },
  };
}

function ev(seq: number, type: string, payload: unknown): ServerEnvelope {
  return { type, match_id: "m1", seq, payload } as ServerEnvelope;
}

describe("match store", () => {
  it("builds from state and applies a turn in order", () => {
    let v: MatchView = fromState(state());
    const legal = [[[13, 7], [8, 7]]];
    let r = apply(v, ev(4, "turn.rolled", { player: null, opening: true, dice: [6, 1], throw_seed: 9, legal, clock }));
    v = r.view;
    expect(v.phase).toBe("move");
    expect(v.turn).toBe(0);
    expect(v.seq).toBe(4);
    r = apply(v, ev(5, "turn.moved", { player: 0, moves: legal[0], hits: [false, false], position: encode(initialPosition()), auto: null, clock }));
    v = r.view;
    expect(v.turn).toBe(1);
    expect(v.phase).toBe("roll");
    expect(canDouble(v, 1)).toBe(true);
    expect(canDouble(v, 0)).toBe(false);
  });

  it("ignores duplicates and asks for a sync on gaps", () => {
    const v = fromState(state());
    expect(apply(v, ev(3, "turn.passed", { player: 0, clock })).ignored).toBe(true);
    const gap = apply(v, ev(6, "turn.passed", { player: 0, clock }));
    expect(gap.needsSync).toBe(true);
    expect(gap.view.seq).toBe(3);
  });

  it("tracks the cube, games, and the end", () => {
    let v = fromState(state({ phase: "roll", turn: 1 }));
    v = apply(v, ev(4, "cube.update", { action: "offer", player: 1, value: 1, owner: null, clock })).view;
    expect(v.phase).toBe("cube_offered");
    v = apply(v, ev(5, "cube.update", { action: "take", player: 0, value: 2, owner: 0, clock })).view;
    expect([v.cubeValue, v.cubeOwner, v.phase]).toEqual([2, 0, "roll"]);
    expect(canDouble(v, 1)).toBe(false);
    v = apply(v, ev(6, "game.ended", { game_no: 1, winner: 0, kind: "gammon", cube: 2, points: 4, reason: "bear_off", score: [4, 0] })).view;
    expect(v.score).toEqual([4, 0]);
    v = apply(v, ev(7, "game.started", { game_no: 2, crawford: true, score: [4, 0], position: encode(initialPosition()) })).view;
    expect([v.gameNo, v.crawford, v.cubeValue]).toEqual([2, true, 1]);
    v = apply(v, ev(8, "opponent.disconnected", { player: 1, grace_seconds: 90 })).view;
    expect(v.players[1]!.connected).toBe(false);
    v = apply(v, ev(9, "match.ended", { winner: 0, score: [5, 0], reason: "points", seed: "ab", elo: null, xp: null, settlement: null })).view;
    expect([v.status, v.phase, v.winner, v.seed]).toEqual(["finished", "match_over", 0, "ab"]);
  });

  it("corrects the clock for skew", () => {
    const c = { ...clock, deadline: 31_000, server_now: 1_000 };
    // Received at local 500_000; 10 s later on the local clock, 20 s remain.
    expect(timeLeft(c, 500_000, 510_000)).toBe(20_000);
    expect(timeLeft(clock, 0, 0)).toBeNull();
  });
});
