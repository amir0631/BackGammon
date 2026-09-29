"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { api, prestartTournament } from "@bg/api-client";
import { avatarSize, layout } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { MatchFoundOut, TournamentInfo } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { Avatar } from "@/components/profile/Avatar";
import { useActiveMatch } from "@/lib/activeMatch";
import { useSession } from "@/lib/session";
import { useGameSocket } from "@/lib/socket";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { gutterStyles } from "@/theme/layout";
import { useTournamentName } from "./labels";

// TO-06 pre-start banner and TO-08 "Your tournament match is ready" (tournaments.md §3.5, §3.6).
// The registered, scheduled tournaments are read once per 5 minutes while signed in (and after a
// join or leave); within 15 minutes of a start the banner shows on every non-immersive screen and
// the game socket connects, so the bracket match's `match.found` reaches this tab.

const REFRESH_MS = 5 * 60_000;

let mine: TournamentInfo[] = [];
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/** Re-reads the viewer's scheduled tournaments (after a join or leave). */
export function refreshMyTournaments(): Promise<void> {
  loading ??= api.tournaments
    .list("scheduled")
    .then((page) => {
      mine = page.results.filter((t) => t.joined);
      loadedAt = Date.now();
      emit();
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

function useMyScheduled(enabled: boolean): TournamentInfo[] {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => mine,
    () => mine,
  );
  useEffect(() => {
    if (!enabled) return;
    if (Date.now() - loadedAt > REFRESH_MS) void refreshMyTournaments();
    const id = window.setInterval(() => void refreshMyTournaments(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
  return list;
}

/** Hidden during money task flows and payments (tournaments.md §3.5 step 4). */
const QUIET = [/^\/wallet\/(transfer|withdraw)/, /^\/shop\/coins/];

export function TournamentPrestartBanner() {
  const t = useTranslations("tournaments");
  const f = useFormat();
  const nameOf = useTournamentName();
  const pathname = usePathname() ?? "";
  const { status } = useSession();
  const socket = useGameSocket();
  const list = useMyScheduled(status === "user");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const soon = prestartTournament(list, now);
  const startsAt = soon ? Date.parse(soon.starts_at) : null;
  const left = useCountdown(startsAt);

  useEffect(() => {
    if (soon) socket.connect();
  }, [soon, socket]);

  if (!soon || QUIET.some((re) => re.test(pathname))) return null;
  const name = nameOf(soon).text;
  return (
    <Box sx={{ ...gutterStyles, pt: 1.5 }}>
      <Banner severity="info" action={{ label: t("prestart.details"), href: `/tournaments/${soon.id}` }}>
        {left > 0 ? <CountdownText seconds={left} clock={f.clock} render={(time) => t("prestart.banner", { name, time })} /> : t("prestart.starting", { name })}
      </Banner>
    </Box>
  );
}

/** TO-08: a blocking dialog when a bracket match is created for this player. */
export function TournamentReadyDialog() {
  const t = useTranslations("tournaments");
  const f = useFormat();
  const router = useRouter();
  const socket = useGameSocket();
  const { refresh: refreshActive } = useActiveMatch();
  const [found, setFound] = useState<MatchFoundOut | null>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(
    () =>
      socket.subscribe((env) => {
        if (env.type === "match.found" && env.payload.tournament) {
          setFound(env.payload);
          void refreshActive();
        }
      }),
    [socket, refreshActive],
  );

  const left = useCountdown(found?.join_deadline ?? null);
  if (!found || !found.tournament) return null;
  const tour = found.tournament;
  const name = tour.name[f.locale] || tour.name.fa || tour.name.en || "";
  const opp = found.opponent;
  const warn = left > 0 && left <= 30;

  return (
    <Dialog
      open
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      disableEscapeKeyDown
      onClose={() => undefined}
      slotProps={{ paper: { sx: { maxWidth: layout.dialogMaxWidth, width: "100%", m: 2 } }, transition: { onEntered: () => goRef.current?.focus() } }}
    >
      <Stack spacing={2} sx={{ p: 3 }}>
        <Typography id={titleId} variant="h4" component="h2">
          {t("ready.title")}
        </Typography>
        <div id={bodyId}>
          <Typography variant="body2" color="text.secondary">
            {t("ready.round", { name, round: f.number(tour.round), rounds: f.number(tour.rounds) })}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", my: 1.5 }}>
            <Avatar avatarKey={opp.avatar} size={avatarSize.sm} />
            <Typography variant="body1">{t("ready.opponent", { username: isolate(opp.username), level: f.number(opp.level), elo: f.number(opp.elo) })}</Typography>
          </Stack>
          <Typography variant="body1" sx={{ color: warn ? "tokens.warning" : undefined, fontWeight: warn ? 600 : undefined }} role="status">
            {left > 0 ? <CountdownText seconds={left} clock={f.clock} render={(time) => t("ready.countdown", { time })} /> : t("ready.noCountdown")}
          </Typography>
        </div>
        <Button
          ref={goRef}
          variant="contained"
          size="large"
          onClick={() => {
            const id = found.match_id;
            setFound(null);
            router.push(`/match/${id}`);
          }}
        >
          {t("ready.go")}
        </Button>
        <Button variant="text" onClick={() => setFound(null)}>
          {t("ready.notNow")}
        </Button>
      </Stack>
    </Dialog>
  );
}
