"use client";

import Box from "@mui/material/Box";
import { useTranslations } from "next-intl";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { EmptyState } from "@/components/states/EmptyState";
import { LoadingState } from "@/components/states/LoadingState";
import { useRequireUser } from "@/lib/session";
import { gutterStyles } from "@/theme/layout";

// Placeholder for Tab 1 until the lobby ships (auth.md §2: "/play is a placeholder shell owned by
// the main agent"). Exists so every auth exit lands on a real, signed-in screen.
export function PlayPlaceholder() {
  const t = useTranslations();
  const { me } = useRequireUser();
  return (
    <SignedInShell topBar={{ title: t("nav.play"), leading: "brand" }}>
      <Box sx={{ ...gutterStyles, py: 3 }}>
        {me ? <EmptyState message={t("play.placeholder")} /> : <LoadingState variant="cards" rows={2} />}
      </Box>
    </SignedInShell>
  );
}
