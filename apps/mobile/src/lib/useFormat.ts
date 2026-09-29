"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  defaultLocale,
  formatDate,
  formatNumber,
  formatPercent,
  isLocale,
  localizeDigits,
  type Locale,
} from "@bg/i18n";
import { clock } from "./useCountdown";

/** Coin and toman amounts arrive from the API as integers (CLAUDE.md §2 rule 4). */
export type Amount = number | bigint;

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/** "۲ ساعت پیش" / "2 hours ago" (patterns.md §10). Negative = past. */
function relativeTime(locale: Locale, target: Date, now = Date.now()): string {
  let value = (target.getTime() - now) / 1000;
  const tag = locale === "fa" ? "fa-IR" : "en";
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto", numberingSystem: locale === "fa" ? "arabext" : "latn" } as Intl.RelativeTimeFormatOptions);
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), "year");
}

/** Locale-aware number, coin, and toman formatting via @bg/i18n (patterns.md §10). */
export function useFormat() {
  const current = useLocale();
  const locale: Locale = isLocale(current) ? current : defaultLocale;
  const tCoins = useTranslations("coins");
  const tMoney = useTranslations("money");

  return useMemo(
    () => ({
      locale,
      number: (value: Amount) => formatNumber(locale, value),
      digits: (value: string) => localizeDigits(locale, value),
      /** 0–1 fraction → "۴۵٪" / "45%" */
      percent: (fraction: number) => formatPercent(locale, fraction),
      /** "۱٬۲۵۰ سکه" / "1,250 coins" */
      coins: (value: Amount) => tCoins("value", { amount: formatNumber(locale, value), count: Number(value) }),
      /** "۱۵۰٬۰۰۰ تومان" / "150,000 toman" */
      toman: (value: Amount) => tMoney("toman", { amount: formatNumber(locale, value) }),
      /** Jalali in fa, Gregorian in en. «۵ مهر ۱۴۰۵» / "Sep 27, 2026" */
      date: (value: string | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
        formatDate(locale, new Date(value), options),
      /** «۵ مهر ۱۴۰۵، ۱۴:۳۰» / "Sep 27, 2026, 2:30 PM" */
      dateTime: (value: string | Date) =>
        formatDate(locale, new Date(value), { dateStyle: "medium", timeStyle: "short" }),
      /** «مهر ۱۴۰۵» / "September 2026" */
      monthYear: (value: string | Date) => formatDate(locale, new Date(value), { year: "numeric", month: "long" }),
      /** "۲ ساعت پیش" / "2 hours ago" */
      relative: (value: string | Date) => relativeTime(locale, new Date(value)),
      /** mm:ss in locale digits, for countdowns (wrap in <bdi dir="ltr">). */
      clock: (seconds: number) => localizeDigits(locale, clock(seconds)),
    }),
    [locale, tCoins, tMoney],
  );
}
