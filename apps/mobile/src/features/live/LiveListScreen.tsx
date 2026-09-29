"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  hasLiveFilters,
  LIVE_REFRESH_MS,
  liveFilterQuery,
  liveRequest,
  mergeLiveRefresh,
  parseLiveFilter,
  type LiveFilter,
} from "@bg/api-client";
import { iconSize, layout, radii } from "@bg/design-tokens";
import type { ApiError, LiveMatchRow, TournamentInfo } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { useToast } from "@/components/feedback/Toast";
import { CloseIcon, RefreshIcon, SettingsIcon } from "@/components/icons";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Illustration } from "@/components/states/Illustration";
import { toApiError } from "@/lib/apiErrors";
import { usePublicConfig } from "@/lib/config";
import { useRequireUser, useSession } from "@/lib/session";
import { readJson, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { gutterStyles } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import { useTournamentName } from "../tournaments/labels";
import { LiveCardSkeleton, LiveMatchCard, LivePreview, type RowFacts } from "./LiveCards";
import { FiltersForm, FiltersSheet } from "./LiveFilters";

// LV-01 Live list `/live` (live.md §3.1, §4). Server order (tournament matches first). A timed
// refresh every 15 s updates values in place; order changes, new rows, and ended rows wait for
// "New list available · Show" (never under the finger). Filters live in the URL and are kept for
// the session. md: list plus a preview panel; lg: filters panel, list, preview panel.

const FILTERS_KEY = "bg.live.filters";
const CACHE_KEY = "bg.live.cache";
const hintKey = (userId: number) => `bg.live.hintSeen.${userId}`;

/**
 * The preview panel needs the list to keep ≥ 20rem beside it (the side rail takes 104 px at md),
 * so it starts at 840 px; the filters panel joins it where the 1280 shell has room for three.
 */
const PREVIEW_MIN = 840;
const FILTER_PANEL_MIN = layout.shellMaxWidth;

const Layout = styled("div")(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(3),
  gridTemplateColumns: "minmax(0, 1fr)",
  paddingBlock: theme.spacing(2, 4),
  [`@media (min-width: ${PREVIEW_MIN}px)`]: {
    gridTemplateColumns: `minmax(0, 1fr) minmax(16rem, ${layout.sidePanelWidth}px)`,
    alignItems: "start",
  },
  [`@media (min-width: ${FILTER_PANEL_MIN}px)`]: {
    gridTemplateColumns: `minmax(15rem, 17.5rem) minmax(0, 1fr) minmax(16rem, ${layout.sidePanelWidth}px)`,
  },
}));

const Panel = styled("section")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "sticky",
    insetBlockStart: theme.spacing(9),
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    containerType: "inline-size",
  };
});

const List = styled("ul")(({ theme }) => ({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: theme.spacing(1.5),
}));

interface Cache {
  query: string;
  rows: LiveMatchRow[];
  at: number;
}

