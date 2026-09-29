import { describe, expect, it } from "vitest";
import { BAR, OFF, initialPosition } from "@bg/game-core";
import { DIMS, locate, locations, pointX, slotFor } from "./geometry";
import { bestOrientation, checkerPx, fitCamera } from "./framing";

describe("board geometry", () => {
  it("numbers points from the viewer's home board, bottom right, counter-clockwise", () => {
    expect(pointX(1)).toBeGreaterThan(pointX(6));
    expect(pointX(6)).toBeGreaterThan(pointX(7)); // the bar sits between 6 and 7
    expect(pointX(12)).toBeLessThan(pointX(7));
    expect(pointX(13)).toBeCloseTo(pointX(12));
    expect(pointX(24)).toBeCloseTo(pointX(1));
  });

  it("locates every point, the bar and the viewer's tray from their centers", () => {
    for (let p = 1; p <= 24; p++) {
      const s = slotFor({ kind: "point", point: p }, 0);
      expect(locate(s.pos[0], s.pos[2])).toBe(p);
    }
    expect(locate((DIMS.barStart + DIMS.barEnd) / 2, 1)).toBe(BAR);
    expect(locate((DIMS.trayStart + DIMS.trayEnd) / 2, 2)).toBe(OFF);
    expect(locate(0, DIMS.depth)).toBeNull();
  });

  it("keeps stacks of 15 on their point", () => {
    for (let i = 0; i < 15; i++) {
      const s = slotFor({ kind: "point", point: 13 }, i);
      expect(locate(s.pos[0], s.pos[2])).toBe(13);
    }
  });

  it("puts the viewer's checkers on 24, 13, 8, 6 at the start, from either side", () => {
    for (const side of [0, 1] as const) {
      const mine = locations(initialPosition(), side).filter((l) => l.side === side);
      expect(mine.map((l) => (l.loc.kind === "point" ? l.loc.point : 0)).sort((a, b) => a - b)).toEqual([6, 8, 13, 24]);
    }
  });
});

describe("framing", () => {
  it("fits the whole board with the margin", () => {
    const f = fitCamera(390, 596, "portrait", 15);
    expect(f.pxPerUnit).toBeGreaterThan(20);
  });

  it("rotates the board on portrait phones and not on tablets or landscape", () => {
    expect(bestOrientation(390, 596, 15)).toBe("portrait");
    expect(bestOrientation(844, 300, 15)).toBe("landscape");
    expect(bestOrientation(768, 700, 15)).toBe("landscape");
  });

  it("reports checker sizes on the reference phones (§11.1: measured, see 3d-art-direction.md)", () => {
    // Board region = viewport minus top strip (48), two bars (2 × 56), and the action bar (88).
    const sizes = [
      [360, 800],
      [390, 844],
      [430, 932],
    ].map(([w, h]) => Math.round(checkerPx(fitCamera(w!, h! - 248, "portrait", 15, 4))));
    expect(sizes[0]).toBeGreaterThanOrEqual(30);
    expect(sizes[2]).toBeGreaterThanOrEqual(sizes[0]!);
    console.info("checker px at 360/390/430 portrait:", sizes.join(", "));
  });
});
