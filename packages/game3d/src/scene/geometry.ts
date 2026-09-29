// Board layout in board units (1 unit = one point's width), natural orientation: the long axis is
// X (screen right = +x), the short axis is Z (toward the viewer = +z), Y is up. Pure math, no
// three.js, so it is unit-tested. Everything is in the viewer's numbering: points 1–6 are the
// viewer's home board (bottom right), 25 is the viewer's bar, 0 the viewer's borne-off tray; the
// opponent's bar and tray are separate locations. The board never mirrors for RTL (§11.1).
import { BAR, OFF, type Player, type Position } from "@bg/game-core";

export const BOARD = {
  frame: 0.28,
  /** Point width along the long axis. */
  pitch: 1,
  checkerDiameter: 0.94,
  checkerHeight: 0.19,
  /** Point length along the short axis (four checkers before stacking in layers). */
  pointLength: 4.05,
  midGap: 0.62,
  bar: 0.86,
  tray: 1.02,
  /** Height of the raised frame rails above the field. */
  railHeight: 0.2,
  /** Board slab thickness under the field. */
  slab: 0.32,
} as const;

/** Checkers that fit in one row of a point before the next layer starts. */
export const ROW_CAPACITY = 4;

export const DIMS = (() => {
  const b = BOARD;
  const length = b.frame + 6 * b.pitch + b.bar + 6 * b.pitch + b.frame + b.tray + b.frame;
  const depth = b.frame + b.pointLength + b.midGap + b.pointLength + b.frame;
  const x0 = -length / 2;
  const leftFieldStart = x0 + b.frame;
  const leftFieldEnd = leftFieldStart + 6 * b.pitch;
  const barStart = leftFieldEnd;
  const barEnd = barStart + b.bar;
  const rightFieldStart = barEnd;
  const rightFieldEnd = rightFieldStart + 6 * b.pitch;
  const trayStart = rightFieldEnd + b.frame;
  const trayEnd = trayStart + b.tray;
  const zTop = -depth / 2 + b.frame;
  const zBottom = depth / 2 - b.frame;
  return { length, depth, leftFieldStart, leftFieldEnd, barStart, barEnd, rightFieldStart, rightFieldEnd, trayStart, trayEnd, zTop, zBottom };
})();

/** Where a checker is: a point (viewer numbering 1–24), a bar, or a tray. */
export type Location =
  | { kind: "point"; point: number }
  | { kind: "bar"; own: boolean }
  | { kind: "off"; own: boolean };

export function locKey(l: Location): string {
  return l.kind === "point" ? `p${l.point}` : `${l.kind}${l.own ? "S" : "O"}`;
}

/** Center X of a point, viewer numbering. */
export function pointX(point: number): number {
  const d = DIMS;
  if (point <= 6) return d.rightFieldEnd - (point - 0.5);
  if (point <= 12) return d.leftFieldEnd - (point - 6.5);
  if (point <= 18) return d.leftFieldStart + (point - 12.5);
  return d.rightFieldStart + (point - 18.5);
}

/** Bottom row (the viewer's side) for points 1–12. */
export function isBottomRow(point: number): boolean {
  return point <= 12;
}

export type Vec3 = [number, number, number];

/** Position and whether the checker stands on its edge (borne off), for stack index `i` of `n`. */
export interface Slot {
  pos: Vec3;
  edge: boolean;
}

