"use client";

import Tooltip from "@mui/material/Tooltip";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { forwardRef, useEffect, useRef } from "react";
import { feedbackTiming, fontWeight, layout, minTouchTarget, radii, typeScale, zIndex } from "@bg/design-tokens";
import {
  bottomInsetVar,
  mqRail,
  mqXs,
  safeInsetBottom,
  safeInsetStart,
  safeInsetTop,
  visuallyHidden,
} from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { primaryNav, type NavItem, type NavKey } from "./navigation";

// Bottom nav (≤ 599 px, portrait) and side rail (≥ 600 px, or short landscape): ia.md §3.1, §3.3.
// Both render; CSS shows exactly one, so the server render is already correct and the hidden one
// is out of the accessibility tree (display: none).

type Variant = "bar" | "rail";

const ItemRoot = styled(Link, { shouldForwardProp: (p) => p !== "variant" })<{ variant: Variant }>(
  ({ theme, variant }) => {
    const t = tokensOf(theme);
    return {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(0.5),
      minHeight: layout.bottomNavHeight,
      minWidth: minTouchTarget,
      paddingBlock: theme.spacing(0.75),
      paddingInline: theme.spacing(0.5),
      borderRadius: radii.md,
      color: t.textSecondary,
      textDecoration: "none",
      WebkitTapHighlightColor: "transparent",
      ...(variant === "bar" ? { flex: "1 1 auto" } : { width: "100%" }),
      "& .nav-indicator": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: layout.navIndicator.width,
        height: layout.navIndicator.height,
        borderRadius: radii.pill,
        transition: theme.transitions.create("background-color", { duration: theme.transitions.duration.shorter }),
      },
      "& .nav-label": {
        ...theme.typography.labelSmall,
        fontWeight: typeScale.labelSmall.fontWeight,
        textAlign: "center",
        ...(variant === "bar" ? { whiteSpace: "nowrap" } : { overflowWrap: "break-word", hyphens: "auto" }),
      },
      "@media (hover: hover)": {
        "&:hover .nav-indicator": { backgroundColor: theme.vars?.palette.action.hover },
      },
      '&[aria-current="page"]': {
        color: t.textPrimary,
        "& .nav-indicator": { backgroundColor: t.primaryContainer, color: t.onPrimaryContainer },
        // Not color alone: the active tab also gets the filled pill and a heavier label.
        "& .nav-label": { fontWeight: fontWeight.bold },
      },
    };
  },
);

interface NavItemLinkProps {
  item: NavItem;
  active: boolean;
  variant: Variant;
  label: string;
}

const NavItemLink = forwardRef<HTMLAnchorElement, NavItemLinkProps>(function NavItemLink(
  { item, active, variant, label, ...rest },
  ref,
) {
  const Icon = item.icon;
  return (
    <ItemRoot
      ref={ref}
      href={item.href}
      variant={variant}
      aria-current={active ? "page" : undefined}
      {...rest}
    >
      <span className="nav-indicator">
        <Icon />
      </span>
      <span className="nav-label">{label}</span>
    </ItemRoot>
  );
});

const Bar = styled("nav")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "sticky",
    insetBlockEnd: 0,
    zIndex: zIndex.nav,
    display: "flex",
    alignItems: "stretch",
    gap: theme.spacing(0.5),
    paddingInline: theme.spacing(0.5),
    paddingBlockEnd: safeInsetBottom,
    backgroundColor: t.surface,
    borderBlockStart: `1px solid ${t.outlineSubtle}`,
    // Labels drop to icon-only when they no longer fit: at xs (ia.md §3.1) and when large text
    // makes the bar narrower than ~24 label-ems (200% text, §11.7). Accessible names stay.
    containerType: "inline-size",
    containerName: "bottomnav",
    fontSize: typeScale.labelSmall.fontSize,
    [mqXs]: { "& .nav-label": visuallyHidden },
    "@container bottomnav (max-width: 24em)": { "& .nav-label": visuallyHidden },
    [mqRail]: { display: "none" },
    "&[data-keyboard-open='true']": { display: "none" },
  };
});

const Rail = styled("nav")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "none",
    [mqRail]: {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: theme.spacing(1),
      position: "sticky",
      insetBlockStart: 0,
      alignSelf: "flex-start",
      flexShrink: 0,
      height: "100dvh",
      overflowY: "auto",
      width: `max(${layout.railWidth}px, ${layout.railWidth / 16}rem)`,
      paddingBlockStart: `calc(${safeInsetTop} + ${theme.spacing(1.5)})`,
      paddingBlockEnd: `calc(${safeInsetBottom} + ${theme.spacing(1.5)})`,
      paddingInline: theme.spacing(0.5),
      backgroundColor: t.surface,
      borderInlineEnd: `1px solid ${t.outlineSubtle}`,
      zIndex: zIndex.nav,
    },
  };
});

export interface PrimaryNavProps {
  active: NavKey | null;
}

export function BottomNav({ active, keyboardOpen }: PrimaryNavProps & { keyboardOpen: boolean }) {
  const t = useTranslations("nav");
  const isXs = useMediaQuery(mqXs.replace("@media ", ""));
  const ref = useRef<HTMLElement>(null);

  // Publish the bar's height so toasts can sit above it.
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => {
      // offsetParent is null while the bar is display:none (rail layout or keyboard open).
      if (el.offsetParent !== null && el.offsetHeight > 0) root.style.setProperty(bottomInsetVar, `${el.offsetHeight}px`);
      else root.style.removeProperty(bottomInsetVar);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(bottomInsetVar);
    };
  }, [keyboardOpen]);

  return (
    <Bar ref={ref} aria-label={t("label")} data-keyboard-open={keyboardOpen}>
      {primaryNav.map((item) => {
        const label = t(item.labelKey);
        const link = (
          <NavItemLink key={item.key} item={item} active={active === item.key} variant="bar" label={label} />
        );
        // Icon-only at xs: long-press shows the label (ia.md §3.1).
        return isXs ? (
          <Tooltip key={item.key} title={label} enterTouchDelay={feedbackTiming.longPressMs} disableInteractive>
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </Bar>
  );
}

export function SideRail({ active }: PrimaryNavProps) {
  const t = useTranslations("nav");
  const theme = useTheme();
  return (
    <Rail aria-label={t("label")} sx={{ [mqRail]: { paddingInlineStart: `calc(${safeInsetStart(theme.direction)} + ${theme.spacing(0.5)})` } }}>
      {primaryNav.map((item) => (
        <NavItemLink key={item.key} item={item} active={active === item.key} variant="rail" label={t(item.labelKey)} />
      ))}
    </Rail>
  );
}
