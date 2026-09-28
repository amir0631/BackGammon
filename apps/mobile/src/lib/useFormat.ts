"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { defaultLocale, formatNumber, formatPercent, isLocale, localizeDigits, type Locale } from "@bg/i18n";

/** Coin and toman amounts arrive from the API as integers (CLAUDE.md §2 rule 4). */
export type Amount = number | bigint;

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
    }),
    [locale, tCoins, tMoney],
  );
}
