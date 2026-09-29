import { describe, expect, it } from "vitest";
import { encode, initialPosition, type Position } from "@bg/game-core";
import { bezier, layoutTokens, pairTokens, stepPositions } from "./tokens";

describe("checker tokens", () => {
  it("moves exactly the checker that left a point and keeps the rest", () => {
    const start = initialPosition();
    const tokens = layoutTokens(start, 0);
    const [after] = stepPositions(start, 0, [[24, 18]])!;
    const next = pairTokens(tokens, after!, 0);
    const moved = next.filter((t, i) => JSON.stringify(t) !== JSON.stringify(tokens[i]));
    expect(moved).toHaveLength(1);
    expect(moved[0]!.loc).toEqual({ kind: "point", point: 18 });
    expect(next).toHaveLength(30);
  });

  it("sends a hit checker to its bar", () => {
    const p: Position = { board: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
    p.board[23] = 15; // A on 24
    p.board[17] = -1; // B blot on A's 18
    p.board[0] = -14;
    const steps = stepPositions(p, 0, [[24, 18]])!;
    expect(steps[0]!.bar).toEqual([0, 1]);
    const next = pairTokens(layoutTokens(p, 0), steps[0]!, 0);
    expect(next.some((t) => t.side === 1 && t.loc.kind === "bar")).toBe(true);
  });

  it("plays a turn step by step and ends on the server position", () => {
    const start = initialPosition();
    const steps = stepPositions(start, 1, [[13, 10], [10, 5]])!;
    expect(steps).toHaveLength(2);
    expect(encode(steps[1]!)).not.toBe(encode(start));
  });

  it("rejects a step with no checker", () => {
    expect(stepPositions(initialPosition(), 0, [[20, 14]])).toBeNull();
  });

  it("eases without overshoot", () => {
    const curve = [0.25, 0.8, 0.35, 1] as const;
    let last = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = bezier(curve, t);
      expect(v).toBeGreaterThanOrEqual(last - 1e-6);
      expect(v).toBeLessThanOrEqual(1);
      last = v;
    }
  });
});
