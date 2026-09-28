"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { layout } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import { OfflineBanner } from "@/components/feedback/StatusBanners";
import { AppShell } from "@/components/shell/AppShell";
import { TopBar } from "@/components/shell/TopBar";
import { gutterStyles } from "@/theme/layout";

// Terms and Privacy placeholders (CLAUDE.md §18: placeholder pages with i18n keys; the real copy
// comes with help-legal.md). Public, no nav; back returns to wherever the link was opened from, so
// a signup in progress keeps its entries.
export function LegalPlaceholder({ titleKey }: { titleKey: "legal.terms.title" | "legal.privacy.title" }) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <AppShell
      hideNav
      topBar={
        <TopBar
          title={t(titleKey)}
          leading="back"
          onNavigate={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        />
      }
      banner={<OfflineBanner />}
    >
      <Box sx={{ ...gutterStyles, py: 3, maxWidth: layout.readableMaxWidth, width: "100%", marginInline: "auto" }}>
        <Typography>{t("legal.placeholder", { channel: isolate(t("support.contact.channel")) })}</Typography>
      </Box>
    </AppShell>
  );
}
