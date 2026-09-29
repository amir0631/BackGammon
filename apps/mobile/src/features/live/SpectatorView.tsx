"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SPECTATOR_LANE, SPECTATOR_REACTION_COOLDOWN_MS, spectateJoinOutcome, type SpectateUnavailable } from "@bg/api-client";
import { avatarSize, feedbackTiming, iconSize, layout, radii, zIndex } from "@bg/design-tokens";
import { initialPosition, pipCount, readClock, toViewerPoint, type Player } from "@bg/game-core";
import { isolate } from "@bg/i18n";
import type { MatchEndedOut, MatchSummary, ServerEnvelope } from "@bg/protocol";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { BackIcon, CoinIcon, EyeIcon, InfoIcon, OfflineIcon, TournamentsIcon, WarningIcon } from "@/components/icons";
import { MenuIcon, ReactionIcon, ShieldIcon } from "@/components/icons/game";
import { Avatar } from "@/components/profile/Avatar";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { CopyButton } from "@/components/wallet/CopyButton";
import { InfoLine } from "@/components/wallet/InfoLine";
import { usePublicConfig } from "@/lib/config";
import { useDevicePref, usePrefs } from "@/lib/prefs";
import { useGameSocket, useMatchSnapshot } from "@/lib/socket";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { mqXs, safeInsetBottom, safeInsetTop, visuallyHidden } from "@/theme/layout";
import { useReducedMotion } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";
import { BoardStage, loadPhysics } from "../match/BoardStage";
import { MatchLoader } from "../match/MatchLoader";
import { EMOJI, FREE_EMOJIS } from "../match/emoji";
import { MoveHistory } from "../match/panels";
import { ClockDisplay, PlayerBar, SeedText, StatusLine } from "../match/parts";
import { useSceneLabels } from "../match/useSceneLabels";
import { useGameLabels } from "../play/labels";
import { PredictionPanel, PredictionSheets, useMatchLine, type PredictionPlayer } from "../predictions/PredictionPanel";
import { usePredictionFlow } from "../predictions/usePredictionFlow";

// LV-03 Spectator view on `/match/[id]` (live.md §3.2–§3.6, §4). Read-only: the board gets no input,
// and no roll, confirm, undo, cube, or resign control exists here. Joins with `spectate.join`
// through the shared socket; `spectate.state` and the players' events drive the same game-core
// store the player view uses. Player A sits at the bottom (§10 Q9), matching the list and score
// order. Predictions (predictions.md PR-01 … PR-03): a sheet at `sm`, the first side-panel tab at
// `md`/`lg`, PR-02 as a sheet / centered dialog, and the result inside the match-ended card.

const LANDSCAPE_PHONE = `@media (orientation: landscape) and (max-height: ${layout.compactHeight - 0.02}px)`;
const WIDE = `@media (min-width: 900px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`;
const WIDEST = `@media (min-width: 1280px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`;

const Screen = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "grid",
    height: "100dvh",
    width: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    backgroundColor: t.background,
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto auto auto minmax(min(45svh, 100vw), 1fr) auto auto",
    gridTemplateAreas: `"top" "banner" "opp" "board" "own" "actions"`,
    "& .s-info": { display: "contents" },
    "& .s-top": { gridArea: "top" },
    "& .s-banner": { gridArea: "banner", minWidth: 0 },
    "& .s-opp": { gridArea: "opp", minWidth: 0, containerType: "inline-size", containerName: "pbar" },
    "& .s-board": { gridArea: "board", minHeight: 0, minWidth: 0, position: "relative" },
    "& .s-own": { gridArea: "own", minWidth: 0, containerType: "inline-size", containerName: "pbar" },
    "& .s-actions": { gridArea: "actions" },
    "& .s-end, & .s-start": { display: "none" },
    [LANDSCAPE_PHONE]: {
      overflowY: "hidden",
      gridTemplateColumns: "minmax(min(10rem, 22vw), min(12rem, 24vw)) minmax(55vw, 1fr) minmax(min(7.5rem, 17vw), min(8.5rem, 20vw))",
      gridTemplateRows: "minmax(0, 1fr)",
      gridTemplateAreas: `"info board actions"`,
      "& .s-info": { display: "flex", flexDirection: "column", gridArea: "info", minHeight: 0, minWidth: 0, overflowY: "auto", overflowX: "hidden" },
      "& .s-actions": { borderBlockStart: 0, borderInlineStart: `1px solid ${t.outlineSubtle}`, minHeight: 0, overflowY: "auto" },
    },
    [WIDE]: {
      gridTemplateColumns: `minmax(0, 1fr) ${layout.sidePanelWidth}px`,
      gridTemplateRows: "auto auto auto minmax(min(45svh, 60vw), 1fr) auto auto",
      gridTemplateAreas: `"top end" "banner end" "opp end" "board end" "own end" "actions end"`,
      maxWidth: layout.shellMaxWidth,
      marginInline: "auto",
      "& .s-end": { display: "flex", gridArea: "end", borderInlineStart: `1px solid ${t.outlineSubtle}` },
    },
    // `lg` (live.md §6, review LV-01): board plus two side panels, no tabs. Start: move history
    // and the players' reactions log. End: spectators (count, reactions) and the prediction pool.
    [WIDEST]: {
      gridTemplateColumns: `${layout.sidePanelWidth}px minmax(0, 1fr) ${layout.sidePanelWidth}px`,
      gridTemplateAreas: `"start top end" "start banner end" "start opp end" "start board end" "start own end" "start actions end"`,
      "& .s-start": { display: "flex", gridArea: "start", borderInlineEnd: `1px solid ${t.outlineSubtle}` },
    },
  };
});

