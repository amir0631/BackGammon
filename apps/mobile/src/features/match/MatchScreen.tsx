"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@bg/api-client";
import { avatarSize, iconSize } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { ApiError, MatchFoundOut, MatchSummary, MyMatchSummary } from "@bg/protocol";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { InfoIcon } from "@/components/icons";
import { BotIcon, ShieldIcon } from "@/components/icons/game";
import { ValueRows, type ValueRow } from "@/components/money/ValueRows";
import { Avatar } from "@/components/profile/Avatar";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError } from "@/lib/apiErrors";
import { readFreshMatch } from "@/lib/match/fresh";
import { useRequireUser, useSession } from "@/lib/session";
import { useGameSocket } from "@/lib/socket";
import { useFormat } from "@/lib/useFormat";
import { supportsWebGL2 } from "@/lib/webgl";
import { gutterStyles } from "@/theme/layout";
import { useGameLabels } from "../play/labels";
import { LiveMatch } from "./LiveMatch";

// `/match/[id]` (match.md §3.1): `GET matches/{id}` picks the view: the live game for a player of
// an active match (MA-01 → MA-02), MA-17 without WebGL2, MA-14 for a finished, aborted, or voided
// match, the not-found variant, and a summary for non-players (the spectator view comes with
// live.md). A match this tab just created or joined opens at once.

type Summary = MatchSummary & Partial<MyMatchSummary>;

export function MatchScreen({ matchId, openCancel, forceSummary }: { matchId: string; openCancel: boolean; forceSummary: boolean }) {
  const { me } = useRequireUser();
  const { handleAuthError } = useSession();
  const socket = useGameSocket();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fresh, setFresh] = useState<{ found: MatchFoundOut | null } | null | undefined>(undefined);
  const [webgl, setWebgl] = useState(true);
  const attached = socket.match?.matchId === matchId;

  useEffect(() => {
    setFresh(readFreshMatch(matchId));
    setWebgl(supportsWebGL2());
  }, [matchId]);

  const load = () => {
    setError(null);
    api.matches
      .get(matchId)
      .then(setSummary)
      .catch((e: unknown) => {
        if (!handleAuthError(e)) setError(toApiError(e));
      });
  };
  useEffect(load, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fresh === undefined || !me) return null;

  const live = !forceSummary && webgl && (attached || Boolean(fresh) || (summary !== null && summary.you !== null && summary.status === "active"));
  if (live) {
    return <LiveMatch key={matchId} matchId={matchId} fresh={Boolean(fresh) && !attached} openCancel={openCancel} header={<LoaderHeader summary={summary} found={fresh?.found ?? null} />} />;
  }
  if (error) {
    return error.code === "NOT_FOUND" || error.code === "MATCH_NOT_FOUND" ? <NotFound /> : <Frame><ErrorState message={undefined} code={error.code} onRetry={load} /></Frame>;
  }
  if (!summary) {
    return (
      <Frame>
        <LoadingState variant="cards" rows={2} />
      </Frame>
    );
  }
  if (summary.status === "active" && summary.you !== null && !webgl) return <Unsupported matchId={matchId} inMatch />;
  return <FinishedSummary summary={summary} />;
}

