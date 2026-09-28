"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { useMemo, type ReactNode } from "react";
import { prefixer } from "stylis";
import { breakpoints, fontStack, palette, radii, spacingUnit, type Script } from "@bg/design-tokens";

// The admin panel is a desktop work tool: light scheme for dense tables, same tokens as the app.
export function ThemeRegistry({
  direction,
  script,
  children,
}: {
  direction: "rtl" | "ltr";
  script: Script;
  children: ReactNode;
}) {
  const theme = useMemo(() => {
    const c = palette.light;
    return createTheme({
      direction,
      spacing: spacingUnit,
      shape: { borderRadius: radii.sm },
      breakpoints: { values: { xs: breakpoints.xs, sm: breakpoints.md, md: breakpoints.lg, lg: 1280, xl: 1440 } },
      typography: { fontFamily: fontStack(script) },
      palette: {
        mode: "light",
        background: { default: c.background, paper: c.surface },
        primary: { main: c.primary, contrastText: c.onPrimary },
        secondary: { main: c.secondary, contrastText: c.onSecondary },
        success: { main: c.success, contrastText: c.onSuccess },
        warning: { main: c.warning, contrastText: c.onWarning },
        error: { main: c.error, contrastText: c.onError },
        info: { main: c.info, contrastText: c.onInfo },
        text: { primary: c.textPrimary, secondary: c.textSecondary, disabled: c.textDisabled },
        divider: c.outlineSubtle,
      },
      components: {
        MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: "none" } } },
        MuiButtonBase: {
          styleOverrides: {
            root: { "&.Mui-focusVisible": { outline: `2px solid ${c.focusRing}`, outlineOffset: 2 } },
          },
        },
        MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
      },
    });
  }, [direction, script]);

  const cacheOptions =
    direction === "rtl" ? { key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] } : { key: "mui" };

  return (
    <AppRouterCacheProvider options={cacheOptions}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
