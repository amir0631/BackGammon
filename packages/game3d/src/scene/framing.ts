// Camera framing (docs/ui/3d-art-direction.md §6): a fixed camera, top-down with a small tilt toward
// the viewer, no orbit. The distance is solved so the whole board fits the canvas with a margin,
// and re-solved on every resize without reloading the scene (§11.7). Pure math, unit-tested.
import { boardCorners, BOARD, type Vec3 } from "./geometry";

export type Orientation = "portrait" | "landscape";

export const CAMERA = {
  /** Vertical field of view in degrees: narrow, so there is little perspective distortion. */
  fov: 30,
} as const;

export interface Framing {
  /** Camera position and look-at target, world units. */
  position: Vec3;
  target: Vec3;
  /** CSS px per board unit at the board's center (a checker is `checkerDiameter` units). */
  pxPerUnit: number;
}

/** Rotation of the board group about Y: portrait turns it a quarter so the long axis runs down. */
export function boardYaw(orientation: Orientation): number {
  return orientation === "portrait" ? -Math.PI / 2 : 0;
}

function rotateY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

interface Basis {
  dir: Vec3;
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
}

function basis(tiltDeg: number): Basis {
  const t = (tiltDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { dir: [0, c, s], right: [1, 0, 0], up: [0, s, -c], fwd: [0, -c, -s] };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function project(p: Vec3, cam: Vec3, b: Basis, tanHalf: number, aspect: number): [number, number] {
  const v: Vec3 = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
  const depth = dot(v, b.fwd);
  return [dot(v, b.right) / (depth * tanHalf * aspect), dot(v, b.up) / (depth * tanHalf)];
}

/**
 * Solves the camera for a canvas of `width` × `height` CSS px with `margin` px kept clear on every
 * side (8 px plus any safe-area inset the app passes).
 */
export function fitCamera(
  width: number,
  height: number,
  orientation: Orientation,
  tiltDeg: number,
  margin = 8,
): Framing {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const aspect = w / h;
  const tanHalf = Math.tan((CAMERA.fov * Math.PI) / 360);
  const b = basis(tiltDeg);
  const yaw = boardYaw(orientation);
  const corners = boardCorners().map((p) => rotateY(p, yaw));
  const limitX = Math.max(0.05, 1 - (2 * margin) / w);
  const limitY = Math.max(0.05, 1 - (2 * margin) / h);

  let target: Vec3 = [0, 0, 0];
  let distance = 20;
  for (let iter = 0; iter < 4; iter++) {
    let lo = 1;
    let hi = 400;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const cam: Vec3 = [target[0] + b.dir[0] * mid, target[1] + b.dir[1] * mid, target[2] + b.dir[2] * mid];
      const fits = corners.every((p) => {
        const [x, y] = project(p, cam, b, tanHalf, aspect);
        return Math.abs(x) <= limitX && Math.abs(y) <= limitY;
      });
      if (fits) hi = mid;
      else lo = mid;
    }
    distance = hi;
    // Center the projected board vertically (the tilt makes the near edge larger).
    const cam: Vec3 = [target[0] + b.dir[0] * distance, target[1] + b.dir[1] * distance, target[2] + b.dir[2] * distance];
    const ys = corners.map((p) => project(p, cam, b, tanHalf, aspect)[1]);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    if (Math.abs(mid) < 1e-4) break;
    // One NDC unit at the target is `distance * tanHalf` world units along camera up (≈ -z).
    target = [target[0], target[1], target[2] - mid * distance * tanHalf * 0.98];
  }
  const position: Vec3 = [target[0] + b.dir[0] * distance, target[1] + b.dir[1] * distance, target[2] + b.dir[2] * distance];
  const pxPerUnit = h / 2 / (distance * tanHalf);
  return { position, target, pxPerUnit };
}

/**
 * The orientation that shows the larger board (portrait phones: the rotated board). `portraitGain`
 * is how much larger the rotated board must be to win over the natural one.
 */
export function bestOrientation(width: number, height: number, tiltDeg: number, portraitGain = 1.02): Orientation {
  const p = fitCamera(width, height, "portrait", tiltDeg).pxPerUnit;
  const l = fitCamera(width, height, "landscape", tiltDeg).pxPerUnit;
  return p > l * portraitGain ? "portrait" : "landscape";
}

/** Rendered checker width in CSS px for a framing (for the §11.1 size check). */
export function checkerPx(f: Framing): number {
  return f.pxPerUnit * BOARD.checkerDiameter;
}
