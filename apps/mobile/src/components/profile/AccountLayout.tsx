"use client";

import { styled } from "@mui/material/styles";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { layout } from "@bg/design-tokens";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { useRequireUser } from "@/lib/session";
import { gutterStyles } from "@/theme/layout";
import { AccountHub } from "./AccountHub";

// Tab 5 frame for /me, /me/edit, /me/sessions, and /settings (profile.md §6, ia.md §3.3).
// - Narrow: one screen at a time; children show a back arrow to /me.
// - Wide enough for two readable columns (container ≥ 44rem, e.g. 1024 × 768 and up; at 768 px
//   the side rail leaves too little room): list-detail with the hub list on the start side and the
//   route in the detail panel. The URL is the route, so deep links and redirects keep working.
// - The detail panel adds a context column when it is wide enough (lg).
// Layout is CSS container queries only, so the server render is already right and a runtime width
// change (foldables, split screen) keeps the current URL and state.

export const ACCOUNT_CONTAINER = "account";
export const LIST_DETAIL_MIN = "44rem";
export const CONTEXT_MIN = "44rem";

const Frame = styled("div")(({ theme }) => ({
  containerType: "inline-size",
  containerName: ACCOUNT_CONTAINER,
  flex: "1 1 auto",
  ...gutterStyles,
  paddingBlock: theme.spacing(3),
  "& .account-hub-col": { display: "none" },
  "& .account-me-preview": { display: "none" },
  // Single screen: the readable column is centered; list-detail: it starts next to the hub.
  "& .detail-main": { marginInline: "auto" },
  [`@container ${ACCOUNT_CONTAINER} (min-width: ${LIST_DETAIL_MIN})`]: {
    "& .account-grid": {
      display: "grid",
      gridTemplateColumns: "minmax(16rem, 20rem) minmax(0, 1fr)",
      columnGap: theme.spacing(4),
      alignItems: "start",
    },
    "& .account-hub-col": { display: "block", position: "sticky", insetBlockStart: theme.spacing(10) },
    "& .account-me-inline": { display: "none" },
    "& .account-me-preview": { display: "block" },
    "& .detail-main": { marginInline: 0 },
  },
}));

const Detail = styled("div")({
  minWidth: 0,
  containerType: "inline-size",
  containerName: "detail",
});

/** Detail content with an optional context column (profile.md §6 lg). */
export const DetailColumns = styled("div")(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(4),
  gridTemplateColumns: "minmax(0, 1fr)",
  "& > .detail-main": { minWidth: 0, maxWidth: layout.taskFlowMaxWidth, width: "100%" },
  "& > .detail-context": { display: "none" },
  [`@container detail (min-width: ${CONTEXT_MIN})`]: {
    gridTemplateColumns: `minmax(0, ${layout.taskFlowMaxWidth}px) minmax(14rem, ${layout.sidePanelWidth}px)`,
    "& > .detail-context": { display: "block" },
  },
}));

const TITLES: Record<string, { key: string; back: boolean }> = {
  "/me": { key: "profile.hub.title", back: false },
  "/me/edit": { key: "profile.edit.title", back: true },
  "/me/sessions": { key: "sessions.title", back: true },
  "/me/matches": { key: "history.title", back: true },
  "/settings": { key: "settings.title", back: true },
};

export function AccountLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname() ?? "/me";
  const { me } = useRequireUser();
  const route = TITLES[pathname] ?? TITLES["/me"]!;

  return (
    <SignedInShell topBar={{ title: t(route.key), leading: route.back ? "back" : "brand", href: route.back ? "/me" : undefined }}>
      <Frame>
        <div className="account-grid">
          <nav className="account-hub-col" aria-label={t("profile.hub.title")}>
            <AccountHub me={me} current={pathname} />
          </nav>
          <Detail>{children}</Detail>
        </div>
      </Frame>
    </SignedInShell>
  );
}
