// Design tokens shared by the mobile (`m.`) and desktop (`app.`) UIs (CLAUDE.md §4, §11).
// Framework-agnostic: plain values only, no MUI, no React. Documented in docs/ui/design-system.md.
//
// Rules for consumers:
// - Every color, size, radius, shadow, and duration in UI code comes from here (directly or
//   through the app's MUI theme). No literal hex values, px spacing, or ms durations in components.
// - Both color modes define every key. Dark is the default (the chrome frames the board).
// - Contrast pairs are verified by `src/contrast.test.mjs` (WCAG 2.2 AA: text 4.5:1, UI 3:1).
//
// This file is intentionally a single module so Node's built-in test runner can import it with
// type stripping and no extra dev dependencies.

// ---------------------------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------------------------

export const colorModes = ["dark", "light"] as const;
export type ColorMode = (typeof colorModes)[number];
export const defaultColorMode: ColorMode = "dark";

export interface ColorTokens {
  /** Page background behind everything. */
  background: string;
  /** Default surface: cards, app bar, nav (MUI `background.paper`). */
  surface: string;
  /** Raised surface: sheets, dialogs, menus. */
  surfaceRaised: string;
  /** Sunken surface: input fills, wells, skeleton base. */
  surfaceSunken: string;
  /** Modal scrim, with alpha. */
  scrim: string;

  textPrimary: string;
  textSecondary: string;
  /** Disabled text. Exempt from contrast rules (WCAG 1.4.3), kept legible anyway. */
  textDisabled: string;

  /** UI component boundaries (input borders, outlined buttons, chips): ≥ 3:1 on every surface. */
  outline: string;
  /** Decorative dividers only; never the sole boundary of a control. */
  outlineSubtle: string;
  /** Keyboard focus ring: ≥ 3:1 on every surface. */
  focusRing: string;

  /** Brass: the brand accent. Primary buttons, active nav, links. */
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  /** Firouzeh (turquoise): secondary accent, legal-move highlight in UI overlays. */
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;

  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  info: string;
  onInfo: string;
  infoContainer: string;
  onInfoContainer: string;

  /** Snackbars and tooltips. */
  inverseSurface: string;
  onInverseSurface: string;

  /** Coin glyph fill and rim. Always shown next to a number, so decorative. */
  coin: string;
  coinRim: string;

  /** Player markers in HTML overlays; they mirror the checker colors (never color alone). */
  playerLight: string;
  playerLightRim: string;
  playerDark: string;
  playerDarkRim: string;
}

