"use client";

import Box from "@mui/material/Box";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isolate } from "@bg/i18n";
import { Banner } from "@/components/feedback/Banner";
import { useActiveMatch } from "@/lib/activeMatch";
import { useFormat } from "@/lib/useFormat";
import { gutterStyles } from "@/theme/layout";

// PL-08 resume banner (play.md §3.8): on every non-immersive signed-in screen while a match runs.
// Not dismissible; it disappears when the match ends. "Your turn" / "@x's turn" in words (icon +
// text in the banner), never color alone.

export function ResumeMatchBanner() {
  const t = useTranslations("play.resume");
  const tBot = useTranslations("play.bot");
  const tCommon = useTranslations("common");
  const f = useFormat();
  const { active } = useActiveMatch();
  const pathname = usePathname() ?? "";
  const id = active?.match_id;
  if (!id || pathname.startsWith("/match/")) return null;

  const opponent = active.is_bot ? tBot("label") : active.opponent ? `@${isolate(active.opponent)}` : null;
  const score = active.score && active.score.length === 2 ? f.digits(`${active.score[0]} – ${active.score[1]}`) : null;
  const turn =
    active.your_turn === true
      ? t("yourTurn")
      : active.your_turn === false && active.opponent && !active.is_bot
        ? t("theirTurn", { username: isolate(active.opponent) })
        : null;
  const detail = [opponent, score && `⁦${score}⁩`, turn].filter(Boolean).join(tCommon("listSep"));

  return (
    <Box sx={{ ...gutterStyles, pt: 1.5 }}>
      <Banner severity="info" title={t("title")} action={{ label: t("return"), href: `/match/${id}` }}>
        {detail}
      </Banner>
    </Box>
  );
}
