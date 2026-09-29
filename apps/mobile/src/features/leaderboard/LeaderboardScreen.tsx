"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, gainDirection, LEADERBOARD_CACHE_MS, LEADERBOARD_SCOPES, myRank, parseScope, type LeaderboardScope } from "@bg/api-client";
import { avatarSize, iconSize, layout, radii } from "@bg/design-tokens";
import { formatPercent, isolate } from "@bg/i18n";
import type { Leaderboard, LeaderboardRow } from "@bg/protocol";
import { InfoIcon } from "@/components/icons";
import { Avatar } from "@/components/profile/Avatar";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError } from "@/lib/apiErrors";
import { usePublicConfig } from "@/lib/config";
import { useRequireUser, useSession } from "@/lib/session";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { bottomInset, gutterStyles, visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// PL-09 Leaderboard `/leaderboard?scope=` with the LB-01 my-rank row (leaderboard.md §3, §4). Each
// scope's board is reused for 60 s; returning after that reloads it. The scope, its period, and
// what the number means are always said in words. Rows are links to the public profile; a row
// without a username is not. The sticky my-rank row follows the list in the DOM (read last).

const cache = new Map<LeaderboardScope, { board: Leaderboard; at: number }>();

const Row = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: theme.spacing(1.5),
    minHeight: 64,
    padding: theme.spacing(1, 1.5),
    borderRadius: radii.md,
    textAlign: "start",
    flexWrap: "wrap",
    "&[data-me='true']": { outline: `2px solid ${t.primary}`, outlineOffset: -2, backgroundColor: t.primaryContainer, color: t.onPrimaryContainer },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "& .lb-rank": { flex: "none", minWidth: "2.75rem", display: "flex", justifyContent: "center", fontVariantNumeric: "tabular-nums" },
    "& .lb-id": { flex: "1 1 8rem", minWidth: 0 },
    "& .lb-value": { flex: "none", marginInlineStart: "auto", textAlign: "end", fontVariantNumeric: "tabular-nums" },
  };
}) as typeof ButtonBase;

/** Top-3 badge: a shaped disc with the number always visible (not color alone). */
function Medal({ rank, text }: { rank: number; text: string }) {
  if (rank > 3) {
    return (
      <Typography variant="label" component="span">
        {text}
      </Typography>
    );
  }
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        clipPath: rank === 1 ? "polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" : undefined,
        borderRadius: rank === 2 ? "50%" : rank === 3 ? "6px" : 0,
        bgcolor: rank === 1 ? "tokens.coin" : "tokens.secondaryContainer",
        color: rank === 1 ? "tokens.background" : "tokens.onSecondaryContainer",
        border: rank === 1 ? 0 : 2,
        borderColor: "tokens.outline",
        typography: "label",
        fontWeight: 700,
        paddingBlockStart: rank === 1 ? "4px" : 0,
      }}
    >
      {text}
    </Box>
  );
}

