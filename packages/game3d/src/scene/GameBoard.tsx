"use client";

// React Three Fiber scene (CLAUDE.md §11.1): board, checkers, pre-simulated physics dice, 3D
// highlights, and ray-cast input. Layout-agnostic: the app passes orientation and margins, and the
// camera is re-framed on every resize without reloading the scene (§11.7). Rendering is on demand:
// frames are drawn only while something changes or animates (battery, §11.4).
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { duration as fullDuration, easingCurve, reducedDuration, scene3d } from "@bg/design-tokens";
import { encode, BAR, OFF, type Player, type Position } from "@bg/game-core";
import { faceOffset } from "../dice/faces";
import { multiply, prng, fromAxisAngle, type Quat } from "../dice/math";
import type { DiceThrow } from "../dice/simulate";
import { buildAssets, type SceneAssets } from "./assets";
import { boardYaw, CAMERA, fitCamera, type Orientation } from "./framing";
import { BOARD, DIMS, locate, locKey, pointX, slotFor, type Location, type Vec3 } from "./geometry";
import { sceneLight } from "./theme";
import { bezier, layoutTokens, pairTokens, stepPositions, type Token } from "./tokens";
import type { BoardInput, DiceShow, GameBoardProps, MoveHint } from "./types";

/**
 * Open question (patterns.md Q8, match.md §10 Q11): under reduced motion the dice use the lite
 * fade instead of the physics throw. One flag, so the product decision is a one-line change.
 */
export const REDUCED_MOTION_DICE_FADE = true;

const DIE = 0.58; // die edge in board units
/** Gap between steps when a move plays back step by step (3d-art-direction.md §7). */
const STEP_GAP_MS = 60;
const DRAG_LIFT = 0.55;
const SELECT_LIFT = 0.1;

