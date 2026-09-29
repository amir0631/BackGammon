"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { iconSize, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { LiveMatchRow } from "@bg/protocol";
import { CheckIcon, CoinIcon, EyeIcon, InfoIcon, PlayIcon, TournamentsIcon } from "@/components/icons";
import { StatusChip } from "@/components/lists/StatusChip";
import { Avatar } from "@/components/profile/Avatar";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import { NameText, type LocalizedName } from "../tournaments/labels";

// LV-01 row cards and the md/lg preview panel (live.md §4). A card is one target (≥ 72 px) with a
// single accessible name (`live.row.label`); its parts are hidden from screen readers so nothing
// is read twice. Chips carry icon plus text.

const Card = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing(1),
    width: "100%",
    minHeight: 72,
    padding: theme.spacing(1.5, 2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    textAlign: "start",
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "&[data-selected='true']": { borderColor: t.primary, boxShadow: `inset 0 0 0 1px ${t.primary}` },
    "&[data-ended='true']": { opacity: 0.8 },
    "& .row-players": { display: "grid", gap: theme.spacing(0.5) },
    "& .row-player": { display: "flex", alignItems: "center", gap: theme.spacing(1), minWidth: 0, flexWrap: "wrap" },
    "& .row-chips": { display: "flex", flexWrap: "wrap", gap: theme.spacing(0.75) },
  };
}) as typeof ButtonBase;

export interface RowFacts {
  poolOpen: boolean;
  yourMatch: boolean;
  ended: boolean;
  /** The running tournament's name, when known (the match's round isn't exposed, live.md §10 Q8). */
  tournament: { name: LocalizedName } | null;
}

function useRowText(row: LiveMatchRow, facts: RowFacts) {
  const t = useTranslations("live");
  const f = useFormat();
  const labels = useGameLabels();
  const [a, b] = row.players;
  const score = t("row.score", { a: f.number(row.score[0] ?? 0), b: f.number(row.score[1] ?? 0) });
  const meta = [
    t("row.game", { n: f.number(row.game_no) }),
    t("row.firstTo", { n: f.number(row.length) }),
    labels.variant(row.variant),
    row.tournament_id === null && row.entry > 0 ? t("filters.tierValue", { entry: f.number(row.entry) }) : null,
    row.tournament_id !== null ? [t("row.tournament"), facts.tournament?.name.text].filter(Boolean).join(" ") : null,
    t("row.spectators", { count: row.spectators }),
    facts.poolOpen ? t("row.poolOpen") : null,
    facts.yourMatch ? t("row.yourMatch") : null,
    facts.ended ? t("row.ended") : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { a: isolate(a?.username ?? ""), b: isolate(b?.username ?? ""), score, meta };
}

export function LiveMatchCard({
  row,
  facts,
  selected,
  onOpen,
  href,
}: {
  row: LiveMatchRow;
  facts: RowFacts;
  selected?: boolean;
  /** md/lg: select for the preview panel instead of navigating. */
  onOpen?: () => void;
  href: string;
}) {
  const t = useTranslations("live");
  const f = useFormat();
  const labels = useGameLabels();
  const text = useRowText(row, facts);
  const linkProps = onOpen ? { onClick: onOpen } : { component: NextLink, href };

  return (
    <Card
      {...linkProps}
      aria-label={t("row.label", text)}
      aria-current={selected ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-ended={facts.ended ? "true" : undefined}
    >
      <Box aria-hidden sx={{ display: "grid", gap: 1, width: "100%" }}>
        {row.tournament_id !== null && (
          <Typography variant="labelSmall" component="p" sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "tokens.primary", m: 0 }}>
            <TournamentsIcon sx={{ fontSize: iconSize.sm }} />
            {facts.tournament ? (
              <span>
                {t("row.tournament")} · <NameText name={facts.tournament.name} />
              </span>
            ) : (
              t("row.tournament")
            )}
          </Typography>
        )}
        <div className="row-players">
          {row.players.map((p, i) => (
            <div className="row-player" key={i}>
              <Avatar avatarKey={p.avatar} size={32} />
              <Typography variant="label" component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <bdi dir="ltr">{p.username}</bdi>
              </Typography>
              <Typography variant="caption" color="text.secondary" component="span">
                {t("row.levelElo", { level: f.number(p.level), elo: f.number(p.elo) })}
              </Typography>
            </div>
          ))}
        </div>
        <Stack direction="row" sx={{ alignItems: "baseline", columnGap: 1.5, rowGap: 0.25, flexWrap: "wrap" }}>
          <Typography variant="h4" component="span">
            <bdi>{text.score}</bdi>
          </Typography>
          <Typography variant="body2" color="text.secondary" component="span">
            {t("row.game", { n: f.number(row.game_no) })} · {t("row.firstTo", { n: f.number(row.length) })}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" component="p" sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5, m: 0 }}>
          {labels.variant(row.variant)}
          {row.tournament_id === null && row.entry > 0 && (
            <>
              <span>·</span>
              <CoinIcon sx={{ fontSize: iconSize.sm }} />
              {t("filters.tierValue", { entry: f.number(row.entry) })}
            </>
          )}
        </Typography>
        <div className="row-chips">
          <StatusChip icon={EyeIcon}>{t("row.spectators", { count: row.spectators })}</StatusChip>
          {facts.poolOpen && (
            <StatusChip icon={CoinIcon} tone="primary">
              {t("row.poolOpen")}
            </StatusChip>
          )}
          {facts.yourMatch && (
            <StatusChip icon={PlayIcon} tone="info">
              {t("row.yourMatch")}
            </StatusChip>
          )}
          {facts.ended && <StatusChip icon={CheckIcon}>{t("row.ended")}</StatusChip>}
        </div>
      </Box>
    </Card>
  );
}

