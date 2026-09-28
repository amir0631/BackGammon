import { describe, expect, it } from "vitest";
import { FACE_NORMALS, faceOffset, topFace } from "./faces";
import { type Quat, fromAxisAngle, multiply } from "./math";
import { MAX_ATTEMPTS, MAX_STEPS, simulateThrow } from "./simulate";

/** The 24 rotations of a cube. */
function cubeRotations(): Quat[] {
  const out: Quat[] = [];
  const quarter = Math.PI / 2;
  for (const face of [0, 1, 2, 3, 4, 5]) {
    const base: Quat =
      face < 4 ? fromAxisAngle([1, 0, 0], face * quarter) : fromAxisAngle([0, 0, 1], face === 4 ? quarter : -quarter);
    for (let k = 0; k < 4; k++) out.push(multiply(fromAxisAngle([0, 1, 0], k * quarter), base));
  }
  return out;
}

describe("face offsets", () => {
  it("show every wanted value whatever face the body rests on", () => {
    for (const body of cubeRotations()) {
      const resting = topFace(body);
      for (const wanted of [1, 2, 3, 4, 5, 6]) {
        expect(topFace(multiply(body, faceOffset(resting, wanted)))).toBe(wanted);
      }
    }
    expect(Object.keys(FACE_NORMALS)).toHaveLength(6);
  });
});

// §16: "10,000 seeded throws for every value pair": the physics never depends on the values (they only
// pick the offsets), so each seeded throw is checked against all 21 value pairs. DICE_THROWS=10000 runs
// the full count; CI runs a sample.
const THROWS = Number(process.env.DICE_THROWS ?? 400);

describe("pre-simulated throws", () => {
  it(`land on the server values for ${THROWS} seeds and every pair, within the retry budget`, async () => {
    let fallbacks = 0;
    let retries = 0;
    for (let seed = 0; seed < THROWS; seed++) {
      const throwSeed = (seed * 2654435761) >>> 0;
      const t = await simulateThrow([1, 1], throwSeed);
      expect(t.steps).toBeLessThanOrEqual(MAX_STEPS);
      expect(t.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
      retries += t.attempts - 1;
      if (!t.settled) {
        fallbacks += 1;
        continue;
      }
      const last = (t.steps - 1) * 7;
      const rest = [0, 1].map((i) => {
        const f = t.frames[i]!;
        return [f[last + 3]!, f[last + 4]!, f[last + 5]!, f[last + 6]!] as Quat;
      });
      expect(rest.map(topFace)).toEqual(t.resting);
      for (let d1 = 1; d1 <= 6; d1++) {
        for (let d2 = d1; d2 <= 6; d2++) {
          expect(topFace(multiply(rest[0]!, faceOffset(t.resting[0], d1)))).toBe(d1);
          expect(topFace(multiply(rest[1]!, faceOffset(t.resting[1], d2)))).toBe(d2);
        }
      }
    }
    // Nearly every throw settles on the first or a retried run; the rest use the lite placement.
    expect(fallbacks / THROWS).toBeLessThan(0.01);
    console.info(`dice: ${THROWS} seeds, ${retries} retries, ${fallbacks} fallbacks`);
  }, 600_000);

  it("is deterministic for a seed", async () => {
    const a = await simulateThrow([3, 5], 42);
    const b = await simulateThrow([3, 5], 42);
    expect(Array.from(a.frames[0])).toEqual(Array.from(b.frames[0]));
    expect(a.resting).toEqual(b.resting);
  });
});
