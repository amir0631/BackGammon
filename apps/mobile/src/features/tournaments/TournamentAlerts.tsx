"use client";

import Box from "@mui/material/Box";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, prestartTournament } from "@bg/api-client";
import type { TournamentInfo } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { useSession } from "@/lib/session";
import { useGameSocket } from "@/lib/socket";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { gutterStyles } from "@/theme/layout";
import { useTournamentName } from "./labels";

// TO-06 pre-start banner (tournaments.md §3.5). TO-08 lives in TournamentReadyHost (app level).
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