const TopStrip = styled("header")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    minHeight: 48,
    paddingBlockStart: safeInsetTop,
    paddingInline: theme.spacing(0.5),
    backgroundColor: t.surface,
    "& .s-mid": { flex: "1 1 auto", minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "center", columnGap: theme.spacing(1) },
  };
});

const ActionRow = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1, 1.5),
    paddingBlockEnd: `calc(${theme.spacing(1)} + ${safeInsetBottom})`,
    backgroundColor: t.surface,
    borderBlockStart: `1px solid ${t.outlineSubtle}`,
    "& .s-buttons": { display: "flex", gap: theme.spacing(1), alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" },
    "& .s-buttons > .s-grow": { flex: "1 1 auto" },
    "& .s-lane": { display: "flex", justifyContent: "flex-end", gap: theme.spacing(0.5), minHeight: 36 },
    [LANDSCAPE_PHONE]: {
      justifyContent: "flex-end",
      "& .s-buttons": { flexDirection: "column", alignItems: "stretch" },
      "& .s-lane": { flexDirection: "column", alignItems: "flex-end" },
    },
  };
});

const LaneItem = styled("span")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceRaised,
    border: `1px solid ${t.outlineSubtle}`,
    fontSize: "1.25rem",
    "&[data-motion='true']": { animation: "bgLaneUp 2s ease-out forwards" },
    "&[data-motion='false']": { animation: "bgLaneFade 2s linear forwards" },
    "@keyframes bgLaneUp": { from: { opacity: 0, transform: "translateY(8px)" }, "15%": { opacity: 1, transform: "translateY(0)" }, "80%": { opacity: 1 }, to: { opacity: 0, transform: "translateY(-8px)" } },
    "@keyframes bgLaneFade": { from: { opacity: 1 }, "80%": { opacity: 1 }, to: { opacity: 0 } },
  };
});

const Panel = styled("aside")(({ theme }) => ({
  flexDirection: "column",
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  overflowY: "auto",
  minHeight: 0,
  backgroundColor: tokensOf(theme).surface,
  containerType: "inline-size",
}));

type SheetKind = "menu" | "reactions" | "peek";

const REACT_LOG_MAX = 30;

interface LaneEntry {
  id: number;
  key: string;
}

export interface SpectatorViewProps {
  matchId: string;
  summary: MatchSummary | null;
  /** The server says this account plays in the match: switch to the player view. */
  onPlayer: () => void;
  /** `not_live`: reload the summary (ended → MA-14; otherwise "not available"). */
  onNotLive: () => void;
}

