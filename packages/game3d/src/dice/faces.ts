// Die faces in the die's local frame. Opposite faces sum to 7.
import { type Quat, type Vec3, IDENTITY, cross, dot, fromAxisAngle, rotate } from "./math";

export const FACE_NORMALS: Record<number, Vec3> = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [1, 0, 0],
  5: [-1, 0, 0],
  3: [0, 0, 1],
  4: [0, 0, -1],
};

const UP: Vec3 = [0, 1, 0];

/** The face value pointing up for a body rotation. */
export function topFace(rotation: Quat): number {
  let best = 1;
  let bestDot = -Infinity;
  for (const [value, normal] of Object.entries(FACE_NORMALS)) {
    const d = dot(rotate(rotation, normal), UP);
    if (d > bestDot) {
      bestDot = d;
      best = Number(value);
    }
  }
  return best;
}

/**
 * A cube symmetry R with R * normal(wanted) = normal(resting). Applied to the visual mesh inside the
 * physics body (visual = body * R), it makes the die show `wanted` where it physically came to rest
 * showing `resting` (§11.1 step 3).
 */
export function faceOffset(resting: number, wanted: number): Quat {
  if (resting === wanted) return IDENTITY;
  const from = FACE_NORMALS[wanted]!;
  const to = FACE_NORMALS[resting]!;
  if (dot(from, to) < -0.5) {
    // Opposite faces: half a turn about any axis perpendicular to them.
    const axis: Vec3 = Math.abs(from[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0];
    return fromAxisAngle(axis, Math.PI);
  }
  return fromAxisAngle(cross(from, to), Math.PI / 2);
}
