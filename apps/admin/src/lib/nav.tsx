import type { ReactNode } from "react";
import type { AdminRole } from "@bg/protocol";
import {
  ArticleIcon,
  ChartIcon,
  DashboardIcon,
  FlagIcon,
  LockIcon,
  PeopleIcon,
  PlayIcon,
  SettingsIcon,
  StoreIcon,
  TrendIcon,
  TrophyIcon,
  WalletIcon,
} from "@/components/icons";

export interface NavItem {
  href: string;
  key: string;
  icon: ReactNode;
  /** Roles that see the section; empty: every admin. */
  roles: readonly AdminRole[];
}

const MONEY: readonly AdminRole[] = ["finance", "superadmin"];

// §13 order. Sections a role can't use are hidden; the API enforces the same rule.
export const NAV: NavItem[] = [
  { href: "/dashboard", key: "admin.shell.nav.dashboard", icon: <DashboardIcon />, roles: [] },
  { href: "/users", key: "admin.shell.nav.users", icon: <PeopleIcon />, roles: [] },
  { href: "/settings", key: "admin.shell.nav.settings", icon: <SettingsIcon />, roles: [] },
  { href: "/predictions", key: "admin.shell.nav.predictions", icon: <TrendIcon />, roles: [] },
  { href: "/tournaments", key: "admin.shell.nav.tournaments", icon: <TrophyIcon />, roles: [] },
  { href: "/shop", key: "admin.shell.nav.shop", icon: <StoreIcon />, roles: [] },
  { href: "/content", key: "admin.shell.nav.content", icon: <ArticleIcon />, roles: [] },
  { href: "/reports", key: "admin.shell.nav.reports", icon: <ChartIcon />, roles: [] },
  { href: "/fraud", key: "admin.shell.nav.fraud", icon: <FlagIcon />, roles: [] },
  { href: "/matches", key: "admin.shell.nav.matches", icon: <PlayIcon />, roles: [] },
  { href: "/withdrawals", key: "admin.shell.nav.withdrawals", icon: <WalletIcon />, roles: MONEY },
  { href: "/access", key: "admin.shell.nav.access", icon: <LockIcon />, roles: ["superadmin"] },
];

export function canSee(item: NavItem, role: AdminRole | undefined): boolean {
  return item.roles.length === 0 || (role !== undefined && item.roles.includes(role));
}

/** Where `/` lands after sign-in. */
export const HOME = "/dashboard";
