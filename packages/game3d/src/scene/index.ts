// The 3D scene entry, imported lazily by the game routes (§11.4): three.js and React Three Fiber
// load only here, and the Rapier WASM only on the first physics throw.
export { GameBoard, REDUCED_MOTION_DICE_FADE } from "./GameBoard";
export { bestOrientation, checkerPx, fitCamera, type Orientation } from "./framing";
export type { BoardInput, BoardTarget, DiceShow, GameBoardProps, MoveHint, SceneLabels } from "./types";
