"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api, groupPredictions, predictionOutcome } from "@bg/api-client";
import { iconSize, minTouchTarget, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { PredictionRow } from "@bg/protocol";
import { ChevronForwardIcon } from "@/components/icons";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { toApiError } from "@/lib/apiErrors";
import { readJson, writeJson } from "@/lib/storage";
import { useSession } from "@/lib/session";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { tokensOf } from "@/theme/theme";
import { OutcomeChip, outcomeStatusKey, useOutcomeAmount } from "./outcome";

// PR-04 My predictions `/me/predictions` (predictions.md §3.4, §4; live.md §3.9). Stakes are
// grouped by match on the client (a group split across pages merges when the next page loads);
// one outcome per match from the winner and the side. A card opens `/match/[id]` (never a
// replay); an expand button lists the individual stakes. No totals, no profit banner, no streaks.

const CACHE_KEY = "bg.predictions.cache";

interface Cache {
  userId: number;
  rows: PredictionRow[];
  next: string | null;
  at: number;
}

const List = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: theme.spacing(1.5),
    "& > li": { borderRadius: radii.lg, border: `1px solid ${t.outlineSubtle}`, backgroundColor: t.surface, overflow: "hidden", containerType: "inline-size" },
  };
});

const CardLink = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    minHeight: 72,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 1.5, 1, 2),
    textAlign: "start",
    color: t.textPrimary,
    "& .card-main": { flex: "1 1 auto", minWidth: 0, display: "grid", gap: theme.spacing(0.5) },
    "& .card-top": { display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: theme.spacing(1.5), rowGap: theme.spacing(0.25) },
    "& .card-line": { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: theme.spacing(1), rowGap: theme.spacing(0.5) },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    // xs: the amount moves to its own line (predictions.md §6).
    "@container (max-width: 20rem)": { "& .card-top": { flexDirection: "column", alignItems: "flex-start" } },
  };
}) as typeof ButtonBase;

export function MyPredictionsScreen() {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const { me } = useSession();
  const amountText = useOutcomeAmount();
  const [rows, setRows] = useState<PredictionRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<{ offline: boolean; code?: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setError(null);
    api.predictions
      .mine()
      .then((page) => {
        setRows(page.results);
        setNext(page.next);
        setCachedAt(null);
        if (me) writeJson("local", CACHE_KEY, { userId: me.id, rows: page.results, next: page.next, at: Date.now() } satisfies Cache);
      })
      .catch((e: unknown) => {
        const err = toApiError(e);
        const cache = readJson<Cache>("local", CACHE_KEY);
        if (err.code === "NETWORK" && cache && me && cache.userId === me.id) {
          setRows(cache.rows);
          setNext(cache.next);
          setCachedAt(cache.at);
          return;
        }
        setError({ offline: err.code === "NETWORK", code: err.code === "NETWORK" ? undefined : err.code });
      });
  }, [me]);
  useEffect(load, [load]);

  const more = () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    api.predictions
      .mine(next)
      .then((page) => {
        setRows((r) => [...(r ?? []), ...page.results]);
        setNext(page.next);
      })
      .catch(() => setMoreError(true))
      .finally(() => setLoadingMore(false));
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const groups = rows ? groupPredictions(rows) : [];

  const card = (g: ReturnType<typeof groupPredictions>[number]) => {
    const first = g.rows[0]!;
    const outcome = predictionOutcome(g.rows);
    const [a, b] = first.players;
    const pickName = first.players[outcome.side];
    const matchText = a && b ? t("predict.mine.match", { a: isolate(a), b: isolate(b) }) : t("predict.mine.unknownMatch", { id: g.matchId.slice(0, 8) });
    const status = t(outcomeStatusKey(outcome.kind));
    const amount = amountText(outcome);
    const open = expanded.has(g.matchId);
    const panelId = `stakes-${g.matchId}`;
    return (
      <li key={g.matchId}>
        <CardLink
          component={NextLink}
          href={`/match/${g.matchId}`}
          aria-label={t("predict.mine.cardLabel", { a: isolate(a ?? "?"), b: isolate(b ?? "?"), pick: isolate(pickName ?? "?"), status, amount })}
        >
          <span className="card-main" aria-hidden>
            <span className="card-top">
              <Typography component="span" variant="label" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <bdi>{matchText}</bdi>
              </Typography>
              <Typography component="span" variant="label" sx={{ fontVariantNumeric: "tabular-nums" }}>
                <bdi>{amount}</bdi>
              </Typography>
            </span>
            <span className="card-line">
              {pickName && (
                <Typography component="span" variant="body2">
                  {t("predict.mine.pick", { username: isolate(pickName) })}
                </Typography>
              )}
              <OutcomeChip outcome={outcome} />
            </span>
            <Typography component="span" variant="caption" color="text.secondary">
              {f.dateTime(g.firstAt)} · {t("predict.mine.total", { amount: f.number(outcome.stake) })}
            </Typography>
          </span>
          <ChevronForwardIcon sx={{ flex: "none", color: "text.secondary", fontSize: iconSize.sm }} />
        </CardLink>
        <Box sx={{ px: 1, pb: 0.5 }}>
          <Button
            size="small"
            variant="text"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => toggle(g.matchId)}
            sx={{ minHeight: minTouchTarget }}
          >
            {t("predict.mine.stakes", { count: g.rows.length })}
          </Button>
          {open && (
            <Stack id={panelId} component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, px: 1, pb: 1 }}>
              {g.rows.map((r) => (
                <Typography key={r.id} component="li" variant="body2" color="text.secondary">
                  {t("predict.mine.stakeRow", { time: f.dateTime(r.created_at), amount: f.number(r.amount) })}
                </Typography>
              ))}
            </Stack>
          )}
        </Box>
      </li>
    );
  };

  return (
    <DetailColumns>
      <Stack spacing={2} className="detail-main">
        <Typography color="text.secondary">{t("predict.mine.intro")}</Typography>
        <MuiLink component={NextLink} href="/leaderboard?scope=predict" sx={{ alignSelf: "flex-start", minHeight: minTouchTarget, display: "inline-flex", alignItems: "center" }}>
          {t("predict.mine.accuracyBoard")}
        </MuiLink>
        {cachedAt !== null && (
          <Typography variant="body2" color="text.secondary">
            {t("common.lastUpdated", { time: f.dateTime(new Date(cachedAt)) })}
          </Typography>
        )}
        {error ? (
          <ErrorState kind={error.offline ? "offline" : "error"} message={error.offline ? t("net.offline") : t("predict.mine.loadError")} code={error.code} onRetry={load} />
        ) : rows === null ? (
          <LoadingState variant="list" rows={5} />
        ) : groups.length === 0 ? (
          <EmptyState message={t("predict.mine.empty")} action={{ label: t("predict.mine.emptyAction"), href: "/live" }} />
        ) : (
          <>
            <List>{groups.map(card)}</List>
            {moreError && (
              <Typography role="alert" variant="body2" sx={{ color: "tokens.error" }}>
                {t("predict.mine.loadError")}
              </Typography>
            )}
            {next && (
              <Box>
                <Button variant="outlined" fullWidth loading={loadingMore} onClick={more} disabled={!online} aria-describedby={!online ? "predictions-offline" : undefined}>
                  {moreError ? t("common.retry") : t("common.showMore")}
                </Button>
                {!online && (
                  <Typography id="predictions-offline" variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
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
