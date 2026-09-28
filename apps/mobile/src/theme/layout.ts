import { breakpoints, layout } from "@bg/design-tokens";

// Media queries and safe-area helpers shared by the shell and components (CLAUDE.md §11.7).
// Queries are CSS (not JS) where possible so the server render already has the right layout.

const below = (px: number) => `(max-width: ${px - 0.02}px)`;

/** xs: 320–359 px. Icon-only nav, reduced paddings. */
export const mqXs = `@media ${below(breakpoints.sm)}`;
export const mqMdUp = `@media (min-width: ${breakpoints.md}px)`;
export const mqLgUp = `@media (min-width: ${breakpoints.lg}px)`;

/**
 * Side rail instead of bottom nav: md and up, or any landscape screen shorter than
 * `layout.compactHeight` (ia.md §3.3: chosen by available height, not device type).
 */
export const railMediaCondition = `(min-width: ${breakpoints.md}px), (orientation: landscape) and ${below(layout.compactHeight)}`;
export const mqRail = `@media ${railMediaCondition}`;

/** Beyond the shell width the shell is centered and framed. */
export const mqBeyondShell = `@media (min-width: ${layout.shellMaxWidth + 1}px)`;

/**
 * Page gutter per breakpoint (tokens `layout.gutter`). Explicit px strings: in `sx`, bare numbers
 * on padding would be read as spacing multipliers.
 */
export const gutterStyles = {
  paddingInline: `${layout.gutter.sm}px`,
  [mqXs]: { paddingInline: `${layout.gutter.xs}px` },
  [mqMdUp]: { paddingInline: `${layout.gutter.md}px` },
  [mqLgUp]: { paddingInline: `${layout.gutter.lg}px` },
} as const;

type Dir = "rtl" | "ltr";

/**
 * Safe-area insets are physical (left/right); logical start/end depend on direction.
 * Use with logical properties: `paddingInlineStart: safeInsetStart(dir)`.
 */
export function safeInsetStart(dir: Dir): string {
  return dir === "rtl" ? "env(safe-area-inset-right, 0px)" : "env(safe-area-inset-left, 0px)";
}

export function safeInsetEnd(dir: Dir): string {
  return dir === "rtl" ? "env(safe-area-inset-left, 0px)" : "env(safe-area-inset-right, 0px)";
}

export const safeInsetTop = "env(safe-area-inset-top, 0px)";
export const safeInsetBottom = "env(safe-area-inset-bottom, 0px)";

/**
 * Height of whatever is pinned to the bottom of the viewport (bottom nav + safe area).
 * AppShell keeps it current; toasts sit above it.
 */
export const bottomInsetVar = "--app-bottom-inset";
export const bottomInset = `var(${bottomInsetVar}, ${safeInsetBottom})`;

/**
 * Hides content visually but keeps it for screen readers. Explicit px strings: in MUI `sx`, a
 * bare `1` for width/height means 100%, so numbers would break it there.
 */
export const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  // 0, not the usual -1: a negative margin pushes the box 1 px past the edge in RTL.
  margin: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
