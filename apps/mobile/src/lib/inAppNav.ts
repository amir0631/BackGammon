"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Whether this tab has navigated inside the app (wallet review W-14). `history.length > 1` is also
// true when the app was opened from another site in a tab with history, so Back/Close could leave
// the app. The flag is set on the first client-side route change and kept for the tab.

const KEY = "bg.nav.inApp";
let first: string | null = null;

/** Mounted once (AppProviders): marks the tab after the first in-app route change. */
export function useTrackInAppNavigation(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (first === null) {
      first = pathname;
      return;
    }
    if (pathname !== first) {
      try {
        window.sessionStorage.setItem(KEY, "1");
      } catch {
        // Storage blocked: Back falls back to the documented exits.
      }
    }
  }, [pathname]);
}

/** True when `router.back()` stays inside the app. */
export function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY) === "1" && window.history.length > 1;
  } catch {
    return false;
  }
}
