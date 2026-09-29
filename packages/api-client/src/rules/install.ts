// PWA install prompt rules shared by both apps' logic (CLAUDE.md §11.5; patterns.md §15): a custom
// banner on the first visit, dismissible, re-shown after 7 days, at most 3 times; never during a
// match, matchmaking, payment, transfer, or withdrawal; a permanent "Install app" menu item.

export const INSTALL_RESHOW_MS = 7 * 24 * 3_600_000;
export const INSTALL_MAX_SHOWS = 3;

export interface InstallRecord {
  /** Times the banner has been shown (one per visit that showed it). */
  shows: number;
  /** Epoch ms of the last time it was shown. */
  lastShownAt: number | null;
}

export const EMPTY_INSTALL_RECORD: InstallRecord = { shows: 0, lastShownAt: null };

/** May a new showing start now? (A banner already showing in this visit stays until dismissed.) */
export function installBannerDue(record: InstallRecord | null, now: number): boolean {
  const r = record ?? EMPTY_INSTALL_RECORD;
  if (r.shows >= INSTALL_MAX_SHOWS) return false;
  return r.lastShownAt === null || now - r.lastShownAt >= INSTALL_RESHOW_MS;
}

export function recordInstallShow(record: InstallRecord | null, now: number): InstallRecord {
  const r = record ?? EMPTY_INSTALL_RECORD;
  return { shows: r.shows + 1, lastShownAt: now };
}

export type InstallPlatform = "installed" | "prompt" | "ios" | "manual";

/**
 * How this browser installs: already running installed, a captured `beforeinstallprompt`
 * (Android/Chromium), the iOS Safari Share → Add to Home Screen guide, or manual (browser menu).
 */
export function installPlatform(o: { standalone: boolean; hasPrompt: boolean; userAgent: string; maxTouchPoints?: number }): InstallPlatform {
  if (o.standalone) return "installed";
  if (o.hasPrompt) return "prompt";
  const ua = o.userAgent;
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (o.maxTouchPoints ?? 0) > 1);
  // Only Safari can add to the home screen on older iOS; other iOS browsers get the same guide
  // (iOS 16.4+ supports it from their share menus too).
  if (iOS) return "ios";
  return "manual";
}

/** Screens where the banner may appear: the tab roots (never immersive screens or money flows). */
export const INSTALL_HOSTS = ["/play", "/live", "/tournaments", "/shop", "/me"] as const;

export function isInstallHost(pathname: string | null | undefined): boolean {
  return (INSTALL_HOSTS as readonly string[]).includes(pathname ?? "");
}
