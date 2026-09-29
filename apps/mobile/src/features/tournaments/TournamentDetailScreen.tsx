"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api,
  detailRefreshMs,
  finalists,
  finishedResult,
  newIdempotencyKey,
  personalResult,
  prizePool,
  prizeRows,
  seedOrderMatters,
  tournamentPrimary,
} from "@bg/api-client";
import { iconSize, radii } from "@bg/design-tokens";
import { formatPercent, isolate } from "@bg/i18n";
import type { BracketSlotInfo, TournamentInfo } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/Toast";
import { StickyActions } from "@/components/flow/StickyActions";
import { ChevronForwardIcon, CoinIcon, ErrorIcon, EyeIcon, LiveIcon, TournamentsIcon } from "@/components/icons";
import { RatedIcon } from "@/components/icons/game";
import { CostConfirmation } from "@/components/money/CostConfirmation";
import { ValueRows } from "@/components/money/ValueRows";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError } from "@/lib/apiErrors";
import { usePublicConfig } from "@/lib/config";
import { useRequireUser, useSession } from "@/lib/session";
import { readJson, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { gutterStyles } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import { Bracket } from "./Bracket";
import { NameText, useTournamentName } from "./labels";
import { refreshMyTournaments } from "./TournamentAlerts";
import { TournamentStatusChips } from "./TournamentCard";

// TO-07 push explanation, loaded only when offered (review TO-03; §11.4 first-load budget).
const PushExplainSheet = lazy(() => import("@/components/pwa/PushExplainSheet"));

// TO-02 Tournament detail `/tournaments/[id]` with the Bracket tab (`?tab=bracket`, TO-03), TO-04
// registration confirmation, and TO-05 leave (tournaments.md §3.2–§3.10). Every rule is visible
// without expanding anything. The primary follows the §3.2 state table; the server decides.

const Card = styled("section")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    containerType: "inline-size",
  };
});

const Facts = styled("dl")(({ theme }) => ({
  margin: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)",
  columnGap: theme.spacing(2),
  rowGap: theme.spacing(1),
  "& dt": { ...theme.typography.body2, color: tokensOf(theme).textSecondary },
  "& dd": { ...theme.typography.body1, margin: 0, overflowWrap: "anywhere" },
  "@container (max-width: 20rem)": { gridTemplateColumns: "minmax(0, 1fr)", "& dd": { marginBlockEnd: theme.spacing(1) } },
}));

const PrizeTable = styled("table")(({ theme }) => ({
  width: "100%",
  borderCollapse: "collapse",
  "& th, & td": { ...theme.typography.body2, textAlign: "start", paddingBlock: theme.spacing(0.75), borderBlockEnd: `1px solid ${tokensOf(theme).outlineSubtle}` },
  "& th": { color: tokensOf(theme).textSecondary, fontWeight: 500 },
  "& td:last-of-type, & th:last-of-type": { textAlign: "end" },
  "@container (max-width: 18rem)": { display: "none" },
}));

const PrizeList = styled("ul")(({ theme }) => ({
  display: "none",
  listStyle: "none",
  margin: 0,
  padding: 0,
  "& li": { ...theme.typography.body2, paddingBlock: theme.spacing(0.5) },
  "@container (max-width: 18rem)": { display: "block" },
}));

