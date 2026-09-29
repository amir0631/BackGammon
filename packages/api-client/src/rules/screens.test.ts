import { describe, expect, it } from "vitest";
import type { BracketSlotInfo, Leaderboard, LiveMatchRow, ShopItem, TournamentInfo } from "@bg/protocol";
import {
  bracketGrid,
  cardQuickAction,
  customAmountProblem,
  itemAction,
  itemState,
  liveFilterQuery,
  mergeLiveRefresh,
  mineGroups,
  myRank,
  parseLiveFilter,
  parseScope,
  personalResult,
  prestartTournament,
  roundName,
  seedOrderMatters,
  spectateJoinOutcome,
  tournamentChip,
  tournamentPrimary,
} from "./index";

const row = (id: string, spectators = 0): LiveMatchRow => ({
  match_id: id,
  variant: "standard_cube",
  length: 3,
  entry: 100,
  tier_id: 100,
  players: [],
  score: [0, 0],
  game_no: 1,
  spectators,
  pool: 0,
  avg_elo: 1500,
  tournament_id: null,
});

describe("live rules", () => {
  it("round-trips the filter through the URL and drops unknown values", () => {
    const f = parseLiveFilter(new URLSearchParams("tier=100&variant=traditional&sort=elo&tournament=x"));
    expect(f).toEqual({ tier: 100, variant: "traditional", tournament: null, sort: "elo" });
    expect(liveFilterQuery(f)).toBe("?tier=100&variant=traditional&sort=elo");
    expect(liveFilterQuery(parseLiveFilter(new URLSearchParams("variant=chess&sort=nope")))).toBe("");
  });

  it("updates values in place and holds back order changes", () => {
    const shown = [row("a", 5), row("b", 3)];
    const same = mergeLiveRefresh(shown, [row("a", 6), row("b", 2)]);
    expect(same.pending).toBe(false);
    expect(same.rows.map((r) => r.spectators)).toEqual([6, 2]);

    const reordered = mergeLiveRefresh(shown, [row("b", 9), row("a", 1)]);
    expect(reordered.pending).toBe(true);
    expect(reordered.rows.map((r) => r.match_id)).toEqual(["a", "b"]);

    const ended = mergeLiveRefresh(shown, [row("a", 5)]);
    expect(ended.ended).toEqual(["b"]);
    expect(ended.pending).toBe(true);
  });

  it("maps join errors", () => {
    expect(spectateJoinOutcome({ code: "MATCH_ACTION_INVALID", details: { reason: "full" } })).toBe("full");
    expect(spectateJoinOutcome({ code: "MATCH_ACTION_INVALID", details: { reason: "not_live" } })).toBe("notLive");
    expect(spectateJoinOutcome({ code: "MATCH_ACTION_INVALID", details: { reason: "player" } })).toBe("player");
    expect(spectateJoinOutcome({ code: "MATCH_NOT_FOUND", details: {} })).toBe("notFound");
    expect(spectateJoinOutcome({ code: "REACTION_REJECTED", details: {} })).toBeNull();
  });
});

const item = (over: Partial<ShopItem>): ShopItem => ({
  id: 1,
  kind: "board_theme",
  key: "k",
  name: { fa: "", en: "" },
  unlock: "purchasable",
  price: 300,
  unlock_level: null,
  owned: false,
  locked: false,
  equipped: false,
  data: {},
  ...over,
});

describe("shop rules", () => {
  it("gives every item exactly one state", () => {
    expect(itemState(item({ equipped: true, owned: true }))).toBe("inUse");
    expect(itemState(item({ unlock: "free", price: 0, owned: true }))).toBe("freeOwned");
    expect(itemState(item({ owned: true }))).toBe("owned");
    expect(itemState(item({ unlock: "level_locked", price: 0, locked: true, unlock_level: 5 }))).toBe("levelLocked");
    expect(itemState(item({}))).toBe("price");
  });

  it("never buys from a card and never offers buy for level-locked items", () => {
    expect(cardQuickAction(item({}))).toBe("price");
    expect(itemAction(item({ unlock: "level_locked", locked: true }))).toBe("locked");
    expect(itemAction(item({ kind: "emoji_pack", owned: true }))).toBe("ownedPack");
    expect(cardQuickAction(item({ owned: true }))).toBe("use");
  });

  it("checks the custom amount range and multiple", () => {
    const rules = { min: 10_000, max: 10_000_000, price: 1000 };
    expect(customAmountProblem("", rules)).toEqual({ kind: "empty" });
    expect(customAmountProblem("۵۰۰۰", rules)).toEqual({ kind: "range", min: 10_000, max: 10_000_000 });
    expect(customAmountProblem("25,500", rules)).toEqual({ kind: "multiple", price: 1000, lower: 25_000, higher: 26_000 });
    expect(customAmountProblem("۲۵٬۰۰۰", rules)).toBeNull();
  });
});

