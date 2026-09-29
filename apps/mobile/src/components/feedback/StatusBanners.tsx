"use client";

import Box from "@mui/material/Box";
import { useTranslations } from "next-intl";
import type { Me } from "@bg/protocol";
import { useOnline } from "@/lib/useOnline";
import { gutterStyles } from "@/theme/layout";
import { Banner } from "./Banner";

// Global status banners below the top bar (patterns.md §1, §6.3; auth.md AU-13). They push content
// down and never cover controls. Neither is dismissible: each disappears when its status clears.

function Slot({ children }: { children: React.ReactNode }) {
  return <Box sx={{ ...gutterStyles, pt: 1.5 }}>{children}</Box>;
}

/** "You're offline" while the browser reports no connection. */
export function OfflineBanner() {
  const t = useTranslations("net");
  const online = useOnline();
  if (online) return null;
  return (
    <Slot>
      <Banner severity="offline">{t("offline")}</Banner>
    </Slot>
  );
}

/**
 * Suspension banner on every non-immersive signed-in screen (auth.md AU-13). The API does not yet
 * return an end date (auth.md open question 12), so the indefinite copy is used until it does.
 */
export function SuspensionBanner({ me }: { me: Me | null }) {
  const t = useTranslations("account.suspended");
  if (me?.status !== "suspended") return null;
  return (
    <Slot>
      <Banner severity="warning" action={{ label: t("details"), href: "/account/status" }}>
        {t("bannerIndefinite")}
      </Banner>
    </Slot>
  );
}