export function GameBoard(props: GameBoardProps) {
  const { lite } = props;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, lite ? scene3d.dprCap.lite : scene3d.dprCap.normal]}
      shadows
      gl={{ antialias: !lite, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
      camera={{ fov: CAMERA.fov, near: 0.5, far: 400, position: [0, 30, 8] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = sceneLight.exposure;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
      style={{ touchAction: "none" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

function Scene(props: GameBoardProps) {
  const { orientation, margin = 8, lite, labels, themes } = props;
  const quality = lite ? "lite" : "normal";
  const invalidate = useThree((s) => s.invalidate);
  const assets = useMemo(
    () => buildAssets(themes, quality, labels),
    // Rebuild only when the look changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themes.board, themes.checkers[0], themes.checkers[1], quality, labels.digits.join("|"), labels.off, labels.font],
  );
  useEffect(() => () => assets.dispose(), [assets]);
  useEffect(() => invalidate(), [assets, invalidate, props]);

  const yaw = boardYaw(orientation);
  const board = useRef<THREE.Group>(null);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ loc: number; point: Vec3 } | null>(null);

  return (
    <>
      <CameraRig orientation={orientation} margin={margin} />
      <Lights lite={lite} />
      <FrameWatch onReady={props.onReady} onSlow={props.onSlow} />
      <group ref={board} rotation={[0, yaw, 0]}>
        <Board assets={assets} />
        <Checkers {...props} assets={assets} drag={drag} />
        <Markers {...props} assets={assets} hover={hover} yaw={yaw} />
        <Dice {...props} assets={assets} />
        {props.input && <InputPlane input={props.input} group={board} drag={drag} onHover={setHover} />}
      </group>
    </>
  );
}

// ---- Camera and light --------------------------------------------------------------------------

function CameraRig({ orientation, margin }: { orientation: Orientation; margin: number }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    const f = fitCamera(size.width, size.height, orientation, scene3d.cameraTiltDeg, margin);
    camera.position.set(...f.position);
    camera.lookAt(...f.target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, orientation, margin, invalidate]);
  return null;
}

function Lights({ lite }: { lite: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    // A tight shadow frustum around the field: only the dice cast shadows (§11.1).
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -DIMS.length / 2;
    cam.right = DIMS.length / 2;
    cam.top = DIMS.depth / 2;
    cam.bottom = -DIMS.depth / 2;
    cam.near = 1;
    cam.far = 40;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(512, 512);
    l.shadow.bias = -0.0015;
  }, [lite]);
  return (
    <>
      <hemisphereLight args={[sceneLight.sky, sceneLight.ground, lite ? sceneLight.hemisphere.lite : sceneLight.hemisphere.normal]} />
      {!lite && (
        // Key light from the top left of the board in its natural orientation; fixed to the board.
        <directionalLight ref={light} position={[-8, 16, -6]} color={sceneLight.key.color} intensity={sceneLight.key.intensity} castShadow />
      )}
    </>
  );
}

/** Ready after the first frame; suggests lite mode after 10 s of animation under 30 fps (MA-16). */
function FrameWatch({ onReady, onSlow }: { onReady?: () => void; onSlow?: () => void }) {
  const ready = useRef(false);
  const window_ = useRef({ time: 0, frames: 0, fired: false });
  useFrame((_, delta) => {
    if (!ready.current) {
      ready.current = true;
      onReady?.();
      return;
    }
    const w = window_.current;
    if (w.fired || delta > 0.25) return; // idle gaps between on-demand frames do not count
    w.time += delta;
    w.frames += 1;
    if (w.time >= 10) {
      if (w.frames / w.time < scene3d.targetFps.lite) {
        w.fired = true;
        onSlow?.();
      }
      w.time = 0;
      w.frames = 0;
    }
  });
  return null;
}

// ---- Board ---------------------------------------------------------------------------------------

function Board({ assets }: { assets: SceneAssets }) {
  const d = DIMS;
  return (
    <group>
      <mesh position={[0, -BOARD.slab / 2, 0]} material={assets.slab}>
        <boxGeometry args={[d.length, BOARD.slab, d.depth]} />
      </mesh>
      <mesh geometry={assets.geo.plane} material={assets.boardTop} scale={[d.length, 1, d.depth]} position={[0, 0.001, 0]} receiveShadow />
      <mesh geometry={assets.geo.rails} material={assets.rails} />
      <mesh geometry={assets.geo.brass} material={assets.brass} />
      <mesh geometry={assets.geo.plane} material={assets.contact} scale={[d.length * 1.22, 1, d.depth * 1.3]} position={[0, -BOARD.slab - 0.02, 0.25]} renderOrder={-1} />
    </group>
  );
}

// ---- Checkers ----------------------------------------------------------------------------------

interface Anim {
  from: Vec3;
  to: Vec3;
  fromEdge: boolean;
  toEdge: boolean;
  start: number;
  dur: number;
  arc: number;
}

type CheckersProps = GameBoardProps & { assets: SceneAssets; drag: React.RefObject<{ loc: number; point: Vec3 } | null> };

function ownLoc(v: number): Location {
  if (v === BAR) return { kind: "bar", own: true };
  if (v === OFF) return { kind: "off", own: true };
  return { kind: "point", point: v };
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function Checkers({ position, perspective, snapKey, moveHint, input, reducedMotion, lite, assets, drag }: CheckersProps) {
  const invalidate = useThree((s) => s.invalidate);
  const meshes = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  const blobs = useRef<THREE.InstancedMesh>(null);
  const state = useRef<{
    tokens: Token[];
    anims: Anim[];
    queue: Position[];
    busyUntil: number;
    key: string;
    snap: number;
    hint: string | null;
    last: Position | null;
  }>({ tokens: [], anims: [], queue: [], busyUntil: 0, key: "", snap: -1, hint: null, last: null });
  const durations = reducedMotion ? reducedDuration : fullDuration;
  const flat = lite || reducedMotion;

  const place = (tokens: Token[]): Anim[] =>
    tokens.map((t) => {
      const s = slotFor(t.loc, t.index);
      return { from: s.pos, to: s.pos, fromEdge: s.edge, toEdge: s.edge, start: 0, dur: 0, arc: 0 };
    });

  // New position from the app: snap on a full state, else queue it (step by step with a hint).
  useEffect(() => {
    const st = state.current;
    const key = `${encode(position)}/${perspective}`;
    if (st.snap !== snapKey || st.tokens.length === 0 || !st.last || !st.key.endsWith(`/${perspective}`)) {
      st.tokens = layoutTokens(position, perspective);
      st.anims = place(st.tokens);
      st.queue = [];
      st.snap = snapKey;
      st.key = key;
      st.last = position;
      st.hint = moveHint?.key ?? null;
      invalidate();
      return;
    }
    if (key === st.key) return;
    let stages: Position[] = [position];
    if (moveHint && moveHint.key !== st.hint) {
      st.hint = moveHint.key;
      const steps = stepPositions(st.last, moveHint.player, moveHint.moves);
      if (steps && steps.length && encode(steps[steps.length - 1]!) === encode(position)) stages = steps;
    }
    st.queue.push(...stages);
    st.key = key;
    st.last = position;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, perspective, snapKey, moveHint, invalidate]);

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), bs: new THREE.Vector3() }),
    [],
  );
  const edgeQ = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), []);

  useFrame(() => {
    const st = state.current;
    const now = performance.now();
    let active = false;
    if (st.queue.length && now >= st.busyUntil) {
      const stage = st.queue.shift()!;
      const next = pairTokens(st.tokens, stage, perspective);
      let longest = 0;
      next.forEach((t, i) => {
        const prev = st.tokens[i]!;
        if (locKey(prev.loc) === locKey(t.loc) && prev.index === t.index) return;
        const cur = current(st.anims[i]!, now);
        const slot = slotFor(t.loc, t.index);
        const far = dist(cur.pos, slot.pos);
        const long = t.loc.kind !== "point" || prev.loc.kind !== "point" || far > 6;
        const dur = far < 1.6 ? durations.checkerShort : long ? durations.checkerLong : durations.checker;
        st.anims[i] = { from: cur.pos, to: slot.pos, fromEdge: cur.edge, toEdge: slot.edge, start: now, dur, arc: flat ? 0 : 0.45 };
        longest = Math.max(longest, dur);
      });
      st.tokens = next;
      st.busyUntil = now + longest + (reducedMotion ? 0 : STEP_GAP_MS);
    }
    if (st.queue.length) active = true;

    // The viewer's top checker at the selected (or dragged) point lifts.
    const lifted = drag.current?.loc ?? input?.selected ?? null;
    let liftIndex = -1;
    if (lifted !== null) {
      const want = locKey(ownLoc(lifted));
      let best = -1;
      st.tokens.forEach((t, i) => {
        if (t.side === perspective && locKey(t.loc) === want && t.index > best) {
          best = t.index;
          liftIndex = i;
        }
      });
    }

    const counters = [0, 0];
    st.tokens.forEach((t, i) => {
      const a = st.anims[i]!;
      const c = current(a, now);
      if (now < a.start + a.dur) active = true;
      let [x, y, z] = c.pos;
      if (i === liftIndex) {
        if (drag.current?.point) [x, , z] = drag.current.point;
        y += drag.current?.point ? DRAG_LIFT : SELECT_LIFT;
      }
      tmp.p.set(x, y, z);
      tmp.q.identity();
      if (c.edge) tmp.q.copy(edgeQ);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      const n = counters[t.side]!++;
      meshes[t.side]!.current?.setMatrixAt(n, tmp.m);
      // Soft blob under each checker (flat on the field).
      const b = BOARD.checkerDiameter * (c.edge ? 0.6 : 1.25);
      tmp.p.set(x, 0.004, z);
      tmp.e.identity();
      tmp.bs.set(b, 1, c.edge ? BOARD.checkerHeight * 2 : b);
      tmp.m.compose(tmp.p, tmp.e, tmp.bs);
      blobs.current?.setMatrixAt(i, tmp.m);
    });
    meshes.forEach((m, side) => {
      if (!m.current) return;
      m.current.count = counters[side]!;
      m.current.instanceMatrix.needsUpdate = true;
    });
    if (blobs.current) {
      blobs.current.count = st.tokens.length;
      blobs.current.instanceMatrix.needsUpdate = true;
    }
    if (active) invalidate();
  });

  return (
    <>
      <instancedMesh ref={blobs} args={[assets.geo.plane, assets.blob, 30]} frustumCulled={false} renderOrder={1} />
      <instancedMesh ref={meshes[0]} args={[assets.geo.checker, assets.checkers[0], 15]} frustumCulled={false} />
      <instancedMesh ref={meshes[1]} args={[assets.geo.checker, assets.checkers[1], 15]} frustumCulled={false} />
    </>
  );

  function current(a: Anim, now: number): { pos: Vec3; edge: boolean } {
    if (a.dur <= 0 || now >= a.start + a.dur) return { pos: a.to, edge: a.toEdge };
    const t = bezier(easingCurve.checker, (now - a.start) / a.dur);
    const pos: Vec3 = [
      a.from[0] + (a.to[0] - a.from[0]) * t,
      a.from[1] + (a.to[1] - a.from[1]) * t + Math.sin(Math.PI * t) * a.arc,
      a.from[2] + (a.to[2] - a.from[2]) * t,
    ];
    return { pos, edge: t < 0.5 ? a.fromEdge : a.toEdge };
  }
}

