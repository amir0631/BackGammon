// React Three Fiber scene: board, checkers, pre-simulated physics dice, raycast input
// (CLAUDE.md §11.1). Layout-agnostic: each app passes its own camera and framing. The scene is
// lazy-loaded on the game route only (CLAUDE.md §11.4).
export * from "./dice/math";
export * from "./dice/faces";
export * from "./dice/simulate";
