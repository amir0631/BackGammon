"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { TournamentInfo } from "@bg/protocol";
import { useFormat } from "@/lib/useFormat";

// Tournament names (tournaments.md §7): the current locale; else the other locale rendered with its
// own `lang` and direction; else "Tournament #{id}". Shared by the tournament screens and the Live
// list, where tournament matches are labeled.

export interface LocalizedName {
  text: string;
  /** Set when the text is in the other language. */
  lang?: "fa" | "en";
}

export function useTournamentName() {
  const t = useTranslations("tournaments");
  const f = useFormat();
  return useCallback(
    (tour: Pick<TournamentInfo, "id" | "name">): LocalizedName => {
      const own = tour.name[f.locale]?.trim();
      if (own) return { text: own };
      const other = f.locale === "fa" ? "en" : "fa";
      const alt = tour.name[other]?.trim();
      if (alt) return { text: alt, lang: other };
      return { text: t("unnamed", { id: f.number(tour.id) }) };
    },
    [f, t],
  );
}

/** A name in its own language and direction when it isn't the page's. */
export function NameText({ name }: { name: LocalizedName }) {
  if (!name.lang) return <>{name.text}</>;
  return (
    <span lang={name.lang} dir={name.lang === "fa" ? "rtl" : "ltr"}>
      {name.text}
    </span>
  );
}
