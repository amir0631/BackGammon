"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { QueueJoinIn } from "@bg/protocol";
import { useFormat } from "@/lib/useFormat";

// Names for variants, lengths, bot levels, and tables (play.md §7). Shared by the lobby, the match
// screen, and later live.md. Keys only: raw server values such as `bot_easy` never reach the UI.

export type Variant = QueueJoinIn["variant"];
export const VARIANTS: readonly Variant[] = ["standard_cube", "standard_nocube", "traditional"];
export type BotLevel = "easy" | "medium" | "hard";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "medium", "hard"];

export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}

export function isBotLevel(value: string | null | undefined): value is BotLevel {
  return value === "easy" || value === "medium" || value === "hard";
}

export function useGameLabels() {
  const t = useTranslations("play");
  const f = useFormat();
  return useMemo(
    () => ({
      variant: (v: string) => (isVariant(v) ? t(`variant.${v}`) : v),
      /** Traditional scoring needs the server's point table; without it the numbers are left out. */
      variantDesc: (v: Variant, points?: Record<string, number> | null) =>
        v === "traditional"
          ? points && points.single !== undefined
            ? t("variantDesc.traditional", {
                single: f.number(points.single),
                gammon: f.number(points.gammon ?? 0),
                backgammon: f.number(points.backgammon ?? 0),
              })
            : t("variantDesc.traditionalNoPoints")
          : t(`variantDesc.${v}`),
      length: (n: number) => t("length.firstTo", { n: f.number(n) }),
      botLevel: (level: string | null | undefined) => (isBotLevel(level) ? t(`bot.level.${level}`) : ""),
      /** "Bot (Easy)", never the raw bot username. */
      botName: (level: string | null | undefined) => t("bot.name", { level: isBotLevel(level) ? t(`bot.level.${level}`) : "" }),
      tierName: (entry: number) => t("tier.name", { entry: f.number(entry) }),
      summary: (entry: number, variant: string, length: number) =>
        t("again.summary", {
          entry: f.number(entry),
          variant: isVariant(variant) ? t(`variant.${variant}`) : variant,
          n: f.number(length),
        }),
    }),
    [t, f],
  );
}
