"use client";

import IconButton from "@mui/material/IconButton";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { layout, zIndex } from "@bg/design-tokens";
import { BackIcon, BrandMarkIcon, CloseIcon } from "@/components/icons";
import type { Amount } from "@/lib/useFormat";
import { gutterStyles, safeInsetTop } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { CoinBalanceChip } from "./CoinBalanceChip";

// Top app bar for non-immersive screens (ia.md §3.2).
// Start: brand mark on tab roots, back on child routes (mirrors in RTL), close in task flows.
// End: coin balance chip on every signed-in screen.

const Header = styled("header")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: zIndex.topBar,
    paddingBlockStart: safeInsetTop,
    // Solid, so text over scrolled content always meets contrast.
    backgroundColor: t.surface,
    borderBlockEnd: `1px solid ${t.outlineSubtle}`,
  };
});

const Row = styled("div")(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: theme.spacing(1),
  rowGap: theme.spacing(0.5),
  minHeight: layout.topBarHeight,
  paddingBlock: theme.spacing(0.5),
  ...gutterStyles,
}));

export type TopBarLeading = "brand" | "back" | "close" | "none";

export interface TopBarProps {
  title: string;
  leading?: TopBarLeading;
  /** Back/close target. Use a href when the destination is known; otherwise `onNavigate`. */
  href?: string;
  onNavigate?: () => void;
  /** Available coins. `undefined` hides the chip (guests, task flows); `null` shows it loading. */
  balance?: Amount | null;
  actions?: ReactNode;
}

export function TopBar({ title, leading = "none", href, onNavigate, balance, actions }: TopBarProps) {
  const t = useTranslations("common");

  const navButton = (label: string, icon: ReactNode) =>
    href ? (
      <IconButton component={Link} href={href} aria-label={label} edge="start">
        {icon}
      </IconButton>
    ) : (
      <IconButton onClick={onNavigate} aria-label={label} edge="start">
        {icon}
      </IconButton>
    );

  return (
    <Header>
      <Row>
        {leading === "brand" && <BrandMarkIcon sx={{ color: "primary.main" }} />}
        {leading === "back" && navButton(t("back"), <BackIcon />)}
        {leading === "close" && navButton(t("close"), <CloseIcon />)}
        <Typography
          variant="h4"
          component="h1"
          // Below ~8 title-ems of room (xs, or large text) the balance chip wraps to its own line
          // instead of squeezing the title into one word per line.
          sx={{ flex: "1 1 8em", minWidth: 0, overflowWrap: "anywhere" }}
        >
          {title}
        </Typography>
        {actions}
        {balance !== undefined && <CoinBalanceChip balance={balance} />}
      </Row>
    </Header>
  );
}
