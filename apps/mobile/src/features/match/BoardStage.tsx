"use client";

import { styled } from "@mui/material/styles";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { scene3d } from "@bg/design-tokens";
import { bestOrientation, checkerPx, fitCamera, pointHitPx, type Orientation } from "@bg/game3d/framing";
import type { GameBoardProps } from "@bg/game3d/scene";

// The board region (match.md §3.2): a lazy-loaded 3D canvas (§11.4: three.js, React Three Fiber,
// and Rapier load only on the game route) plus HTML overlays. It measures its own box and picks
// the orientation that shows the larger board: the quarter-turned board on portrait phones, the
// natural one on tablets and landscape (§11.1, §11.7). Resizes re-frame the camera; the scene is
// never reloaded.

type Scene = ComponentType<GameBoardProps>;

let loaded: Scene | null = null;
let loading: Promise<Scene> | null = null;

/** Loads the scene chunk once per page (the service worker caches it for repeat visits). */
export function loadScene(): Promise<Scene> {
  loading ??= import("@bg/game3d/scene").then((m) => {
    loaded = m.GameBoard;
    return m.GameBoard;
  });
  return loading;
}

let physics: Promise<void> | null = null;

/** Rapier WASM for the physics throw; skipped in lite mode (no throw there). */
export function loadPhysics(): Promise<void> {
  physics ??= import("@bg/game3d").then((m) => m.initPhysics());
  return physics;
}

/**
 * The quarter-turned board only when it is clearly bigger (phones in portrait). Tablets and desktop
 * keep the natural orientation unless turning gains at least 15 % (match.md §6 md/lg rows).
 */
const PORTRAIT_GAIN = 1.15;

/**
 * CSS px kept clear around the board inside the canvas. 4 px keeps checkers ≥ 32 px at 360 × 800
 * (CLAUDE.md §11.1); the canvas sits between solid bars, so the board never touches a screen edge.
 */
const MARGIN = 4;

interface Measured {
  orientation: Orientation;
  checker: number;
  along: number;
  across: number;
}

const Root = styled("div")({
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  "& > .board-canvas": { position: "absolute", inset: 0 },
});

export type BoardStageProps = Omit<GameBoardProps, "orientation" | "margin"> & {
  children?: ReactNode;
  /** The scene chunk is loaded (for MA-01 progress). */
  onLoaded?: () => void;
  /** Board region label and keyboard entry (match.md §8: one stop; Enter opens MA-18). */
  label: string;
  onKeyboardEntry?: () => void;
};

export function BoardStage({ children, onLoaded, label, onKeyboardEntry, ...props }: BoardStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [Board, setBoard] = useState<Scene | null>(() => loaded);
  const [measured, setMeasured] = useState<Measured>({ orientation: "portrait", checker: 0, along: 0, across: 0 });
  const orientation = measured.orientation;

  useEffect(() => {
    let alive = true;
    void loadScene().then((scene) => {
      if (!alive) return;
      setBoard(() => scene);
      onLoaded?.();
    });
    return () => {
      alive = false;
    };
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const next = bestOrientation(r.width, r.height, scene3d.cameraTiltDeg, PORTRAIT_GAIN);
      const framing = fitCamera(r.width, r.height, next, scene3d.cameraTiltDeg, MARGIN);
      const hit = pointHitPx(framing);
      setMeasured({ orientation: next, checker: checkerPx(framing), along: hit.along, across: hit.across });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Root
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={onKeyboardEntry ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget && onKeyboardEntry) {
          e.preventDefault();
          onKeyboardEntry();
        }
      }}
      data-orientation={orientation}
      // Rendered sizes for the §11.1 target check (e2e): checker width and a point's hit area.
      data-checker-px={measured.checker.toFixed(1)}
      data-hit-along={measured.along.toFixed(1)}
      data-hit-across={measured.across.toFixed(1)}
    >
      <div className="board-canvas">{Board && <Board {...props} orientation={orientation} margin={MARGIN} />}</div>
      {children}
    </Root>
  );
}
