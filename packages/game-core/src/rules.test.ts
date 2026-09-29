import { describe, expect, it } from "vitest";
import type { Clock, MatchRulesOut } from "@bg/protocol";
import { BAR, OFF, fromView, initialPosition, type Player, type Position } from "./position";
import {
  countAt,
  gamePoints,
  isBeforeFirstRoll,
  isWaitingForOpponent,
  lossKind,
  readClock,
  resignPreview,
  toViewerPoint,
} from "./rules";
import type { MatchView } from "./store";

/** A position for `loser` (player 1 here) against a winner with one checker left on their 1-point. */
function loserWith(mine: Record<number, number>): Position {
  const m = new Array<number>(26).fill(0);
  const t = new Array<number>(26).fill(0);
  for (const [p, n] of Object.entries(mine)) m[Number(p)] = n;
  t[OFF] = 14;
  t[24] = 1; // the winner's 1-point, in the loser's numbering
  return fromView(1, { mine: m, theirs: t });
}

const RULES = { points: { single: 1, gammon: 2, backgammon: 3 } } as unknown as MatchRulesOut;

function matchView(over: Partial<MatchView> = {}): MatchView {
  return {
    matchId: "m",
    seq: 1,
    status: "active",
    you: 0,
    players: [],
    variant: "standard_cube",
    length: 3,
    entry: 0,
    seedCommit: "",
    score: [0, 0],
    gameNo: 1,
    crawford: false,
    phase: "opening",
    position: initialPosition(),
    turn: null,
    dice: null,
    opening: false,
    throwSeed: null,
    cubeValue: 1,
    cubeOwner: null,
    legal: [],
    clock: { actor: null, deadline: null, bank: [90, 90], turn_seconds: 30, server_now: 0 },
    timeouts: [0, 0],
    results: [],
    winner: null,
    endReason: null,
    seed: null,
    spectators: 0,
    ...over,
  };
}

describe("lossKind (engine loss_kind reference positions)", () => {
  it("is single once the loser has borne a checker off", () => {
    expect(lossKind(loserWith({ [OFF]: 1, 6: 14 }), 1)).toBe("single");
  });
  it("is gammon with nothing off and nothing in the winner's home or on the bar", () => {
    expect(lossKind(loserWith({ 6: 10, 13: 5 }), 1)).toBe("gammon");
  });
  it("is backgammon with a checker on the bar", () => {
    expect(lossKind(loserWith({ [BAR]: 1, 6: 14 }), 1)).toBe("backgammon");
  });
  it("is backgammon with a checker in the winner's home board", () => {
    expect(lossKind(loserWith({ 19: 1, 6: 14 }), 1)).toBe("backgammon");
  });
});

describe("points and resign preview", () => {
  it("multiplies the point table by the cube", () => {
    expect(gamePoints(RULES, "gammon", 4)).toBe(8);
    expect(gamePoints(null, "single", 1)).toBeNull();
  });
  it("gives the opponent the full value and says when it ends the match", () => {
    const v = matchView({ position: loserWith({ 6: 15 }), cubeValue: 2, score: [0, 1], length: 5, phase: "roll" });
    expect(resignPreview(v, 1 as Player, RULES)).toEqual({ kind: "gammon", points: 4, scoreAfter: [1, 4], endsMatch: false });
    expect(resignPreview({ ...v, length: 3 }, 1 as Player, RULES).endsMatch).toBe(true);
  });
});

describe("readClock", () => {
  const clock = (deadline: number): Clock => ({ actor: 0, deadline, bank: [90, 90], turn_seconds: 30, server_now: 0 });
  it("spends the turn time before the bank", () => {
    const r = readClock(clock(120_000), 0, 0);
    expect(r).toMatchObject({ actor: 0, remaining: 120_000, turnLeft: 30_000, bankLeft: 90_000, turnMs: 30_000 });
  });
  it("reads only bank once the turn time is used", () => {
    const r = readClock(clock(120_000), 0, 40_000);
    expect(r).toMatchObject({ remaining: 80_000, turnLeft: 0, bankLeft: 80_000 });
  });
  it("has no reading while no clock runs", () => {
    expect(readClock({ ...clock(0), actor: null, deadline: null }, 0, 0).remaining).toBeNull();
  });
});

describe("numbering", () => {
  it("mirrors points but keeps bar and off", () => {
    expect(toViewerPoint(1)).toBe(24);
    expect(toViewerPoint(24)).toBe(1);
    expect(toViewerPoint(BAR)).toBe(BAR);
    expect(toViewerPoint(OFF)).toBe(OFF);
  });
  it("counts checkers in either player's numbering", () => {
    const p = initialPosition();
    expect(countAt(p, 0, 6)).toBe(5);
    expect(countAt(p, 1, 6)).toBe(5);
    expect(countAt(p, 1, 19, 0)).toBe(5); // player 1's 6-point is player 0's 19-point
    expect(countAt({ ...p, bar: [2, 0] }, 0, BAR)).toBe(2);
  });
});

describe("before the first roll", () => {
  const opp = { is_bot: false, connected: false };
  it("holds only in game 1 with no dice, results or turns", () => {
    expect(isBeforeFirstRoll(matchView(), 0)).toBe(true);
    expect(isBeforeFirstRoll(matchView(), 1)).toBe(false);
    expect(isBeforeFirstRoll(matchView({ dice: [3, 1] }), 0)).toBe(false);
    expect(isBeforeFirstRoll(matchView({ gameNo: 2 }), 0)).toBe(false);
  });
  it("waits only for an absent human opponent", () => {
    expect(isWaitingForOpponent(matchView(), opp, 0)).toBe(true);
    expect(isWaitingForOpponent(matchView(), { ...opp, connected: true }, 0)).toBe(false);
    expect(isWaitingForOpponent(matchView(), { ...opp, is_bot: true }, 0)).toBe(false);
    expect(isWaitingForOpponent(matchView({ status: "finished" }), opp, 0)).toBe(false);
  });
});
