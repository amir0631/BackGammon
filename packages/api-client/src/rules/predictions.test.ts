import { describe, expect, it } from "vitest";
import type { PredictionRow } from "@bg/protocol";
import { blockedReason, estimatePayout, groupPredictions, ownStake, predictionOutcome, quickPicks, refusalReason, stakeProblem } from "./predictions";

const row = (o: Partial<PredictionRow>): PredictionRow => ({
  id: 1,
  match_id: "m1",
  side: 0,
  amount: 100,
  payout: null,
  pool_status: "open",
  winner_side: null,
  players: ["a", "b"],
  created_at: "2026-09-01T10:00:00Z",
  ...o,
});

describe("prediction rules", () => {
  it("maps blocked and refusal reasons, unknown → linked", () => {
    expect(blockedReason(null)).toBeNull();
    expect(blockedReason("review")).toBe("review");
    expect(blockedReason("something")).toBe("linked");
    expect(refusalReason({ reason: "pool_full" })).toBe("pool_full");
    expect(refusalReason({})).toBe("linked");
  });

  it("sums own stakes and offers quick picks within the remaining cap", () => {
    expect(ownStake([row({ amount: 50 }), row({ id: 2, amount: 30 }), row({ id: 3, match_id: "x" })], "m1")).toEqual({ side: 0, total: 80 });
    expect(ownStake([], "m1")).toBeNull();
    expect(quickPicks(1000, 1000)).toEqual([100, 250, 500]);
    expect(quickPicks(1000, 300)).toEqual([100, 250]);
    expect(quickPicks(5, 5)).toEqual([1, 2]);
  });

  it("checks the stake in order", () => {
    expect(stakeProblem("", 100, 50)).toEqual({ kind: "empty" });
    expect(stakeProblem("1.5", 100, 50)).toEqual({ kind: "invalid" });
    expect(stakeProblem("200", 100, 500)).toEqual({ kind: "overRemaining", remaining: 100 });
    expect(stakeProblem("80", 100, 50)).toEqual({ kind: "insufficient", balance: 50 });
    expect(stakeProblem("۵۰", 100, 50)).toBeNull();
  });

  it("estimates with integer math and flags below-stake and zero results", () => {
    expect(estimatePayout({ totalA: 100, totalB: 0, side: 0, own: 0, stake: 10, rakePct: 10 })).toEqual({ kind: "oneSided" });
    expect(estimatePayout({ totalA: 100, totalB: 100, side: 0, own: 0, stake: 10, rakePct: null })).toEqual({ kind: "unknown" });
    // pool 310, rake 31, winners share 279; 110 on A → 10 gets floor(10 × 279 / 110) = 25.
    expect(estimatePayout({ totalA: 100, totalB: 200, side: 0, own: 0, stake: 10, rakePct: 10 })).toEqual({ kind: "ok", estimate: 25, total: 10 });
    // predictions.md example: A 1,000 (own), B 10 → a 1,000 stake gets 909.
    expect(estimatePayout({ totalA: 0, totalB: 10, side: 0, own: 0, stake: 1000, rakePct: 10 })).toEqual({ kind: "belowStake", estimate: 909, total: 1000 });
    expect(estimatePayout({ totalA: 100000, totalB: 1, side: 0, own: 0, stake: 1, rakePct: 10 })).toEqual({ kind: "zero", total: 1 });
  });

  it("derives the outcome from the winner and the side, not payout > 0", () => {
    expect(predictionOutcome([row({ pool_status: "settled", payout: 150, winner_side: 0 })]).kind).toBe("won");
    expect(predictionOutcome([row({ pool_status: "settled", payout: 90, winner_side: 0 })])).toMatchObject({ kind: "wonLess", net: -10 });
    expect(predictionOutcome([row({ pool_status: "settled", payout: 0, winner_side: 0 })])).toMatchObject({ kind: "wonZero", net: -100 });
    expect(predictionOutcome([row({ pool_status: "settled", payout: 0, winner_side: 1 })])).toMatchObject({ kind: "lost", net: -100 });
    expect(predictionOutcome([row({ pool_status: "refunded", payout: 100 })])).toMatchObject({ kind: "refunded", net: 0 });
    expect(predictionOutcome([row({ pool_status: "held" })]).kind).toBe("held");
    const two = [row({ pool_status: "settled", payout: 60, winner_side: 0 }), row({ id: 2, amount: 50, pool_status: "settled", payout: 30, winner_side: 0 })];
    expect(predictionOutcome(two)).toMatchObject({ kind: "wonLess", stake: 150, payout: 90, net: -60 });
  });

  it("groups stakes by match", () => {
    const rows = [row({ id: 3, match_id: "m2", created_at: "2026-09-02T00:00:00Z" }), row({ id: 2, created_at: "2026-09-01T12:00:00Z" }), row({ id: 1 })];
    const groups = groupPredictions(rows);
    expect(groups.map((g) => g.matchId)).toEqual(["m2", "m1"]);
    expect(groups[1]!.firstAt).toBe("2026-09-01T10:00:00Z");
  });
});