export function slotFor(loc: Location, i: number): Slot {
  const b = BOARD;
  const d = DIMS;
  const r = b.checkerDiameter / 2;
  const h = b.checkerHeight;
  if (loc.kind === "point") {
    const layer = layerOf(i);
    const x = pointX(loc.point);
    const along = (layer.slot + (layer.layer % 2 ? 0.5 : 0)) * b.checkerDiameter + r + 0.03;
    const z = isBottomRow(loc.point) ? d.zBottom - along : d.zTop + along;
    return { pos: [x, layer.layer * h, z], edge: false };
  }
  if (loc.kind === "bar") {
    // The viewer's checkers wait on the top half of the bar (they enter the opponent's home at the
    // top right); the opponent's on the bottom half.
    const x = (d.barStart + d.barEnd) / 2;
    const along = (i % 4) * b.checkerDiameter + r + 0.25;
    const z = loc.own ? -along : along;
    return { pos: [x, Math.floor(i / 4) * h, z], edge: false };
  }
  // Borne off: standing on edge side by side in the tray, from the rim inward.
  const x = (d.trayStart + d.trayEnd) / 2;
  const along = 0.12 + i * (h + 0.02) + h / 2;
  const z = loc.own ? d.zBottom - along : d.zTop + along;
  return { pos: [x, r * 0.92, z], edge: true };
}

function layerOf(i: number): { layer: number; slot: number } {
  // Rows of 4, 3, 4, 3, … (odd layers sit in the gaps of the layer below).
  let rest = i;
  let layer = 0;
  for (;;) {
    const cap = layer % 2 ? ROW_CAPACITY - 1 : ROW_CAPACITY;
    if (rest < cap) return { layer, slot: rest };
    rest -= cap;
    layer += 1;
  }
}

/** The viewer's numbering of an absolute point (A's numbering). */
export function toViewer(absPoint: number, perspective: Player): number {
  return perspective === 0 ? absPoint : 25 - absPoint;
}

/** Checker counts per location for each side, in the viewer's frame. */
export function locations(position: Position, perspective: Player): { side: Player; loc: Location; count: number }[] {
  const out: { side: Player; loc: Location; count: number }[] = [];
  for (let abs = 1; abs <= 24; abs++) {
    const v = position.board[abs - 1]!;
    if (v === 0) continue;
    out.push({ side: v > 0 ? 0 : 1, loc: { kind: "point", point: toViewer(abs, perspective) }, count: Math.abs(v) });
  }
  for (const side of [0, 1] as Player[]) {
    const own = side === perspective;
    if (position.bar[side]) out.push({ side, loc: { kind: "bar", own }, count: position.bar[side] });
    if (position.off[side]) out.push({ side, loc: { kind: "off", own }, count: position.off[side] });
  }
  return out;
}

/**
 * The location under a board-local (natural orientation) point, for the viewer's input: 1–24,
 * BAR (25) for the viewer's bar area, OFF (0) for the viewer's tray, or null. Hit areas cover the
 * whole point strip plus half the middle gap, so they are larger than the checkers (§11.1).
 */
export function locate(x: number, z: number): number | null {
  const d = DIMS;
  if (Math.abs(z) > d.depth / 2) return null;
  if (x >= d.trayStart - BOARD.frame && x <= d.trayEnd + BOARD.frame) return z > 0 ? OFF : null;
  if (x >= d.barStart && x < d.barEnd) return BAR;
  const bottom = z >= 0;
  if (x >= d.rightFieldStart && x < d.rightFieldEnd) {
    const k = Math.min(5, Math.floor(x - d.rightFieldStart)); // 0 = next to the bar
    return bottom ? 6 - k : 19 + k;
  }
  if (x >= d.leftFieldStart && x < d.leftFieldEnd) {
    const k = Math.min(5, Math.floor(x - d.leftFieldStart)); // 0 = the left edge
    return bottom ? 12 - k : 13 + k;
  }
  return null;
}

/** Bounding box corners of the board (for framing), natural orientation. */
export function boardCorners(): Vec3[] {
  const d = DIMS;
  const hx = d.length / 2;
  const hz = d.depth / 2;
  const ys = [-BOARD.slab, BOARD.railHeight + 0.6];
  const out: Vec3[] = [];
  for (const x of [-hx, hx]) for (const y of ys) for (const z of [-hz, hz]) out.push([x, y, z]);
  return out;
}
