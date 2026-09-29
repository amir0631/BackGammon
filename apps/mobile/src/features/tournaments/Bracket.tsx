"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { bracketGrid, isMySlot, mySlot, roundName, type BracketCell } from "@bg/api-client";
import { breakpoints, iconSize, radii } from "@bg/design-tokens";
import type { BracketSlotInfo, TournamentInfo } from "@bg/protocol";
import { CheckIcon, EyeIcon, LiveIcon, PlayIcon } from "@/components/icons";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { StatusChip } from "@/components/lists/StatusChip";
import { useFormat } from "@/lib/useFormat";
import { useReducedMotion } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";
import { visuallyHidden } from "@/theme/layout";

// TO-03 Bracket (tournaments.md §4): every round from `rounds` and `capacity`, known slots filled,
// "To be decided" elsewhere. Winners: check icon + bold + the word "winner" (not color alone). The
// viewer's slots: "You" badge + thicker outline. Phones and tablets: one round at a time with a
// round picker (no horizontal page scroll); lg: all rounds side by side, scrolling inside the
// bracket region only. Rounds run in reading direction (the grid follows `dir`).

const Slot = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "grid",
    gap: theme.spacing(0.5),
    minHeight: 72,
    padding: theme.spacing(1, 1.5),
    borderRadius: radii.md,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    "&[data-mine='true']": { borderColor: t.primary, borderWidth: 2 },
    "& .slot-row": { display: "flex", alignItems: "center", gap: theme.spacing(1), minWidth: 0 },
    "& .slot-name": { flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" },
    "& .slot-row[data-winner='true'] .slot-name": { fontWeight: theme.typography.fontWeightBold },
  };
});

function useRoundLabel(rounds: number) {
  const t = useTranslations("tournaments.bracket");
  const f = useFormat();
  return (round: number) => {
    const kind = roundName(round, rounds);
    return kind === "round" ? t("round", { round: f.number(round) }) : t(kind);
  };
}

function SlotCard({ cell, rounds, username }: { cell: BracketCell; rounds: number; username: string | null }) {
  const t = useTranslations("tournaments.bracket");
  const f = useFormat();
  const roundLabel = useRoundLabel(rounds);
  const s = cell.slot;
  const mine = isMySlot(s, username);
  const players = s?.players ?? [null, null];
  const status = s?.live ? t("live") : s?.winner ? `${s.winner} ${t("winner")}` : "";
  const label = t("slotLabel", {
    round: roundLabel(cell.round),
    n: f.number(cell.position + 1),
    a: players[0] ?? t("tbd"),
    b: players[1] ?? t("tbd"),
    scoreA: s?.score ? f.number(s.score[0]) : "",
    scoreB: s?.score ? f.number(s.score[1]) : "",
    status: [status, mine ? t("you") : ""].filter(Boolean).join(" · "),
  });
  return (
    <Slot data-mine={mine ? "true" : undefined} id={`slot-${cell.round}-${cell.position}`} role="group" aria-label={label}>
      {[0, 1].map((i) => {
        const name = players[i];
        const won = Boolean(s?.winner && name && s.winner === name);
        return (
          <div className="slot-row" key={i} data-winner={won ? "true" : undefined} aria-hidden>
            {won ? <CheckIcon sx={{ fontSize: iconSize.sm, color: "tokens.success" }} /> : <Box sx={{ width: iconSize.sm, flex: "none" }} />}
            <Typography variant="body2" className="slot-name" color={name ? "text.primary" : "text.secondary"}>
              {name ? <bdi dir="ltr">{name}</bdi> : t("tbd")}
              {won && <span style={visuallyHidden}> {t("winner")}</span>}
            </Typography>
            {s?.score && (
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {f.number(s.score[i as 0 | 1])}
              </Typography>
            )}
          </div>
        );
      })}
      {(mine || s?.live) && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          {mine && (
            <StatusChip tone="primary" icon={CheckIcon}>
              {t("you")}
            </StatusChip>
          )}
          {s?.live && (
            <StatusChip tone="info" icon={LiveIcon}>
              {t("live")}
            </StatusChip>
          )}
          {s?.live && s.match_id && (
            <Button size="small" variant="outlined" component={NextLink} href={`/match/${s.match_id}`} startIcon={mine ? <PlayIcon /> : <EyeIcon />} sx={{ minHeight: 44, marginInlineStart: "auto" }}>
              {mine ? t("play") : t("watch")}
            </Button>
          )}
        </Stack>
      )}
    </Slot>
  );
}

export function Bracket({ tour, slots, username }: { tour: TournamentInfo; slots: BracketSlotInfo[]; username: string | null }) {
  const t = useTranslations("tournaments.bracket");
  const reduced = useReducedMotion();
  const wide = useMediaQuery(`(min-width: ${breakpoints.lg}px)`);
  const roundLabel = useRoundLabel(tour.rounds);
  const grid = useMemo(() => bracketGrid(tour, slots), [tour, slots]);
  const mine = mySlot(slots, username);
  const [round, setRound] = useState(() => mine?.round ?? Math.max(1, tour.round || 1));

  useEffect(() => {
    if (round > tour.rounds) setRound(tour.rounds);
  }, [round, tour.rounds]);

  const jump = () => {
    if (!mine) return;
    setRound(mine.round);
    window.setTimeout(() => {
      document.getElementById(`slot-${mine.round}-${mine.position}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center", inline: "center" });
    }, 0);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {mine && (
          <Button variant="outlined" onClick={jump}>
            {t("jumpToMine")}
          </Button>
        )}
      </Stack>
      {wide ? (
        <Box sx={{ overflowX: "auto", overscrollBehaviorX: "contain", pb: 1 }} role="region" aria-label={t("rounds")} tabIndex={0}>
          <Box sx={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(16rem, 1fr)", gap: 2, alignItems: "stretch" }}>
            {grid.map((cells, i) => (
              <section key={i} aria-label={roundLabel(i + 1)}>
                <Typography variant="labelSmall" component="h3" color="text.secondary" sx={{ mb: 1 }}>
                  {roundLabel(i + 1)}
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 1.5, height: "calc(100% - 2rem)" }}>
                  {cells.map((cell) => (
                    <SlotCard key={cell.position} cell={cell} rounds={tour.rounds} username={username} />
                  ))}
                </Box>
              </section>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          <ChoiceGroup
            legend={t("rounds")}
            layout="chips"
            value={round}
            onChange={setRound}
            options={grid.map((_, i) => ({ value: i + 1, label: roundLabel(i + 1) }))}
          />
          <section aria-label={roundLabel(round)}>
            <Typography variant="h5" component="h3" sx={{ mb: 1 }}>
              {roundLabel(round)}
            </Typography>
            <Stack spacing={1.5}>
              {(grid[round - 1] ?? []).map((cell) => (
                <SlotCard key={cell.position} cell={cell} rounds={tour.rounds} username={username} />
              ))}
            </Stack>
          </section>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
            <Button variant="text" disabled={round <= 1} onClick={() => setRound((r) => r - 1)}>
              {t("previous")}
            </Button>
            <Button variant="text" disabled={round >= tour.rounds} onClick={() => setRound((r) => r + 1)}>
              {t("next")}
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
