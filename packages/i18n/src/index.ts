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

/** Percent from a 0–1 fraction: fa «۴۵٪», en "45%". */
export function formatPercent(locale: Locale, fraction: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits,
    numberingSystem: numberingSystem[locale],
  }).format(fraction);
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

// ---------------------------------------------------------------------------------------------
// Digit input normalization (patterns.md §10, §12). Users type Persian (۰–۹), Arabic-Indic
// (٠–٩, common on Arabic keyboards), or Latin digits; everything sent to the API uses Latin.
// ---------------------------------------------------------------------------------------------

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** Replaces Persian and Arabic-Indic digits with Latin digits; other characters are kept. */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= PERSIAN_ZERO ? code - PERSIAN_ZERO : code - ARABIC_INDIC_ZERO);
  });
}

/** Keeps only digits (after normalizing them to Latin), e.g. for OTP and amount inputs. */
export function digitsOnly(value: string): string {
  return toLatinDigits(value).replace(/[^0-9]/g, "");
}

/** Renders a string of Latin digits in the locale's digits without grouping (codes, phone numbers). */
export function localizeDigits(locale: Locale, value: string): string {
  if (numberingSystem[locale] === "latn") return value;
  return value.replace(/[0-9]/g, (d) => String.fromCharCode(PERSIAN_ZERO + Number(d)));
}

/**
 * Normalizes an Iranian mobile number to `09xxxxxxxxx` (patterns.md §10). Accepts Persian or
 * Latin digits, spaces, dashes, and the `+98` / `0098` / `98` prefixes. Returns null when the
 * result is not an 11-digit `09…` number. Format check only; the server stays authoritative.
 */
export function normalizeMobileNumber(value: string): string | null {
  let digits = digitsOnly(value);
  if (digits.startsWith("0098")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
  return /^09[0-9]{9}$/.test(digits) ? digits : null;
}

/** Groups an Iranian mobile number for display as `0912 345 6789` (Latin digits in, Latin out). */
export function groupMobileNumber(digits: string): string {
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11), digits.slice(11)];
  return parts.filter(Boolean).join(" ");
}

/**
 * Wraps user-provided text (usernames, codes) in FSI…PDI so it cannot reorder the surrounding
 * sentence (patterns.md §10). The string equivalent of <bdi>, for values passed into messages.
 */
export function isolate(value: string): string {
  return `\u2068${value}\u2069`;
}
