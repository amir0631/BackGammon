"use client";

import { styled, useTheme } from "@mui/material/styles";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { layout, radii, zIndex } from "@bg/design-tokens";
import { useVirtualKeyboardOpen } from "@/lib/useVirtualKeyboardOpen";
import { mqBeyondShell, mqRail, safeInsetEnd, safeInsetStart, safeInsetTop, visuallyHidden } from "@/theme/layout";
import { focusRingStyle, tokensOf } from "@/theme/theme";
import { activeNavKey, type NavKey } from "./navigation";
import { BottomNav, SideRail } from "./PrimaryNav";

// App frame for every non-immersive screen (ia.md §3). Portrait phones: content + bottom nav.
// md and short landscape: side rail on the start edge. lg: the same, centered, max 1280 px.
// Uses dvh and safe-area insets; never 100vh (§11.7).

const Shell = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "stretch",
  width: "100%",
  maxWidth: layout.shellMaxWidth,
  minHeight: "100dvh",
  marginInline: "auto",
  [mqBeyondShell]: {
    borderInline: `1px solid ${tokensOf(theme).outlineSubtle}`,
  },
}));

const Column = styled("div")({
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: "100dvh",
});

const Main = styled("main")({
  flex: "1 1 auto",
  minWidth: 0,
  // A flex column so a screen can fill the remaining height (sticky footers, centered cards).
  display: "flex",
  flexDirection: "column",
  "&:focus": { outline: "none" },
});

/** Hidden until focused with the keyboard; then pinned to the top start corner. */
const SkipLink = styled("a")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    ...visuallyHidden,
    "&:focus": {
      position: "fixed",
      insetInlineStart: theme.spacing(1),
      insetBlockStart: `calc(${safeInsetTop} + ${theme.spacing(1)})`,
      zIndex: zIndex.tooltip,
      width: "auto",
      height: "auto",
      margin: 0,
      clip: "auto",
      overflow: "visible",
      whiteSpace: "normal",
      padding: theme.spacing(1.5, 2),
      borderRadius: radii.md,
      backgroundColor: t.inverseSurface,
      color: t.onInverseSurface,
      ...theme.typography.label,
      ...focusRingStyle(theme),
    },
  };
});

export interface AppShellProps {
  children: ReactNode;
  /** Usually a <TopBar />. */
  topBar?: ReactNode;
  /** Global status banners (offline, return to match), shown above the content. */
  banner?: ReactNode;
  /** Hide the nav on auth screens, task flows, and system screens (ia.md §3.1). */
  hideNav?: boolean;
  /** Override the active tab; by default it is derived from the path. */
  activeKey?: NavKey | null;
}

export function AppShell({ children, topBar, banner, hideNav = false, activeKey }: AppShellProps) {
  const t = useTranslations("common");
  const theme = useTheme();
  const pathname = usePathname();
  const keyboardOpen = useVirtualKeyboardOpen();
  const active = activeKey !== undefined ? activeKey : activeNavKey(pathname ?? "");
  const dir = theme.direction;

  return (
    <Shell>
      <SkipLink href="#main">{t("skipToContent")}</SkipLink>
      {!hideNav && <SideRail active={active} />}
      <Column
        sx={{
          // Insets on the side(s) the rail does not already cover.
          paddingInlineStart: safeInsetStart(dir),
          paddingInlineEnd: safeInsetEnd(dir),
          ...(!hideNav && { [mqRail]: { paddingInlineStart: 0 } }),
        }}
      >
        {topBar}
        {banner}
        <Main id="main" tabIndex={-1}>
          {children}
        </Main>
        {!hideNav && <BottomNav active={active} keyboardOpen={keyboardOpen} />}
      </Column>
    </Shell>
  );
}