const tour = (over: Partial<TournamentInfo>): TournamentInfo => ({
  id: 1,
  name: { fa: "جام", en: "Cup" },
  variant: "standard_cube",
  length: 3,
  entry: 100,
  capacity: 8,
  entries: 3,
  starts_at: "2026-10-01T10:00:00Z",
  status: "scheduled",
  round: 0,
  rounds: 3,
  prize_split: [50, 25, 12.5, 12.5],
  prizes: [360, 180, 90, 90],
  joined: false,
  cancel_reason: null,
  ...over,
});
const before = Date.parse("2026-10-01T09:00:00Z");
const slot = (round: number, position: number, a: string | null, b: string | null, winner: string | null = null): BracketSlotInfo => ({
  round,
  position,
  players: [a, b],
  winner,
  match_id: null,
  score: null,
  live: false,
});

describe("tournament rules", () => {
  it("derives chips and primaries", () => {
    expect(tournamentChip(tour({}), before)).toBe("open");
    expect(tournamentChip(tour({ entries: 8 }), before)).toBe("full");
    expect(tournamentChip(tour({}), Date.parse("2026-10-01T10:00:05Z"))).toBe("starting");
    expect(tournamentPrimary(tour({ joined: true }), before)).toBe("registered");
    expect(tournamentPrimary(tour({ status: "running", joined: true }), before, true)).toBe("watch");
  });

  it("draws every round with placeholders", () => {
    const grid = bracketGrid({ capacity: 8, rounds: 3 }, [slot(1, 0, "a", "b")]);
    expect(grid.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(grid[0]![0]!.slot?.players).toEqual(["a", "b"]);
    expect(grid[1]![0]!.slot).toBeNull();
    expect(roundName(3, 3)).toBe("final");
    expect(roundName(1, 3)).toBe("quarter");
    expect(roundName(1, 5)).toBe("round");
  });

  it("finds the viewer's place from the bracket", () => {
    const t = tour({ status: "running", joined: true, capacity: 4, rounds: 2 });
    const slots = [slot(1, 0, "me", "x", "me"), slot(1, 1, "y", "z")];
    expect(personalResult(t, slots, "me").kind).toBe("waiting");
    expect(personalResult(t, [slot(1, 0, "me", "x", "x")], "me")).toEqual({ kind: "out", round: 1 });
    expect(personalResult(t, [slot(2, 0, "me", "y", "me")], "me")).toEqual({ kind: "champion" });
  });

  it("groups mine and finds the pre-start tournament", () => {
    const joined = tour({ joined: true, starts_at: "2026-10-01T09:10:00Z" });
    expect(mineGroups([joined, tour({ id: 2 })]).comingUp).toHaveLength(1);
    expect(prestartTournament([joined], before)?.id).toBe(1);
    expect(prestartTournament([joined], before - 3_600_000)).toBeNull();
    expect(seedOrderMatters(tour({}))).toBe(false);
    expect(seedOrderMatters(tour({ prizes: [360, 180, 120, 60] }))).toBe(true);
  });
});

describe("leaderboard rules", () => {
  const board = (over: Partial<Leaderboard>): Leaderboard => ({
    scope: "all",
    results: [{ rank: 1, username: "a", avatar: "", level: 1, value: 1900 }],
    me: null,
    period: null,
    ...over,
  });

  it("parses the scope", () => {
    expect(parseScope("weekly")).toBe("weekly");
    expect(parseScope("x")).toBe("all");
  });

  it("chooses the my-rank row", () => {
    expect(myRank(board({}), "me")).toEqual({ kind: "unrated" });
    expect(myRank(board({ scope: "weekly" }), "me")).toEqual({ kind: "noPeriod", period: "weekly" });
    expect(myRank(board({ me: { rank: 88, value: 1542 } }), "me")).toEqual({ kind: "outside", rank: 88, value: 1542 });
    expect(myRank(board({ me: { rank: 1, value: 1900 } }), "a")).toEqual({ kind: "inList", rank: 1 });
    expect(myRank(board({ scope: "predict", me: { rank: null, value: null, count: 4, needed: 20 } }), "me")).toEqual({ kind: "predict", count: 4, needed: 20 });
  });
});
