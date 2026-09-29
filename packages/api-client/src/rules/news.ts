import type { Announcement } from "@bg/protocol";

// Announcement rules shared by both apps (CLAUDE.md §2 rule 14; news.md §3). The server only
// validates links as paths; the client adds the stricter checks below.

export type NewsLang = "fa" | "en";

export interface NewsText {
  title: string;
  body: string;
  /** The language the text is in (the other one when the current locale's title is empty). */
  lang: NewsLang;
  fallback: boolean;
}

/** news.md §3.2: current locale, else the other locale's title and body; no title at all → null. */
export function newsText(item: Pick<Announcement, "title" | "body">, locale: NewsLang): NewsText | null {
  const other: NewsLang = locale === "fa" ? "en" : "fa";
  const own = item.title?.[locale]?.trim();
  if (own) return { title: own, body: item.body?.[locale]?.trim() ?? "", lang: locale, fallback: false };
  const alt = item.title?.[other]?.trim();
  if (alt) return { title: alt, body: item.body?.[other]?.trim() ?? "", lang: other, fallback: true };
  return null;
}

const BLOCKED_LINKS = [/^\/wallet\/transfer(\/|\?|$)/, /^\/wallet\/withdraw(\/|\?|$)/, /^\/shop\/coins\/result(\/|\?|$)/];

/** news.md §3.3: one leading `/`, not `//`, and never a money task flow or the payment result. */
export function safeNewsLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return null;
  if (BLOCKED_LINKS.some((re) => re.test(link))) return null;
  return link;
}

/** Tab roots that host the banner (news.md §3.4 step 2). */
export const NEWS_HOSTS = ["/play", "/live", "/tournaments", "/shop"] as const;

export function isNewsHost(pathname: string | null | undefined): boolean {
  return (NEWS_HOSTS as readonly string[]).includes(pathname ?? "");
}

/** The first undismissed banner in server order that has a title in some language. */
export function bannerCandidate(items: readonly Announcement[], dismissed: ReadonlySet<number>, locale: NewsLang): Announcement | null {
  return items.find((a) => a.kind === "banner" && !dismissed.has(a.id) && newsText(a, locale) !== null) ?? null;
}

/** Items to list (both kinds, server order), skipping those without any title. */
export function listableNews(items: readonly Announcement[], locale: NewsLang): Announcement[] {
  return items.filter((a) => newsText(a, locale) !== null);
}

/** Plain-text body → paragraphs split on blank lines; single line breaks are kept inside. */
export function bodyParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Drops ids the API no longer returns (news.md §3.1 step 3). */
export function pruneIds(ids: readonly number[], items: readonly Pick<Announcement, "id">[]): number[] {
  const live = new Set(items.map((a) => a.id));
  return ids.filter((id) => live.has(id));
}