export const palette: Record<ColorMode, ColorTokens> = {
  dark: {
    background: "#14110f",
    surface: "#1c1714",
    surfaceRaised: "#251f1b",
    surfaceSunken: "#0f0c0a",
    scrim: "rgba(6, 4, 3, 0.64)",

    textPrimary: "#f4ede3",
    textSecondary: "#c4b8a9",
    textDisabled: "#857a6e",

    outline: "#8f8375",
    outlineSubtle: "#3a322c",
    focusRing: "#ffd684",

    primary: "#d9a94e",
    onPrimary: "#1b1407",
    primaryContainer: "#3e2f14",
    onPrimaryContainer: "#f3ddb0",

    secondary: "#56c2b8",
    onSecondary: "#04201d",
    secondaryContainer: "#113b37",
    onSecondaryContainer: "#bdede7",

    success: "#74cf8f",
    onSuccess: "#06240f",
    successContainer: "#143a20",
    onSuccessContainer: "#c4f0d0",

    warning: "#f0b458",
    onWarning: "#2a1a00",
    warningContainer: "#43300d",
    onWarningContainer: "#fbe0b3",

    error: "#ff8f85",
    onError: "#3a0703",
    errorContainer: "#4a1712",
    onErrorContainer: "#ffd9d4",

    info: "#8db9f2",
    onInfo: "#0a1f3a",
    infoContainer: "#16304f",
    onInfoContainer: "#d6e6fc",

    inverseSurface: "#f4ede3",
    onInverseSurface: "#1e1915",

    coin: "#e9b949",
    coinRim: "#9a6e1c",

    playerLight: "#efe6d4",
    playerLightRim: "#8f7a55",
    playerDark: "#2b211c",
    playerDarkRim: "#c9a46a",
  },
  light: {
    background: "#f6f1e9",
    surface: "#fffcf7",
    surfaceRaised: "#ffffff",
    surfaceSunken: "#ede6db",
    scrim: "rgba(30, 25, 21, 0.48)",

    textPrimary: "#1e1915",
    textSecondary: "#574c43",
    textDisabled: "#91867b",

    outline: "#827464",
    outlineSubtle: "#ddd3c6",
    focusRing: "#1e1915",

    primary: "#7f5310",
    onPrimary: "#ffffff",
    primaryContainer: "#f5e3bf",
    onPrimaryContainer: "#3a2605",

    secondary: "#0b6961",
    onSecondary: "#ffffff",
    secondaryContainer: "#cdefea",
    onSecondaryContainer: "#03302c",

    success: "#1d6e36",
    onSuccess: "#ffffff",
    successContainer: "#d5f2dd",
    onSuccessContainer: "#0a3318",

    warning: "#7d4e00",
    onWarning: "#ffffff",
    warningContainer: "#fce7c4",
    onWarningContainer: "#3a2400",

    error: "#b3261e",
    onError: "#ffffff",
    errorContainer: "#fce1de",
    onErrorContainer: "#5a0e09",

    info: "#1c5ba3",
    onInfo: "#ffffff",
    infoContainer: "#dce9fa",
    onInfoContainer: "#0b2a52",

    inverseSurface: "#2a2420",
    onInverseSurface: "#f4ede3",

    coin: "#c8961e",
    coinRim: "#6b4a0c",

    playerLight: "#f3ecdd",
    playerLightRim: "#7d6a47",
    playerDark: "#2b211c",
    playerDarkRim: "#a9824a",
  },
};

/** Semantic color roles that come as a `role` / `onRole` / `roleContainer` / `onRoleContainer` set. */
export const toneRoles = ["primary", "secondary", "success", "warning", "error", "info"] as const;
export type ToneRole = (typeof toneRoles)[number];

// ---------------------------------------------------------------------------------------------
// Typography (CLAUDE.md §11.3): Vazirmatn for fa, Inter for en, self-hosted.
// ---------------------------------------------------------------------------------------------

export const scripts = ["fa", "en"] as const;
export type Script = (typeof scripts)[number];

/**
 * CSS custom properties that each app binds to its self-hosted font files
 * (apps/mobile uses next/font/local). Tokens only name the contract.
 */
export const fontFamilyVar: Record<Script, string> = {
  fa: "--font-fa",
  en: "--font-en",
};

/** Font stack per locale. Latin inside fa text uses Vazirmatn's own Latin; Persian inside en falls back to Vazirmatn. */
export function fontStack(script: Script): string {
  const fa = `var(${fontFamilyVar.fa})`;
  const en = `var(${fontFamilyVar.en})`;
  return script === "fa"
    ? `${fa}, Tahoma, system-ui, sans-serif`
    : `${en}, ${fa}, system-ui, -apple-system, "Segoe UI", sans-serif`;
}

export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

export const typeRoles = [
  "display",
  "headline",
  "titleLarge",
  "title",
  "titleSmall",
  "bodyLarge",
  "body",
  "bodySmall",
  "label",
  "labelSmall",
  "caption",
] as const;
export type TypeRole = (typeof typeRoles)[number];

export interface TypeStyle {
  /** rem, so it scales with the user's text size (§11.7: 200% without clipping). */
  fontSize: string;
  fontWeight: number;
}

