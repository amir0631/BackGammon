"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { direction, LOCALE_COOKIE, type Locale } from "@bg/i18n";

// Runtime language switch (auth.md AU-10, profile.md §3.3). Routes are locale-free: the locale
// lives in a cookie, and `router.refresh()` re-renders the server tree (messages, <html lang dir>,
// theme direction) while client state such as form entries is kept.
//
// A switch that happens together with a navigation (sign-in applies `me.lang`) refreshes once the
// new route has rendered, because layouts are not re-fetched by a plain navigation.

const ONE_YEAR_S = 60 * 60 * 24 * 365;

interface LocaleSwitch {
  /** Sets the cookie and re-renders. `afterNavigation`: refresh after the next route change. */
  switchLocale: (locale: Locale, options?: { afterNavigation?: boolean }) => void;
}

const LocaleSwitchContext = createContext<LocaleSwitch | null>(null);

export function LocaleSwitchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef(false);

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    router.refresh();
  }, [pathname, router]);

  const switchLocale = useCallback<LocaleSwitch["switchLocale"]>(
    (locale, options) => {
      document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
      // Update the document at once so assistive tech and fonts follow before the server render.
      document.documentElement.lang = locale;
      document.documentElement.dir = direction(locale);
      if (options?.afterNavigation) pending.current = true;
      else router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ switchLocale }), [switchLocale]);
  return <LocaleSwitchContext.Provider value={value}>{children}</LocaleSwitchContext.Provider>;
}

export function useLocaleSwitch(): LocaleSwitch {
  const value = useContext(LocaleSwitchContext);
  if (!value) throw new Error("useLocaleSwitch must be used inside <LocaleSwitchProvider>");
  return value;
}