export function SpectatorView({ matchId, summary, onPlayer, onNotLive }: SpectatorViewProps) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const labels = useGameLabels();
  const sceneLabels = useSceneLabels();
  const matchLine = useMatchLine();
  const reduced = useReducedMotion();
  const online = useOnline();
  const config = usePublicConfig();
  const { prefs, set: setPref } = usePrefs();
  const socket = useGameSocket();
  const [store, setStore] = useState(() => (socket.spectating && socket.match?.matchId === matchId ? socket.match : null));
  const snap = useMatchSnapshot(store);
  const view = snap.view;
  const wide = useMediaQuery(`(min-width: 900px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`);
  const widest = useMediaQuery(`(min-width: 1280px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`);

  const [unavailable, setUnavailable] = useState<SpectateUnavailable | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [physicsReady, setPhysicsReady] = useState(prefs.graphics_lite);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [peek, setPeek] = useState<number>(0);
  const [endTab, setEndTab] = useState(1);
  const [ended, setEnded] = useState<MatchEndedOut | null>(null);
  const [lane, setLane] = useState<LaneEntry[]>([]);
  /** The players' reactions, newest first, for the `lg` start panel (live.md §6). */
  const [reactLog, setReactLog] = useState<{ id: number; sender: number; text: string }[]>([]);
  const [recent, setRecent] = useState(0);
  const [reactionsOff, setReactionsOff] = useState(config ? !config.spectator_reactions_enabled : false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [waitNote, setWaitNote] = useState(false);
  const [bubbles, setBubbles] = useState<Record<number, { text: string; key: number } | null>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [lastMove, setLastMove] = useState<{ moves: number[][]; player: number; key: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showLane, setShowLane] = useDevicePref("showSpectatorReactions", true);
  const laneId = useRef(0);
  const graceWarned = useRef<Record<number, 30 | 10 | null>>({});

  const predictionsOn = config?.predictions_enabled ?? false;

  useEffect(() => {
    if (config && !config.spectator_reactions_enabled) setReactionsOff(true);
  }, [config]);

  // ---- Join (§3.2 step 2) ----
  const join = useCallback(() => {
    setUnavailable(null);
    void socket.spectate(matchId).then(setStore);
  }, [socket, matchId]);

  useEffect(() => {
    join();
    return () => {
      // Leaving the view sends `spectate.leave` (§3.2 step 8); no dialog, leaving costs nothing.
      socket.detach();
    };
    // Once per match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    if (prefs.graphics_lite) {
      setPhysicsReady(true);
      return;
    }
    void loadPhysics()
      .then(() => setPhysicsReady(true))
      .catch(() => setPhysicsReady(true));
  }, [prefs.graphics_lite]);

  // The pool, when predictions are on (predictions.md §3.1; live.md §3.4 step 1).
  const flow = usePredictionFlow({
    matchId,
    enabled: predictionsOn,
    ended: ended !== null,
    errorText: (code) => `${t("errors.generic")} (${t("common.errorCode", { code })})`,
  });
  const loadPool = flow.reload;
  const applyPool = flow.applyPool;
  const closePool = flow.closeNow;
  const poolWasOpen = Boolean(flow.totals?.open);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setAnnounce(text);
    window.setTimeout(() => setToast((x) => (x === text ? null : x)), feedbackTiming.toastMs);
  }, []);

  const nameOf = useCallback(
    (p: number) => {
      const pl = store?.getSnapshot().view?.players[p];
      return pl ? isolate(pl.username) : "";
    },
    [store],
  );

  // ---- Events (§3.2 step 4) ----
  const handle = useCallback(
    (env: ServerEnvelope) => {
      if (env.match_id !== matchId && !(env.type === "error" && env.match_id === null)) return;
      switch (env.type) {
        case "error": {
          const outcome = spectateJoinOutcome(env.payload);
          if (outcome === "player") onPlayer();
          else if (outcome === "notLive") {
            socket.detach();
            setStore(null);
            setUnavailable("notLive");
            onNotLive();
          }
          else if (outcome === "rejoin") join();
          else if (outcome) {
            socket.detach();
            setStore(null);
            setUnavailable(outcome);
          } else if (env.payload.code === "REACTION_REJECTED") {
            if (env.payload.details.reason === "disabled") setReactionsOff(true);
            else if (env.payload.details.reason === "rate") setCooldownUntil(Date.now() + SPECTATOR_REACTION_COOLDOWN_MS);
          }
          break;
        }
        case "spectate.state":
          setEnded(null);
          loadPool();
          break;
        case "pool.update":
          applyPool(env.payload);
          if (!env.payload.open) setAnnounce(t("predict.closed"));
          break;
        case "turn.rolled": {
          const p = env.payload;
          if (p.opening) {
            if (poolWasOpen) setAnnounce(t("predict.closed"));
            closePool();
          }
          if (p.player !== null) setAnnounce(t("match.rolled.theirs", { username: nameOf(p.player), a: f.number(p.dice[0] ?? 0), b: f.number(p.dice[1] ?? 0) }));
          break;
        }
        case "turn.moved":
          setLastMove({ moves: env.payload.moves, player: env.payload.player, key: `${env.seq}` });
          break;
        case "game.started":
          setLastMove(null);
          break;
        case "react.recv": {
          const p = env.payload;
          const text =
            p.kind === "emoji"
              ? `${EMOJI[p.key] ?? ""} ${t.has(`reactions.emoji.${p.key}`) ? t(`reactions.emoji.${p.key}`) : ""}`.trim()
              : t.has(`reactions.phrase.${p.key}`)
                ? t(`reactions.phrase.${p.key}`)
                : p.key;
          const key = Date.now();
          setBubbles((b) => ({ ...b, [p.sender]: { text, key } }));
          setAnnounce(t("match.reactions.received", { username: nameOf(p.sender), text }));
          setReactLog((log) => [{ id: key, sender: p.sender, text }, ...log].slice(0, REACT_LOG_MAX));
          window.setTimeout(() => setBubbles((b) => (b[p.sender]?.key === key ? { ...b, [p.sender]: null } : b)), 3000);
          break;
        }
        case "spectate.react": {
          const id = ++laneId.current;
          setRecent((n) => n + 1);
          setLane((l) => [...l.slice(-(SPECTATOR_LANE.max - 1)), { id, key: env.payload.key }]);
          window.setTimeout(() => setLane((l) => l.filter((x) => x.id !== id)), SPECTATOR_LANE.ms);
          break;
        }
        case "opponent.disconnected":
          graceWarned.current[env.payload.player] = null;
          setAnnounce(t("spectate.playerDisconnected", { username: nameOf(env.payload.player), time: f.clock(env.payload.grace_seconds) }));
          break;
        case "opponent.back":
          showToast(t("spectate.playerBack", { username: nameOf(env.payload.player) }));
          break;
        case "match.ended":
          setEnded(env.payload);
          setSheet(null);
          break;
        default:
          break;
      }
    },
    [matchId, onPlayer, onNotLive, join, socket, loadPool, applyPool, closePool, poolWasOpen, t, f, nameOf, showToast],
  );
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => socket.subscribe((env) => handleRef.current(env)), [socket]);

  // Grace warnings at 30 s and 10 s, announced once each (P§6.4).
  useEffect(() => {
    if (!view || view.status !== "active") return;
    for (const p of [0, 1] as Player[]) {
      const at = snap.grace[p] ?? null;
      if (view.players[p]?.connected || at === null) {
        graceWarned.current[p] = null;
        continue;
      }
      const left = Math.max(0, Math.ceil((at - now) / 1000));
      const bucket = left <= 10 ? 10 : left <= 30 ? 30 : null;
      if (bucket !== null && left > 0 && graceWarned.current[p] !== bucket) {
        graceWarned.current[p] = bucket;
        setAnnounce(t("match.opponent.warning", { seconds: f.number(bucket), username: nameOf(p) }));
      }
    }
  }, [now, view, snap.grace, t, f, nameOf]);

  // ---- Reactions (LV-04) ----
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const react = (key: string) => {
    if (cooldown > 0) {
      setWaitNote(true);
      return;
    }
    setWaitNote(false);
    socket.send("spectate.react", { emoji_key: key });
    setCooldownUntil(Date.now() + SPECTATOR_REACTION_COOLDOWN_MS);
    if (!wide) setSheet(null);
  };

  const poolOpen = Boolean(predictionsOn && flow.totals?.open && view?.status === "active" && ended === null && flow.blocked !== "player");
  // The panel stays reachable after the close when the viewer has a stake ("Your prediction").
  // …and stays mounted while PR-01/PR-02 is open or the close notice is unread, so a pool that
  // closes under the viewer shows "closed, nothing charged" in place instead of vanishing (PR-01).
  const entering = flow.step !== null || flow.closedWhileEntering;
  const poolVisible = Boolean(predictionsOn && flow.entry && ended === null && flow.blocked !== "player" && (poolOpen || flow.own || entering));
  const openPredict = () => {
    if (wide) setEndTab(0);
    flow.openPanel();
    if (widest) window.requestAnimationFrame(() => document.getElementById("sv-pool")?.scrollIntoView({ block: "nearest" }));
  };
  /** R (§6): the picker sheet on phones, the reactions tab at `md`, the always-visible grid at `lg`. */
  const openReactions = () => {
    if (widest) document.querySelector<HTMLButtonElement>("#sv-react-grid button")?.focus();
    else if (wide) setEndTab(2);
    else setSheet("reactions");
  };
  const selectEndTab = (v: number) => {
    setEndTab(v);
    if (v === 0) flow.openPanel();
    else if (tabValue === 0) flow.dismiss();
  };
  const reconnecting = (socket.status === "reconnecting" || !online) && ended === null && unavailable === null;

  // Keyboard (§6): P predictions, R reactions; no game shortcuts for spectators.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]") || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key.toLowerCase() === "p" && poolVisible) openPredict();
      else if (e.key.toLowerCase() === "r" && !reactionsOff) openReactions();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolVisible, reactionsOff, wide, widest]);

  const leave = () => router.push("/live");

  if (unavailable) return <SpectateUnavailableView kind={unavailable} onRetry={join} />;

  // ---- Derived ----
  const perspective: Player = 0;
  const clockReading = view ? readClock(view.clock, snap.clockAt, now) : null;
  const position = view?.position ?? initialPosition();
  const limit = snap.timeoutLimit ?? snap.rules?.max_consecutive_timeouts ?? null;

  const diceShow = view?.dice
    ? {
        key: `${view.gameNo}:${view.throwSeed ?? "s"}:${view.dice.join(",")}:${view.turn}`,
        values: view.dice,
        throwSeed: view.throwSeed ?? 0,
        thrower: (view.opening ? "both" : view.turn === perspective ? "self" : "opponent") as "self" | "opponent" | "both",
        animate: view.throwSeed !== null && sceneReady,
      }
    : null;
  const trails =
    lastMove && view?.phase !== "move"
      ? lastMove.moves.map(([a, b]) => (lastMove.player === perspective ? { from: a!, to: b! } : { from: toViewerPoint(a!), to: toViewerPoint(b!) }))
      : null;
  const moveHint = lastMove ? { player: lastMove.player as Player, moves: lastMove.moves, key: lastMove.key } : null;

  const barFor = (p: Player) => {
    const info = view?.players[p];
    if (!info || !view) return null;
    const running = clockReading?.actor === p;
    const bank = view.clock.bank[p] ?? 0;
    const graceAt = snap.grace[p] ?? null;
    const graceLeft = graceAt !== null ? Math.max(0, Math.ceil((graceAt - now) / 1000)) : null;
    const status: ReactNode[] = [];
    if (!info.connected && view.status === "active") {
      const warnNow = graceLeft !== null && graceLeft <= 30;
      status.push(
        <StatusLine key="dc" tone={warnNow ? "warning" : "info"} icon={warnNow ? WarningIcon : OfflineIcon}>
          {graceLeft !== null ? t("spectate.playerDisconnected", { username: isolate(info.username), time: `⁦${f.clock(graceLeft)}⁩` }) : t("match.opponent.disconnectedNoTime")}
        </StatusLine>,
      );
    }
    if (limit !== null && (view.timeouts[p] ?? 0) >= limit - 1 && (view.timeouts[p] ?? 0) > 0) status.push(<StatusLine key="to">{t("spectate.lastTimeout")}</StatusLine>);
    const pips = pipCount(position, p);
    const bubble = bubbles[p];
    return (
      <PlayerBar
        player={info}
        side={p}
        self={false}
        pips={pips}
        cube={view.cubeOwner === p && view.variant === "standard_cube" ? view.cubeValue : null}
        turn={view.turn === p && view.status === "active"}
        turnText={view.turn === p && view.status === "active" ? t("spectate.turnOf", { username: isolate(info.username) }) : null}
        status={status.length ? status : undefined}
        onPeek={() => {
          setPeek(p);
          setSheet("peek");
        }}
        label={t("spectate.barLabel", {
          name: isolate(info.username),
          pips: f.number(pips),
          time: running && clockReading ? f.clock(Math.ceil((clockReading.turnLeft || clockReading.bankLeft) / 1000)) : "—",
          bank: f.clock(Math.round(bank)),
        })}
        clock={clockReading ? <ClockDisplay reading={clockReading} running={running} bank={bank} /> : null}
        bubble={
          bubble ? (
            <Box
              role="presentation"
              sx={{
                position: "absolute",
                insetInlineEnd: 8,
                insetBlockStart: "50%",
                transform: "translateY(-50%)",
                zIndex: zIndex.hud + 1,
                px: 1.5,
                py: 0.75,
                borderRadius: "12px",
                bgcolor: "tokens.inverseSurface",
                color: "tokens.onInverseSurface",
                typography: "body2",
                maxWidth: "60%",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {bubble.text}
            </Box>
          ) : null
        }
      />
    );
  };

  const score = view ? t("live.row.score", { a: f.number(view.score[0] ?? 0), b: f.number(view.score[1] ?? 0) }) : "";
  const count = view?.spectators ?? 0;
  const loading = !sceneReady || !view;
  const tabValue = endTab === 0 && !poolVisible ? 1 : endTab;

  const reactionGrid = (
    <Stack spacing={1.5}>
      <InfoLine icon={InfoIcon}>{t("spectate.reactions.note")}</InfoLine>
      {cooldown > 0 && (
        <Typography variant="body2" role="status" color={waitNote ? "text.primary" : "text.secondary"}>
          {waitNote ? `${t("spectate.reactions.wait")} · ` : ""}
          {t("spectate.reactions.cooldown", { seconds: f.number(cooldown) })}
        </Typography>
      )}
      <Box role="list" id="sv-react-grid" sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 1 }}>
        {FREE_EMOJIS.map((key) => (
          <div role="listitem" key={key}>
            <Button
              variant="outlined"
              onClick={() => react(key)}
              aria-disabled={cooldown > 0 || undefined}
              aria-label={t(`reactions.emoji.${key}`)}
              sx={{ minWidth: 44, minHeight: 52, width: "100%", fontSize: "1.5rem", p: 0.5 }}
            >
              <span aria-hidden>{EMOJI[key]}</span>
            </Button>
          </div>
        ))}
      </Box>
    </Stack>
  );

  const predictPlayers: [PredictionPlayer, PredictionPlayer] = [0, 1].map((i) => ({
    username: view?.players[i]?.username ?? summary?.players[i]?.username ?? "",
    avatar: view?.players[i]?.avatar ?? "",
    elo: view?.players[i]?.elo ?? 0,
  })) as [PredictionPlayer, PredictionPlayer];
  const poolPanel = <PredictionPanel flow={flow} players={predictPlayers} ended={ended} />;

  const infoPanel = view ? (
    <Stack spacing={1.5}>
      <Typography variant="body1">
        {labels.variant(view.variant)}
        {t("common.listSep")}
        {labels.length(view.length)}
      </Typography>
      {view.entry > 0 && <Typography variant="body2" color="text.secondary">{t("spectate.info.entry", { entry: f.number(view.entry) })}</Typography>}
      {view.entry === 0 && summary?.is_bot === false && (
        <InfoLine icon={TournamentsIcon}>{t("spectate.info.tournament")}</InfoLine>
      )}
      {(config?.spectator_delay_seconds ?? 0) > 0 && <InfoLine>{t("spectate.info.delayed", { seconds: f.number(config?.spectator_delay_seconds ?? 0) })}</InfoLine>}
      <Box>
        <Typography variant="labelSmall" component="p" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <ShieldIcon sx={{ fontSize: iconSize.sm }} />
          {t("spectate.info.seedCommit")}
        </Typography>
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}>
          <SeedText value={view.seedCommit} label={t("spectate.info.seedCommit")} />
          <CopyButton value={view.seedCommit} label={t("common.copy")} />
        </Stack>
      </Box>
    </Stack>
  ) : null;

  return (
    <Screen>
      <div className="s-info">
        <TopStrip className="s-top">
          <IconButton aria-label={t("spectate.back")} onClick={leave}>
            <BackIcon />
          </IconButton>
          <div className="s-mid">
            <Typography variant="label" component="p" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, m: 0 }}>
              <EyeIcon sx={{ fontSize: iconSize.sm }} aria-hidden />
              <span>{t("spectate.label")}</span>
              <Box component="span" sx={{ color: "text.secondary", [mqXs]: { display: "none" } }}>
                ({t("spectate.watching", { count })})
              </Box>
            </Typography>
            {view && (
              <Typography variant="h4" component="h1" aria-label={`${nameOf(0)} ${score} ${nameOf(1)}`}>
                <bdi>{score}</bdi>
              </Typography>
            )}
            {view && (
              <Typography variant="caption" color="text.secondary">
                {labels.length(view.length)}
              </Typography>
            )}
          </div>
          <IconButton aria-label={t("spectate.menuTitle")} onClick={() => setSheet("menu")}>
            <MenuIcon />
          </IconButton>
        </TopStrip>
        <div className="s-banner">
          {reconnecting && (
            <Stack direction="row" role="status" sx={{ alignItems: "center", gap: 1, px: 2, py: 1, bgcolor: "tokens.infoContainer", color: "tokens.onInfoContainer", flexWrap: "wrap" }}>
              <OfflineIcon sx={{ fontSize: iconSize.sm }} />
              <Typography variant="body2" sx={{ flex: "1 1 auto", color: "inherit" }}>
                {t("spectate.reconnecting", { n: f.number(Math.max(1, socket.attempt)) })}
              </Typography>
              <Button size="small" variant="outlined" color="inherit" onClick={socket.retryNow}>
                {t("spectate.retryNow")}
              </Button>
            </Stack>
          )}
        </div>
        <div className="s-opp">{view && barFor(1)}</div>
        <div className="s-own">{view && barFor(0)}</div>
      </div>

      <div className="s-board">
        <BoardStage
          label={reconnecting ? `${t("spectate.board")} · ${t("spectate.paused")}` : t("spectate.board")}
          onLoaded={() => setSceneLoaded(true)}
          position={position}
          perspective={perspective}
          lite={prefs.graphics_lite}
          reducedMotion={reduced}
          dice={diceShow}
          input={null}
          lastMove={trails}
          moveHint={moveHint}
          snapKey={snap.stateKey}
          labels={sceneLabels}
          themes={{ board: "default", checkers: [view?.players[0]?.checker_theme ?? "default", view?.players[1]?.checker_theme ?? "default"] }}
          onReady={() => setSceneReady(true)}
        >
          {reconnecting && view && (
            <Box sx={{ position: "absolute", insetInline: 0, insetBlockStart: 8, mx: "auto", width: "fit-content", px: 2, py: 0.75, borderRadius: `${radii.pill}px`, bgcolor: "tokens.surfaceRaised", border: 1, borderColor: "tokens.outline", zIndex: zIndex.hud }}>
              <Typography variant="label">{t("spectate.paused")}</Typography>
            </Box>
          )}
          {toast && (
            <Box role="presentation" sx={{ position: "absolute", insetInline: 8, insetBlockStart: 8, zIndex: zIndex.snackbar, display: "flex", justifyContent: "center" }}>
              <Typography variant="body2" sx={{ px: 2, py: 1, borderRadius: "10px", bgcolor: "tokens.inverseSurface", color: "tokens.onInverseSurface" }}>
                {toast}
              </Typography>
            </Box>
          )}
          {ended && view && (
            <EndedCard ended={ended} names={[view.players[0]?.username ?? "", view.players[1]?.username ?? ""]} onBack={leave} prediction={predictionsOn && flow.own ? poolPanel : null} />
          )}
          {loading && (
            <MatchLoader
              header={
                summary ? (
                  <Typography variant="body1">
                    <bdi dir="ltr">{summary.players[0]?.username}</bdi> – <bdi dir="ltr">{summary.players[1]?.username}</bdi>
                  </Typography>
                ) : null
              }
              stage={!sceneLoaded ? 0 : !physicsReady ? 1 : !sceneReady ? 2 : 3}
              fresh={false}
              onCancel={leave}
              onRetry={() => window.location.reload()}
            />
          )}
        </BoardStage>
      </div>

      <ActionRow className="s-actions">
        {showLane && !reactionsOff && (
          <div className="s-lane" aria-hidden="true">
            {lane.map((x) => (
              <LaneItem key={x.id} data-motion={reduced ? "false" : "true"}>
                {EMOJI[x.key] ?? "⭐"}
              </LaneItem>
            ))}
          </div>
        )}
        <div className="s-buttons">
          <span className="s-grow" />
          {poolVisible && (
            <Button variant={poolOpen && !flow.own ? "contained" : "outlined"} size="large" startIcon={<CoinIcon />} onClick={openPredict} sx={{ minHeight: 48 }}>
              {flow.own ? t("predict.yourPrediction") : t("predict.button")}
            </Button>
          )}
          {!reactionsOff && (
            <Button
              variant="outlined"
              size="large"
              startIcon={<ReactionIcon />}
              onClick={() => setSheet("reactions")}
              disabled={ended !== null || reconnecting}
              aria-label={cooldown > 0 ? t("spectate.reactions.cooldown", { seconds: f.number(cooldown) }) : t("spectate.reactions.button")}
              sx={{ minHeight: 48 }}
            >
              {cooldown > 0 ? <bdi dir="ltr">{f.number(cooldown)}</bdi> : t("spectate.reactions.button")}
            </Button>
          )}
        </div>
      </ActionRow>

      {widest && (
        <Panel className="s-start" aria-label={t("spectate.menu.moves")}>
          <section aria-labelledby="sv-start-moves">
            <Typography id="sv-start-moves" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
              {t("spectate.menu.moves")}
            </Typography>
            <MoveHistory view={view} history={snap.history} you={null} />
          </section>
          <section aria-labelledby="sv-start-reactions">
            <Typography id="sv-start-reactions" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
              {t("spectate.panel.playerReactions")}
            </Typography>
            {reactLog.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("spectate.panel.noReactions")}
              </Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.5 }}>
                {reactLog.map((r) => (
                  <Typography key={r.id} component="li" variant="body2">
                    {t("match.reactions.received", { username: nameOf(r.sender), text: r.text })}
                  </Typography>
                ))}
              </Box>
            )}
          </section>
        </Panel>
      )}

      {widest ? (
        <Panel className="s-end" aria-label={t("spectate.reactions.lane")}>
          <section aria-labelledby="sv-end-spect">
            <Typography id="sv-end-spect" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
              {t("spectate.reactions.lane")}
            </Typography>
            <Stack spacing={1.5}>
              <InfoLine icon={EyeIcon}>{t("spectate.watching", { count })}</InfoLine>
              <Typography variant="body2" color="text.secondary">
                {t("spectate.reactions.recent", { count: recent })}
              </Typography>
              {reactionsOff ? <InfoLine>{t("spectate.reactions.off")}</InfoLine> : reactionGrid}
            </Stack>
          </section>
          {poolVisible && (
            <section id="sv-pool" aria-labelledby="sv-end-pool">
              <Typography id="sv-end-pool" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
                {flow.own ? t("predict.yourPrediction") : t("predict.title")}
              </Typography>
              {poolPanel}
            </section>
          )}
          <section aria-labelledby="sv-end-info">
            <Typography id="sv-end-info" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
              {t("spectate.menu.info")}
            </Typography>
            {infoPanel}
          </section>
        </Panel>
      ) : wide && (
        <Panel className="s-end" aria-label={t("spectate.menu.info")}>
          <Tabs value={tabValue} onChange={(_, v: number) => selectEndTab(v)} variant="fullWidth" aria-label={t("spectate.menu.info")}>
            {poolVisible && <Tab value={0} label={flow.own ? t("predict.yourPrediction") : t("predict.button")} />}
            <Tab value={1} label={t("spectate.menu.moves")} />
            <Tab value={2} label={t("spectate.reactions.lane")} />
            <Tab value={3} label={t("spectate.menu.info")} />
          </Tabs>
          <div role="tabpanel">
            {tabValue === 0 ? (
              poolPanel
            ) : tabValue === 1 ? (
              <MoveHistory view={view} history={snap.history} you={null} />
            ) : tabValue === 2 ? (
              <Stack spacing={1.5}>
                <InfoLine icon={EyeIcon}>{t("spectate.watching", { count })}</InfoLine>
                <Typography variant="body2" color="text.secondary">
                  {t("spectate.reactions.recent", { count: recent })}
                </Typography>
                {reactionsOff ? <InfoLine>{t("spectate.reactions.off")}</InfoLine> : reactionGrid}
              </Stack>
            ) : (
              infoPanel
            )}
          </div>
        </Panel>
      )}

      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announce}
      </span>

      <BottomSheet open={sheet === "menu"} onClose={() => setSheet(null)} title={t("spectate.menuTitle")}>
        <Stack spacing={2.5}>
          <section aria-labelledby="sv-info">
            <Typography id="sv-info" variant="labelSmall" component="h3" color="text.secondary" sx={{ mb: 1 }}>
              {t("spectate.menu.info")}
            </Typography>
            {infoPanel}
          </section>
          <section aria-labelledby="sv-moves">
            <Typography id="sv-moves" variant="labelSmall" component="h3" color="text.secondary" sx={{ mb: 1 }}>
              {t("spectate.menu.moves")}
            </Typography>
            <MoveHistory view={view} history={snap.history} you={null} />
          </section>
          <SwitchRow label={t("settings.sound.label")} checked={prefs.sound} onChange={(v) => setPref("sound", v)} />
          <SwitchRow label={t("settings.lite.label")} description={t("settings.lite.desc")} checked={prefs.graphics_lite} onChange={(v) => setPref("graphics_lite", v)} />
          {reactionsOff ? (
            <InfoLine>{t("spectate.reactions.off")}</InfoLine>
          ) : (
            <SwitchRow label={t("spectate.menu.showReactions")} checked={showLane} onChange={setShowLane} />
          )}
          <InfoLine icon={InfoIcon}>{t("spectate.menu.shortcuts")}</InfoLine>
          <Button variant="outlined" onClick={leave}>
            {t("spectate.menu.leave")}
          </Button>
        </Stack>
      </BottomSheet>

      <BottomSheet open={sheet === "reactions" && !wide} onClose={() => setSheet(null)} title={t("spectate.reactions.button")}>
        {reactionGrid}
      </BottomSheet>

      <BottomSheet open={flow.step === "panel" && !wide && poolVisible} onClose={flow.dismiss} title={t("predict.title")}>
        {poolPanel}
      </BottomSheet>
      {view && (
        <PredictionSheets
          flow={flow}
          players={predictPlayers}
          matchLine={matchLine(predictPlayers[0].username, predictPlayers[1].username, view.variant, view.length)}
          entry={view.entry}
        />
      )}

      <BottomSheet open={sheet === "peek"} onClose={() => setSheet(null)} title={view?.players[peek]?.username ?? ""}>
        {view?.players[peek] && (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Avatar avatarKey={view.players[peek]!.avatar} size={avatarSize.md} />
              <Typography variant="body2" color="text.secondary">
                {t("match.bar.levelElo", { level: f.number(view.players[peek]!.level), elo: f.number(view.players[peek]!.elo) })}
              </Typography>
            </Stack>
            <Button variant="outlined" component={NextLink} href={`/profile/${encodeURIComponent(view.players[peek]!.username)}`}>
              {t("match.peek.viewProfile")}
            </Button>
          </Stack>
        )}
      </BottomSheet>
    </Screen>
  );
}

