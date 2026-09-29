"use client";

import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { gutterStyles } from "@/theme/layout";

// Shop frame (shop.md §4): app bar with the balance chip and four segment tabs, each its own route
// so deep links and Back work (acceptance 1). Kept light: the coins page loads it too.

export type ShopSegment = "themes" | "avatars" | "packs" | "coins";
const SEGMENTS: { key: ShopSegment; href: string }[] = [
  { key: "themes", href: "/shop" },
  { key: "avatars", href: "/shop/avatars" },
  { key: "packs", href: "/shop/packs" },
  { key: "coins", href: "/shop/coins" },
];

export function ShopFrame({ segment, children }: { segment: ShopSegment; children: ReactNode }) {
  const t = useTranslations("shop");
  return (
    <SignedInShell topBar={{ title: t("title"), leading: "brand" }}>
      <Box sx={{ ...gutterStyles, pt: 1 }}>
        <Tabs value={segment} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t("segments")}>
          {SEGMENTS.map((s) => (
            <Tab key={s.key} value={s.key} label={t(`segment.${s.key}`)} component={NextLink} href={s.href} aria-current={s.key === segment ? "page" : undefined} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>
      <Box sx={{ ...gutterStyles, py: 2, pb: 4 }}>{children}</Box>
    </SignedInShell>
  );
}

