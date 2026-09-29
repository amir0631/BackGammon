import { createTheme, type Theme } from "@mui/material/styles";
import {
  borderWidth,
  breakpoints,
  duration,
  easing,
  elevation,
  elevationLevels,
  focusRing,
  fontStack,
  layout,
  lineHeight,
  letterSpacing,
  minTouchTarget,
  palette,
  parseHex,
  radii,
  reducedDuration,
  spacingUnit,
  typeScale,
  zIndex,
  type ColorMode,
  type ColorTokens,
  type ElevationLevel,
  type Script,
  type TypeRole,
} from "@bg/design-tokens";

// MUI v6 theme built only from @bg/design-tokens (docs/ui/design-system.md).
// Dark and light schemes are emitted as CSS variables so the mode switches without a flash;
// components read colors through `theme.vars`.

export interface AppThemeOptions {
  direction: "rtl" | "ltr";
  script: Script;
  reducedMotion: boolean;
}

/** `#rrggbb` + alpha → `rgba()`; used for state layers computed at theme build time. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Color tokens of the active scheme as CSS variables. */
export function tokensOf(theme: Theme): ColorTokens {
  return (theme.vars ?? theme).palette.tokens;
}

/** Visible keyboard focus ring (WCAG 2.4.7 / 2.4.11). */
export function focusRingStyle(theme: Theme) {
  return {
    outline: `${focusRing.width}px solid ${tokensOf(theme).focusRing}`,
    outlineOffset: focusRing.offset,
  } as const;
}

function schemePalette(mode: ColorMode) {
  const c = palette[mode];
  return {
    tokens: c,
    primary: { main: c.primary, contrastText: c.onPrimary },
    secondary: { main: c.secondary, contrastText: c.onSecondary },
    success: { main: c.success, contrastText: c.onSuccess },
    warning: { main: c.warning, contrastText: c.onWarning },
    error: { main: c.error, contrastText: c.onError },
    info: { main: c.info, contrastText: c.onInfo },
    background: { default: c.background, paper: c.surface },
    text: { primary: c.textPrimary, secondary: c.textSecondary, disabled: c.textDisabled },
    divider: c.outlineSubtle,
    action: {
      active: c.textSecondary,
      hover: withAlpha(c.textPrimary, 0.08),
      hoverOpacity: 0.08,
      selected: withAlpha(c.primary, 0.16),
      selectedOpacity: 0.16,
      focus: withAlpha(c.textPrimary, 0.12),
      focusOpacity: 0.12,
      disabled: c.textDisabled,
      disabledBackground: withAlpha(c.textPrimary, 0.12),
      disabledOpacity: 0.38,
    },
  };
}

/** MUI's 0–24 shadow scale mapped onto our five levels, as CSS variables set per scheme. */
function elevationLevelFor(index: number): ElevationLevel {
  if (index === 0) return 0;
  if (index <= 2) return 1;
  if (index <= 6) return 2;
  if (index <= 12) return 3;
  return 4;
}

const shadows = Array.from({ length: 25 }, (_, i) => `var(--bg-elevation-${elevationLevelFor(i)})`) as Theme["shadows"];

function elevationVars(mode: ColorMode): Record<string, string> {
  return Object.fromEntries(elevationLevels.map((l) => [`--bg-elevation-${l}`, elevation[mode][l]]));
}

function typography(script: Script) {
  const role = (r: TypeRole) => ({
    fontSize: typeScale[r].fontSize,
    fontWeight: typeScale[r].fontWeight,
    lineHeight: lineHeight[script][r],
    letterSpacing: letterSpacing[script][r],
  });
  return {
    fontFamily: fontStack(script),
    h1: role("display"),
    h2: role("headline"),
    h3: role("titleLarge"),
    h4: role("title"),
    h5: role("titleSmall"),
    h6: role("titleSmall"),
    subtitle1: role("titleSmall"),
    subtitle2: role("labelSmall"),
    body1: role("body"),
    body2: role("bodySmall"),
    bodyLarge: role("bodyLarge"),
    label: role("label"),
    labelSmall: role("labelSmall"),
    button: { ...role("label"), textTransform: "none" as const },
    caption: role("caption"),
    overline: { ...role("caption"), textTransform: "none" as const },
  };
}

