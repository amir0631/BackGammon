// Pre-simulated dice throw (CLAUDE.md §11.1): run Rapier off-screen at a fixed 1/120 s step from the
// server's throw_seed, record each die's transform per step, read the resting top faces, and compute
// the visual offsets that make the dice land showing the server's values. Values never come from the
// physics: they are fixed before the throw (§2 rule 6).
import RAPIER from "@dimforge/rapier3d-compat";
import { faceOffset, topFace } from "./faces";
import { type Quat, prng } from "./math";

export const STEP = 1 / 120;
export const MAX_STEPS = 240;
export const MAX_ATTEMPTS = 3;

/** The throw area in die-edge units: the floor at y = 0, walls around it (dice hit only these, §11.1.7). */
export const ARENA = { halfWidth: 5, halfDepth: 3.5, wallHeight: 4 };

export interface DiceThrow {
  /** Per die: x, y, z, qx, qy, qz, qw for every recorded step. */
  frames: [Float32Array, Float32Array];
  steps: number;
  /** Rotation to apply to each die's visual mesh (visual = body * offset). */
  offsets: [Quat, Quat];
  /** The faces the physics landed on, before the offsets. */
  resting: [number, number];
  settled: boolean;
  attempts: number;
  seedUsed: number;
}

let ready: Promise<void> | null = null;

/** Loads the Rapier WASM once. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

function runOnce(seed: number): Omit<DiceThrow, "offsets" | "attempts"> {
  const rand = prng(seed);
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  world.timestep = STEP;
  const { halfWidth: w, halfDepth: d, wallHeight: h } = ARENA;
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const wall = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.6).setRestitution(0.3), fixed);
  wall(w, 0.5, d, 0, -0.5, 0); // floor
  wall(0.5, h, d, -w - 0.5, h, 0);
  wall(0.5, h, d, w + 0.5, h, 0);
  wall(w, h, 0.5, 0, h, -d - 0.5);
  wall(w, h, 0.5, 0, h, d + 0.5);

  const bodies = [0, 1].map((i) => {
    const q = normalize([rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5]);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-w + 1.2, 2.2 + i * 1.3 + rand() * 0.4, (i ? 0.9 : -0.9) + (rand() - 0.5) * 0.6)
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
        .setLinvel(9 + rand() * 5, 1 + rand() * 2, (rand() - 0.5) * 4)
        .setAngvel({ x: (rand() - 0.5) * 30, y: (rand() - 0.5) * 30, z: (rand() - 0.5) * 30 })
        .setLinearDamping(0.25)
        .setAngularDamping(0.6)
        .setCanSleep(true),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(0.6).setRestitution(0.25).setDensity(1), body);
    return body;
  });

  const frames: [number[], number[]] = [[], []];
  let steps = 0;
  let settled = false;
  while (steps < MAX_STEPS) {
    world.step();
    steps += 1;
    bodies.forEach((b, i) => {
      const t = b.translation();
      const r = b.rotation();
      frames[i]!.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
    });
    if (bodies.every((b) => b.isSleeping() || (speed(b.linvel()) < 0.02 && speed(b.angvel()) < 0.05))) {
      settled = bodies.every((b) => b.translation().y < 0.6); // resting flat, not stacked or leaning
      if (settled) break;
    }
  }
  const resting = bodies.map((b) => {
    const r = b.rotation();
    return topFace([r.x, r.y, r.z, r.w]);
  }) as [number, number];
  world.free();
  return { frames: [Float32Array.from(frames[0]), Float32Array.from(frames[1])], steps, resting, settled, seedUsed: seed };
}

function speed(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(q: Quat): Quat {
  const len = Math.hypot(...q) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/**
 * The throw for server `dice` and `throwSeed`. If it does not settle within MAX_STEPS, re-run with
 * throwSeed + 1 up to MAX_ATTEMPTS times (§11.1 step 5); `settled: false` means the caller falls back
 * to the lite-mode placement.
 */
export async function simulateThrow(dice: [number, number], throwSeed: number): Promise<DiceThrow> {
  await initPhysics();
  let result = runOnce(throwSeed >>> 0);
  let attempts = 1;
  while (!result.settled && attempts < MAX_ATTEMPTS) {
    result = runOnce((throwSeed + attempts) >>> 0);
    attempts += 1;
  }
  return {
    ...result,
    attempts,
    offsets: [faceOffset(result.resting[0], dice[0]), faceOffset(result.resting[1], dice[1])],
  };
}
