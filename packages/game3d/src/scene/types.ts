import type { Player, Position } from "@bg/game-core";
import type { Orientation } from "./framing";

/** A roll to show (§11.1): the server values are fixed before the throw starts. */
export interface DiceShow {
  /** Unique per roll (e.g. the event seq); a new key starts a new throw. */
  key: string;
  values: [number, number];
  throwSeed: number;
  /** Who threw: the dice land in that player's right-hand half. The opening roll is "both". */
  thrower: "self" | "opponent" | "both";
  /** False after a re-sync: the dice appear at rest, without replaying the throw. */
  animate: boolean;
  /** Every die of this roll is used (dimmed; the HTML chips carry the text). */
  dim?: boolean;
}

/** Legal target for a checker (viewer numbering; 0 = bear off). */
export interface BoardTarget {
  to: number;
  die: number;
}

/**
 * Board input for the viewer's own turn (§11.1 Input). The scene handles tap-tap, drag, and hover;
 * the app decides legality through game-core's TurnBuilder.
 */
export interface BoardInput {
  /** Points (viewer numbering, 25 = bar) that have a checker with a legal step. */
  sources: readonly number[];
  targets: (from: number) => readonly BoardTarget[];
  selected: number | null;
  onSelect: (from: number | null) => void;
  onMove: (from: number, to: number) => void;
  /** A tap or drop that does nothing: a checker that can't move, or an illegal drop. */
  onInvalid: (at: number | null) => void;
}

/** The mover's [from, to] list for step-by-step playback of a move (mover's numbering). */
export interface MoveHint {
  player: Player;
  moves: number[][];
  /** Changes per move, so the same list played twice animates twice. */
  key: string;
}

export interface SceneLabels {
  /** Localized die digits for 1–6 (index 0 = "1"). */
  digits: readonly string[];
  /** Localized word on the bear-off marker. */
  off: string;
  /** CSS font stack for the marker labels (the app's self-hosted font). */
  font: string;
}

export interface GameBoardProps {
  position: Position;
  /** The side shown at the bottom (the player; spectators pass 0). */
  perspective: Player;
  /** Passed by the app (layout-agnostic scene): "portrait" turns the board a quarter. */
  orientation: Orientation;
  /** CSS px kept clear around the board inside the canvas (8 + safe-area insets). */
  margin?: number;
  lite: boolean;
  reducedMotion: boolean;
  dice: DiceShow | null;
  input: BoardInput | null;
  /** The opponent's last move, viewer numbering (trail arrows until the viewer rolls). */
  lastMove: { from: number; to: number }[] | null;
  moveHint: MoveHint | null;
  /** Changes on every full state: the board snaps instead of animating. */
  snapKey: number;
  labels: SceneLabels;
  themes: { board: string; checkers: [string, string] };
  /** First frame rendered with every texture ready. */
  onReady?: () => void;
  /** Frame rate stayed under 30 fps for 10 s of animation (MA-16 lite suggestion). */
  onSlow?: () => void;
  /** The throw for this key finished (dice at rest). */
  onDiceSettled?: (key: string) => void;
}
