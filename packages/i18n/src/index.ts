// Locale config and formatting helpers (CLAUDE.md §11.3).

export const locales = ["fa", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fa";

const rtlLocales: ReadonlySet<Locale> = new Set(["fa"]);

/** Cookie that stores the chosen UI language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function direction(locale: Locale): "rtl" | "ltr" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}

// fa uses Persian digits, en uses Latin digits.
const numberingSystem: Record<Locale, string> = { fa: "arabext", en: "latn" };

export function formatNumber(locale: Locale, value: number | bigint): string {
  return new Intl.NumberFormat(locale, { numberingSystem: numberingSystem[locale] }).format(value);
}

/** Jalali calendar for fa, Gregorian for en. */
export function formatDate(
  locale: Locale,
  value: Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en";
  return new Intl.DateTimeFormat(tag, { ...options, numberingSystem: numberingSystem[locale] }).format(value);
}
