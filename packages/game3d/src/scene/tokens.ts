// Checker identity across positions, so a move animates the checker that moved (pure, tested).
// Each side has 15 tokens; when the position changes, tokens that stay on a location keep their
// slot, the top checkers leaving a location pair up with the new slots in order of travel.
import { applyStep, fromView, view, BAR, OFF, type Player, type Position } from "@bg/game-core";
import { locKey, locations, type Location } from "./geometry";

export interface Token {
  side: Player;
  loc: Location;
  index: number;
}

/** Tokens for a position, in a stable order: side, location, stack index. */
export function layoutTokens(position: Position, perspective: Player): Token[] {
  const out: Token[] = [];
  for (const { side, loc, count } of locations(position, perspective)) {
    for (let index = 0; index < count; index++) out.push({ side, loc, index });
  }
  return out;
}

function order(l: Location): number {
  // Travel order for pairing: bar first, then points 24 → 1, then off.
  if (l.kind === "bar") return 100;
  if (l.kind === "off") return -1;
  return l.point;
}

/**
 * Re-assigns `current` tokens (same array positions = same visual checker) to `next`. Returns the
 * new token for every current index.
 */
export function pairTokens(current: Token[], next: Position, perspective: Player): Token[] {
  const result: Token[] = current.map((t) => ({ ...t }));
  for (const side of [0, 1] as Player[]) {
    const targets = new Map<string, { loc: Location; count: number }>();
    for (const l of locations(next, perspective)) if (l.side === side) targets.set(locKey(l.loc), { loc: l.loc, count: l.count });
    const groups = new Map<string, number[]>();
    current.forEach((t, i) => {
      if (t.side !== side) return;
      const key = locKey(t.loc);
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    const leaving: number[] = [];
    const arriving: { loc: Location; index: number }[] = [];
    for (const [key, idxs] of groups) {
      idxs.sort((a, b) => current[a]!.index - current[b]!.index);
      const keep = targets.get(key)?.count ?? 0;
      idxs.forEach((i, n) => {
        if (n < keep) result[i] = { side, loc: current[i]!.loc, index: n };
        else leaving.push(i);
      });
    }
    for (const [key, { loc, count }] of targets) {
      const have = groups.get(key)?.length ?? 0;
      for (let n = have; n < count; n++) arriving.push({ loc, index: n });
    }
    leaving.sort((a, b) => order(current[b]!.loc) - order(current[a]!.loc));
    arriving.sort((a, b) => order(b.loc) - order(a.loc));
    leaving.forEach((i, n) => {
      const to = arriving[n];
      if (to) result[i] = { side, loc: to.loc, index: to.index };
    });
  }
  return result;
}

/**
 * The positions after each [from, to] step of a turn (mover's numbering; 25 = bar, 0 = off), for
 * step-by-step playback of the opponent's move. Null when a step does not apply (then the caller
 * jumps straight to the final position).
 */
export function stepPositions(start: Position, player: Player, moves: number[][]): Position[] | null {
  let v = view(start, player);
  const out: Position[] = [];
  for (const [from, to] of moves as [number, number][]) {
    if (from === undefined || to === undefined || !v.mine[from]) return null;
    if (from !== BAR && from < 1) return null;
    const hit = to !== OFF && to >= 1 && to <= 24 && v.theirs[to] === 1;
    v = applyStep(v, { from, to, die: 0, hit });
    out.push(fromView(player, v));
  }
  return out;
}

/** CSS-style cubic-bezier easing (x1, y1, x2, y2) evaluated at t in [0, 1]. */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number], t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let s = t;
  for (let i = 0; i < 8; i++) {
    const x = ((ax * s + bx) * s + cx) * s - t;
    const dx = (3 * ax * s + 2 * bx) * s + cx;
    if (Math.abs(x) < 1e-5 || dx === 0) break;
    s -= x / dx;
  }
  return ((ay * s + by) * s + cy) * s;
}