export function LiveCardSkeleton() {
  return <Skeleton variant="rectangular" height="9.5rem" sx={{ borderRadius: `${radii.lg}px` }} />;
}

/** md/lg detail panel: the selected match without 3D, and "Watch" (live.md §6). */
export function LivePreview({ row, facts, onWatch }: { row: LiveMatchRow | null; facts: RowFacts | null; onWatch: (id: string) => void }) {
  const t = useTranslations("live");
  const f = useFormat();
  const labels = useGameLabels();
  if (!row || !facts) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <InfoIcon sx={{ fontSize: iconSize.sm, mt: 0.25 }} />
        {t("preview.empty")}
      </Typography>
    );
  }
  return (
    <Stack spacing={2}>
      {row.players.map((p, i) => (
        <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
          <Avatar avatarKey={p.avatar} size={48} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="label" component="p" sx={{ overflowWrap: "anywhere" }}>
              <bdi dir="ltr">{p.username}</bdi>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("row.levelElo", { level: f.number(p.level), elo: f.number(p.elo) })}
            </Typography>
          </Box>
        </Stack>
      ))}
      <Typography variant="h3" component="p">
        <bdi>{t("row.score", { a: f.number(row.score[0] ?? 0), b: f.number(row.score[1] ?? 0) })}</bdi>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("row.game", { n: f.number(row.game_no) })} · {labels.length(row.length)} · {labels.variant(row.variant)}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
        <StatusChip icon={EyeIcon}>{t("row.spectators", { count: row.spectators })}</StatusChip>
        {facts.poolOpen && (
          <StatusChip icon={CoinIcon} tone="primary">
            {t("row.poolOpen")}
          </StatusChip>
        )}
        {facts.yourMatch && (
          <StatusChip icon={PlayIcon} tone="info">
            {t("row.yourMatch")}
          </StatusChip>
        )}
        {facts.ended && <StatusChip icon={CheckIcon}>{t("row.ended")}</StatusChip>}
      </Stack>
      <Button variant="contained" size="large" startIcon={<EyeIcon />} onClick={() => onWatch(row.match_id)}>
        {t("preview.watch")}
      </Button>
    </Stack>
  );
}
