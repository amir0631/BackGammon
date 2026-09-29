"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { tournamentChip, type TournamentChip } from "@bg/api-client";
import { iconSize, radii } from "@bg/design-tokens";
import type { TournamentInfo } from "@bg/protocol";
import { CheckIcon, ClockIcon, CloseIcon, CoinIcon, InfoIcon, LockIcon, PendingIcon, TournamentsIcon, type IconProps } from "@/components/icons";
import { StatusChip } from "@/components/lists/StatusChip";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import { NameText, useTournamentName } from "./labels";

// TO-01 card (tournaments.md §4): one target (≥ 88 px), one accessible name; status chips carry an
// icon and text; the places bar is decorative (the text carries the value).

const Card = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing(0.75),
    width: "100%",
    minHeight: 88,
    padding: theme.spacing(1.5, 2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    textAlign: "start",
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "&[data-joined='true']": { borderColor: t.primary },
  };
}) as typeof ButtonBase;

const CHIP_ICON: Record<TournamentChip, ComponentType<IconProps>> = {
  open: TournamentsIcon,
  full: LockIcon,
  starting: PendingIcon,
  round: ClockIcon,
  finished: CheckIcon,
  cancelled: CloseIcon,
};

export function useChipText() {
  const t = useTranslations("tournaments.status");
  const f = useFormat();
  return (tour: TournamentInfo, now: number) => {
    const chip = tournamentChip(tour, now);
    const text = chip === "round" ? t("round", { round: f.number(tour.round), rounds: f.number(tour.rounds) }) : t(chip);
    return { chip, text, Icon: CHIP_ICON[chip] };
  };
}

export function TournamentStatusChips({ tour, now }: { tour: TournamentInfo; now: number }) {
  const t = useTranslations("tournaments");
  const chipText = useChipText();
  const { chip, text, Icon } = chipText(tour, now);
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      <StatusChip icon={Icon} tone={chip === "open" ? "success" : chip === "round" || chip === "starting" ? "info" : "neutral"}>
        {text}
      </StatusChip>
      {tour.joined && (
        <StatusChip icon={CheckIcon} tone="primary">
          {t("registered")}
        </StatusChip>
      )}
    </Box>
  );
}

export function TournamentCard({ tour, now }: { tour: TournamentInfo; now: number }) {
  const t = useTranslations("tournaments");
  const f = useFormat();
  const labels = useGameLabels();
  const nameOf = useTournamentName();
  const chipText = useChipText();
  const name = nameOf(tour);
  const { text: status } = chipText(tour, now);
  const entry = tour.entry > 0 ? t("card.entry", { count: tour.entry }) : t("card.free");
  const start =
    tour.status === "running"
      ? t("card.started", { relative: f.relative(tour.starts_at) })
      : t("card.starts", { date: f.dateTime(tour.starts_at), relative: f.relative(tour.starts_at) });
  const places = t("card.places", { entries: f.number(tour.entries), capacity: f.number(tour.capacity) });
  const variant = `${labels.variant(tour.variant)} · ${labels.length(tour.length)}`;
  const firstPrize = (tour.prizes[0] ?? 0) > 0 ? t("card.firstPrize", { amount: f.number(tour.prizes[0]!) }) : null;

  return (
    <Card
      component={NextLink}
      href={`/tournaments/${tour.id}`}
      data-joined={tour.joined ? "true" : undefined}
      aria-label={t("card.label", { name: name.text, status: [status, tour.joined ? t("registered") : null].filter(Boolean).join(" · "), variant, entry: [entry, firstPrize].filter(Boolean).join(" · "), start, places })}
    >
      <Box aria-hidden sx={{ display: "grid", gap: 0.75 }}>
        <Typography variant="h5" component="p" sx={{ m: 0, overflowWrap: "anywhere" }}>
          <NameText name={name} />
        </Typography>
        <TournamentStatusChips tour={tour} now={now} />
        <Typography variant="body2" color="text.secondary">
          {variant}
        </Typography>
        <Typography variant="body2" sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
          <CoinIcon sx={{ fontSize: iconSize.sm }} />
          {entry}
          {firstPrize && <span>· {firstPrize}</span>}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {start}
        </Typography>
        {tour.status === "scheduled" && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {places}
            </Typography>
            <LinearProgress variant="determinate" value={Math.min(100, (tour.entries / Math.max(1, tour.capacity)) * 100)} sx={{ mt: 0.5, borderRadius: 1 }} />
          </Box>
        )}
        {tour.status === "finished" && tour.my_place !== null && tour.my_place !== undefined && (
          <Typography variant="body2" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <CheckIcon sx={{ fontSize: iconSize.sm }} />
            {(tour.my_prize ?? 0) > 0
              ? t("card.myPlacePrize", { place: f.number(tour.my_place), prize: f.number(tour.my_prize ?? 0) })
              : t("card.myPlace", { place: f.number(tour.my_place) })}
          </Typography>
        )}
        {tour.status === "cancelled" && tour.joined && tour.entry > 0 && (
          <Typography variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <InfoIcon sx={{ fontSize: iconSize.sm }} />
            {t("card.refunded")}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

export function TournamentCardSkeleton() {
  return <Skeleton variant="rectangular" height="9rem" sx={{ borderRadius: `${radii.lg}px` }} />;
}