/** One scale for both scripts; the per-script differences are line height and letter spacing. */
export const typeScale: Record<TypeRole, TypeStyle> = {
  display: { fontSize: "2rem", fontWeight: fontWeight.bold },
  headline: { fontSize: "1.625rem", fontWeight: fontWeight.bold },
  titleLarge: { fontSize: "1.375rem", fontWeight: fontWeight.bold },
  title: { fontSize: "1.125rem", fontWeight: fontWeight.semibold },
  titleSmall: { fontSize: "1rem", fontWeight: fontWeight.semibold },
  bodyLarge: { fontSize: "1.0625rem", fontWeight: fontWeight.regular },
  body: { fontSize: "1rem", fontWeight: fontWeight.regular },
  bodySmall: { fontSize: "0.875rem", fontWeight: fontWeight.regular },
  label: { fontSize: "0.9375rem", fontWeight: fontWeight.semibold },
  labelSmall: { fontSize: "0.8125rem", fontWeight: fontWeight.semibold },
  caption: { fontSize: "0.8125rem", fontWeight: fontWeight.regular },
};

/** Persian needs taller lines for dots and descenders; body ≥ 1.6 (agent brief). */
export const lineHeight: Record<Script, Record<TypeRole, number>> = {
  fa: {
    display: 1.45,
    headline: 1.5,
    titleLarge: 1.5,
    title: 1.55,
    titleSmall: 1.6,
    bodyLarge: 1.8,
    body: 1.8,
    bodySmall: 1.75,
    label: 1.5,
    labelSmall: 1.5,
    caption: 1.7,
  },
  en: {
    display: 1.2,
    headline: 1.25,
    titleLarge: 1.3,
    title: 1.35,
    titleSmall: 1.4,
    bodyLarge: 1.55,
    body: 1.5,
    bodySmall: 1.45,
    label: 1.35,
    labelSmall: 1.35,
    caption: 1.4,
  },
};

/** Never letter-space Persian: it breaks cursive joining. Latin gets small optical tweaks only. */
export const letterSpacing: Record<Script, Record<TypeRole, string>> = {
  fa: Object.fromEntries(typeRoles.map((r) => [r, "0"])) as Record<TypeRole, string>,
  en: {
    display: "-0.01em",
    headline: "-0.01em",
    titleLarge: "-0.005em",
    title: "0",
    titleSmall: "0",
    bodyLarge: "0",
    body: "0",
    bodySmall: "0.005em",
    label: "0.01em",
    labelSmall: "0.015em",
    caption: "0.01em",
  },
};

// ---------------------------------------------------------------------------------------------
// Spacing, radii, sizing
// ---------------------------------------------------------------------------------------------

/** MUI spacing unit: `theme.spacing(1)` = 8 px. Half steps (0.5, 1.5) give 4 and 12. */
export const spacingUnit = 8;

/** Named spacing scale in px, 4 px grid. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;
export type SpaceToken = keyof typeof space;

export const radii = { xs: 4, sm: 6, md: 10, lg: 16, xl: 24, pill: 999 } as const;

/** Minimum touch target in CSS px (CLAUDE.md §11.7). */
export const minTouchTarget = 44;

/** Focus ring geometry (color is `palette[mode].focusRing`). */
export const focusRing = { width: 2, offset: 2 } as const;

export const borderWidth = { hairline: 1, control: 1, emphasis: 2 } as const;

/** Icon sizes in px (one outline set; stroke scales with size). */
export const iconSize = { sm: 18, md: 24, lg: 32, illustration: 96 } as const;
export const iconStroke = 1.75;

// ---------------------------------------------------------------------------------------------
// Breakpoints and layout (CLAUDE.md §11.7)
// ---------------------------------------------------------------------------------------------

/** Min widths. xs 320–359, sm 360–599, md 600–1023, lg ≥ 1024. */
export const breakpoints = { xs: 0, sm: 360, md: 600, lg: 1024 } as const;
export type Breakpoint = keyof typeof breakpoints;

