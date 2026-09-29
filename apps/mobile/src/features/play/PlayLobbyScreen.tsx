"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { styled, useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import type { ApiError, ErrorOut, LeaderboardRow, MatchFoundOut, Tier } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { OfflineIcon, WarningIcon } from "@/components/icons";
import { InfoLine } from "@/components/wallet/InfoLine";
import { useToast } from "@/components/feedback/Toast";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { useActiveMatch } from "@/lib/activeMatch";
import { toApiError, useErrorText } from "@/lib/apiErrors";
import { usePublicConfig } from "@/lib/config";
import { markFreshMatch } from "@/lib/match/fresh";
import { useRequireUser, useSession } from "@/lib/session";
import { readJson, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { supportsWebGL2 } from "@/lib/webgl";
import { gutterStyles, mqMdUp } from "@/theme/layout";
import { isBotLevel, isVariant, useGameLabels, type BotLevel, type Variant } from "./labels";
import { Card, PlayAgainCard, PracticeCard, RankCard, TierCard, TierCardSkeleton, TopPlayers } from "./LobbyCards";
import { MatchmakingOverlay } from "./MatchmakingOverlay";
import { PlaySheet, type BotEntry, type SheetState } from "./PlaySheet";
import { usePlayQueue, type QueueRequest } from "./usePlayQueue";

// PL-01 Play lobby `/play` (play.md §3.1, §4): tier cards, practice, rank, "Play again", and the
// resume banner (PL-08, in the shell). Every play button is disabled with a visible reason when the
// device lacks WebGL2, the account is suspended, a match is running, or the browser is offline;
// nothing is queued or charged then. Server values only: entry, pot, fee, and payout come from
// `GET tiers`.

const TIERS_KEY = "bg.play.tiers";
const lastKey = (userId: number) => `bg.play.last.${userId}`;
const hintKey = (userId: number) => `bg.play.feeHintSeen.${userId}`;
/** `waiting` counts refresh every 30 s in the lobby and every 15 s during a search (§3.1, §3.4). */
const REFRESH_MS = 30_000;
const REFRESH_SEARCH_MS = 15_000;

const Layout = styled("div")(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(3),
  paddingBlock: theme.spacing(2, 4),
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateAreas: `"top" "online" "side"`,
  // md: the tier cards (the primary action) keep the room; the side column stays narrow (P-05).
  [mqMdUp]: {
    gridTemplateColumns: "minmax(0, 1fr) minmax(15rem, 17.5rem)",
    gridTemplateAreas: `"top top" "online side"`,
    alignItems: "start",
  },
  "& .lobby-top": { gridArea: "top", display: "grid", gap: theme.spacing(2) },
  "& .lobby-online": { gridArea: "online", minWidth: 0, containerType: "inline-size", containerName: "tiers" },
  "& .lobby-side": { gridArea: "side", display: "grid", gap: theme.spacing(2), minWidth: 0 },
}));

/**
 * One column until every card gets at least 13rem; then as many as fit (4-up in the 1280 shell).
 * Measured on the section (a named container), not the viewport, so the side column and the rail
 * never squeeze a card (P-05, P-11).
 */
const TierGrid = styled("ul")(({ theme }) => ({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: theme.spacing(1.5),
  gridTemplateColumns: "repeat(auto-fill, minmax(min(13rem, 100%), 1fr))",
  "& > li": { containerType: "inline-size", containerName: "tiercard", minWidth: 0 },
}));

interface CachedTiers {
  tiers: Tier[];
  at: number;
}

