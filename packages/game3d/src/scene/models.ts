// Base models, built procedurally (original geometry, §11.2): one board, one checker, one die.
// Themes change materials and textures only. Triangle budget (§11.4): board ≈ 200, checkers
// 30 × ≈ 480, dice 2 × ≈ 1,150, markers and shadows < 200 — about 17k in total.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BOARD, DIMS } from "./geometry";
import { dieUvCell } from "./textures";

/** Frame rails around the fields and the tray (raised above the field). */
export function railsGeometry(): THREE.BufferGeometry {
  const d = DIMS;
  const b = BOARD;
  const h = b.railHeight;
  const parts: THREE.BufferGeometry[] = [];
  const box = (x0: number, x1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
    g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    parts.push(g);
  };
  const L = d.length / 2;
  const D = d.depth / 2;
  box(-L, L, -D, -D + b.frame); // top rail
  box(-L, L, D - b.frame, D); // bottom rail
  box(-L, -L + b.frame, -D + b.frame, D - b.frame); // left rail
  box(L - b.frame, L, -D + b.frame, D - b.frame); // right rail
  box(d.rightFieldEnd, d.trayStart, -D + b.frame, D - b.frame); // divider before the tray
  box(d.trayStart, d.trayEnd, -b.midGap / 4, b.midGap / 4); // tray split: own half / opponent half
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged!;
}

/** Brass corner caps and hinge plates on the rails. */
export function brassGeometry(): THREE.BufferGeometry {
  const d = DIMS;
  const b = BOARD;
  const parts: THREE.BufferGeometry[] = [];
  const cap = b.frame * 1.25;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.BoxGeometry(cap, 0.04, cap);
      g.translate(sx * (d.length / 2 - cap / 2 + 0.01), b.railHeight + 0.02, sz * (d.depth / 2 - cap / 2 + 0.01));
      parts.push(g);
    }
  }
  const hingeX = (d.barStart + d.barEnd) / 2;
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(b.bar * 0.8, 0.035, b.frame * 0.7);
    g.translate(hingeX, b.railHeight + 0.018, sz * (d.depth / 2 - b.frame / 2));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged!;
}

/**
 * Checker: a lathe with bevelled edges. Top-facing vertices get planar UVs into the motif texture;
 * the sides sample its corner, which is rim color.
 */
export function checkerGeometry(segments = 40): THREE.BufferGeometry {
  const r = BOARD.checkerDiameter / 2;
  const h = BOARD.checkerHeight;
  const profile = [
    new THREE.Vector2(0.0001, 0),
    new THREE.Vector2(r * 0.94, 0),
    new THREE.Vector2(r, h * 0.18),
    new THREE.Vector2(r, h * 0.78),
    new THREE.Vector2(r * 0.95, h),
    new THREE.Vector2(r * 0.86, h * 0.97),
    new THREE.Vector2(0.0001, h * 0.9),
  ];
  const g = new THREE.LatheGeometry(profile, segments);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (y >= h * 0.89) uv.setXY(i, 0.5 + x / (2 * r), 0.5 - z / (2 * r));
    else uv.setXY(i, 0.02, 0.02);
  }
  uv.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * Die: a rounded cube with UVs remapped into the face atlas. Face values match the physics
 * (dice/faces.ts): +y 1, −y 6, +x 2, −x 5, +z 3, −z 4.
 */
export function dieGeometry(segments = 3): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(1, 1, 1, segments, 0.12);
  const values = [2, 5, 1, 6, 3, 4]; // BoxGeometry group order: px, nx, py, ny, pz, nz
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const index = g.getIndex();
  const done = new Set<number>();
  g.groups.forEach((group, gi) => {
    const [col, row] = dieUvCell(values[gi]!);
    for (let k = group.start; k < group.start + group.count; k++) {
      const vi = index ? index.getX(k) : k;
      if (done.has(vi)) continue;
      done.add(vi);
      const u = uv.getX(vi);
      const v = uv.getY(vi);
      uv.setXY(vi, (col + u) / 3, 1 - (row + 1 - v) / 2);
    }
  });
  uv.needsUpdate = true;
  g.clearGroups();
  return g;
}