export function LiveListScreen() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const nameOf = useTournamentName();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const online = useOnline();
  const config = usePublicConfig();
  const { me } = useRequireUser();
  const { handleAuthError } = useSession();
  const md = useMediaQuery(`(min-width: ${PREVIEW_MIN}px)`);
  const lg = useMediaQuery(`(min-width: ${FILTER_PANEL_MIN}px)`);

  const query = params.toString();
  const filter = useMemo(() => parseLiveFilter(new URLSearchParams(query)), [query]);
  const filterQuery = liveFilterQuery(filter);

  const [rows, setRows] = useState<LiveMatchRow[] | null>(null);
  const [rowsAt, setRowsAt] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [ended, setEnded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<LiveMatchRow[] | null>(null);
  const [running, setRunning] = useState<TournamentInfo[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hintSeen, setHintSeen] = useState(true);
  const [resetNote, setResetNote] = useState(false);
  const rowsRef = useRef<LiveMatchRow[] | null>(null);
  rowsRef.current = rows;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const spectating = config?.spectating_enabled ?? true;
  const predictions = config?.predictions_enabled ?? false;

  // Session memory of the last filters (live.md §2): /live without a query restores them.
  useEffect(() => {
    if (!query) {
      const saved = readJson<string>("session", FILTERS_KEY);
      if (saved) router.replace(`${pathname}${saved}`);
    }
    // Once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => writeJson("session", FILTERS_KEY, filterQuery), [filterQuery]);

  useEffect(() => {
    if (me) setHintSeen(Boolean(readJson<boolean>("local", hintKey(me.id))));
  }, [me]);

  useEffect(() => {
    api.tournaments
      .list("running")
      .then((page) => setRunning(page.results))
      .catch(() => setRunning([]));
  }, []);

  const load = useCallback(
    async (mode: "replace" | "merge") => {
      if (!spectating) return;
      try {
        const page = await api.matches.live(liveRequest(filter));
        setError(null);
        setRowsAt(Date.now());
        const current = rowsRef.current;
        if (mode === "replace" || current === null) {
          setRows(page.results);
          setEnded(new Set());
          setPending(null);
          writeJson("session", CACHE_KEY, { query: filterQuery, rows: page.results, at: Date.now() } satisfies Cache);
        } else {
          const merged = mergeLiveRefresh(current, page.results);
          setRows(merged.rows);
          setEnded(new Set(merged.ended));
          setPending(merged.pending ? page.results : null);
        }
      } catch (e) {
        if (handleAuthError(e)) return;
        const err = toApiError(e);
        if (err.code === "VALIDATION" && hasLiveFilters(filter)) {
          // A bad filter (e.g. a table that no longer exists): drop it and say so (live.md §3.8).
          setResetNote(true);
          router.replace(pathname);
          return;
        }
        setError(err);
      }
    },
    [spectating, filter, filterQuery, handleAuthError, router, pathname],
  );

  // First load per filter; the cached list shows at once (offline: with "Last updated").
  useEffect(() => {
    const cached = readJson<Cache>("session", CACHE_KEY);
    if (cached && cached.query === filterQuery) {
      setRows(cached.rows);
      setRowsAt(cached.at);
    } else {
      setRows(null);
    }
    setEnded(new Set());
    setPending(null);
    void load("replace");
    // Per filter only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterQuery, spectating]);

  // Timed refresh: every 15 s while visible and online (paused otherwise).
  useEffect(() => {
    if (!online || !spectating) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load("merge");
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [online, spectating, load]);

  // Back online: refresh once.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) void load("merge");
    wasOnline.current = online;
  }, [online, load]);

  const applyPending = () => {
    if (pending) {
      setRows(pending);
      setEnded(new Set());
      setPending(null);
      writeJson("session", CACHE_KEY, { query: filterQuery, rows: pending, at: Date.now() } satisfies Cache);
    } else {
      void load("replace");
    }
    headingRef.current?.focus();
  };

  const applyFilter = (next: LiveFilter) => {
    setSheet(false);
    setResetNote(false);
    router.replace(`${pathname}${liveFilterQuery(next)}`);
  };

  const factsFor = useCallback(
    (row: LiveMatchRow): RowFacts => {
      // Rows carry the pool flag and the tournament (older payloads: fall back to the running list).
      const tour = row.tournament ?? (row.tournament_id !== null ? running?.find((x) => x.id === row.tournament_id) : undefined);
      const mine = me?.username?.toLowerCase();
      return {
        poolOpen: predictions && Boolean(row.pool_open) && !ended.has(row.match_id),
        yourMatch: Boolean(mine && row.players.some((p) => p.username.toLowerCase() === mine)),
        ended: ended.has(row.match_id),
        tournament: tour ? { name: nameOf(tour) } : null,
      };
    },
    [running, me, predictions, ended, nameOf],
  );

  const open = (id: string) => {
    if (!online) {
      toast.show({ message: t("live.offlineWatch") });
      return;
    }
    router.push(`/match/${id}`);
  };

  const dismissHint = () => {
    if (me) writeJson("local", hintKey(me.id), true);
    setHintSeen(true);
  };

  // ---- Filter summary (LV-01 item 1) ----
  const chips: { key: keyof LiveFilter; label: string }[] = [];
  if (filter.tier !== null) chips.push({ key: "tier", label: t("live.filters.tierValue", { entry: f.number(filter.tier) }) });
  if (filter.variant) chips.push({ key: "variant", label: labels.variant(filter.variant) });
  if (filter.tournament !== null) {
    const tour = running?.find((x) => x.id === filter.tournament);
    chips.push({ key: "tournament", label: t("live.filters.tournamentChip", { name: tour ? nameOf(tour).text : f.number(filter.tournament) }) });
  }
  const filterBar = (
    <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      {chips.map((c) => (
        <Button
          key={c.key}
          size="small"
          variant="outlined"
          endIcon={<CloseIcon />}
          onClick={() => applyFilter({ ...filter, [c.key]: null })}
          aria-label={t("live.filters.remove", { name: c.label })}
          sx={{ borderRadius: `${radii.pill}px`, minHeight: 44 }}
        >
          {c.label}
        </Button>
      ))}
      <Typography variant="body2" color="text.secondary" sx={{ flex: "1 1 auto" }}>
        {t(`live.filters.sort.${filter.sort}`)}
      </Typography>
      <IconButton onClick={() => (online ? void load("replace") : undefined)} aria-label={t("live.refresh")} disabled={!online}>
        <RefreshIcon />
      </IconButton>
      {!lg && (
        <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => setSheet(true)} sx={{ minHeight: 44 }}>
          {t("live.filters.button")}
        </Button>
      )}
    </Stack>
  );

  const filtersProps = {
    value: filter,
    tiers: config?.tiers ?? [],
    tournaments: running,
    poolSort: predictions,
    onApply: applyFilter,
    disabledReason: online ? null : t("net.offlineAction"),
  };

  const selectedRow = md ? (rows?.find((r) => r.match_id === selected) ?? null) : null;

  let body: React.ReactNode;
  if (!spectating) {
    body = (
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 4 }}>
        <Illustration kind="empty" />
        <Typography variant="h4" component="p">
          {t("spectate.disabled.title")}
        </Typography>
        <Typography color="text.secondary">{t("spectate.disabled.body")}</Typography>
      </Stack>
    );
  } else if (error && rows === null) {
    body = <ErrorState kind={online ? "error" : "offline"} message={online ? t("live.loadError") : t("net.offline")} code={error.code !== "NETWORK" ? error.code : undefined} onRetry={() => void load("replace")} />;
  } else if (rows === null) {
    body = (
      <div aria-busy="true">
        <Stack spacing={1.5} aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <LiveCardSkeleton key={i} />
          ))}
        </Stack>
      </div>
    );
  } else if (rows.length === 0) {
    body = hasLiveFilters(filter) ? (
      <EmptyState message={t("live.emptyFiltered")} action={{ label: t("live.filters.clear"), onClick: () => applyFilter({ ...filter, tier: null, variant: null, tournament: null }) }} />
    ) : (
      <EmptyState message={t("live.empty")} action={{ label: t("live.emptyAction"), href: "/play" }} />
    );
  } else {
    body = (
      <>
        <List>
          {rows.map((row) => (
            <li key={row.match_id}>
              <LiveMatchCard
                row={row}
                facts={factsFor(row)}
                href={`/match/${row.match_id}`}
                selected={md && selected === row.match_id}
                onOpen={md ? () => setSelected(row.match_id) : online ? undefined : () => open(row.match_id)}
              />
            </li>
          ))}
        </List>
        {(!online || error) && rowsAt !== null && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            {t("common.lastUpdated", { time: f.relative(new Date(rowsAt)) })}
          </Typography>
        )}
      </>
    );
  }

  return (
    <SignedInShell topBar={{ title: t("live.title"), leading: "brand" }}>
      <Box sx={gutterStyles}>
        <Layout>
          {lg && spectating && (
            <Panel aria-labelledby="live-filters">
              <Typography id="live-filters" variant="h5" component="h2" sx={{ mb: 2 }}>
                {t("live.filters.title")}
              </Typography>
              <FiltersForm {...filtersProps} />
            </Panel>
          )}
          <Stack spacing={2} sx={{ minWidth: 0 }} component="section" aria-labelledby="live-heading">
            <Typography id="live-heading" ref={headingRef} tabIndex={-1} variant="h4" component="h2" sx={{ "&:focus": { outline: "none" } }}>
              {t("live.title")}
            </Typography>
            {spectating && filterBar}
            {resetNote && (
              <Banner severity="info" onClose={() => setResetNote(false)}>
                {t("live.filters.reset")}
              </Banner>
            )}
            {spectating && !hintSeen && (
              <Banner severity="info" onClose={dismissHint}>
                {t("live.hint.firstVisit")}
              </Banner>
            )}
            {pending && (
              <Box sx={{ position: "sticky", insetBlockStart: 72, zIndex: 2, display: "flex", justifyContent: "center" }}>
                <Button variant="contained" onClick={applyPending} startIcon={<RefreshIcon sx={{ fontSize: iconSize.sm }} />} sx={{ borderRadius: `${radii.pill}px` }}>
                  {t("live.newList")}
                </Button>
              </Box>
            )}
            {body}
          </Stack>
          {md && spectating && (
            <Panel aria-labelledby="live-preview">
              <Typography id="live-preview" variant="h5" component="h2" sx={{ mb: 2 }}>
                {t("live.preview.title")}
              </Typography>
              <LivePreview row={selectedRow} facts={selectedRow ? factsFor(selectedRow) : null} onWatch={open} />
            </Panel>
          )}
        </Layout>
      </Box>
      {!lg && <FiltersSheet open={sheet} onClose={() => setSheet(false)} {...filtersProps} />}
    </SignedInShell>
  );
}
