"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { useMemo, type ReactNode } from "react";
import { prefixer } from "stylis";
import { breakpoints, palette, radii, spacingUnit } from "@bg/design-tokens";

export function ThemeRegistry({ direction, children }: { direction: "rtl" | "ltr"; children: ReactNode }) {
  const theme = useMemo(() => {
    const colors = palette.dark;
    return createTheme({
      direction,
      spacing: spacingUnit,
      shape: { borderRadius: radii.md },
      breakpoints: { values: { ...breakpoints, xl: 1440 } },
      palette: {
        mode: "dark",
        background: { default: colors.background, paper: colors.surface },
        primary: { main: colors.primary, contrastText: colors.onPrimary },
        error: { main: colors.error },
        text: { primary: colors.textPrimary, secondary: colors.textSecondary },
      },
    });
  }, [direction]);

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
