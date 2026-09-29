// Themes are material colors and procedural textures on the shared base models (§11.2). Only the
// default "Walnut & Brass" set exists today; unknown keys (a theme this build does not ship yet)
// fall back to it, so a newer server never breaks the board.
import { boardDefaultTheme, sceneLight } from "@bg/design-tokens";

export type BoardTheme = { -readonly [K in keyof typeof boardDefaultTheme]: string };

export interface CheckerTheme {
  body: string;
  rim: string;
}

const boards: Record<string, BoardTheme> = { default: { ...boardDefaultTheme } };

/** Player A (0) plays the light set, player B (1) the dark set; each side keeps its motif. */
const checkers: Record<string, [CheckerTheme, CheckerTheme]> = {
  default: [
    { body: boardDefaultTheme.checkerLight, rim: boardDefaultTheme.checkerLightRim },
    { body: boardDefaultTheme.checkerDark, rim: boardDefaultTheme.checkerDarkRim },
  ],
};

export function boardTheme(key: string | null | undefined): BoardTheme {
  return boards[key ?? "default"] ?? boards.default!;
}

export function checkerTheme(key: string | null | undefined, side: 0 | 1): CheckerTheme {
  return (checkers[key ?? "default"] ?? checkers.default!)[side];
}

export { sceneLight };

/** `#rrggbb` + alpha → `rgba()` for baked shading painted into textures. */
export function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
