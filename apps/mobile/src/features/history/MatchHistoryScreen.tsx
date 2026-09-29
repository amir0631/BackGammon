"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@bg/api-client";
import { avatarSize, iconSize, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { MatchSummary, MyMatchSummary } from "@bg/protocol";
import { CheckIcon, ChevronForwardIcon, CloseIcon, InfoIcon, WarningIcon } from "@/components/icons";
import { BotIcon, HourglassIcon } from "@/components/icons/game";
import { Avatar } from "@/components/profile/Avatar";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { toApiError } from "@/lib/apiErrors";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";

// HI-01 Match history `/me/matches` (history-replay.md §3.1, §4): newest first, 20 per page with
// "Show more". A row opens the player view of a running match, or MA-14 for any other. Coin,
// rating, and XP changes appear only when the API returns them (AC 3); nothing is guessed.

type Row = MatchSummary & Partial<MyMatchSummary>;

const List = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "& > li + li": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

const RowButton = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    minHeight: 72,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 1.5, 1.5, 2),
    textAlign: "start",
    color: t.textPrimary,
    "& .row-main": { flex: "1 1 auto", minWidth: 0, display: "grid", gap: theme.spacing(0.25) },
    "& .row-top": { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: theme.spacing(1), rowGap: theme.spacing(0.25) },
    "& .row-chevron": { flex: "none", color: t.textSecondary, fontSize: iconSize.sm },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
  };
}) as typeof ButtonBase;

const Chip = styled("span")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    paddingInline: theme.spacing(1),
    borderRadius: radii.pill,
    border: `1px solid ${t.outline}`,
    ...theme.typography.labelSmall,
    "&[data-tone='won']": { borderColor: t.success, color: t.success },
    "&[data-tone='lost']": { color: t.textSecondary },
  };
});

type Result = "won" | "lost" | "cancelled" | "voided" | "active";

function resultOf(m: Row): Result {
  if (m.status === "active") return "active";
  if (m.status === "aborted") return "cancelled";
  if (m.status === "voided") return "voided";
  return m.you !== null && m.winner === m.you ? "won" : "lost";
}

const RESULT_ICON = { won: CheckIcon, lost: CloseIcon, cancelled: InfoIcon, voided: WarningIcon, active: HourglassIcon } as const;

export function MatchHistoryScreen() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const online = useOnline();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<{ offline: boolean; code?: string } | null>(null);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.matches
      .mine()
      .then((page) => {
        setRows(page.results);
        setNext(page.next);
      })
      .catch((e: unknown) => {
        const err = toApiError(e);
        setError({ offline: err.code === "NETWORK", code: err.code === "NETWORK" ? undefined : err.code });
      });
  }, []);
  useEffect(load, [load]);

  const more = () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    api.matches
      .mine(next)
      .then((page) => {
        setRows((r) => [...(r ?? []), ...page.results]);
        setNext(page.next);
      })
      .catch((e: unknown) => {
        // A stale cursor: reload from the first page (history-replay.md §3.6).
        if (toApiError(e).code === "VALIDATION") load();
        else setMoreError(true);
      })
      .finally(() => setLoadingMore(false));
  };

  const dateText = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const time = f.date(d, { hour: "2-digit", minute: "2-digit" });
    if (same(d, today)) return t("history.row.today", { time });
    if (same(d, yesterday)) return t("history.row.yesterday", { time });
    return f.date(d, { day: "numeric", month: "long", year: "numeric" });
  };

  const row = (m: Row) => {
    const result = resultOf(m);
    const Icon = RESULT_ICON[result];
    const self = m.you ?? 0;
    const opp = m.players[1 - self];
    const oppName = opp?.is_bot ? labels.botName(opp.bot_level) : opp?.username ? `@${isolate(opp.username)}` : t("history.row.unknownPlayer");
    const score = t("match.score", { self: f.number(m.score[self] ?? 0), opp: f.number(m.score[1 - self] ?? 0) });
    const table = m.is_bot ? t("history.row.practice") : m.entry > 0 ? t("history.row.table", { entry: f.number(m.entry) }) : null;
    const meta = [labels.variant(m.variant), labels.length(m.length), table].filter(Boolean).join(t("common.listSep"));
    const date = dateText(m.ended_at ?? m.created_at);
    const resultText = t(`history.row.result.${result}`);
    return (
      <li key={m.id}>
        <RowButton
          component={NextLink}
          href={`/match/${m.id}`}
          aria-label={t("history.row.label", { result: resultText, opponent: oppName, score, meta, date })}
        >
          <Avatar avatarKey={opp?.avatar ?? ""} size={avatarSize.sm} />
          <span className="row-main" aria-hidden>
            <span className="row-top">
              <Typography component="span" variant="label" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0, overflowWrap: "anywhere" }}>
                {opp?.is_bot && <BotIcon sx={{ fontSize: iconSize.sm }} />}
                {opp?.is_bot ? oppName : <bdi dir="ltr">{oppName}</bdi>}
              </Typography>
              <Chip data-tone={result}>
                <Icon sx={{ fontSize: iconSize.sm - 4 }} />
                {resultText}
              </Chip>
            </span>
            <Typography component="span" variant="body2">
              <bdi>{score}</bdi>
              {result === "active" && ` · ${t("history.row.returnToMatch")}`}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary">
              {meta}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary">
              {date}
              {typeof m.coins === "number" && m.coins !== 0 &&
                ` · ${m.coins > 0 ? t("match.result.signWon", { amount: f.number(m.coins) }) : t("match.result.signLost", { amount: f.number(-m.coins) })}`}
            </Typography>
          </span>
          <ChevronForwardIcon className="row-chevron" />
        </RowButton>
      </li>
    );
  };

  return (
    <DetailColumns>
      <Stack spacing={2} className="detail-main">
        <Typography color="text.secondary">{t("history.intro")}</Typography>
        {error ? (
          <ErrorState
            kind={error.offline ? "offline" : "error"}
            message={error.offline ? t("net.offline") : t("history.loadError")}
            code={error.code}
            onRetry={load}
          />
        ) : rows === null ? (
          <LoadingState variant="list" rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState message={t("history.empty")} action={{ label: t("history.emptyAction"), href: "/play?bot=" }} />
        ) : (
          <>
            <List>{rows.map(row)}</List>
            {moreError && (
              <Typography role="alert" variant="body2" sx={{ color: "tokens.error" }}>
                {t("history.loadMoreError")}
              </Typography>
            )}
            {next && (
              <Box>
                <Button
                  variant="outlined"
                  fullWidth
                  loading={loadingMore}
                  onClick={more}
                  disabled={!online}
                  aria-describedby={!online ? "history-offline" : undefined}
                >
                  {moreError ? t("common.retry") : t("common.showMore")}
                </Button>
                {!online && (
                  <Typography id="history-offline" variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
                    {t("net.offlineAction")}
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </Stack>
      <Box className="detail-context" />
    </DetailColumns>
  );
}
