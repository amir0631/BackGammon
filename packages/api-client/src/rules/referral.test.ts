import { describe, expect, it } from "vitest";
import { earningDisplay, groupByDay, referralRules } from "./referral";

describe("referral rules", () => {
  it("builds the rules block from server values", () => {
    expect(referralRules({ pct: 1, base: "referee_entry", duration_days: 0 }).map((r) => r.key)).toEqual(["entry", "activation", "noLimit", "rounding", "review"]);
    expect(referralRules({ pct: 2, base: "pot", duration_days: 30 })).toContainEqual({ key: "days", days: 30 });
    expect(referralRules({ pct: 2, base: "pot", duration_days: 30 })[0]).toEqual({ key: "pot", pct: 2 });
  });

  it("never signs held or cancelled rows", () => {
    expect(earningDisplay({ status: "paid" }).signed).toBe(true);
    expect(earningDisplay({ status: "held" })).toMatchObject({ signed: false, note: "heldNote" });
    expect(earningDisplay({ status: "cancelled" })).toMatchObject({ signed: false, struck: true });
    expect(earningDisplay({} as never).status).toBeNull();
  });

  it("groups by day in order", () => {
    const rows = [{ created_at: "a1" }, { created_at: "a2" }, { created_at: "b1" }];
    expect(groupByDay(rows, (s) => s[0]!).map((g) => [g.day, g.rows.length])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