function LoaderHeader({ summary, found }: { summary: Summary | null; found: MatchFoundOut | null }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const opp = found?.opponent ?? (summary && summary.you !== null ? summary.players[1 - summary.you] : null);
  const variant = found?.variant ?? summary?.variant;
  const length = found?.length ?? summary?.length;
  if (!opp || !variant || !length) return null;
  return (
    <>
      <Avatar avatarKey={opp.avatar} size={avatarSize.md} />
      <Typography variant="body1">
        {opp.is_bot
          ? t("match.summary.practiceVsBot", { level: labels.botLevel(opp.bot_level) })
          : t("match.loading.summary", { username: isolate(opp.username ?? ""), variant: labels.variant(variant), n: f.number(length) })}
      </Typography>
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  return (
    <SignedInShell topBar={{ title: t("match.summary.title"), leading: "back", href: "/play" }}>
      <Box sx={{ ...gutterStyles, py: 3, maxWidth: 720, width: "100%", mx: "auto" }}>{children}</Box>
    </SignedInShell>
  );
}

function NotFound() {
  const t = useTranslations();
  return (
    <Frame>
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h3" component="h2">
          {t("match.notFound.title")}
        </Typography>
        <Typography>{t("match.notFound.body")}</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Button variant="contained" component={NextLink} href="/me/matches">
            {t("match.notFound.history")}
          </Button>
          <Button variant="text" component={NextLink} href="/play">
            {t("match.result.backToLobby")}
          </Button>
        </Stack>
      </Stack>
    </Frame>
  );
}

/** MA-14 finished-match summary (match.md §4). */
function FinishedSummary({ summary }: { summary: Summary }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const you = summary.you;
  const player = you !== null;
  const opp = summary.players[you === null ? 1 : 1 - you];
  const oppName = opp ? (opp.is_bot ? labels.botName(opp.bot_level) : isolate(opp.username ?? "")) : "";
  const aborted = summary.status === "aborted";
  const voided = summary.status === "voided";
  const active = summary.status === "active";
  const won = player && summary.winner === you;
  const headline = aborted ? t("match.result.cancelled") : voided ? t("match.summary.voided") : active ? t("match.summary.title") : player ? (won ? t("match.summary.won") : t("match.summary.lost")) : t("match.summary.title");
  const reason = summary.end_reason ?? "";
  const reasonText = aborted
    ? t("match.summary.cancelledBody")
    : reason === "resign"
      ? won
        ? t("match.result.reason.resignTheirs", { username: oppName })
        : t("match.result.reason.resignYours")
      : reason.endsWith("disconnect")
        ? won
          ? t("match.result.reason.disconnectTheirs", { username: oppName })
          : t("match.result.reason.disconnectYours")
        : reason.endsWith("timeouts")
          ? won
            ? t("match.summary.reason.timeoutsTheirs", { username: oppName })
            : t("match.summary.reason.timeoutsYours")
          : reason === "points"
            ? t("match.result.reason.points")
            : null;
  const self = you ?? 0;
  const rows: ValueRow[] = [];
  if (typeof summary.elo_delta === "number")
    rows.push({ label: t("match.summary.ratingLabel"), value: summary.elo_delta >= 0 ? t("match.result.eloUp", { delta: f.number(summary.elo_delta) }) : t("match.result.eloDown", { delta: f.number(-summary.elo_delta) }) });
  if (typeof summary.xp === "number") rows.push({ label: t("match.summary.xpLabel"), value: t("match.result.xp", { xp: f.number(summary.xp) }) });
  if (typeof summary.coins === "number")
    rows.push({ label: t("match.result.net"), value: summary.coins >= 0 ? t("match.result.signWon", { amount: f.number(summary.coins) }) : t("match.result.signLost", { amount: f.number(-summary.coins) }), emphasis: true });

  return (
    <Frame>
      <Stack spacing={2}>
        <Typography variant="h3" component="h2">
          {headline}
        </Typography>
        {!player && active && <InfoLine>{t("match.notPlayer.body")}</InfoLine>}
        {reasonText && <Typography>{reasonText}</Typography>}
        {!aborted && (
          <Typography variant="h4" component="p">
            {t("match.result.finalScore", { self: f.number(summary.score[self] ?? 0), opp: f.number(summary.score[1 - self] ?? 0) })}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {labels.variant(summary.variant)}
          {t("common.listSep")}
          {labels.length(summary.length)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          {summary.is_bot ? <BotIcon sx={{ fontSize: iconSize.sm }} /> : null}
          {summary.is_bot ? t("match.summary.practiceVsBot", { level: labels.botLevel(opp?.bot_level) }) : summary.entry > 0 ? t("match.summary.entry", { entry: f.number(summary.entry) }) : null}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {f.dateTime(summary.ended_at ?? summary.created_at)}
        </Typography>
        {rows.length > 0 && <ValueRows rows={rows} />}
        {player && !aborted && !active && (
          <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
            <Button variant="contained" component={NextLink} href={`/replay/${summary.id}`} startIcon={<ShieldIcon />}>
              {t("match.summary.watchReplay")}
            </Button>
            {!summary.is_bot && <InfoLine icon={InfoIcon}>{t("match.result.privacy", { username: oppName })}</InfoLine>}
          </Stack>
        )}
      </Stack>
    </Frame>
  );
}

/** MA-17 device not supported (match.md §4): no WebGL2, so nothing 3D is downloaded. */
export function Unsupported({ matchId, inMatch }: { matchId: string; inMatch: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const socket = useGameSocket();
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(
    () =>
      socket.subscribe((env) => {
        if (env.type === "match.ended" && env.match_id === matchId) {
          socket.detach();
          router.push("/play");
        }
      }),
    [socket, matchId, router],
  );

  return (
    <Frame>
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h3" component="h2">
          {t("match.unsupported.title")}
        </Typography>
        <Typography>{t("match.unsupported.body")}</Typography>
        {inMatch && <InfoLine tone="primary">{t("match.unsupported.inMatch")}</InfoLine>}
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {inMatch && (
            <Button variant="outlined" color="error" onClick={() => setConfirm(true)}>
              {t("match.resign.ctaMatch")}
            </Button>
          )}
          <Button variant="text" component={NextLink} href="/play">
            {t("match.result.backToLobby")}
          </Button>
        </Stack>
      </Stack>
      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setSending(true);
          void socket.attach(matchId).then(() => socket.send("match.resign", { scope: "match" }));
        }}
        title={t("match.resign.match")}
        confirmLabel={t("match.resign.ctaMatch")}
        inFlight={sending}
      >
        {t("match.resign.matchRated")}
      </ConfirmDialog>
    </Frame>
  );
}