export const layout = {
  /** lg: centered app shell. */
  shellMaxWidth: 1280,
  /** Task flows (transfer, withdraw) at md/lg. */
  taskFlowMaxWidth: 560,
  /** Setup and confirmation sheets become centered dialogs at md/lg. */
  dialogMaxWidth: 480,
  /** Content column for simple single-column pages at md/lg. */
  readableMaxWidth: 720,
  /** Landscape phones below this height use the side rail instead of the bottom nav (ia.md §3.3). */
  compactHeight: 500,
  topBarHeight: 56,
  bottomNavHeight: 64,
  /** Side rail width; the app scales it with text size (max(railWidth px, 6.5rem)). Fits "Tournaments". */
  railWidth: 104,
  /** Active-tab pill behind the nav icon. */
  navIndicator: { width: 56, height: 32 },
  /** Drag handle drawn at the top of a bottom sheet (the whole header is the drag zone). */
  sheetHandle: { width: 36, height: 4 },
  /** OTP boxes: max width and height in rem (they shrink to fit narrow containers). */
  otpBox: { maxWidthRem: 3.5, heightRem: 3.5 },
  sidePanelWidth: 320,
  sidePanelWidthLg: 360,
  /** Sheets open at content height up to this share of the dynamic viewport (patterns.md §1). */
  sheetMaxHeightDvh: 90,
  /** Page gutters by breakpoint, px. */
  gutter: { xs: 12, sm: 16, md: 24, lg: 32 },
} as const;

/** Viewports every screen is designed, reviewed, and screenshot-tested at (§11.7, §16). */
export const reviewViewports = [
  { width: 360, height: 800, name: "phone-small" },
  { width: 390, height: 844, name: "phone-reference" },
  { width: 430, height: 932, name: "phone-large" },
  { width: 768, height: 1024, name: "tablet-portrait" },
  { width: 1024, height: 768, name: "tablet-landscape" },
  { width: 1440, height: 900, name: "desktop" },
] as const;

export const zIndex = {
  board: 0,
  hud: 10,
  topBar: 1100,
  nav: 1100,
  banner: 1050,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500,
} as const;

// ---------------------------------------------------------------------------------------------
// Elevation. Dark mode shows elevation mostly through lighter surfaces; shadows stay soft.
// ---------------------------------------------------------------------------------------------

export const elevationLevels = [0, 1, 2, 3, 4] as const;
export type ElevationLevel = (typeof elevationLevels)[number];

export const elevation: Record<ColorMode, Record<ElevationLevel, string>> = {
  dark: {
    0: "none",
    1: "0 1px 2px rgba(0, 0, 0, 0.5)",
    2: "0 2px 6px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.5)",
    3: "0 6px 16px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)",
    4: "0 12px 32px rgba(0, 0, 0, 0.55), 0 4px 8px rgba(0, 0, 0, 0.4)",
  },
  light: {
    0: "none",
    1: "0 1px 2px rgba(58, 38, 5, 0.12)",
    2: "0 2px 6px rgba(58, 38, 5, 0.12), 0 1px 2px rgba(58, 38, 5, 0.1)",
    3: "0 6px 16px rgba(58, 38, 5, 0.14), 0 2px 4px rgba(58, 38, 5, 0.08)",
    4: "0 12px 32px rgba(58, 38, 5, 0.18), 0 4px 8px rgba(58, 38, 5, 0.08)",
  },
};

/** Which surface token each elevation level sits on. */
export const elevationSurface: Record<ElevationLevel, keyof ColorTokens> = {
  0: "background",
  1: "surface",
  2: "surface",
  3: "surfaceRaised",
  4: "surfaceRaised",
};

// ---------------------------------------------------------------------------------------------
// Motion (docs/ui/design-system.md §Motion). UI 150–250 ms; checker moves 200–350 ms, slight ease-out.
// Dice are physics-driven (§11.1) and not timed by these tokens.
// ---------------------------------------------------------------------------------------------