export function LeaderboardScreen() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnline();
  const config = usePublicConfig();
  const { me } = useRequireUser();
  const { handleAuthError } = useSession();
  const raw = params.get("scope");
  const scope = parseScope(raw);
  const [board, setBoard] = useState<Leaderboard | null>(() => cache.get(scope)?.board ?? null);
  const [at, setAt] = useState<number | null>(() => cache.get(scope)?.at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // Unknown or missing scope → `all`, replacing the URL (§3 step 1).
  useEffect(() => {
    if (raw !== null && raw !== scope) router.replace(pathname, { scroll: false });
  }, [raw, scope, router, pathname]);

  const load = useCallback(
    async (force = false) => {
      const hit = cache.get(scope);
      if (hit && !force && Date.now() - hit.at < LEADERBOARD_CACHE_MS) {
        setBoard(hit.board);
        setAt(hit.at);
        return;
      }
      try {
        const next = await api.leaderboard(scope);
        cache.set(scope, { board: next, at: Date.now() });
        setBoard(next);
        setAt(Date.now());
        setError(null);
        setAnnounce(t("leaderboard.announce", { scope: t(`leaderboard.scope.${scope}`), count: next.results.length }));
      } catch (e) {
        if (!handleAuthError(e)) setError(toApiError(e).code);
      }
    },
    [scope, handleAuthError, t],
  );

  useEffect(() => {
    setBoard(cache.get(scope)?.board ?? null);
    setAt(cache.get(scope)?.at ?? null);
    setError(null);
    void load();
  }, [scope, load]);

  // Returning to the screen after 60 s reloads (§3 step 6); no timed polling.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const setScope = (next: LeaderboardScope) => router.replace(next === "all" ? pathname : `${pathname}?scope=${next}`, { scroll: false });

  const min = config?.predict_min_count_for_board ?? null;
  const explain =
    scope === "predict" ? (min ? t("leaderboard.explain.predict", { min: f.number(min) }) : t("leaderboard.explain.predictNoMin")) : t(`leaderboard.explain.${scope}`);
  const period = board?.scope === scope && board.period ? t("leaderboard.explain.period", { start: f.date(board.period.start), end: f.date(board.period.end) }) : null;

  const valueText = (row: { value: number; count?: number }): { text: string; sub?: string } => {
    if (scope === "all") return { text: f.number(row.value) };
    if (scope === "predict") return { text: formatPercent(f.locale, row.value / 100), sub: row.count !== undefined ? t("leaderboard.row.predictions", { count: row.count }) : undefined };
    const dir = gainDirection(row.value);
    return { text: dir === "gained" ? `+${f.number(row.value)}` : dir === "lost" ? `−${f.number(-row.value)}` : f.number(0) };
  };

  const labelFor = (row: LeaderboardRow) => {
    const username = isolate(row.username ?? "");
    const rank = f.number(row.rank);
    const level = f.number(row.level);
    if (scope === "all") return t("leaderboard.row.label.all", { rank, username, level, value: f.number(row.value) });
    if (scope === "predict") return t("leaderboard.row.label.predict", { rank, username, percent: formatPercent(f.locale, row.value / 100), count: f.number(row.count ?? 0) });
    return t("leaderboard.row.label.gain", { rank, username, level, value: gainDirection(row.value), amount: f.number(Math.abs(row.value)) });
  };

  const mine = board ? myRank(board, me?.username) : null;
  const myName = me?.username?.toLowerCase();

  let list: ReactNode;
  if (!board && error) {
    list = <ErrorState kind={online ? "error" : "offline"} message={online ? t("leaderboard.loadError") : t("net.offline")} code={error !== "NETWORK" ? error : undefined} onRetry={() => void load(true)} />;
  } else if (!board) {
    list = <LoadingState variant="list" rows={10} />;
  } else if (board.results.length === 0) {
    list = scope === "predict" ? <EmptyState message={t("leaderboard.empty.predict")} action={{ label: t("leaderboard.empty.watchLive"), href: "/live" }} /> : <EmptyState message={t(`leaderboard.empty.${scope}`)} />;
  } else {
    list = (
      <Box component="ol" aria-label={t(`leaderboard.scope.${scope}`)} sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 0.5 }}>
        {board.results.map((row) => {
          const own = Boolean(myName && row.username?.toLowerCase() === myName);
          const value = valueText(row);
          const content = (
            <>
              <span className="lb-rank" aria-hidden>
                <Medal rank={row.rank} text={f.number(row.rank)} />
              </span>
              <Avatar avatarKey={row.avatar} size={avatarSize.sm} />
              <span className="lb-id" aria-hidden>
                <Typography variant="label" component="span" sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", overflowWrap: "anywhere" }}>
                  {row.username ? <bdi dir="ltr">{row.username}</bdi> : t("leaderboard.row.unavailable")}
                  {own && (
                    <Box component="span" sx={{ typography: "labelSmall", px: 0.75, borderRadius: `${radii.pill}px`, border: 1, borderColor: "currentColor" }}>
                      {t("leaderboard.me.you")}
                    </Box>
                  )}
                </Typography>
                <Typography variant="caption" color={own ? "inherit" : "text.secondary"} component="span" sx={{ display: "block" }}>
                  {t("leaderboard.row.level", { level: f.number(row.level) })}
                </Typography>
              </span>
              <span className="lb-value" aria-hidden>
                <Typography variant="h5" component="span" sx={{ display: "block" }}>
                  <bdi>{value.text}</bdi>
                </Typography>
                {value.sub && (
                  <Typography variant="caption" color={own ? "inherit" : "text.secondary"}>
                    {value.sub}
                  </Typography>
                )}
              </span>
            </>
          );
          return (
            <li key={`${row.rank}:${row.username ?? ""}`}>
              {row.username ? (
                <Row component={NextLink} href={`/profile/${encodeURIComponent(row.username)}`} aria-label={labelFor(row)} data-me={own ? "true" : undefined} aria-current={own ? "true" : undefined}>
                  {content}
                </Row>
              ) : (
                <Row component="div" disabled aria-label={labelFor(row)}>
                  {content}
                </Row>
              )}
            </li>
          );
        })}
      </Box>
    );
  }

  let myRow: ReactNode = null;
  if (board && mine && mine.kind !== "inList") {
    let text: ReactNode;
    if (mine.kind === "outside") {
      const v = valueText({ value: mine.value });
      text = <Typography variant="label">{t("leaderboard.me.row", { rank: f.number(mine.rank), value: v.text })}</Typography>;
    } else if (mine.kind === "unrated") {
      text = (
        <Stack spacing={0.5}>
          <Typography variant="body2">{t("leaderboard.me.unrated")}</Typography>
          <Link component={NextLink} href="/play" sx={{ alignSelf: "flex-start", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            {t("leaderboard.me.playRated")}
          </Link>
        </Stack>
      );
    } else if (mine.kind === "noPeriod") {
      text = <Typography variant="body2">{t(mine.period === "weekly" ? "leaderboard.me.noWeek" : "leaderboard.me.noMonth")}</Typography>;
    } else {
      text = (
        <Stack spacing={0.25}>
          <Typography variant="body2">{t("leaderboard.me.predict")}</Typography>
          {mine.count !== null && mine.needed !== null && (
            <Typography variant="caption" color="text.secondary">
              {t("leaderboard.me.predictProgress", { count: f.number(mine.count), needed: f.number(mine.needed) })}
            </Typography>
          )}
          <Link component={NextLink} href="/me/predictions" sx={{ alignSelf: "flex-start", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            {t("leaderboard.me.myPredictions")}
          </Link>
        </Stack>
      );
    }
    myRow = (
      <Box
        component="section"
        aria-label={t("leaderboard.me.you")}
        sx={{
          // Sticky above the bottom nav on portrait phones; inline in short landscape (§6).
          [`@media (min-height: ${layout.compactHeight}px)`]: { position: "sticky", insetBlockEnd: bottomInset, zIndex: 2 },
          mt: 1,
          p: 1.5,
          borderRadius: `${radii.md}px`,
          border: 1,
          borderColor: "tokens.outline",
          bgcolor: "tokens.surfaceRaised",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        {me && <Avatar avatarKey={me.avatar} size={avatarSize.sm} />}
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>{text}</Box>
      </Box>
    );
  }

  return (
    <SignedInShell topBar={{ title: t("leaderboard.title"), leading: "back", href: "/play" }}>
      <Box sx={{ ...gutterStyles, pt: 1 }}>
        <Tabs value={scope} onChange={(_, v: LeaderboardScope) => setScope(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t("leaderboard.scopes")}>
          {LEADERBOARD_SCOPES.map((s) => (
            <Tab key={s} value={s} label={t(`leaderboard.scope.${s}`)} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>
      <Stack spacing={2} sx={{ ...gutterStyles, py: 2, maxWidth: 720 + 64, width: "100%", marginInline: "auto", flex: "1 1 auto" }}>
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary" sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <InfoIcon sx={{ fontSize: iconSize.sm, mt: 0.25, flex: "none" }} />
            <span>
              {explain}
              {period && <> {period}</>}
            </span>
          </Typography>
        </Stack>
        {list}
        {board && (!online || error) && at !== null && <InfoLine>{t("common.lastUpdated", { time: f.relative(new Date(at)) })}</InfoLine>}
        {myRow}
      </Stack>
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announce}
      </span>
    </SignedInShell>
  );
}
