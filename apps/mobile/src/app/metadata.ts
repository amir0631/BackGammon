import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Document title "<screen> · <app name>" from i18n keys (screen readers announce it on load). */
export async function titled(key: string): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t(key)} · ${t("app.name")}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of a query parameter. */
export async function param(searchParams: SearchParams, name: string): Promise<string | null> {
  const value = (await searchParams)[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export type PageProps = { searchParams: SearchParams };