export const duration = {
  instant: 0,
  /** Hover, press, color changes. */
  fast: 150,
  /** Most UI transitions: fades, small moves, chips. */
  base: 200,
  /** Larger surfaces: sheets, dialogs, panels. */
  slow: 250,
  /** One checker hop (short distance). */
  checkerShort: 200,
  /** Default checker move. */
  checker: 280,
  /** Longest checker move (across the board, to the bar, bear-off). */
  checkerLong: 350,
  /** Lite mode (§11.6): dice appear at rest after this fade. */
  diceFade: 300,
} as const;

/** Under `animations.reduced` or `prefers-reduced-motion`: no travel, near-instant, opacity only. */
export const reducedDuration: Record<keyof typeof duration, number> = {
  instant: 0,
  fast: 0,
  base: 80,
  slow: 100,
  checkerShort: 80,
  checker: 100,
  checkerLong: 120,
  diceFade: 150,
};

export type CubicBezier = readonly [number, number, number, number];

/** Control points, for non-CSS consumers (the 3D scene). */
export const easingCurve = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  /** Checker moves: slight ease-out, no overshoot. */
  checker: [0.25, 0.8, 0.35, 1],
  linear: [0, 0, 1, 1],
} as const satisfies Record<string, CubicBezier>;

export function cubicBezierCss(points: CubicBezier): string {
  return `cubic-bezier(${points.join(", ")})`;
}

export const easing: Record<keyof typeof easingCurve, string> = {
  standard: cubicBezierCss(easingCurve.standard),
  enter: cubicBezierCss(easingCurve.enter),
  exit: cubicBezierCss(easingCurve.exit),
  checker: cubicBezierCss(easingCurve.checker),
  linear: "linear",
};

/** Feedback timings from patterns.md (toasts §1, slow requests §2.2 and §6.1). */
export const feedbackTiming = {
  toastMs: 4000,
  toastWithActionMs: 8000,
  /** After this long without a response, show "Still working…" / "Taking longer than usual". */
  slowRequestMs: 10000,
  /** Long-press before a nav tooltip appears on touch. */
  longPressMs: 500,
} as const;

// ---------------------------------------------------------------------------------------------
// 3D scene (docs/ui/3d-art-direction.md, CLAUDE.md §11.1, §11.2, §11.4, §11.6)
// ---------------------------------------------------------------------------------------------

export const scene3d = {
  /** Fixed camera tilt from top-down, degrees. No free orbit. */
  cameraTiltDeg: 15,
  dprCap: { normal: 2, lite: 1.5 },
  budget: {
    triangles: 60_000,
    drawCalls: 50,
    realtimeLights: 2,
    boardThemeBytesMobile: 1_500_000,
    boardThemeBytesDesktop: 3_000_000,
    checkerThemeBytes: 300_000,
  },
  /** Mobile portrait: checkers ≥ this many CSS px wide on a 360 px screen. */
  minCheckerCssPx: 44,
  targetFps: { normal: 60, lite: 30 },
} as const;

/** Default board theme ("Walnut & Brass") base colors, linear-ready sRGB hex. Textures carry the detail. */
export const boardDefaultTheme = {
  frameWood: "#5a3a22",
  fieldWood: "#d4bb8f",
  pointDark: "#4a2c1b",
  pointLight: "#e6d6b2",
  inlayTurquoise: "#3fa59c",
  brass: "#c9973f",
  checkerLight: "#ede4d0",
  /** Rim ring: outlines the checker against any point or field color (≥ 3:1 with its body). */
  checkerLightRim: "#8f7a55",
  checkerDark: "#2a201b",
  checkerDarkRim: "#c9a46a",
  diceBody: "#f2ebdc",
  dicePip: "#241b16",
  legalMove: "#56c2b8",
  selection: "#ffd684",
} as const;

// ---------------------------------------------------------------------------------------------
// Contrast helpers (WCAG 2.x relative luminance). Pure functions; used by tests and tooling.
// ---------------------------------------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || m[1] === undefined) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
