import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@bg/i18n";

// Routes are locale-free so `app.` and `m.` share identical paths (CLAUDE.md §11.0 rule 7);
// the locale comes from a cookie and defaults to fa.
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : defaultLocale;
  return {
    locale,
    messages: (await import(`@bg/i18n/messages/${locale}.json`)).default,
  };
});
