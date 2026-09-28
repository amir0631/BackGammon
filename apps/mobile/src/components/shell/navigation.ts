import type { ComponentType } from "react";
import {
  AccountIcon,
  LiveIcon,
  PlayIcon,
  ShopIcon,
  TournamentsIcon,
  type IconProps,
} from "@/components/icons";

// Primary navigation from docs/ux/foundation/ia.md §3.1. Order is logical; RTL runs it right to left.

export type NavKey = "play" | "live" | "tournaments" | "shop" | "account";

export interface NavItem {
  key: NavKey;
  href: string;
  /** i18n key under `nav.*` */
  labelKey: NavKey;
  icon: ComponentType<IconProps>;
  /** Route prefixes that belong to this tab (children stay under their tab). */
  matches: readonly string[];
}

export const primaryNav: readonly NavItem[] = [
  { key: "play", href: "/play", labelKey: "play", icon: PlayIcon, matches: ["/play", "/leaderboard"] },
  { key: "live", href: "/live", labelKey: "live", icon: LiveIcon, matches: ["/live"] },
  {
    key: "tournaments",
    href: "/tournaments",
    labelKey: "tournaments",
    icon: TournamentsIcon,
    matches: ["/tournaments"],
  },
  { key: "shop", href: "/shop", labelKey: "shop", icon: ShopIcon, matches: ["/shop"] },
  {
    key: "account",
    href: "/me",
    labelKey: "account",
    icon: AccountIcon,
    matches: ["/me", "/wallet", "/settings", "/help", "/profile"],
  },
];

export function activeNavKey(pathname: string): NavKey | null {
  const hit = primaryNav.find((item) =>
    item.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  return hit?.key ?? null;
}