// ---- Highlights ----------------------------------------------------------------------------------

function topSlot(position: Position, perspective: Player, v: number): Vec3 | null {
  const tokens = layoutTokens(position, perspective).filter((t) => t.side === perspective && locKey(t.loc) === locKey(ownLoc(v)));
  if (!tokens.length) return null;
  const top = tokens.reduce((a, b) => (b.index > a.index ? b : a));
  return slotFor(top.loc, top.index).pos;
}

function landing(position: Position, perspective: Player, to: number): Vec3 {
  const own = layoutTokens(position, perspective).filter((t) => t.side === perspective && locKey(t.loc) === locKey(ownLoc(to))).length;
  return slotFor(ownLoc(to), own).pos;
}

function Markers({ position, perspective, input, lastMove, assets, hover, yaw, labels }: GameBoardProps & { assets: SceneAssets; hover: number | null; yaw: number }) {
  const sources = input?.sources ?? [];
  const selected = input?.selected ?? null;
  const shownFrom = selected ?? hover;
  const targets = shownFrom !== null && input ? input.targets(shownFrom) : [];
  const preview = selected === null;
  const h = BOARD.checkerHeight;

  return (
    <group>
      {input &&
        selected === null &&
        sources.map((s) => {
          const p = topSlot(position, perspective, s);
          if (!p) return null;
          return <mesh key={`src${s}`} geometry={assets.geo.plane} material={assets.sourceRing} position={[p[0], p[1] + h + 0.012, p[2]]} scale={BOARD.checkerDiameter * 1.02} renderOrder={3} />;
        })}
      {selected !== null &&
        (() => {
          const p = topSlot(position, perspective, selected);
          return p ? (
            <mesh geometry={assets.geo.plane} material={assets.selectRing} position={[p[0], p[1] + h + SELECT_LIFT + 0.014, p[2]]} scale={BOARD.checkerDiameter * 1.12} renderOrder={4} />
          ) : null;
        })()}
      {targets.map((t) => {
        const p = landing(position, perspective, t.to);
        const label = t.to === OFF ? labels.off : (labels.digits[t.die - 1] ?? String(t.die));
        const mat = assets.markers.get(label);
        if (!mat) return null;
        return (
          // Counter-rotated so the digit reads upright in portrait too.
          <group key={`t${t.to}`} position={[p[0], (t.to === OFF ? 0.02 : p[1]) + 0.02, t.to === OFF ? (DIMS.zBottom + 0) / 2 : p[2]]} rotation={[0, -yaw, 0]}>
            <mesh geometry={assets.geo.plane} material={mat} scale={BOARD.checkerDiameter * 0.8} renderOrder={5} material-opacity={preview ? 0.6 : 1} />
          </group>
        );
      })}
      {lastMove?.map((m, i) => {
        const a = anchor(m.from);
        const b = anchor(m.to);
        const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
        return [a, b].map((p, j) => (
          <mesh key={`trail${i}-${j}`} geometry={assets.geo.plane} material={assets.trail} position={[p[0], 0.01, p[1]]} rotation={[0, angle, 0]} scale={0.5} renderOrder={2} />
        ));
      })}
    </group>
  );
}

