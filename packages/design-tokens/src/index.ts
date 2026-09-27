// Design tokens shared by the mobile and desktop UIs (CLAUDE.md §4).
// Scaffold values only: the UI specialist owns this package and replaces them in §17 step 0.

export const palette = {
  dark: {
    background: "#14110f",
    surface: "#1f1a17",
    textPrimary: "#f5efe6",
    textSecondary: "#c9bfb2",
    primary: "#c89b3c",
    onPrimary: "#1a1409",
    error: "#ef5350",
  },
  light: {
    background: "#faf6f0",
    surface: "#ffffff",
    textPrimary: "#1f1a17",
    textSecondary: "#5a5048",
    primary: "#8a6420",
    onPrimary: "#ffffff",
    error: "#c62828",
  },
} as const;

export type ColorMode = keyof typeof palette;

export const radii = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const spacingUnit = 8;

/** Minimum touch target in CSS px (CLAUDE.md §11.7). */
export const minTouchTarget = 44;

export const breakpoints = { xs: 0, sm: 360, md: 600, lg: 1024 } as const;
