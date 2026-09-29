"use client";

import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { bannerCandidate, isNewsHost, newsText, safeNewsLink } from "@bg/api-client";
import type { Announcement } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { MegaphoneIcon } from "@/components/icons/extra";
import { useNews } from "@/lib/news";
import { gutterStyles } from "@/theme/layout";

// NW-01 announcement banner (news.md §3.4, §4): on the tab roots only, below the suspension,
// offline, and pre-start banners; one at a time. After a dismissal the next banner waits for the
// next navigation to a host screen (no flicker of banners). Showing a banner marks it as seen.

export function AnnouncementBanner({ onShown }: { onShown?: (shown: boolean) => void }) {
  const t = useTranslations("news");
  const locale = useLocale() as "fa" | "en";
  const pathname = usePathname();
  const news = useNews();
  const host = isNewsHost(pathname);
  const compact = useMediaQuery("(orientation: landscape) and (max-height: 499.98px)");
  const [shown, setShown] = useState<Announcement | null>(null);
  const [pickedFor, setPickedFor] = useState<string | null>(null);

  // Pick once per navigation (and when data first arrives on this screen).
  useEffect(() => {
    if (!host || !news.items) {
      setShown(null);
      if (!host) setPickedFor(null);
      return;
    }
    if (pickedFor === pathname) return;
    setPickedFor(pathname);
    setShown(bannerCandidate(news.items, news.dismissed, locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, pathname, news.items, locale]);

  useEffect(() => {
    if (shown) news.markSeen([shown.id]);
    onShown?.(shown !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id]);

  if (!host || !shown) return null;
  const text = newsText(shown, locale);
  if (!text) return null;
  const link = safeNewsLink(shown.link);
  // Short landscape: one title line, so "Details" is always offered (news.md §6).
  const action = text.body || (compact && link) ? { label: t("banner.details"), href: `/news/${shown.id}` } : link ? { label: t("banner.open"), href: link } : undefined;

  const dismiss = () => {
    news.dismiss(shown.id);
    setShown(null);
  };

  return (
    <Box sx={{ ...gutterStyles, pt: 1.5 }} aria-label={t("banner.label", { title: text.title })} component="section">
      <Banner severity="info" icon={MegaphoneIcon} action={action} onClose={dismiss} closeLabel={t("banner.dismiss")}>
        <Box
          component="span"
          lang={text.lang}
          dir={text.fallback ? (text.lang === "fa" ? "rtl" : "ltr") : undefined}
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontWeight: 600,
            "@media (orientation: landscape) and (max-height: 499.98px)": { WebkitLineClamp: 1 },
          }}
        >
          {text.title}
        </Box>
      </Banner>
    </Box>
  );
}
