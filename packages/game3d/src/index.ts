// Visual layer of the game (CLAUDE.md §11.1): pre-simulated physics dice (this entry) and the React
// Three Fiber scene (`@bg/game3d/scene`, lazy-loaded by the apps). Layout-agnostic: each app passes
// its own camera framing and orientation.
export * from "./dice/math";
export * from "./dice/faces";
export * from "./dice/simulate";