/** LV-07 (live.md §4): over the lower part of the board, scrolling within itself when taller; no replay link, no share. */
function EndedCard({ ended, names, onBack, prediction }: { ended: MatchEndedOut; names: [string, string]; onBack: () => void; prediction: ReactNode }) {
  const t = useTranslations();
  const f = useFormat();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const aborted = ended.winner === null;
  const reason = ended.reason ?? "";
  const reasonText = aborted
    ? t("spectate.ended.aborted")
    : reason === "resign"
      ? t("spectate.ended.reason.resign")
      : reason.endsWith("timeouts") || reason === "timeout"
        ? t("spectate.ended.reason.timeout")
        : reason.endsWith("disconnect")
          ? t("spectate.ended.reason.disconnect")
          : t("spectate.ended.reason.normal");
  const score = t("live.row.score", { a: f.number(ended.score[0] ?? 0), b: f.number(ended.score[1] ?? 0) });
  return (
    <Box
      role="region"
      aria-labelledby="sv-ended"
      sx={{
        position: "absolute",
        insetInline: 8,
        insetBlockEnd: 8,
        zIndex: zIndex.hud + 2,
        p: 2,
        borderRadius: `${radii.lg}px`,
        bgcolor: "tokens.surfaceRaised",
        border: 1,
        borderColor: "tokens.outline",
        boxShadow: 4,
        maxWidth: 480,
        mx: "auto",
        // Never taller than the board region, whose root clips (overflow: hidden): in landscape
        // phones and at 200% text the card scrolls inside itself, so the focused heading, the
        // prediction result, and both buttons stay reachable (live.md AC 22, review LV-02).
        maxHeight: "calc(100% - 16px)",
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <Stack spacing={1}>
        <Typography id="sv-ended" ref={titleRef} tabIndex={-1} variant="h4" component="h2" sx={{ "&:focus": { outline: "none" } }}>
          {aborted ? t("spectate.ended.title") : t("spectate.ended.won", { username: isolate(names[ended.winner ?? 0] ?? "") })}
        </Typography>
        {!aborted && (
          <Typography variant="body1">
            <bdi>{t("spectate.ended.score", { score })}</bdi>
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {reasonText}
        </Typography>
        {prediction}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button variant="contained" onClick={onBack}>
            {t("spectate.back")}
          </Button>
          <Button variant="text" component={NextLink} href="/live">
            {t("spectate.ended.anotherMatch")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** LV-06 (live.md §4): in place on `/match/[id]`; no 3D scene is loaded. */
export function SpectateUnavailableView({ kind, onRetry }: { kind: SpectateUnavailable; onRetry?: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const titleKey = kind === "notLive" ? "notLive" : kind;
  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", p: 3, paddingBlockStart: `calc(${safeInsetTop} + 24px)` }}>
      <Stack spacing={2} sx={{ maxWidth: 480, alignItems: "flex-start" }}>
        <Typography ref={titleRef} tabIndex={-1} variant="h3" component="h1" sx={{ "&:focus": { outline: "none" } }}>
          {t(`spectate.${titleKey}.title`)}
        </Typography>
        <Typography>{t(`spectate.${titleKey}.body`)}</Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          {kind === "full" && onRetry && (
            <Button variant="contained" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          )}
          {kind === "disabled" ? (
            <Button variant="contained" onClick={() => router.back()}>
              {t("common.back")}
            </Button>
          ) : (
            <Button variant={kind === "full" ? "text" : "contained"} component={NextLink} href="/live">
              {t("spectate.back")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