export function createAppTheme({ direction, script, reducedMotion }: AppThemeOptions): Theme {
  const d = reducedMotion ? reducedDuration : duration;

  return createTheme({
    direction,
    cssVariables: { colorSchemeSelector: "data", cssVarPrefix: "bg" },
    defaultColorScheme: "dark",
    colorSchemes: {
      dark: { palette: schemePalette("dark") },
      light: { palette: schemePalette("light") },
    },
    spacing: spacingUnit,
    shape: { borderRadius: radii.md },
    breakpoints: { values: { ...breakpoints, xl: 1440 } },
    zIndex: {
      appBar: zIndex.topBar,
      modal: zIndex.modal,
      snackbar: zIndex.snackbar,
      tooltip: zIndex.tooltip,
    },
    shadows,
    typography: typography(script),
    transitions: {
      duration: {
        shortest: d.fast,
        shorter: d.fast,
        short: d.base,
        standard: d.base,
        complex: d.slow,
        enteringScreen: d.slow,
        leavingScreen: d.base,
      },
      easing: {
        easeInOut: easing.standard,
        easeOut: easing.enter,
        easeIn: easing.exit,
        sharp: easing.standard,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme: Theme) => ({
          html: { WebkitTextSizeAdjust: "100%", textSizeAdjust: "100%" },
          ":root, [data-dark]": elevationVars("dark"),
          "[data-light]": elevationVars("light"),
          body: {
            minHeight: "100dvh",
            WebkitTapHighlightColor: "transparent",
            // Long words (usernames, English compounds) wrap instead of overflowing at 200% text.
            overflowWrap: "break-word",
          },
          ":focus-visible": focusRingStyle(theme),
          "::selection": { backgroundColor: tokensOf(theme).primaryContainer, color: tokensOf(theme).onPrimaryContainer },
          "@media (prefers-reduced-motion: reduce)": { html: { scrollBehavior: "auto" } },
        }),
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: reducedMotion },
        styleOverrides: {
          root: ({ theme }) => ({
            "&.Mui-focusVisible, &:focus-visible": focusRingStyle(theme),
          }),
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: minTouchTarget,
            minWidth: minTouchTarget,
            borderRadius: radii.md,
            paddingInline: theme.spacing(2.5),
            paddingBlock: theme.spacing(1),
            overflowWrap: "anywhere",
          }),
          // In flight (patterns.md §2.2) the button keeps its fill so the label stays readable;
          // MUI would otherwise style it like a disabled control.
          contained: {
            "&.MuiButton-loading": {
              backgroundColor: "var(--variant-containedBg)",
              color: "var(--variant-containedColor)",
              "& .MuiButton-loadingIndicator": { color: "inherit" },
            },
          },
          sizeSmall: ({ theme }) => ({ minHeight: minTouchTarget, paddingInline: theme.spacing(1.5) }),
          sizeLarge: ({ theme }) => ({ minHeight: 52, paddingInline: theme.spacing(3) }),
          outlined: ({ theme }) => ({
            borderColor: tokensOf(theme).outline,
            "&:hover": { borderColor: tokensOf(theme).textSecondary },
          }),
          outlinedPrimary: ({ theme }) => ({ borderColor: tokensOf(theme).primary }),
          outlinedError: ({ theme }) => ({ borderColor: tokensOf(theme).error }),
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { minWidth: minTouchTarget, minHeight: minTouchTarget },
        },
      },
      MuiFab: {
        styleOverrides: { root: { minHeight: minTouchTarget, minWidth: minTouchTarget } },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined", fullWidth: true },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: tokensOf(theme).textSecondary,
            "&.Mui-focused": { color: tokensOf(theme).textPrimary },
            "&.Mui-error": { color: tokensOf(theme).error },
          }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: radii.md,
            backgroundColor: tokensOf(theme).surfaceSunken,
            minHeight: 52,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: tokensOf(theme).outline },
            "&:hover:not(.Mui-disabled, .Mui-error) .MuiOutlinedInput-notchedOutline": {
              borderColor: tokensOf(theme).textSecondary,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: tokensOf(theme).focusRing,
              borderWidth: borderWidth.emphasis,
            },
            "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: tokensOf(theme).error },
          }),
          input: {
            // 16 px keeps iOS from zooming on focus.
            fontSize: "1rem",
          },
        },
      },
      MuiFormHelperText: {
        styleOverrides: {
          root: ({ theme }) => ({
            marginInline: 0,
            marginTop: theme.spacing(0.75),
            color: tokensOf(theme).textSecondary,
            ...theme.typography.caption,
            "&.Mui-error": { color: tokensOf(theme).error },
          }),
        },
      },
      MuiCheckbox: {
        styleOverrides: { root: { padding: (minTouchTarget - 24) / 2 } },
      },
      MuiRadio: {
        styleOverrides: { root: { padding: (minTouchTarget - 24) / 2 } },
      },
      // Switch (profile.md ST-01). The settings row is the 44 px target; the switch itself is
      // 44 px tall too. Track outline ≥ 3:1 in both states, thumb position + fill carry the state
      // (not color alone). The thumb travels toward the end side: in RTL the stylis plugin flips
      // both `left` and `translateX`, so one value serves both directions (no logical property
      // exists for transforms).
      MuiSwitch: {
        styleOverrides: {
          root: {
            width: 64,
            height: minTouchTarget,
            padding: "12px 10px",
            // Clips MUI's 300%-wide hit input (it would otherwise widen the page near an edge);
            // the thumb's focus ring fits inside the padding.
            overflow: "hidden",
          },
          switchBase: ({ theme }) => {
            const t = tokensOf(theme);
            return {
              padding: 12,
              color: t.textSecondary,
              "&.Mui-checked": {
                transform: "translateX(20px)",
                color: t.onPrimary,
                "& + .MuiSwitch-track": { backgroundColor: t.primary, borderColor: t.primary, opacity: 1 },
              },
              "&.Mui-disabled": {
                color: t.textDisabled,
                "& + .MuiSwitch-track": { opacity: 1, borderColor: t.outlineSubtle },
              },
              "&.Mui-checked.Mui-disabled": {
                color: t.onPrimaryContainer,
                "& + .MuiSwitch-track": { backgroundColor: t.primaryContainer, borderColor: t.primaryContainer },
              },
              "&.Mui-focusVisible .MuiSwitch-thumb": focusRingStyle(theme),
            };
          },
          thumb: { width: 20, height: 20, boxShadow: "none" },
          track: ({ theme }) => ({
            opacity: 1,
            borderRadius: radii.pill,
            boxSizing: "border-box",
            border: `${borderWidth.control}px solid ${tokensOf(theme).outline}`,
            backgroundColor: tokensOf(theme).surfaceSunken,
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: radii.pill,
            fontWeight: typeScale.labelSmall.fontWeight,
            "&.MuiChip-clickable": { minHeight: minTouchTarget, height: "auto", paddingBlock: theme.spacing(0.5) },
          }),
          label: { overflowWrap: "anywhere", whiteSpace: "normal" },
          outlined: ({ theme }) => ({ borderColor: tokensOf(theme).outline }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }) => ({
            backgroundColor: tokensOf(theme).surfaceRaised,
            borderRadius: radii.lg,
            width: `calc(100% - ${theme.spacing(4)})`,
            maxWidth: layout.dialogMaxWidth,
            margin: theme.spacing(2),
            maxHeight: `calc(100dvh - ${theme.spacing(4)})`,
          }),
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme }) => ({ backgroundColor: tokensOf(theme).surfaceRaised }),
          paperAnchorBottom: {
            borderStartStartRadius: radii.xl,
            borderStartEndRadius: radii.xl,
            maxHeight: `${layout.sheetMaxHeightDvh}dvh`,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: ({ theme, ownerState }) =>
            ownerState.invisible ? {} : { backgroundColor: tokensOf(theme).scrim },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: tokensOf(theme).inverseSurface,
            color: tokensOf(theme).onInverseSurface,
            borderRadius: radii.md,
            ...theme.typography.body2,
          }),
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: ({ theme }) => ({
            backgroundColor: tokensOf(theme).inverseSurface,
            color: tokensOf(theme).onInverseSurface,
            ...theme.typography.caption,
          }),
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: ({ theme, ownerState }) => {
            const t = tokensOf(theme);
            const severity = ownerState.severity ?? "info";
            const map = {
              success: [t.successContainer, t.onSuccessContainer, t.success],
              info: [t.infoContainer, t.onInfoContainer, t.info],
              warning: [t.warningContainer, t.onWarningContainer, t.warning],
              error: [t.errorContainer, t.onErrorContainer, t.error],
            } as const;
            const [bg, fg] = map[severity];
            return ownerState.variant === "standard" || ownerState.variant === undefined
              ? { backgroundColor: bg, color: fg, "& .MuiAlert-icon": { color: fg } }
              : {};
          },
        },
      },
      MuiLink: {
        defaultProps: { underline: "always" },
        styleOverrides: {
          root: ({ theme }) => ({ color: tokensOf(theme).primary, textUnderlineOffset: "0.2em" }),
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { minHeight: 48, textTransform: "none" },
        },
      },
      MuiToggleButtonGroup: {
        // Segmented controls wrap instead of overflowing at xs with 200% text (§11.7).
        styleOverrides: { root: { flexWrap: "wrap", maxWidth: "100%" } },
      },
      MuiToggleButton: {
        styleOverrides: { root: { minHeight: minTouchTarget, textTransform: "none" } },
      },
      MuiListItemButton: {
        styleOverrides: { root: { minHeight: 48 } },
      },
      MuiMenuItem: {
        styleOverrides: { root: { minHeight: 48 } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: ({ theme }) => ({
            height: 6,
            borderRadius: radii.pill,
            backgroundColor: tokensOf(theme).outlineSubtle,
          }),
          bar: { borderRadius: radii.pill },
        },
      },
      MuiSkeleton: {
        defaultProps: { animation: reducedMotion ? false : "pulse" },
        styleOverrides: {
          root: ({ theme }) => ({ backgroundColor: tokensOf(theme).outlineSubtle }),
        },
      },
      MuiDivider: {
        styleOverrides: { root: ({ theme }) => ({ borderColor: tokensOf(theme).outlineSubtle }) },
      },
      MuiTypography: {
        defaultProps: {
          variantMapping: { bodyLarge: "p", label: "span", labelSmall: "span" },
        },
      },
    },
  });
}