/** Where a trail arrow sits for a location (viewer numbering; 25 / 0 = the mover's bar / tray). */
function anchor(v: number): [number, number] {
  if (v >= 1 && v <= 24) {
    const z = v <= 12 ? DIMS.zBottom - BOARD.pointLength - 0.1 : DIMS.zTop + BOARD.pointLength + 0.1;
    return [pointX(v), z];
  }
  if (v === BAR) return [(DIMS.barStart + DIMS.barEnd) / 2, 0];
  return [(DIMS.trayStart + DIMS.trayEnd) / 2, 0];
}

// ---- Input ---------------------------------------------------------------------------------------

function InputPlane({
  input,
  group,
  drag,
  onHover,
}: {
  input: BoardInput;
  group: React.RefObject<THREE.Group | null>;
  drag: React.RefObject<{ loc: number; point: Vec3 } | null>;
  onHover: (loc: number | null) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const down = useRef<{ loc: number | null; x: number; y: number; dragging: boolean } | null>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD.checkerHeight), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const inputRef = useRef(input);
  inputRef.current = input;

  const localAt = (e: ThreeEvent<PointerEvent>): Vec3 | null => {
    if (!e.ray.intersectPlane(plane, hit) || !group.current) return null;
    const local = group.current.worldToLocal(hit.clone());
    return [local.x, local.y, local.z];
  };
  const locAt = (e: ThreeEvent<PointerEvent>) => {
    const p = localAt(e);
    return p ? locate(p[0], p[2]) : null;
  };

  return (
    <mesh
      position={[0, BOARD.checkerHeight, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[DIMS.length, DIMS.depth, 1]}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as unknown as Element | null)?.setPointerCapture?.(e.pointerId);
        down.current = { loc: locAt(e), x: e.clientX, y: e.clientY, dragging: false };
      }}
      onPointerMove={(e) => {
        const d = down.current;
        const cur = inputRef.current;
        if (d && !d.dragging && d.loc !== null && cur.sources.includes(d.loc) && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
          d.dragging = true;
          cur.onSelect(d.loc);
          drag.current = { loc: d.loc, point: localAt(e) ?? [0, 0, 0] };
          invalidate();
          return;
        }
        if (d?.dragging) {
          const p = localAt(e);
          if (p && drag.current) drag.current.point = p;
          invalidate();
          return;
        }
        if (!d && e.pointerType === "mouse") {
          const loc = locAt(e);
          onHover(loc !== null && cur.sources.includes(loc) ? loc : null);
        }
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        const cur = inputRef.current;
        const loc = locAt(e);
        if (d?.dragging) {
          const from = drag.current?.loc ?? null;
          drag.current = null;
          if (from !== null && loc !== null && cur.targets(from).some((t) => t.to === loc)) cur.onMove(from, loc);
          else cur.onInvalid(loc); // the checker returns; destinations stay shown
          invalidate();
          return;
        }
        if (!d) return;
        if (cur.selected !== null && loc !== null && cur.targets(cur.selected).some((t) => t.to === loc)) {
          cur.onMove(cur.selected, loc);
        } else if (loc !== null && cur.sources.includes(loc)) {
          cur.onSelect(loc === cur.selected ? null : loc);
        } else {
          if (cur.selected !== null) cur.onSelect(null);
          cur.onInvalid(loc);
        }
      }}
      onPointerLeave={() => onHover(null)}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

