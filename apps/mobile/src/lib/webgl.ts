// WebGL2 support check (CLAUDE.md §11.4: WebGL2 is the minimum; there is no 2D fallback).
// Synchronous and download-free, so the lobby can disable play buttons before anything is queued
// or charged (play.md §3.1 step 2), and the match route can show MA-17 before loading the engine.

let cached: boolean | null = null;

export function supportsWebGL2(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    cached = Boolean(gl);
    // Free the context at once; the scene creates its own.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
