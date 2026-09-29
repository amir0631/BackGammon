import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/legal.json";
import { TurnBuilder, finalsOf } from "./moves";
import { type Player, decode, encode, initialPosition, pipCount } from "./position";

interface Case {
  position: string;
  player: Player;
  dice: [number, number];
  legal: number[][][];
  finals: string[];
}

const cases = fixtures as unknown as Case[];

/** Every final position the builder lets a player reach by any order of steps. */
function reachable(b: TurnBuilder, out = new Set<string>()): Set<string> {
  if (b.complete) out.add(encode(b.position));
  for (const from of b.sources()) {
    for (const t of b.targets(from)) {
      b.move(from, t.to);
      reachable(b, out);
      b.undo();
    }
  }
  return out;
}

describe("TurnBuilder against the Python engine", () => {
  it("has fixtures", () => {
    expect(cases.length).toBeGreaterThan(50);
  });

  it.each(cases.map((c, i) => [i, c] as const))("case %i reaches exactly the engine's final positions", (_i, c) => {
    const b = new TurnBuilder(decode(c.position), c.player, c.dice, c.legal);
    expect(b.canMove).toBe(c.legal.length > 0);
    if (!c.legal.length) return;
    expect([...finalsOf(decode(c.position), c.player, c.dice, c.legal)].sort()).toEqual(c.finals);
    expect([...reachable(b)].sort()).toEqual(c.finals);
    // The server's own step order is accepted, and undo returns to the start.
    for (const [from, to] of c.legal[0]!) b.move(from!, to!);
    expect(b.complete).toBe(true);
    expect(b.moves()).toEqual(c.legal[0]);
    b.reset();
    expect(encode(b.position)).toBe(c.position);
  });
});

describe("TurnBuilder", () => {
  it("rejects a step that leads nowhere legal", () => {
    const start = initialPosition();
    const legal = [[[13, 7], [8, 7]]];
    const b = new TurnBuilder(start, 0, [6, 1], legal);
    expect(() => b.move(24, 18)).toThrow();
    expect(b.sources()).toEqual([13, 8]);
    expect(b.targets(13)).toEqual([{ to: 7, die: 6 }]);
    b.move(8, 7);
    expect(b.remainingDice).toEqual([6]);
    expect(b.complete).toBe(false);
    b.move(13, 7);
    expect(b.complete).toBe(true);
    expect(pipCount(b.position, 0)).toBe(167 - 7);
  });

  it("round-trips position encoding", () => {
    const p = initialPosition();
    expect(decode(encode(p))).toEqual(p);
    expect(() => decode("1,2")).toThrow();
  });
});
