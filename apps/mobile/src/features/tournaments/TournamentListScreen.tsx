"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api, finishedOrder, LIST_REFRESH_MS, mineGroups, parseSegment, TOURNAMENT_SEGMENTS, type TournamentSegment } from "@bg/api-client";
import type { TournamentInfo } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { toApiError } from "@/lib/apiErrors";
import { useRequireUser, useSession } from "@/lib/session";
import { readJson, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { gutterStyles } from "@/theme/layout";
import { TournamentCard, TournamentCardSkeleton } from "./TournamentCard";

// TO-01 Tournament list `/tournaments` (tournaments.md §3.1, §4). Segments in `?segment=` (kept for
// the session). Server order; refresh every 30 s while visible and online. "Mine" is one
// `?joined=1` request (the caller's tournaments of any status).

const SEGMENT_KEY = "bg.tournaments.segment";
const hintKey = (userId: number) => `bg.tournaments.hintSeen.${userId}`;

const Grid = styled("ul")(({ theme }) => ({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: theme.spacing(1.5),
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 20rem), 1fr))",
}));

type Lists = Partial<Record<TournamentInfo["status"] | "mine", TournamentInfo[]>>;

const STATUSES: Record<TournamentSegment, (TournamentInfo["status"] | "mine")[]> = {
  upcoming: ["scheduled"],
  running: ["running"],
  finished: ["finished", "cancelled"],
  mine: ["mine"],
};

export function TournamentListScreen() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnline();
  const { me } = useRequireUser();
  const { handleAuthError } = useSession();
  const segment = parseSegment(params.get("segment"));
  const [lists, setLists] = useState<Lists>({});
  const [at, setAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hintSeen, setHintSeen] = useState(true);

  useEffect(() => {
    if (!params.get("segment")) {
      const saved = readJson<TournamentSegment>("session", SEGMENT_KEY);
      if (saved && saved !== "upcoming") router.replace(`${pathname}?segment=${saved}`);
    }
    // Once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => writeJson("session", SEGMENT_KEY, segment), [segment]);
  useEffect(() => {
    if (me) setHintSeen(Boolean(readJson<boolean>("local", hintKey(me.id))));
  }, [me]);

  const load = useCallback(async () => {
    try {
      const statuses = STATUSES[segment];
      const pages = await Promise.all(statuses.map((s) => (s === "mine" ? api.tournaments.mine() : api.tournaments.list(s))));
      setLists((prev) => {
        const next = { ...prev };
        statuses.forEach((s, i) => {
          next[s] = pages[i]!.results;
        });
        return next;
      });
      setAt(Date.now());
      setNow(Date.now());
      setError(null);
    } catch (e) {
      if (!handleAuthError(e)) setError(toApiError(e).code);
    }
  }, [segment, handleAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, LIST_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [online, load]);

  const ready = STATUSES[segment].every((s) => lists[s] !== undefined);

  const grid = (list: TournamentInfo[]) => (
    <Grid>
      {list.map((tour) => (
        <li key={tour.id}>
          <TournamentCard tour={tour} now={now} />
        </li>
      ))}
    </Grid>
  );

  let body: React.ReactNode;
  if (!ready && error) {
    body = <ErrorState kind={online ? "error" : "offline"} message={online ? t("tournaments.loadError") : t("net.offline")} code={error !== "NETWORK" ? error : undefined} onRetry={() => void load()} />;
  } else if (!ready) {
    body = (
      <div aria-busy="true">
        <Stack spacing={1.5} aria-hidden>
          {[0, 1, 2].map((i) => (
            <TournamentCardSkeleton key={i} />
          ))}
        </Stack>
      </div>
    );
  } else if (segment === "mine") {
    const groups = mineGroups(lists.mine ?? []);
    const sections = [
      { key: "comingUp", list: groups.comingUp },
      { key: "playing", list: groups.playing },
      { key: "past", list: groups.past },
    ].filter((s) => s.list.length > 0);
    body = sections.length ? (
      <Stack spacing={3}>
        {sections.map((s) => (
          <section key={s.key} aria-labelledby={`mine-${s.key}`}>
            <Typography id={`mine-${s.key}`} variant="h5" component="h2" sx={{ mb: 1.5 }}>
              {t(`tournaments.mine.${s.key}`)}
            </Typography>
            {grid(s.list)}
          </section>
        ))}
      </Stack>
    ) : (
      <EmptyState message={t("tournaments.empty.mine")} action={{ label: t("tournaments.empty.mineAction"), href: "/tournaments?segment=upcoming" }} />
    );
  } else {
    const list = segment === "finished" ? finishedOrder([...(lists.finished ?? []), ...(lists.cancelled ?? [])]) : (lists[STATUSES[segment][0]!] ?? []);
    body = list.length ? grid(list) : <EmptyState message={t(`tournaments.empty.${segment}`)} />;
  }

  return (
    <SignedInShell topBar={{ title: t("tournaments.title"), leading: "brand" }}>
      <Box sx={{ ...gutterStyles, pt: 1 }}>
        <Tabs
          value={segment}
          onChange={(_, v: TournamentSegment) => router.replace(v === "upcoming" ? pathname : `${pathname}?segment=${v}`, { scroll: false })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label={t("tournaments.segments")}
        >
          {TOURNAMENT_SEGMENTS.map((s) => (
            <Tab key={s} value={s} label={t(`tournaments.segment.${s}`)} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>
      <Stack spacing={2} sx={{ ...gutterStyles, py: 2, pb: 4 }}>
        {!hintSeen && (
          <Banner
            severity="info"
            onClose={() => {
              if (me) writeJson("local", hintKey(me.id), true);
              setHintSeen(true);
            }}
          >
            {t("tournaments.hint.firstVisit")}
          </Banner>
        )}
        {body}
        {(!online || error) && ready && at !== null && (
          <Typography variant="caption" color="text.secondary">
            {t("common.lastUpdated", { time: f.relative(new Date(at)) })}
          </Typography>
        )}
      </Stack>
    </SignedInShell>
  );
}