export function TournamentDetailScreen({ id }: { id: number }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const nameOf = useTournamentName();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const online = useOnline();
  const wallet = useWallet();
  const config = usePublicConfig();
  const { me } = useRequireUser();
  const { reload: reloadMe, handleAuthError } = useSession();
  const tab = params.get("tab") === "bracket" ? "bracket" : "overview";

  const [tour, setTour] = useState<TournamentInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<BracketSlotInfo[] | null>(null);
  const [bracketError, setBracketError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<"register" | "leave" | "insufficient" | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState<number | null>(null);
  const [others, setOthers] = useState<TournamentInfo[] | null>(null);
  const [announce, setAnnounce] = useState("");
  const [hintSeen, setHintSeen] = useState(true);
  const [pushOffer, setPushOffer] = useState(false);
  const keyRef = useRef<string | null>(null);
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.tournaments.get(id);
      setTour(next);
      setNow(Date.now());
      setError(null);
      if (lastStatus.current && lastStatus.current !== next.status) {
        setAnnounce(next.status === "cancelled" && next.joined ? t("tournaments.cancelled.announce") : t(`tournaments.status.${next.status === "scheduled" ? "open" : next.status === "running" ? "starting" : next.status}`));
      }
      lastStatus.current = next.status;
      if (next.status === "running" || next.status === "finished") {
        api.tournaments
          .bracket(id)
          .then((b) => {
            setSlots(b.slots);
            setBracketError(false);
          })
          .catch(() => setBracketError(true));
      }
      return next;
    } catch (e) {
      if (handleAuthError(e)) return null;
      const err = toApiError(e);
      if (err.code === "NOT_FOUND") setNotFound(true);
      else setError(err.code);
      return null;
    }
  }, [id, handleAuthError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!tour || !online) return;
    const ms = detailRefreshMs(tour, Date.now());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !inFlight) void load();
    }, ms);
    return () => window.clearInterval(timer);
  }, [tour, online, load, inFlight]);

  useEffect(() => {
    if (me) setHintSeen(Boolean(readJson<boolean>("local", `bg.tournaments.detailHint.${me.id}`)));
  }, [me]);

  const startsAt = tour ? Date.parse(tour.starts_at) : null;
  const left = useCountdown(tour?.status === "scheduled" && startsAt && startsAt - Date.now() <= 60 * 60_000 ? startsAt : null);

  const setTab = (next: "overview" | "bracket") => router.replace(next === "bracket" ? `${pathname}?tab=bracket` : pathname, { scroll: false });

  const frame = (children: ReactNode, title = t("tournaments.title")) => (
    <SignedInShell topBar={{ title, leading: "back", href: "/tournaments", titleComponent: "p" }}>
      <Box sx={{ ...gutterStyles, py: 2, maxWidth: 960, width: "100%", mx: "auto", display: "flex", flexDirection: "column", flex: "1 1 auto" }}>{children}</Box>
    </SignedInShell>
  );

  if (notFound) {
    return frame(
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h3" component="h1">
          {t("tournaments.notFound")}
        </Typography>
        <Button variant="contained" component={NextLink} href="/tournaments">
          {t("tournaments.all")}
        </Button>
      </Stack>,
    );
  }
  if (!tour) {
    return frame(error ? <ErrorState kind={online ? "error" : "offline"} message={online ? t("tournaments.loadError") : t("net.offline")} code={error !== "NETWORK" ? error : undefined} onRetry={() => void load()} /> : <LoadingState variant="cards" rows={3} />);
  }

  const name = nameOf(tour);
  const username = me?.username ?? null;
  const result = slots ? personalResult(tour, slots, username) : { kind: "none" as const };
  const primary = tournamentPrimary(tour, now, result.kind === "out" || result.kind === "runnerUp");
  const suspended = me?.status === "suspended";
  const balance = wallet.summary?.balance ?? null;
  const coinPrice = wallet.summary?.coin_price_toman ?? config?.coin_price_toman ?? null;
  const rows = prizeRows(tour);
  const pool = prizePool(tour);
  const startTime = f.date(tour.starts_at, { timeStyle: "short" });
  const grace = config?.reconnect_grace_seconds ?? null;
  const presence = grace
    ? t("tournaments.rules.presence", { time: startTime, grace: t("tournaments.rules.grace", { seconds: grace }) })
    : t("tournaments.rules.presenceNoGrace", { time: startTime });
  const placeName = (place: number) => t("tournaments.prizes.placeN", { place });
  const share = (pct: number) => formatPercent(f.locale, pct / 100, 1);

  // ---- Actions ----
  const openRegister = () => {
    setActionError(null);
    if (tour.entry > 0 && balance !== null && balance < tour.entry) {
      setInsufficientBalance(balance);
      openInsufficient();
      return;
    }
    keyRef.current = newIdempotencyKey();
    setSheet("register");
  };

  function openInsufficient() {
    setSheet("insufficient");
    setOthers(null);
    api.tournaments
      .list("scheduled")
      .then((page) => setOthers(page.results))
      .catch(() => setOthers([]));
  }

  const register = async () => {
    if (inFlight || !tour) return;
    keyRef.current ??= newIdempotencyKey();
    setInFlight(true);
    setActionError(null);
    try {
      const next = await api.tournaments.join(tour.id, keyRef.current);
      setTour(next);
      setSheet(null);
      void wallet.refresh();
      void refreshMyTournaments();
      toast.show({ message: t("tournaments.register.done", { name: name.text }) });
      setAnnounce(t("tournaments.register.done", { name: name.text }));
      offerPush();
    } catch (e) {
      if (handleAuthError(e)) return;
      const err = toApiError(e);
      if (err.code === "TOURNAMENT_REFUSED") {
        setActionError(err.details.reason === "full" ? t("tournaments.error.full") : t("tournaments.error.closedJoin"));
        void load();
      } else if (err.code === "WALLET_INSUFFICIENT") {
        setInsufficientBalance(typeof err.details.balance === "number" ? err.details.balance : balance);
        void wallet.refresh();
        openInsufficient();
      } else if (err.code === "ACCOUNT_SUSPENDED") {
        setActionError(t("account.suspended.actionBlocked"));
        void reloadMe();
      } else if (err.code === "NETWORK") {
        setActionError(t("errors.network"));
      } else {
        setActionError(`${t("errors.generic")} (${t("common.errorCode", { code: err.code })})`);
      }
    } finally {
      setInFlight(false);
    }
  };

  /** "Check status" (§3.3 step 3): joined → done; otherwise the same key again. */
  const checkStatus = async () => {
    const next = await load();
    if (next?.joined) {
      setInFlight(false);
      setSheet(null);
      void wallet.refresh();
      toast.show({ message: t("tournaments.register.done", { name: name.text }) });
      offerPush();
    }
  };

  /**
   * TO-07 (§3.3 step 4, P§15; review TO-03): once per account, after the first successful
   * registration, when push is supported and the browser can still ask. "Not now" asks nothing.
   */
  function offerPush() {
    if (!me) return;
    void import("@/components/pwa/PushExplainSheet")
      .then((m) => m.offerPushOnce(String(me.id)))
      .then((ok) => ok && setPushOffer(true))
      .catch(() => undefined);
  }

  const leave = async () => {
    if (inFlight) return;
    setInFlight(true);
    setActionError(null);
    try {
      const next = await api.tournaments.leave(tour.id);
      setTour(next);
      setSheet(null);
      void wallet.refresh();
      void refreshMyTournaments();
      const msg = tour.entry > 0 ? t("tournaments.leave.done", { name: name.text, entry: f.number(tour.entry) }) : t("tournaments.leave.doneFree", { name: name.text });
      toast.show({ message: msg });
      setAnnounce(msg);
    } catch (e) {
      if (handleAuthError(e)) return;
      const err = toApiError(e);
      setActionError(err.code === "TOURNAMENT_REFUSED" ? t("tournaments.error.closedLeave") : err.code === "NETWORK" ? t("errors.network") : `${t("errors.generic")} (${t("common.errorCode", { code: err.code })})`);
      if (err.code === "TOURNAMENT_REFUSED") void load();
    } finally {
      setInFlight(false);
    }
  };

  // ---- Status card (§4 TO-02 item 2) ----
  let status: ReactNode = null;
  if (tour.status === "cancelled") {
    status = (
      <Stack spacing={1}>
        <Typography>{tour.cancel_reason === "not_filled" ? t("tournaments.cancelled.notFilled", { entries: f.number(tour.entries), capacity: f.number(tour.capacity) }) : t("tournaments.cancelled.admin")}</Typography>
        {tour.joined && tour.entry > 0 && (
          <>
            <Typography>{t("tournaments.cancelled.refunded", { entry: f.number(tour.entry) })}</Typography>
            <Link component={NextLink} href="/wallet" sx={{ alignSelf: "flex-start", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
              {t("tournaments.cancelled.viewWallet")}
            </Link>
          </>
        )}
      </Stack>
    );
  } else if (primary === "starting") {
    status = <Typography role="status">{t("tournaments.status.startingNow")}</Typography>;
  } else if (primary === "registered") {
    status = (
      <Stack spacing={0.5}>
        <Typography>{t("tournaments.status.registeredCard", { date: f.dateTime(tour.starts_at) })}</Typography>
        {left > 0 && (
          <Typography variant="h4" component="p">
            {t("tournaments.status.countdown", { time: `⁦${f.clock(left)}⁩` })}
          </Typography>
        )}
      </Stack>
    );
  } else if (tour.status === "running" && tour.joined) {
    if (result.kind === "playing") {
      status = (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography>{t("tournaments.status.playing", { round: f.number(result.slot.round) })}</Typography>
          {result.slot.match_id && (
            <Button variant="contained" component={NextLink} href={`/match/${result.slot.match_id}`}>
              {t("tournaments.bracket.play")}
            </Button>
          )}
        </Stack>
      );
    } else if (result.kind === "waiting") {
      const opponent = result.opponent
        ? `@${isolate(result.opponent)}`
        : result.feeder && result.feeder.players[0] && result.feeder.players[1]
          ? t("tournaments.wait.winnerOf", { a: isolate(result.feeder.players[0]), b: isolate(result.feeder.players[1]) })
          : t("tournaments.wait.tbd");
      status = (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography>{t("tournaments.wait.won", { round: f.number(result.round), opponent })}</Typography>
          {result.feeder?.live && result.feeder.match_id && (
            <Button variant="outlined" startIcon={<EyeIcon />} component={NextLink} href={`/match/${result.feeder.match_id}`}>
              {t("tournaments.wait.watch")}
            </Button>
          )}
        </Stack>
      );
    } else if (result.kind === "out") {
      status = <Typography>{t("tournaments.wait.out", { round: f.number(result.round) })}</Typography>;
    } else {
      status = <Typography>{t("tournaments.status.watchRunning", { round: f.number(tour.round), rounds: f.number(tour.rounds) })}</Typography>;
    }
  } else if (tour.status === "running") {
    status = <Typography>{t("tournaments.status.watchRunning", { round: f.number(tour.round), rounds: f.number(tour.rounds) })}</Typography>;
  } else if (tour.status === "finished") {
    const top = slots ? finalists(tour, slots) : null;
    // `my_place` / `my_prize` from the API first, so 3rd and 4th place show their prize (TO-02).
    const final = finishedResult(tour, result);
    status = (
      <Stack spacing={1}>
        {final.kind === "place" && (
          <>
            <Typography variant="h4" component="p">
              {final.place === 1 ? t("tournaments.result.won", { name: name.text }) : t("tournaments.result.place", { place: placeName(final.place) })}
            </Typography>
            {final.prize > 0 && <Typography>{t("tournaments.result.prize", { amount: f.number(final.prize) })}</Typography>}
          </>
        )}
        {final.kind === "out" && <Typography>{t("tournaments.result.outInRound", { round: f.number(final.round) })}</Typography>}
        {top && <Typography color="text.secondary">{t("tournaments.result.champion", { winner: isolate(top.winner), runnerUp: isolate(top.runnerUp ?? "") })}</Typography>}
      </Stack>
    );
  }

  // ---- Footer primary (§3.2 table) ----
  const offline = !online ? t("net.offlineAction") : null;
  let footer: ReactNode = null;
  if (primary === "register") {
    const reason = suspended ? t("account.suspended.actionBlocked") : offline;
    footer = (
      <>
        <Button variant="contained" size="large" onClick={openRegister} disabled={Boolean(reason)} startIcon={tour.entry > 0 ? <CoinIcon /> : undefined} aria-describedby={reason ? "reg-reason" : undefined}>
          {tour.entry > 0 ? t("tournaments.register.cta", { count: tour.entry }) : t("tournaments.register.ctaFree")}
        </Button>
        {reason && (
          <Typography id="reg-reason" variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            {reason}{" "}
            {suspended && (
              <Link component={NextLink} href="/account/status">
                {t("account.suspended.details")}
              </Link>
            )}
          </Typography>
        )}
      </>
    );
  } else if (primary === "full") {
    footer = (
      <>
        <Button variant="contained" size="large" disabled aria-describedby="full-reason">
          {tour.entry > 0 ? t("tournaments.register.cta", { count: tour.entry }) : t("tournaments.register.ctaFree")}
        </Button>
        <Typography id="full-reason" variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          {t("tournaments.register.fullReason")}
        </Typography>
        <Button variant="text" component={NextLink} href="/tournaments">
          {t("tournaments.register.others")}
        </Button>
      </>
    );
  } else if (primary === "registered") {
    footer = (
      <>
        <Button variant="text" color="error" onClick={() => setSheet("leave")} disabled={Boolean(offline)}>
          {t("tournaments.leave.button")}
        </Button>
        {offline && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            {offline}
          </Typography>
        )}
      </>
    );
  } else if (primary === "playing" || primary === "watch" || primary === "finished") {
    footer = tab === "overview" && (
      <>
        <Button variant={primary === "playing" ? "outlined" : "contained"} size="large" onClick={() => setTab("bracket")}>
          {t("tournaments.tab.bracket")}
        </Button>
        {tour.status === "running" && (
          <Button variant="text" component={NextLink} href={`/live?tournament=${tour.id}`} startIcon={<LiveIcon />}>
            {t("tournaments.liveMatches")}
          </Button>
        )}
      </>
    );
  } else if (primary === "cancelled") {
    footer = (
      <Button variant="outlined" component={NextLink} href="/tournaments">
        {t("tournaments.register.others")}
      </Button>
    );
  }

  const prizesTable = (
    <div>
      {rows.every((r) => r.amount === 0) ? (
        <Typography variant="body2">{t("tournaments.prizes.none")}</Typography>
      ) : (
        <>
          <PrizeTable>
            <thead>
              <tr>
                <th scope="col">{t("tournaments.prizes.place")}</th>
                <th scope="col">{t("tournaments.prizes.share")}</th>
                <th scope="col">{t("tournaments.prizes.prize")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.place}>
                  <td>{placeName(r.place)}</td>
                  <td>{share(r.share)}</td>
                  <td>{f.coins(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </PrizeTable>
          <PrizeList>
            {rows.map((r) => (
              <li key={r.place}>{t("tournaments.prizes.row", { place: placeName(r.place), share: share(r.share), amount: f.number(r.amount) })}</li>
            ))}
          </PrizeList>
        </>
      )}
    </div>
  );

  const rules = (
    <Stack component="ul" spacing={0.75} sx={{ listStyle: "none", p: 0, m: 0 }}>
      <InfoLine component="li">{t("tournaments.rules.refund")}</InfoLine>
      <InfoLine component="li">{t("tournaments.rules.leave")}</InfoLine>
      <InfoLine component="li">{presence}</InfoLine>
      <InfoLine component="li">{t("tournaments.rules.noBots")}</InfoLine>
      <InfoLine component="li">{t("tournaments.rules.noPredictions")}</InfoLine>
    </Stack>
  );

  const bracketDisabled = tour.status === "scheduled" || tour.status === "cancelled";

  return frame(
    <>
      <Stack spacing={2.5} sx={{ flex: "1 1 auto" }}>
        <Stack spacing={1}>
          <Typography variant="h3" component="h1" sx={{ overflowWrap: "anywhere" }}>
            <NameText name={name} />
          </Typography>
          <TournamentStatusChips tour={tour} now={now} />
        </Stack>
        {status && <Card aria-label={t("tournaments.tab.overview")}>{status}</Card>}
        <Tabs value={tab} onChange={(_, v: "overview" | "bracket") => setTab(v)} aria-label={t("tournaments.tab.label")}>
          <Tab value="overview" label={t("tournaments.tab.overview")} sx={{ minHeight: 48 }} />
          <Tab value="bracket" label={t("tournaments.tab.bracket")} sx={{ minHeight: 48 }} />
        </Tabs>
        {tab === "bracket" ? (
          bracketDisabled ? (
            <InfoLine>{tour.status === "cancelled" ? t("tournaments.bracket.cancelled") : t("tournaments.bracket.notYet")}</InfoLine>
          ) : bracketError && !slots ? (
            <ErrorState message={t("tournaments.bracket.loadError")} onRetry={() => void load()} />
          ) : !slots ? (
            <LoadingState variant="cards" rows={3} />
          ) : (
            <Bracket tour={tour} slots={slots} username={username} />
          )
        ) : (
          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" }, alignItems: "start" }}>
            <Card aria-labelledby="t-facts">
              <Typography id="t-facts" variant="h5" component="h2" sx={{ mb: 1.5 }}>
                {t("tournaments.facts.title")}
              </Typography>
              <Facts>
                <dt>{t("tournaments.facts.start")}</dt>
                <dd>{t("tournaments.facts.startValue", { date: f.dateTime(tour.starts_at), relative: f.relative(tour.starts_at) })}</dd>
                <dt>{t("tournaments.facts.formatLabel")}</dt>
                <dd>{t("tournaments.facts.format", { capacity: f.number(tour.capacity), rounds: f.number(tour.rounds) })}</dd>
                <dt>{t("tournaments.facts.variant")}</dt>
                <dd>
                  {labels.variant(tour.variant)} · {labels.length(tour.length)}
                </dd>
                <dt>{t("tournaments.facts.entry")}</dt>
                <dd>
                  {tour.entry > 0 ? f.coins(tour.entry) : t("tournaments.card.free")}
                  {tour.entry > 0 && coinPrice !== null && (
                    <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
                      {t("coins.tomanEquivalent", { amount: f.number(tour.entry * coinPrice) })}
                    </Typography>
                  )}
                </dd>
                <dt>{t("tournaments.facts.places")}</dt>
                <dd>{t("tournaments.card.places", { entries: f.number(tour.entries), capacity: f.number(tour.capacity) })}</dd>
              </Facts>
              <Box sx={{ mt: 1.5 }}>
                <InfoLine icon={RatedIcon}>{t("tournaments.facts.rated")}</InfoLine>
              </Box>
            </Card>
            <Card aria-labelledby="t-prizes">
              <Typography id="t-prizes" variant="h5" component="h2" sx={{ mb: 1.5 }}>
                {t("tournaments.prizes.title")}
              </Typography>
              {!hintSeen && tour.status === "scheduled" && (
                <Box sx={{ mb: 1.5 }}>
                  <Banner
                    severity="info"
                    onClose={() => {
                      if (me) writeJson("local", `bg.tournaments.detailHint.${me.id}`, true);
                      setHintSeen(true);
                    }}
                  >
                    {t("tournaments.hint.detail")}
                  </Banner>
                </Box>
              )}
              {prizesTable}
              <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                {pool.pool > 0 && <InfoLine>{t("tournaments.prizes.poolNoPct", { pool: f.number(pool.pool), total: f.number(pool.entries) })}</InfoLine>}
                {seedOrderMatters(tour) && <InfoLine>{t("tournaments.prizes.seedOrder")}</InfoLine>}
              </Stack>
            </Card>
            <Card aria-labelledby="t-rules" sx={{ gridColumn: { lg: "1 / -1" } }}>
              <Typography id="t-rules" variant="h5" component="h2" sx={{ mb: 1.5 }}>
                {t("tournaments.rules.title")}
              </Typography>
              {rules}
              <Stack direction="row" sx={{ mt: 1.5, gap: 2, flexWrap: "wrap" }}>
                {tour.status === "running" && (
                  <Link component={NextLink} href={`/live?tournament=${tour.id}`} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minHeight: 44 }}>
                    <LiveIcon sx={{ fontSize: iconSize.sm }} />
                    {t("tournaments.liveMatches")}
                  </Link>
                )}
              </Stack>
            </Card>
          </Box>
        )}
      </Stack>
      {footer && <StickyActions>{footer}</StickyActions>}

      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {announce}
      </span>

      {tour.entry > 0 ? (
        <CostConfirmation
          open={sheet === "register"}
          onCancel={() => setSheet(null)}
          onConfirm={() => void register()}
          title={t("tournaments.register.title", { name: name.text })}
          summary={
            <Stack spacing={0.5}>
              <Typography variant="body2">{t("tournaments.register.summary", { variant: labels.variant(tour.variant), n: f.number(tour.length), capacity: f.number(tour.capacity) })}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("tournaments.facts.startValue", { date: f.dateTime(tour.starts_at), relative: f.relative(tour.starts_at) })}
              </Typography>
            </Stack>
          }
          cost={{
            cost: tour.entry,
            costLabel: "entry",
            tomanEquivalent: coinPrice !== null ? tour.entry * coinPrice : undefined,
            balance,
            balanceAfter: balance === null ? null : balance - tour.entry,
          }}
          facts={
            <Stack spacing={1} component="span">
              {prizesTable}
              <span>{t("tournaments.rules.refund")} {t("tournaments.rules.leave")}</span>
              <span>{presence}</span>
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                <RatedIcon sx={{ fontSize: iconSize.sm }} />
                {t("tournaments.register.rated")}
              </Box>
            </Stack>
          }
          confirmLabel={t("tournaments.register.pay", { entry: f.number(tour.entry) })}
          inFlightLabel={t("tournaments.register.paying")}
          inFlight={inFlight}
          disabledReason={balance === null ? t("common.loading") : offline ?? undefined}
          error={actionError}
          onCheckStatus={() => void checkStatus()}
        />
      ) : (
        <BottomSheet
          open={sheet === "register"}
          onClose={() => setSheet(null)}
          dismissible={!inFlight}
          title={t("tournaments.register.title", { name: name.text })}
          footerMode="inline"
          footer={
            <>
              {actionError && (
                <Stack direction="row" spacing={1} role="alert" sx={{ color: "tokens.error" }}>
                  <ErrorIcon sx={{ fontSize: iconSize.sm }} />
                  <Typography variant="body2" sx={{ color: "inherit" }}>
                    {actionError}
                  </Typography>
                </Stack>
              )}
              <Button variant="contained" size="large" loading={inFlight} onClick={() => void register()} disabled={Boolean(offline)}>
                {t("tournaments.register.payFree")}
              </Button>
              <Button variant="text" onClick={() => setSheet(null)} disabled={inFlight}>
                {t("common.cancel")}
              </Button>
            </>
          }
        >
          <Stack spacing={1.5}>
            <Typography variant="body2">{t("tournaments.register.summary", { variant: labels.variant(tour.variant), n: f.number(tour.length), capacity: f.number(tour.capacity) })}</Typography>
            <Typography variant="body2">{t("tournaments.register.freeEntry")}</Typography>
            {prizesTable}
            <InfoLine>{t("tournaments.rules.refund")}</InfoLine>
            <InfoLine>{presence}</InfoLine>
            <InfoLine icon={RatedIcon}>{t("tournaments.register.rated")}</InfoLine>
          </Stack>
        </BottomSheet>
      )}

      <ConfirmDialog
        open={sheet === "leave"}
        onCancel={() => setSheet(null)}
        onConfirm={() => void leave()}
        title={t("tournaments.leave.title", { name: name.text })}
        confirmLabel={tour.entry > 0 ? t("tournaments.leave.confirm", { entry: f.number(tour.entry) }) : t("tournaments.leave.confirmFree")}
        cancelLabel={t("tournaments.leave.keep")}
        inFlight={inFlight}
        error={actionError}
        disabledReason={offline}
      >
        {tour.entry > 0 ? t("tournaments.leave.body", { entry: f.number(tour.entry) }) : t("tournaments.leave.bodyFree")}
      </ConfirmDialog>

      <BottomSheet open={sheet === "insufficient"} onClose={() => setSheet(null)} title={t("coins.insufficient.title")}>
        <Stack spacing={2}>
          <ValueRows
            rows={[
              { label: t("play.join.entry"), value: tour.entry, coins: true, emphasis: true },
              { label: t("coins.balance"), value: insufficientBalance ?? 0, coins: true, divider: true },
              { label: t("coins.shortfall"), value: Math.max(0, tour.entry - (insufficientBalance ?? 0)), coins: true, emphasis: true },
            ]}
          />
          {others === null ? (
            <LoadingState variant="list" rows={2} />
          ) : (
            <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
              {others
                .filter((o) => o.id !== tour.id && o.entries < o.capacity && o.entry < tour.entry && o.entry <= (insufficientBalance ?? 0))
                .slice(0, 3)
                .map((o) => (
                  <li key={o.id}>
                    <Button
                      fullWidth
                      variant="outlined"
                      component={NextLink}
                      href={`/tournaments/${o.id}`}
                      startIcon={<TournamentsIcon />}
                      endIcon={<ChevronForwardIcon />}
                      sx={{ justifyContent: "flex-start", textAlign: "start", minHeight: 56 }}
                      onClick={() => setSheet(null)}
                    >
                      {t("tournaments.insufficient.other", { name: nameOf(o).text, entry: f.number(o.entry), date: f.dateTime(o.starts_at) })}
                    </Button>
                  </li>
                ))}
            </Stack>
          )}
          <Button variant="text" component={NextLink} href="/shop/coins" sx={{ alignSelf: "flex-start" }}>
            {t("coins.getCoins")}
          </Button>
          <Button variant="text" onClick={() => setSheet(null)}>
            {t("common.close")}
          </Button>
        </Stack>
      </BottomSheet>
      {pushOffer && (
        <Suspense fallback={null}>
          <PushExplainSheet open onClose={() => setPushOffer(false)} />
        </Suspense>
      )}
    </>,
    name.text,
  );
}