export function PlayLobbyScreen() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const router = useRouter();
  const params = useSearchParams();
  const theme = useTheme();
  const lg = useMediaQuery(theme.breakpoints.up("lg"));
  const toast = useToast();
  const errorText = useErrorText();
  const { me } = useRequireUser();
  const { reload: reloadMe, handleAuthError } = useSession();
  const wallet = useWallet();
  const config = usePublicConfig();
  const online = useOnline();
  const { active, refresh: refreshActive } = useActiveMatch();

  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [tiersAt, setTiersAt] = useState<number | null>(null);
  const [tiersError, setTiersError] = useState<ApiError | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [joinError, setJoinError] = useState<ReactNode | null>(null);
  const [botInFlight, setBotInFlight] = useState(false);
  const [botError, setBotError] = useState<ReactNode | null>(null);
  const [botRetry, setBotRetry] = useState(false);
  const [botLengths, setBotLengths] = useState<number[] | null>(null);
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);
  const [last, setLast] = useState<QueueRequest | null>(null);
  const [hintSeen, setHintSeen] = useState(true);
  const [top, setTop] = useState<LeaderboardRow[] | null>(null);
  /** The server's current bot entry after BOT_ENTRY_CHANGED (newer than the config read). */
  const [botEntryNow, setBotEntryNow] = useState<BotEntry | null>(null);
  /** Opened from a lost match (MA-13b `from=loss`): no "Get coins" in this visit (P§9, P-06). */
  const [afterLoss, setAfterLoss] = useState(false);

  const balance = wallet.summary?.balance ?? null;
  const botEntry: BotEntry | null = botEntryNow ?? config?.bot_entry ?? null;
  const userId = me?.id ?? null;

  // ---- Data ----------------------------------------------------------------------------------

  const loadTiers = useCallback(async () => {
    try {
      const page = await api.matches.tiers();
      setTiers(page.results);
      setTiersAt(Date.now());
      setTiersError(null);
      writeJson("session", TIERS_KEY, { tiers: page.results, at: Date.now() } satisfies CachedTiers);
      return page.results;
    } catch (error) {
      if (handleAuthError(error)) return null;
      setTiersError(toApiError(error));
      return null;
    }
  }, [handleAuthError]);

  useEffect(() => {
    setWebgl(supportsWebGL2());
    const cached = readJson<CachedTiers>("session", TIERS_KEY);
    if (cached) {
      setTiers(cached.tiers);
      setTiersAt(cached.at);
    }
    void loadTiers();
  }, [loadTiers]);

  useEffect(() => {
    if (userId === null) return;
    setLast(readJson<QueueRequest>("local", lastKey(userId)));
    setHintSeen(Boolean(readJson<boolean>("local", hintKey(userId))));
  }, [userId]);

  useEffect(() => {
    if (!lg || top !== null) return;
    api
      .leaderboard("all")
      .then((board) => setTop(board.results))
      .catch(() => setTop([]));
  }, [lg, top]);

  // ---- Queue -----------------------------------------------------------------------------------

  const tierById = useCallback((id: number) => tiers?.find((x) => x.id === id) ?? null, [tiers]);

  const openMatch = useCallback(
    (found: MatchFoundOut, query = "") => {
      markFreshMatch(found.match_id, found);
      void wallet.refresh();
      void refreshActive();
      router.push(`/match/${found.match_id}${query}`);
    },
    [router, wallet, refreshActive],
  );

  const joinErrorFor = useCallback(
    (error: ErrorOut, req: QueueRequest) => {
      const code = error.code;
      if (code === "WALLET_INSUFFICIENT") {
        const b = typeof error.details.balance === "number" ? error.details.balance : null;
        setSheet({ step: "insufficient", tierId: req.tier_id, variant: req.variant, length: req.length, mode: "normal", balance: b });
        void wallet.refresh();
        return;
      }
      if (code === "ACCOUNT_SUSPENDED") {
        setJoinError(t("account.suspended.actionBlocked"));
        void reloadMe();
        return;
      }
      if (code === "MATCH_IN_PROGRESS") {
        const id = typeof error.details.match_id === "string" ? error.details.match_id : null;
        void refreshActive();
        setJoinError(
          <>
            {t("play.error.inProgress")}{" "}
            {id && (
              <Button size="small" variant="text" onClick={() => router.push(`/match/${id}`)}>
                {t("play.error.returnToMatch")}
              </Button>
            )}
          </>,
        );
        return;
      }
      if (code === "QUEUE_INVALID") {
        const reason = error.details.reason;
        void loadTiers();
        if (reason === "tier") setSheet({ step: "setup", tierId: null, variant: req.variant, length: req.length, notice: t("play.error.tierGone") });
        else if (reason === "length") setSheet({ step: "setup", tierId: req.tier_id, variant: req.variant, length: null, notice: t("play.error.optionGone") });
        else setSheet({ step: "setup", tierId: req.tier_id, variant: null, length: req.length, notice: t("play.error.optionGone") });
        return;
      }
      const text = errorText({ code, message_key: code === "BAD_MESSAGE" ? "errors.generic" : error.message_key, details: error.details });
      setJoinError(
        <>
          {text.message}
          {(text.code || code === "BAD_MESSAGE") && <> ({t("common.errorCode", { code })})</>}
        </>,
      );
    },
    [t, wallet, reloadMe, refreshActive, router, loadTiers, errorText],
  );

  const queue = usePlayQueue({
    onJoinError: joinErrorFor,
    onRemoved: (reason, req) => {
      if (reason === "balance") {
        setSheet({ step: "insufficient", tierId: req.tier_id, variant: req.variant, length: req.length, mode: "removed", balance: null });
        void wallet.refresh();
      } else {
        toast.show({ message: t("play.queue.removed.generic") });
      }
    },
    onLeftElsewhere: () => toast.show({ message: t("play.queue.cancelledElsewhere") }),
    onFoundElsewhere: () => void refreshActive(),
    onFound: () => {
      void wallet.refresh();
      void refreshActive();
    },
  });

  const searching = queue.state.kind === "waiting" || queue.state.kind === "offline";

  // `waiting` counts: 30 s in the lobby, 15 s while searching; only while the tab is visible.
  useEffect(() => {
    const id = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void loadTiers();
      },
      searching ? REFRESH_SEARCH_MS : REFRESH_MS,
    );
    return () => window.clearInterval(id);
  }, [searching, loadTiers]);

  // queue.join answered with `waiting`: remember the choice for "Play again" and close PL-03.
  useEffect(() => {
    if (queue.state.kind !== "waiting" || userId === null) return;
    writeJson("local", lastKey(userId), queue.state.req);
    setLast(queue.state.req);
    setSheet(null);
    setJoinError(null);
  }, [queue.state, userId]);

  const join = (req: QueueRequest) => {
    setJoinError(null);
    queue.join(req);
  };

  // ---- Bot ------------------------------------------------------------------------------------

  const startBot = async (level: BotLevel, variant: Variant, length: number, entry: number) => {
    if (botInFlight) return;
    setBotInFlight(true);
    setBotError(null);
    try {
      const created = await api.matches.startBot(level, variant, length, entry);
      if (entry > 0) void wallet.refresh();
      markFreshMatch(created.match_id, null);
      void refreshActive();
      // Navigate with the sheet still open: closing it first would pop its history entry and race
      // the push (the route unmounts the sheet anyway).
      router.push(`/match/${created.match_id}`);
    } catch (error) {
      if (handleAuthError(error)) return;
      const e = toApiError(error);
      if (e.code === "MATCH_IN_PROGRESS" && typeof e.details.match_id === "string") {
        const id = e.details.match_id;
        void refreshActive();
        if (botRetry) {
          // The first try succeeded before the network dropped (§3.6 step 5): open that match.
          router.push(`/match/${id}`);
          return;
        }
        setBotError(
          <>
            {t("play.error.inProgress")}{" "}
            <Button size="small" variant="text" onClick={() => router.push(`/match/${id}`)}>
              {t("play.error.returnToMatch")}
            </Button>
          </>,
        );
      } else if (e.code === "BOT_ENTRY_CHANGED") {
        // Nothing was charged: show the new cost and let the player confirm again (§9).
        const now = typeof e.details.entry === "number" ? e.details.entry : 0;
        const prize = typeof e.details.prize === "number" ? e.details.prize : 0;
        setBotEntryNow({ enabled: now > 0, entry: now, prize: now > 0 ? prize : 0 });
        setBotError(t("errors.match.botEntryChanged"));
      } else if (e.code === "WALLET_INSUFFICIENT") {
        setBotError(t("errors.wallet.insufficient"));
        void wallet.refresh();
      } else if (e.code === "ACCOUNT_SUSPENDED") {
        setBotError(t("account.suspended.actionBlocked"));
        void reloadMe();
      } else if (e.code === "MATCH_LENGTH_NOT_ALLOWED") {
        const allowed = Array.isArray(e.details.allowed) ? (e.details.allowed as unknown[]).filter((n): n is number => typeof n === "number") : null;
        if (allowed) setBotLengths(allowed);
        setSheet((s) => (s?.step === "bot" ? { ...s, length: null, notice: t("play.error.optionGone") } : s));
      } else if (e.code === "NETWORK") {
        setBotRetry(true);
        setBotError(t("errors.network"));
      } else if (e.code === "VALIDATION") {
        setBotError(t("errors.validation"));
      } else {
        const text = errorText(e);
        setBotError(text.code ? `${text.message} (${t("common.errorCode", { code: text.code })})` : text.message);
      }
    } finally {
      setBotInFlight(false);
    }
  };

  // ---- Entry points with query (MA-13 "Play again", "Search again", PL-05 from the match) ----

  useEffect(() => {
    if (!tiers) return;
    const parse = (value: string | null) => value?.split(":") ?? null;
    const again = parse(params.get("again"));
    const bot = parse(params.get("bot"));
    if (params.get("from") === "loss") setAfterLoss(true);
    if (again && again.length === 3) {
      const [tierId, variant, length] = [Number(again[0]), again[1] ?? "", Number(again[2])];
      if (tierById(tierId) && isVariant(variant) && Number.isInteger(length)) setSheet({ step: "confirm", tierId, variant, length });
    } else if (params.get("setup")) {
      const s = parse(params.get("setup")) ?? [];
      const variant = s[1] ?? "";
      setSheet({ step: "setup", tierId: Number(s[0]) || null, variant: isVariant(variant) ? variant : null, length: Number(s[2]) || null });
    } else if (bot) {
      // `bot=variant:length[:level]`: MA-13b "Play again" opens PL-04 at its cost step (P-03).
      const variant = bot[0] ?? "";
      const level = bot[2] ?? "";
      setSheet({ step: "bot", level: isBotLevel(level) ? level : null, variant: isVariant(variant) ? variant : null, length: Number(bot[1]) || null });
    } else {
      return;
    }
    router.replace("/play");
    // Once, when tiers are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers]);

  // ---- Blocking reasons (play.md §5) ------------------------------------------------------------

  const suspended = me?.status === "suspended";
  const inMatch = Boolean(active?.match_id);
  const blockedKind: "unsupported" | "suspended" | "inMatch" | "offline" | null = !webgl
    ? "unsupported"
    : suspended
      ? "suspended"
      : inMatch
        ? "inMatch"
        : !online
          ? "offline"
          : null;
  const blockedId = blockedKind ? "play-blocked" : null;

  const blockedNotice = blockedKind && (
    <div id="play-blocked">
      {blockedKind === "unsupported" && (
        <Banner severity="warning" action={{ label: t("play.unsupported.details"), onClick: () => setUnsupportedOpen(true) }}>
          {t("play.unsupported.reason")}
        </Banner>
      )}
      {/* The shell already shows the suspension and offline banners (with "Details"): here only the
          reason, as the aria-describedby target of the play buttons (P-09). */}
      {blockedKind === "suspended" && (
        <InfoLine icon={WarningIcon} tone="primary">
          {t("account.suspended.actionBlocked")}
        </InfoLine>
      )}
      {blockedKind === "inMatch" && <Banner severity="info">{t("play.inMatch.reason")}</Banner>}
      {blockedKind === "offline" && (
        <InfoLine icon={OfflineIcon} tone="primary">
          {t("net.offlineAction")}
        </InfoLine>
      )}
    </div>
  );

  const joinBlocked = !online ? t("net.offlineAction") : queue.socketStatus !== "open" ? t("play.join.connecting") : null;
  const botBlocked = !online ? t("net.offlineAction") : null;

  const openTier = (tier: Tier) => {
    setJoinError(null);
    setSheet({ step: "setup", tierId: tier.id, variant: null, length: null });
  };
  const openBot = (variant: Variant | null = null, length: number | null = null) => {
    setBotError(null);
    setBotRetry(false);
    setSheet({ step: "bot", level: null, variant, length });
  };
  const dismissHint = () => {
    if (userId !== null) writeJson("local", hintKey(userId), true);
    setHintSeen(true);
  };

  const lastTier = last ? tierById(last.tier_id) : null;
  const searchReq = queue.state.kind === "waiting" || queue.state.kind === "offline" ? queue.state.req : null;
  const searchTier = searchReq ? tierById(searchReq.tier_id) : null;

  const onlineSection = (
    <section aria-labelledby="play-online" className="lobby-online">
      <Typography id="play-online" variant="h4" component="h2" sx={{ mb: 1.5 }}>
        {t("play.online.title")}
      </Typography>
      {tiersError && !tiers ? (
        <Card>
          <ErrorState
            kind={online ? "error" : "offline"}
            message={online ? t("play.tiers.loadError") : t("net.offline")}
            code={tiersError.code !== "NETWORK" ? tiersError.code : undefined}
            onRetry={() => void loadTiers()}
          />
        </Card>
      ) : tiers === null ? (
        <div aria-busy="true">
          <TierGrid aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <TierCardSkeleton />
              </li>
            ))}
          </TierGrid>
        </div>
      ) : tiers.length === 0 ? (
        <Card>
          <EmptyState message={t("play.tiers.empty")} />
        </Card>
      ) : (
        <>
          <TierGrid>
            {tiers.map((tier) => (
              <li key={tier.id}>
                <TierCard tier={tier} affordable={balance === null || balance >= tier.entry} blockedBy={blockedId} onOpen={() => openTier(tier)} />
              </li>
            ))}
          </TierGrid>
          {(!online || tiersError) && tiersAt !== null && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              {t("common.lastUpdated", { time: f.relative(new Date(tiersAt)) })}
            </Typography>
          )}
        </>
      )}
    </section>
  );

  return (
    <SignedInShell topBar={{ title: t("play.title"), leading: "brand" }}>
      <Box sx={gutterStyles}>
        <Layout>
          <div className="lobby-top">
            {blockedNotice}
            {!hintSeen && (
              <Banner severity="info" onClose={dismissHint}>
                <Box component="span" sx={{ display: "inline-flex", gap: 0.75, alignItems: "flex-start" }}>
                  {t("play.hint.fees")}
                </Box>
              </Banner>
            )}
            {last && lastTier && (
              <PlayAgainCard
                summary={labels.summary(lastTier.entry, last.variant, last.length)}
                blockedBy={blockedId}
                onOpen={() => {
                  setJoinError(null);
                  setSheet(
                    balance !== null && balance < lastTier.entry
                      ? { step: "insufficient", tierId: lastTier.id, variant: last.variant, length: last.length, mode: "normal", balance: null }
                      : { step: "confirm", tierId: lastTier.id, variant: last.variant, length: last.length },
                  );
                }}
              />
            )}
          </div>
          {onlineSection}
          <div className="lobby-side">
            <PracticeCard blockedBy={blockedId} onOpen={() => openBot()} entry={botEntry?.enabled ? botEntry.entry : 0} />
            <RankCard elo={me?.elo ?? null} level={me?.level ?? null}>
              {lg && <TopPlayers rows={top} />}
            </RankCard>
          </div>
        </Layout>
      </Box>

      <PlaySheet
        state={sheet}
        onState={(next) => {
          if (next === null) setJoinError(null);
          setSheet(next);
        }}
        tiers={tiers ?? []}
        balance={balance}
        balanceFailed={wallet.failed && balance === null}
        onRetryBalance={() => void wallet.refresh()}
        botEntry={botEntry}
        afterLoss={afterLoss}
        coinPriceToman={wallet.summary?.coin_price_toman ?? config?.coin_price_toman ?? null}
        username={me?.username ?? null}
        botLengths={botLengths ?? config?.allowed_lengths ?? []}
        joining={queue.state.kind === "joining"}
        joinSlow={queue.state.kind === "joining" && queue.state.slow}
        joinError={joinError}
        onJoin={join}
        joinBlocked={joinBlocked}
        botInFlight={botInFlight}
        botError={botError}
        onStartBot={(level, variant, length, entry) => void startBot(level, variant, length, entry)}
        botBlocked={botBlocked}
      />

      <MatchmakingOverlay
        state={queue.state}
        waiting={searchTier?.waiting ?? null}
        payout={searchTier?.payout ?? null}
        onCancel={queue.cancel}
        onChangeTable={() => {
          const req = searchReq;
          queue.cancel();
          if (req) setSheet({ step: "setup", tierId: req.tier_id, variant: req.variant, length: req.length });
        }}
        onPlayBot={() => {
          const req = searchReq;
          queue.cancel();
          openBot(req?.variant ?? null, req?.length ?? null);
        }}
        onGo={(found) => openMatch(found)}
        onCancelMatch={(found) => openMatch(found, "?cancel=1")}
      />

      <BottomSheet open={unsupportedOpen} onClose={() => setUnsupportedOpen(false)} title={t("match.unsupported.title")}>
        <Typography>{t("match.unsupported.body")}</Typography>
      </BottomSheet>
    </SignedInShell>
  );
}
