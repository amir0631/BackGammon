import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@bg/i18n";

type Messages = { [key: string]: string | Messages };

function merge(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] =
      typeof value === "object" && typeof current === "object" ? merge(current, value) : value;
  }
  return out;
}

// The admin locale cookie is host-only on `admin.` (it is set without a Domain attribute).
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : defaultLocale;
  const shared = (await import(`@bg/i18n/messages/${locale}.json`)).default as Messages;
  const admin = (await import(`@bg/i18n/messages/admin.${locale}.json`)).default as Messages;
  return { locale, messages: merge(shared, admin) };
});
