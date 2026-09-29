"use client";

import { useState } from "react";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { AnnouncementBanner } from "@/features/news/AnnouncementBanner";

/**
 * Lobby banners after the status banners (news.md §3.4; CLAUDE.md §11.5): the announcement, then
 * the install suggestion, one at a time. Loaded lazily by the shell (never blocks first paint).
 */
export default function LobbyBanners() {
  const [announcementShown, setAnnouncementShown] = useState(false);
  return (
    <>
      <AnnouncementBanner onShown={setAnnouncementShown} />
      <InstallBanner suppressed={announcementShown} />
    </>
  );
}