// ---- Dice ----------------------------------------------------------------------------------------

interface DicePlay {
  key: string;
  throw: DiceThrow | null;
  start: number;
  fadeFrom: number;
  rest: { pos: Vec3; q: Quat }[];
  offsets: [Quat, Quat];
  arena: { x: number; yaw: number };
  done: boolean;
}

function arenaFor(thrower: DiceShow["thrower"]): { x: number; yaw: number } {
  const right = (DIMS.rightFieldStart + DIMS.rightFieldEnd) / 2;
  const left = (DIMS.leftFieldStart + DIMS.leftFieldEnd) / 2;
  return thrower === "opponent" ? { x: left, yaw: Math.PI } : { x: right, yaw: 0 };
}

function restPose(show: DiceShow): { pos: Vec3; q: Quat }[] {
  // Deterministic from the throw seed (never Math.random); values come from the server.
  const rand = prng(show.throwSeed >>> 0);
  return show.values.map((v, i) => {
    const spin = fromAxisAngle([0, 1, 0], (rand() - 0.5) * 0.9);
    return { pos: [1.2 + rand() * 0.6, 0.5, i === 0 ? -1.1 : 1.1] as Vec3, q: multiply(spin, faceOffset(1, v)) };
  });
}

function Dice({ dice, lite, reducedMotion, assets, onDiceSettled }: GameBoardProps & { assets: SceneAssets }) {
  const invalidate = useThree((s) => s.invalidate);
  const groups = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const inner = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const shadows = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const arena = useRef<THREE.Group>(null);
  const play = useRef<DicePlay | null>(null);
  const settled = useRef(onDiceSettled);
  settled.current = onDiceSettled;
  const fade = lite || (reducedMotion && REDUCED_MOTION_DICE_FADE);
  const fadeMs = (reducedMotion ? reducedDuration : fullDuration).diceFade;
  const diceRef = useRef(dice);
  diceRef.current = dice;
  const diceKey = dice?.key ?? null;

  useEffect(() => {
    const dice = diceRef.current;
    if (!dice) {
      play.current = null;
      invalidate();
      return;
    }
    if (play.current?.key === dice.key) return;
    const base: DicePlay = {
      key: dice.key,
      throw: null,
      start: 0,
      fadeFrom: dice.animate ? performance.now() : -Infinity,
      rest: restPose(dice),
      offsets: [faceOffset(1, dice.values[0]), faceOffset(1, dice.values[1])],
      arena: arenaFor(dice.thrower),
      done: !dice.animate,
    };
    play.current = base;
    invalidate();
    if (fade || !dice.animate) {
      if (!dice.animate) settled.current?.(dice.key);
      return;
    }
    base.fadeFrom = Infinity; // hidden until the simulation is ready
    let alive = true;
    void import("../dice/simulate")
      .then((m) => m.simulateThrow(dice.values, dice.throwSeed))
      .then((t) => {
        if (!alive || play.current?.key !== dice.key) return;
        if (!t.settled) {
          // §11.1 step 5: no settle within the retry budget → the lite placement.
          play.current = { ...base, fadeFrom: performance.now() };
        } else {
          play.current = { ...base, throw: t, start: performance.now(), offsets: t.offsets, fadeFrom: -Infinity };
        }
        invalidate();
      })
      .catch(() => {
        if (alive && play.current?.key === dice.key) play.current = { ...base, fadeFrom: performance.now() };
        invalidate();
      });
    return () => {
      alive = false;
    };
    // A new throw only when the roll changes (the dice object is rebuilt on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diceKey, invalidate]);

  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const p = play.current;
    const visible = Boolean(p) && p!.fadeFrom !== Infinity;
    groups.forEach((g) => g.current && (g.current.visible = visible));
    shadows.forEach((s) => s.current && (s.current.visible = visible && (lite || !p?.throw)));
    if (!p || !visible) return;
    const now = performance.now();
    if (arena.current) {
      arena.current.position.set(p.arena.x, 0, 0);
      arena.current.rotation.set(0, p.arena.yaw, 0);
    }
    let active = false;
    for (let i = 0; i < 2; i++) {
      const g = groups[i]!.current;
      const m = inner[i]!.current;
      if (!g || !m) continue;
      if (p.throw) {
        const frames = p.throw.frames[i as 0 | 1];
        const step = Math.min(p.throw.steps - 1, Math.floor(((now - p.start) / 1000) * 120));
        const o = step * 7;
        g.position.set(frames[o]!, frames[o + 1]!, frames[o + 2]!);
        g.quaternion.set(frames[o + 3]!, frames[o + 4]!, frames[o + 5]!, frames[o + 6]!);
        m.quaternion.set(...p.offsets[i as 0 | 1]);
        if (step < p.throw.steps - 1) active = true;
      } else {
        const r = p.rest[i]!;
        g.position.set(...r.pos);
        q.set(...r.q);
        g.quaternion.copy(q);
        m.quaternion.identity();
      }
      const s = shadows[i]!.current;
      if (s) s.position.set(g.position.x, 0.006, g.position.z);
    }
    const opacity = Math.min(1, (now - p.fadeFrom) / Math.max(1, fadeMs));
    assets.die.opacity = dice?.dim ? Math.min(opacity, 0.55) : opacity;
    assets.die.transparent = assets.die.opacity < 1;
    if (opacity < 1) active = true;
    if (!active && !p.done) {
      p.done = true;
      settled.current?.(p.key);
    }
    if (active) invalidate();
  });

  return (
    <group ref={arena} scale={DIE}>
      {[0, 1].map((i) => (
        <group key={i} ref={groups[i]} visible={false}>
          <mesh ref={inner[i]} geometry={assets.geo.die} material={assets.die} castShadow={!lite} />
        </group>
      ))}
      {[0, 1].map((i) => (
        <mesh key={`s${i}`} ref={shadows[i]} geometry={assets.geo.plane} material={assets.blob} scale={1.6} visible={false} />
      ))}
    </group>
  );
}

export type { MoveHint };
