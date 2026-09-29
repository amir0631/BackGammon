"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import { feedbackTiming, iconSize, layout, zIndex } from "@bg/design-tokens";
import { canDouble, encode, initialPosition, isWaitingForOpponent, pipCount, readClock, toViewerPoint, TurnBuilder, type Player } from "@bg/game-core";
import { isolate } from "@bg/i18n";
import type { MatchEndedOut, PhraseText, ServerEnvelope } from "@bg/protocol";
import { BackIcon, EyeIcon, WarningIcon } from "@/components/icons";
import { CubeIcon, MenuIcon, ReactionIcon, UndoIcon } from "@/components/icons/game";
import { useActiveMatch } from "@/lib/activeMatch";
import { clearFreshMatch } from "@/lib/match/fresh";
import { usePrefs } from "@/lib/prefs";
import { useSession } from "@/lib/session";
import { useGameSocket, useMatchSnapshot } from "@/lib/socket";
import { useFormat } from "@/lib/useFormat";
import { isOwnBack } from "@/lib/useCloseOnBack";
import { useOnline } from "@/lib/useOnline";
import { mqXs, safeInsetBottom, safeInsetTop, visuallyHidden } from "@/theme/layout";
import { useReducedMotion } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import { BoardStage, loadPhysics } from "./BoardStage";
import { MatchLoader } from "./MatchLoader";
import { MatchOverlays, type SheetKind } from "./MatchOverlays";
import { EMOJI, FREE_EMOJIS, FREE_PHRASES, MatchInfo, MoveHistory, ReactionPicker, useNames, useNotation } from "./panels";
import { ClockDisplay, CubeChip, DiceChips, PlayerBar, StatusLine } from "./parts";
import { useSceneLabels } from "./useSceneLabels";

// MA-02 game screen (match.md §3, §4). Driven by the shared GameSocket and the game-core store:
// the client never decides dice, legality, timers, or results (§2 rule 1). Local steps before
// Confirm come from TurnBuilder over the server's legal plays.
//
// Layout (§3.2, §6): portrait phones stack top strip, opponent bar, board, own bar, action bar;
// the primary actions live in the bottom 40 %. Landscape phones: bars and header in a start column,
// actions in an end column. Wide screens: the board with an end panel (moves, reactions, info),
// plus a start panel from 1280 px.

const Screen = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "grid",
    height: "100dvh",
    width: "100%",
    overflow: "hidden",
    backgroundColor: t.background,
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto auto minmax(0, 1fr) auto auto",
    gridTemplateAreas: `"top" "opp" "board" "own" "actions"`,
    "& .m-top": { gridArea: "top" },
    "& .m-opp": { gridArea: "opp", minWidth: 0, containerType: "inline-size", containerName: "pbar" },
    "& .m-board": { gridArea: "board", minHeight: 0, minWidth: 0, position: "relative" },
    "& .m-own": { gridArea: "own", minWidth: 0, containerType: "inline-size", containerName: "pbar" },
    "& .m-actions": { gridArea: "actions" },
    "& .m-start, & .m-end": { display: "none" },
    // Landscape phones: header and bars on the start side, actions on the end side.
    [`@media (orientation: landscape) and (max-height: ${layout.compactHeight - 0.02}px)`]: {
      gridTemplateColumns: "minmax(12rem, 16rem) minmax(0, 1fr) minmax(9rem, 11rem)",
      gridTemplateRows: "auto auto auto minmax(0, 1fr)",
      gridTemplateAreas: `"top board actions" "opp board actions" "own board actions" ". board actions"`,
      "& .m-actions": { borderBlockStart: 0, borderInlineStart: `1px solid ${t.outlineSubtle}` },
    },
    // Wide landscape (tablets in landscape, desktop browsers): board + end panel.
    [`@media (min-width: 900px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`]: {
      gridTemplateColumns: `minmax(0, 1fr) ${layout.sidePanelWidth}px`,
      gridTemplateRows: "auto auto minmax(0, 1fr) auto auto",
      gridTemplateAreas: `"top end" "opp end" "board end" "own end" "actions end"`,
      "& .m-end": { display: "flex", gridArea: "end", borderInlineStart: `1px solid ${t.outlineSubtle}` },
    },
    [`@media (min-width: 1280px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`]: {
      gridTemplateColumns: `${layout.sidePanelWidth}px minmax(0, 1fr) ${layout.sidePanelWidth}px`,
      gridTemplateAreas: `"start top end" "start opp end" "start board end" "start own end" "start actions end"`,
      maxWidth: layout.shellMaxWidth,
      marginInline: "auto",
      "& .m-start": { display: "flex", gridArea: "start", borderInlineEnd: `1px solid ${t.outlineSubtle}` },
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
    "& .m-score": { flex: "1 1 auto", minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "center", columnGap: theme.spacing(1) },
    [mqXs]: { "& .m-spect": { display: "none" } },
  };
});

const ActionBar = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1, 1.5),
    paddingBlockEnd: `calc(${theme.spacing(1)} + ${safeInsetBottom})`,
    backgroundColor: t.surface,
    borderBlockStart: `1px solid ${t.outlineSubtle}`,
    "& .m-slots": { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)", gap: theme.spacing(1), alignItems: "center" },
    "& .m-slots > *": { minWidth: 0 },
    // Side slots: icon over a short label, so words never break inside a narrow slot.
    "& .m-side": {
      flexDirection: "column",
      gap: theme.spacing(0.25),
      paddingInline: theme.spacing(0.5),
      minHeight: 56,
      width: "100%",
      ...theme.typography.labelSmall,
      overflowWrap: "normal",
      wordBreak: "normal",
      "& .MuiButton-startIcon": { margin: 0 },
    },
    "& .m-primary": { minHeight: 56 },
    // Landscape phones: a vertical column, primary in the lower half, reactions below it.
    [`@media (orientation: landscape) and (max-height: ${layout.compactHeight - 0.02}px)`]: {
      justifyContent: "flex-end",
      "& .m-slots": { gridTemplateColumns: "minmax(0, 1fr)", gridAutoFlow: "row" },
      "& .m-slot-start": { order: 1 },
      "& .m-slot-center": { order: 2 },
      "& .m-slot-end": { order: 3 },
    },
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

const Caption = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "absolute",
    insetInline: 0,
    insetBlockStart: theme.spacing(1),
    marginInline: "auto",
    width: "fit-content",
    maxWidth: `calc(100% - ${theme.spacing(4)})`,
    padding: theme.spacing(0.75, 2),
    borderRadius: 999,
    backgroundColor: t.surfaceRaised,
    border: `1px solid ${t.outline}`,
    textAlign: "center",
    zIndex: zIndex.hud,
    pointerEvents: "none",
  };
});

export interface LiveMatchProps {
  matchId: string;
  /** First entry to a new match: attach only once the scene is ready (§3.1 step 4). */
  fresh: boolean;
  /** Open the MA-19 cancel sheet at once (PL-07 race variant). */
  openCancel: boolean;
  /** For the MA-01 header before the state arrives. */
  header: ReactNode;
}

interface Toast {
  key: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

export function LiveMatch({ matchId, fresh, openCancel, header }: LiveMatchProps) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const labels = useGameLabels();
  const sceneLabels = useSceneLabels();
  const reduced = useReducedMotion();
  const online = useOnline();
  const { me } = useSession();
  const { prefs, set: setPref } = usePrefs();
  const socket = useGameSocket();
  const { refresh: refreshActive, clear: clearActive } = useActiveMatch();
  const [store, setStore] = useState(() => (socket.match?.matchId === matchId ? socket.match : null));
  const snap = useMatchSnapshot(store);
  const view = snap.view;
  const you = (view?.you ?? null) as Player | null;
  const opp = (you === null ? 1 : 1 - you) as Player;
  const names = useNames(view);
  const notation = useNotation();
  const wideEnd = useMediaQuery(`(min-width: 900px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`);

  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [physicsReady, setPhysicsReady] = useState(prefs.graphics_lite);
  const [sheet, setSheet] = useState<SheetKind | null>(openCancel ? "cancelMatch" : null);
  const [selected, setSelected] = useState<number | null>(null);
  const [, setVersion] = useState(0);
  const [inFlight, setInFlight] = useState<"roll" | "move" | "double" | "cube" | "resign" | null>(null);
  const [caption, setCaption] = useState<{ text: string; sub?: string; persist?: boolean } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, { text: string; key: number } | null>>({});
  const [notice, setNotice] = useState<Record<number, string | null>>({});
  const [warn, setWarn] = useState<Record<number, boolean>>({});
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [showOpp, setShowOpp] = useState(true);
  const [ended, setEnded] = useState<MatchEndedOut | null>(null);
  const [announce, setAnnounce] = useState("");
  const [lastOppMove, setLastOppMove] = useState<{ moves: number[][]; hits: boolean[]; player: number; key: string } | null>(null);
  const [resignError, setResignError] = useState<string | null>(null);
  const [phrases, setPhrases] = useState<PhraseText[]>([]);
  const [owned, setOwned] = useState<{ emojis: string[]; phrases: string[] }>({ emojis: [], phrases: [] });
  const [now, setNow] = useState(() => Date.now());
  const [attachedAt, setAttachedAt] = useState<number | null>(null);
  const [liteSuggested, setLiteSuggested] = useState(false);
  const toastKey = useRef(0);
  const reconnectFrom = useRef<number | null>(null);
  const wasReconnecting = useRef(false);

  const pushToast = useCallback((text: string, action?: Toast["action"]) => {
    const key = ++toastKey.current;
    setToasts((list) => [...list.slice(-1), { key, text, action }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.key !== key)), action ? feedbackTiming.toastWithActionMs : feedbackTiming.toastMs);
  }, []);

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (prefs.vibration && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
    },
    [prefs.vibration],
  );

  // ---- Attach (§3.1 step 4) --------------------------------------------------------------------

  const attach = useCallback(() => {
    void socket.attach(matchId).then((s) => {
      setStore(s);
      setAttachedAt((a) => a ?? Date.now());
    });
  }, [socket, matchId]);

  useEffect(() => {
    if (!fresh) attach();
    // Once per match id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    if (fresh && sceneReady && !store) {
      attach();
      clearFreshMatch(matchId);
    }
  }, [fresh, sceneReady, store, attach, matchId]);

  // Physics for the first throw (lite mode never throws).
  useEffect(() => {
    if (prefs.graphics_lite) {
      setPhysicsReady(true);
      return;
    }
    void loadPhysics()
      .then(() => setPhysicsReady(true))
      .catch(() => setPhysicsReady(true));
  }, [prefs.graphics_lite]);

  // Reaction packs and phrase texts (§3.9).
  useEffect(() => {
    api.shop.phrases().then((p) => setPhrases(p.results)).catch(() => undefined);
    Promise.all([api.shop.items("emoji_pack"), api.shop.items("phrase_pack")])
      .then(([e, p]) =>
        setOwned({
          emojis: e.results.filter((i) => i.owned).flatMap((i) => i.data.keys ?? []),
          phrases: p.results.filter((i) => i.owned).flatMap((i) => i.data.keys ?? []),
        }),
      )
      .catch(() => undefined);
  }, []);

  // One clock for the timers.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // ---- Turn builder ----------------------------------------------------------------------------

  const moving = Boolean(view && you !== null && view.status === "active" && view.phase === "move" && view.turn === you && view.dice && view.legal.length > 1);
  const turnKey = view && moving ? `${snap.stateKey}:${view.gameNo}:${encode(view.position)}:${view.dice?.join(",")}:${JSON.stringify(view.legal)}` : null;
  const builder = useMemo(() => {
    if (!turnKey || !view || you === null || !view.dice) return null;
    try {
      return new TurnBuilder(view.position, you, view.dice, view.legal);
    } catch {
      return null;
    }
    // A new builder per turn only; other events must not drop local steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  useEffect(() => {
    setSelected(null);
    if (builder) {
      const sources = builder.sources();
      if (sources.length === 1) setSelected(sources[0]!); // e.g. entering from the bar
    }
  }, [builder]);

  const doStep = (from: number, to: number) => {
    if (!builder) return;
    try {
      builder.move(from, to);
      setVersion((v) => v + 1);
      const next = builder.sources();
      setSelected(next.length === 1 && !builder.complete ? next[0]! : null);
    } catch {
      vibrate([30, 40, 30]);
    }
  };
  const undo = () => {
    if (!builder || inFlight) return;
    builder.undo();
    setSelected(null);
    setVersion((v) => v + 1);
  };

  // ---- Server events → UI (§3.3) ---------------------------------------------------------------

  const showCaption = useCallback((text: string, opts: { sub?: string; ms?: number; persist?: boolean } = {}) => {
    setCaption({ text, sub: opts.sub, persist: opts.persist });
    setAnnounce(opts.sub ? `${text}. ${opts.sub}` : text);
    if (!opts.persist) {
      const shown = text;
      window.setTimeout(() => setCaption((c) => (c && c.text === shown && !c.persist ? null : c)), opts.ms ?? 1800);
    }
  }, []);

  const handle = useCallback(
    (env: ServerEnvelope) => {
      if (env.match_id !== matchId && env.type !== "error") return;
      const v = store?.getSnapshot().view ?? null;
      const me_ = v?.you ?? null;
      const name = (p: number) => {
        const pl = v?.players[p];
        return pl ? (pl.is_bot ? labels.botName(pl.bot_level) : isolate(pl.username)) : "";
      };
      switch (env.type) {
        case "match.state":
          setInFlight(null);
          if (env.payload.phase !== "cube_offered") setSheet((s) => (s === "cancelMatch" || s === "menu" || s === "history" || s === "moveEntry" || s === "reactions" || s === "peek" || s === "leave" ? s : null));
          setWarn(() => {
            const limit = env.payload.rules.max_consecutive_timeouts;
            return { 0: (env.payload.timeouts[0] ?? 0) >= limit - 1, 1: (env.payload.timeouts[1] ?? 0) >= limit - 1 };
          });
          break;
        case "game.started":
          setLastOppMove(null);
          showCaption(t("match.game.number", { n: f.number(env.payload.game_no) }));
          if (env.payload.crawford) window.setTimeout(() => showCaption(t("match.crawford.banner"), { ms: 3000 }), 1500);
          break;
        case "turn.rolled": {
          const p = env.payload;
          setInFlight(null);
          if (p.opening) {
            const [a, b] = p.dice as [number, number];
            const yourDie = me_ === null ? a : me_ === 0 ? a : b;
            const theirDie = me_ === null ? b : me_ === 0 ? b : a;
            const sub = `${t("match.opening.yourDie", { value: f.number(yourDie) })} · ${t("match.opening.theirDie", { username: name(me_ === null ? 1 : 1 - me_), value: f.number(theirDie) })}`;
            if (a === b) showCaption(t("match.opening.tie"), { sub });
            else {
              const starter = a > b ? 0 : 1;
              const hi = Math.max(a, b);
              const lo = Math.min(a, b);
              showCaption(
                starter === me_ ? t("match.opening.youStart", { a: f.number(hi), b: f.number(lo) }) : t("match.opening.theyStart", { username: name(starter), a: f.number(hi), b: f.number(lo) }),
                { sub, ms: 2500 },
              );
              if (starter === me_) vibrate(60);
            }
            break;
          }
          const mine = p.player === me_;
          if (mine) {
            if (warn[p.player as number] && !notice[p.player as number]) setWarn((w) => ({ ...w, [p.player as number]: false }));
            if (p.legal.length === 1) showCaption(t("match.forced.yours"), { persist: true });
            else if (p.legal.length === 0) showCaption(t("match.noMove.yours"), { ms: 1600 });
            else setAnnounce(t("match.dice.label", { a: f.number(p.dice[0] ?? 0), b: f.number(p.dice[1] ?? 0) }));
          } else if (p.player !== null) {
            const who = name(p.player);
            if (p.legal.length === 1) showCaption(t("match.forced.theirs", { username: who }), { sub: t("match.rolled.theirs", { username: who, a: f.number(p.dice[0] ?? 0), b: f.number(p.dice[1] ?? 0) }) });
            else if (p.legal.length === 0) showCaption(t("match.noMove.theirs", { username: who }));
            else showCaption(t("match.rolled.theirs", { username: who, a: f.number(p.dice[0] ?? 0), b: f.number(p.dice[1] ?? 0) }));
          }
          break;
        }
        case "turn.moved": {
          const p = env.payload;
          const mine = p.player === me_;
          setCaption((c) => (c?.persist ? null : c));
          if (mine) {
            setInFlight(null);
            setSelected(null);
            if (p.auto === null) setWarn((w) => ({ ...w, [p.player]: false }));
            if (p.auto === "timeout") showCaption(t("match.auto.timeout"));
          } else {
            setLastOppMove({ moves: p.moves, hits: p.hits, player: p.player, key: `${env.seq}` });
            const summary = t("match.move.summary", { username: name(p.player), moves: notation(p.moves, p.hits) });
            if (p.auto === "forced") showCaption(t("match.forced.done"), { sub: summary });
            else if (p.auto === "timeout") showCaption(t("match.auto.timeout"), { sub: summary });
            else if (p.hits.some(Boolean)) showCaption(t("match.hitCaption", { username: name(p.player) }), { sub: summary });
            else setAnnounce(summary);
            if (p.auto === null) setWarn((w) => ({ ...w, [p.player]: false }));
          }
          if (mine && p.hits.some(Boolean)) showCaption(t("match.hitCaptionYours", { username: name(1 - p.player) }));
          break;
        }
        case "turn.passed":
          setCaption((c) => (c?.persist ? null : c));
          break;
        case "turn.timeout": {
          const p = env.payload;
          const mine = p.player === me_;
          const text = mine
            ? t("match.timeout.notice", { count: f.number(p.count), limit: f.number(p.limit) })
            : t("match.timeout.noticeTheirs", { username: name(p.player), count: f.number(p.count), limit: f.number(p.limit) });
          setNotice((n) => ({ ...n, [p.player]: text }));
          setAnnounce(text);
          window.setTimeout(() => setNotice((n) => ({ ...n, [p.player]: n[p.player] === text ? null : n[p.player] ?? null })), 4000);
          if (p.count >= p.limit - 1) {
            setWarn((w) => ({ ...w, [p.player]: true }));
            if (mine) vibrate([80, 60, 80]);
          }
          break;
        }
        case "cube.update": {
          const p = env.payload;
          setInFlight(null);
          if (p.player === me_) setWarn((w) => ({ ...w, [p.player]: false }));
          if (p.action === "offer" && p.player !== me_) {
            setSheet(null);
            vibrate(60);
          }
          if (p.action === "take") {
            const text = p.owner === me_ ? t("match.cube.tookYours", { value: f.number(p.value) }) : t("match.cube.tookTheirs", { username: name(p.owner ?? 0), value: f.number(p.value) });
            showCaption(text, { ms: 2500 });
          }
          break;
        }
        case "game.ended":
          setInFlight(null);
          setSheet((s) => (s === "resign" ? null : s));
          setCaption(null);
          break;
        case "react.recv": {
          const p = env.payload;
          if (p.sender !== me_ && !showOpp) break;
          const text =
            p.kind === "emoji"
              ? `${EMOJI[p.key] ?? ""} ${t.has(`reactions.emoji.${p.key}`) ? t(`reactions.emoji.${p.key}`) : ""}`.trim()
              : (phrases.find((x) => x.key === p.key)?.text[f.locale] ?? (t.has(`reactions.phrase.${p.key}`) ? t(`reactions.phrase.${p.key}`) : p.key));
          const key = Date.now();
          setBubbles((b) => ({ ...b, [p.sender]: { text, key } }));
          if (p.sender !== me_) setAnnounce(t("match.reactions.received", { username: name(p.sender), text }));
          window.setTimeout(() => setBubbles((b) => (b[p.sender]?.key === key ? { ...b, [p.sender]: null } : b)), 3000);
          break;
        }
        case "opponent.disconnected":
          if (env.payload.player !== me_) {
            setAnnounce(t("match.opponent.disconnectedAnnounce", { username: name(env.payload.player), time: f.clock(env.payload.grace_seconds) }));
          }
          break;
        case "opponent.back":
          if (env.payload.player !== me_) pushToast(t("match.opponent.back", { username: name(env.payload.player) }));
          break;
        case "match.ended":
          setEnded(env.payload);
          setInFlight(null);
          setSheet(null);
          setCaption(null);
          clearActive();
          void refreshActive();
          break;
        case "error": {
          const e = env.payload;
          const reason = e.details.reason;
          setInFlight(null);
          if (e.code === "MATCH_ACTION_INVALID") {
            if (reason === "not_legal" || reason === "format" || reason === "range") pushToast(t("match.error.moveRejected"));
            else if (reason === "cube") pushToast(t("match.error.cube"));
            else if (reason === "scope") setResignError(t("match.error.resignScope"));
            else if (reason === "ended") pushToast(t("match.error.ended"));
            else if (reason === "busy") pushToast(t("match.error.busy"));
            else pushToast(t("match.error.stale"));
          } else if (e.code === "MATCH_NOT_ATTACHED") {
            attach();
            pushToast(t("match.error.stale"));
          } else if (e.code === "REACTION_REJECTED") {
            if (reason === "rate") setCooldownUntil(Date.now() + 3000);
          } else if (e.code === "MATCH_NOT_A_PLAYER" || e.code === "MATCH_NOT_FOUND") {
            router.replace(`/match/${matchId}?view=summary`);
          } else {
            pushToast(t("errors.generic"));
          }
          break;
        }
        default:
          break;
      }
    },
    [matchId, store, labels, f, t, notation, showCaption, vibrate, pushToast, phrases, showOpp, warn, notice, attach, router, clearActive, refreshActive],
  );

  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => socket.subscribe((env) => handleRef.current(env)), [socket]);

  // Your turn: haptic (P§8).
  const yourTurnRoll = Boolean(view && view.status === "active" && view.phase === "roll" && view.turn === you && you !== null);
  useEffect(() => {
    if (yourTurnRoll) {
      vibrate(60);
      setAnnounce(t("match.turn.yours"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourTurnRoll, view?.gameNo]);

  // ---- Connection (MA-10) ------------------------------------------------------------------------

  const reconnecting = (socket.status === "reconnecting" || !online) && view?.status === "active" && ended === null;
  useEffect(() => {
    if (reconnecting) {
      reconnectFrom.current ??= Date.now();
      wasReconnecting.current = true;
      setSheet(null);
    } else if (socket.status === "open" && wasReconnecting.current) {
      wasReconnecting.current = false;
      reconnectFrom.current = null;
      pushToast(t("match.reconnect.done"));
    }
  }, [reconnecting, socket.status, pushToast, t]);

  // Closing the tab during an active match asks first (§3.14 step 5).
  useEffect(() => {
    if (view?.status !== "active") return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [view?.status]);

  // Back opens MA-09 instead of leaving (§3.14 step 1).
  useEffect(() => {
    if (view?.status !== "active") return;
    window.history.pushState({ ...window.history.state, __bgMatch: true }, "");
    const onPop = () => {
      // A sheet handles its own back; a sheet dropping its entry is not the user's Back.
      if (isOwnBack() || document.querySelector("[role=dialog]")) return;
      window.history.pushState({ ...window.history.state, __bgMatch: true }, "");
      setSheet("leave");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [view?.status]);

  // ---- Actions ----------------------------------------------------------------------------------

  const send = socket.send;
  const roll = () => {
    if (inFlight || !yourTurnRoll) return;
    setInFlight("roll");
    send("turn.roll", {});
  };
  const confirm = () => {
    if (inFlight || !builder?.complete) return;
    setInFlight("move");
    send("turn.move", { moves: builder.moves() });
  };
  const canDbl = Boolean(view && you !== null && canDouble(view, you) && yourTurnRoll);
  const offerDouble = () => {
    if (inFlight || !canDbl) return;
    setInFlight("double");
    send("cube.offer", {});
  };
  const cubeAnswer = (take: boolean) => {
    if (inFlight) return;
    setInFlight("cube");
    send(take ? "cube.take" : "cube.drop", {});
  };
  const resign = (scope: "game" | "match") => {
    if (inFlight === "resign") return;
    setResignError(null);
    setInFlight("resign");
    send("match.resign", { scope });
  };
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const sendReaction = (kind: "emoji" | "phrase", key: string) => {
    if (cooldown > 0) return;
    send("react.send", kind === "emoji" ? { emoji_key: key } : { phrase_key: key });
    setCooldownUntil(Date.now() + 3000);
    setSheet((s) => (s === "reactions" ? null : s));
  };

  // Keyboard shortcuts (§6): none while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === " " && yourTurnRoll) {
        e.preventDefault();
        roll();
      } else if (e.key === "Enter" && builder?.complete && target?.getAttribute("role") !== "group") {
        e.preventDefault();
        confirm();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === "d" && canDbl) offerDouble();
      else if (e.key.toLowerCase() === "r") setSheet("reactions");
      else if (e.key.toLowerCase() === "m") setSheet("menu");
      else if (e.key === "Escape" && view?.status === "active") setSheet("leave");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Derived view ------------------------------------------------------------------------------

  const position = builder?.position ?? view?.position ?? initialPosition();
  const perspective = (you ?? 0) as Player;
  const clockReading = view ? readClock(view.clock, snap.clockAt, now) : null;
  const rules = snap.rules;
  const limit = snap.timeoutLimit ?? rules?.max_consecutive_timeouts ?? null;
  const oppInfo = view?.players[opp] ?? null;
  const selfInfo = you !== null ? (view?.players[you] ?? null) : null;
  const isBot = Boolean(oppInfo?.is_bot);
  const oppName = names(opp);
  const turnIsOpp = view?.turn === opp && view.status === "active";

  // Remaining clock thresholds (P§7): announce once at 5 s; haptic at 10 s.
  const myRemaining = clockReading && clockReading.actor === you ? clockReading.remaining : null;
  const tenFired = useRef(false);
  const fiveFired = useRef(false);
  useEffect(() => {
    if (myRemaining === null || myRemaining > 10_000) {
      tenFired.current = false;
      fiveFired.current = false;
      return;
    }
    if (!tenFired.current) {
      tenFired.current = true;
      vibrate([40, 40, 40]);
    }
    if (myRemaining <= 5000 && !fiveFired.current) {
      fiveFired.current = true;
      setAnnounce(t("match.clock.fiveLeft"));
    }
  }, [myRemaining, vibrate, t]);

  const diceShow = useMemo(() => {
    if (!view?.dice) return null;
    const thrower: "self" | "opponent" | "both" = view.opening ? "both" : view.turn === you ? "self" : "opponent";
    return {
      key: `${view.gameNo}:${view.throwSeed ?? "s"}:${view.dice.join(",")}:${view.turn}`,
      values: view.dice,
      throwSeed: view.throwSeed ?? 0,
      thrower,
      animate: view.throwSeed !== null && sceneReady,
      dim: Boolean(builder && builder.remainingDice.length === 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.dice, view?.throwSeed, view?.gameNo, view?.turn, view?.opening, you, sceneReady, builder?.remainingDice.length]);

  const lastMoveView = useMemo(() => {
    if (!lastOppMove || lastOppMove.player === you) return null;
    // Opponent's numbering → viewer's numbering: points mirror; bar/off stay the mover's.
    return lastOppMove.moves.map(([a, b]) => ({
      from: toViewerPoint(a!),
      to: toViewerPoint(b!),
    }));
  }, [lastOppMove, you]);
  // Trails stay until this player rolls (§3.3 turn.moved row).
  const trails = view && view.phase === "move" && view.turn === you ? null : lastMoveView;

  const moveHint = useMemo(
    () => (lastOppMove ? { player: lastOppMove.player as Player, moves: lastOppMove.moves, key: lastOppMove.key } : null),
    [lastOppMove],
  );

  const input =
    builder && moving && inFlight === null && !reconnecting
      ? {
          sources: builder.sources(),
          targets: (from: number) => builder.targets(from),
          selected,
          onSelect: setSelected,
          onMove: doStep,
          onInvalid: (at: number | null) => {
            if (at !== null && at >= 1 && at <= 25) {
              vibrate([30, 40, 30]);
              showCaption(t("match.move.cantMove"), { ms: 1500 });
            }
          },
        }
      : null;

  // ---- Action bar (MA-02 table) ------------------------------------------------------------------

  const phase = view?.phase;
  const myTurn = view?.turn === you && you !== null;
  const forcedOrNone = Boolean(view && myTurn && phase === "move" && view.legal.length <= 1);
  let start: ReactNode = null;
  let center: ReactNode = null;
  if (view && view.status === "active" && ended === null) {
    if (phase === "roll" && myTurn) {
      if (canDbl) {
        const next = f.number(view.cubeValue * 2);
        start = (
          <Button className="m-side" variant="outlined" onClick={offerDouble} loading={inFlight === "double"} startIcon={<CubeIcon />} aria-label={t("match.action.double", { value: next })}>
            <Box component="span" sx={{ display: "inline", [mqXs]: { display: "none" } }}>
              {t("match.action.double", { value: next })}
            </Box>
            <Box component="span" sx={{ display: "none", [mqXs]: { display: "inline" } }}>
              {t("match.action.doubleShort", { value: next })}
            </Box>
          </Button>
        );
      }
      center = (
        <Button className="m-primary" variant="contained" size="large" fullWidth onClick={roll} loading={inFlight === "roll"}>
          {t("match.action.roll")}
        </Button>
      );
    } else if (phase === "move" && myTurn && !forcedOrNone && builder) {
      start = (
        <Button className="m-side" variant="outlined" onClick={undo} disabled={!builder.steps.length || inFlight !== null} startIcon={<UndoIcon />}>
          {t("match.action.undo")}
        </Button>
      );
      center = (
        <Button className="m-primary" variant="contained" size="large" fullWidth onClick={confirm} disabled={!builder.complete} loading={inFlight === "move"}>
          {t("match.action.confirm")}
        </Button>
      );
    } else if (phase === "cube_offered" && view.turn === you) {
      center = <Typography variant="body2" sx={{ textAlign: "center" }}>{t("match.action.waitingCube", { username: oppName })}</Typography>;
    } else if (phase === "roll" && turnIsOpp) {
      center = <Typography variant="body2" sx={{ textAlign: "center" }}>{t("match.turn.theirs", { username: oppName })}</Typography>;
    } else if (phase === "move" && turnIsOpp) {
      center = <Typography variant="body2" sx={{ textAlign: "center" }}>{isBot ? t("match.turn.botThinking") : t("match.turn.moving", { username: oppName })}</Typography>;
    } else if (phase === "opening") {
      center = <Typography variant="body2" sx={{ textAlign: "center" }}>{t("match.opening.title")}</Typography>;
    }
  }
  const reactionsButton = (
    <Button
      className="m-side"
      variant="text"
      onClick={() => setSheet("reactions")}
      startIcon={<ReactionIcon />}
      aria-label={cooldown > 0 ? t("match.reactions.cooldown", { seconds: f.number(cooldown) }) : t("match.action.reactions")}
      disabled={ended !== null}
    >
      {cooldown > 0 ? <bdi dir="ltr">{f.number(cooldown)}</bdi> : t("match.action.reactions")}
    </Button>
  );

  // Dice chips: every die of the roll; used ones struck through (not color alone).
  let chips: ReactNode = null;
  if (builder && view?.dice) {
    const all = view.dice[0] === view.dice[1] ? [view.dice[0], view.dice[0], view.dice[0], view.dice[0]] : [...view.dice];
    const remaining = [...builder.remainingDice];
    const used = all.map((d) => {
      const i = remaining.indexOf(d);
      if (i >= 0) {
        remaining.splice(i, 1);
        return false;
      }
      return true;
    });
    chips = <DiceChips dice={all} used={used} unusable={builder.complete && builder.remainingDice.length > 0} />;
  }

  // ---- Bars ---------------------------------------------------------------------------------------

  const barFor = (p: Player) => {
    const info = view?.players[p];
    if (!info || !view) return null;
    const self = p === you;
    const running = clockReading?.actor === p;
    const bank = view.clock.bank[p] ?? 0;
    const graceAt = snap.grace[p] ?? null;
    const disconnected = !info.connected && !self && !info.is_bot && view.status === "active";
    const graceLeft = graceAt !== null ? Math.max(0, Math.ceil((graceAt - now) / 1000)) : null;
    const status: ReactNode[] = [];
    if (disconnected && !waitingJoin) {
      status.push(
        <StatusLine key="dc" tone="warning">
          {graceLeft !== null
            ? graceLeft <= 30
              ? `${t("match.opponent.disconnected", { time: `⁦${f.clock(graceLeft)}⁩` })} · ${t("match.opponent.warning", { seconds: f.number(graceLeft), username: names(p) })}`
              : t("match.opponent.disconnected", { time: `⁦${f.clock(graceLeft)}⁩` })
            : t("match.opponent.disconnectedNoTime")}
        </StatusLine>,
      );
    }
    if (notice[p]) status.push(<StatusLine key="to" tone="info">{notice[p]}</StatusLine>);
    if (warn[p] && (view.timeouts[p] ?? 0) > 0)
      status.push(
        <StatusLine key="warn">{limit !== null ? t("match.timeout.lastWarning") : t("match.timeout.countOnly", { count: f.number(view.timeouts[p] ?? 0) })}</StatusLine>,
      );
    const bubble = bubbles[p];
    const pips = pipCount(position, p);
    const turnText = self && yourTurnRoll ? t("match.turn.yours") : null;
    return (
      <PlayerBar
        player={info}
        side={p}
        self={self}
        pips={pips}
        cube={view.cubeOwner === p && view.variant === "standard_cube" ? view.cubeValue : null}
        turn={view.turn === p && view.status === "active"}
        turnText={turnText}
        status={status.length ? status : undefined}
        onPeek={() => setSheet(self ? "menu" : "peek")}
        label={t("match.bar.label", {
          name: self ? t("match.bar.you") : names(p),
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
                insetBlockStart: p === you ? "auto" : "100%",
                insetBlockEnd: p === you ? "100%" : "auto",
                zIndex: zIndex.hud + 1,
                mt: 0.5,
                mb: 0.5,
                px: 1.5,
                py: 0.75,
                borderRadius: "12px",
                bgcolor: "tokens.inverseSurface",
                color: "tokens.onInverseSurface",
                typography: "body2",
                maxWidth: "70%",
                boxShadow: 3,
                animation: reduced ? "none" : "bgBubbleIn 200ms ease-out",
                "@keyframes bgBubbleIn": { from: { opacity: 0 }, to: { opacity: 1 } },
              }}
            >
              {bubble.text}
            </Box>
          ) : null
        }
      />
    );
  };

  // MA-19: waiting for a human opponent to join before the first roll.
  const waitingJoin = Boolean(
    view && isWaitingForOpponent(view, oppInfo ?? null, snap.history.filter((h) => h.kind !== "game").length),
  );

  // MA-13a: between games.
  const lastResult = view?.phase === "game_over" && ended === null ? view.results[view.results.length - 1] : null;

  // ---- Render ---------------------------------------------------------------------------------------

  const loading = !sceneReady || !view;
  const scoreText = view && you !== null ? t("match.score", { self: f.number(view.score[you] ?? 0), opp: f.number(view.score[opp] ?? 0) }) : "";

  const panelContent = view ? (
    <>
      <section aria-labelledby="panel-info">
        <Typography id="panel-info" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
          {t("match.panel.info")}
        </Typography>
        <MatchInfo view={view} payout={rules?.payout ?? null} />
      </section>
      <section aria-labelledby="panel-react">
        <Typography id="panel-react" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1 }}>
          {t("match.panel.reactions")}
        </Typography>
        <ReactionPicker
          emojis={[...FREE_EMOJIS, ...owned.emojis.filter((k) => !FREE_EMOJIS.includes(k))]}
          phrases={[...FREE_PHRASES, ...owned.phrases.filter((k) => !FREE_PHRASES.includes(k))]}
          phraseText={(k) => phrases.find((x) => x.key === k)?.text[f.locale] ?? (t.has(`reactions.phrase.${k}`) ? t(`reactions.phrase.${k}`) : k)}
          onSend={sendReaction}
          cooldown={cooldown}
        />
      </section>
    </>
  ) : null;

  return (
    <Screen>
      <TopStrip className="m-top">
        <IconButton aria-label={t("match.leave")} onClick={() => (view?.status === "active" ? setSheet("leave") : router.push("/play"))}>
          <BackIcon />
        </IconButton>
        <div className="m-score">
          <Typography variant="h4" component="h1" aria-label={view && you !== null ? t("match.scoreLabel", { self: f.number(view.score[you] ?? 0), username: oppName, opp: f.number(view.score[opp] ?? 0) }) : undefined}>
            <bdi>{scoreText}</bdi>
          </Typography>
          {view && (
            <Typography variant="caption" color="text.secondary">
              {t("match.firstTo", { n: f.number(view.length) })}
            </Typography>
          )}
          {view?.crawford && (
            <Typography variant="caption" sx={{ color: "tokens.warning", display: "inline-flex", alignItems: "center", gap: 0.5 }}>
              <WarningIcon sx={{ fontSize: iconSize.sm }} />
              {t("match.crawford.label")}
            </Typography>
          )}
        </div>
        {view && view.spectators > 0 && !isBot && (
          <Box className="m-spect" role="img" aria-label={t("match.spectators", { count: view.spectators })} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1 }}>
            <EyeIcon sx={{ fontSize: iconSize.sm }} />
            <Typography variant="label" aria-hidden>
              {f.number(view.spectators)}
            </Typography>
          </Box>
        )}
        <IconButton aria-label={t("match.menu.title")} onClick={() => setSheet("menu")}>
          <MenuIcon />
        </IconButton>
      </TopStrip>

      <div className="m-opp">{view && barFor(opp)}</div>

      <div className="m-board">
        <BoardStage
          label={t("match.board.label")}
          onKeyboardEntry={() => setSheet("moveEntry")}
          onLoaded={() => setSceneLoaded(true)}
          position={position}
          perspective={perspective}
          lite={prefs.graphics_lite}
          reducedMotion={reduced}
          dice={diceShow}
          input={input}
          lastMove={trails}
          moveHint={moveHint}
          snapKey={snap.stateKey}
          labels={sceneLabels}
          themes={{ board: selfInfo?.board_theme ?? "default", checkers: [view?.players[0]?.checker_theme ?? "default", view?.players[1]?.checker_theme ?? "default"] }}
          onReady={() => setSceneReady(true)}
          onSlow={() => {
            if (prefs.graphics_lite || liteSuggested) return;
            setLiteSuggested(true);
            pushToast(t("match.lite.suggest"), { label: t("match.lite.turnOn"), onClick: () => setPref("graphics_lite", true) });
          }}
        >
          {caption && (
            <Caption role="presentation">
              <Typography variant="label" component="p">
                {caption.text}
              </Typography>
              {caption.sub && (
                <Typography variant="caption" component="p" color="text.secondary">
                  {caption.sub}
                </Typography>
              )}
            </Caption>
          )}
          {view && view.variant === "standard_cube" && view.cubeOwner === null && view.status === "active" && (
            <Box sx={{ position: "absolute", insetInlineStart: 8, insetBlockEnd: 8, zIndex: zIndex.hud }}>
              <CubeChip
                value={view.cubeValue}
                label={t("match.cube.centered", { value: f.number(view.cubeValue) })}
                text={view.crawford ? t("match.crawford.cube") : undefined}
              />
            </Box>
          )}
          <MatchOverlays.BoardCards
            view={view}
            waitingJoin={waitingJoin}
            attachedAt={attachedAt}
            now={now}
            oppName={oppName}
            lastResult={lastResult ?? null}
            you={you}
            onCancelMatch={() => setSheet("cancelMatch")}
          />
          {toasts.length > 0 && (
            <Box sx={{ position: "absolute", insetInline: 8, insetBlockStart: caption ? 72 : 8, zIndex: zIndex.snackbar, display: "grid", gap: 1, justifyItems: "center" }} role="status">
              {toasts.map((x) => (
                <Box key={x.key} sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderRadius: "10px", bgcolor: "tokens.inverseSurface", color: "tokens.onInverseSurface", maxWidth: 480, boxShadow: 3 }}>
                  <Typography variant="body2" sx={{ color: "inherit" }}>
                    {x.text}
                  </Typography>
                  {x.action && (
                    <Button size="small" color="inherit" onClick={x.action.onClick}>
                      {x.action.label}
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {loading && (
            <MatchLoader
              header={header}
              stage={!sceneLoaded ? 0 : !physicsReady ? 1 : !sceneReady ? 2 : 3}
              fresh={fresh}
              onCancel={() => (view?.status === "active" || fresh ? setSheet("leave") : router.back())}
              onRetry={() => window.location.reload()}
            />
          )}
        </BoardStage>
      </div>

      <div className="m-own">{view && you !== null && barFor(you)}</div>

      <ActionBar className="m-actions">
        {chips}
        <div className="m-slots">
          <div className="m-slot-start">{start}</div>
          <div className="m-slot-center" style={{ textAlign: "center" }}>
            {center}
          </div>
          <div className="m-slot-end">{reactionsButton}</div>
        </div>
      </ActionBar>

      {wideEnd && (
        <Panel className="m-end" aria-label={t("match.panel.info")}>
          {panelContent}
        </Panel>
      )}
      <Panel className="m-start" aria-label={t("match.panel.moves")}>
        <Typography variant="labelSmall" component="h2" color="text.secondary">
          {t("match.panel.moves")}
        </Typography>
        <MoveHistory view={view} history={snap.history} you={you} />
      </Panel>

      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announce}
      </span>

      <MatchOverlays
        matchId={matchId}
        view={view}
        you={you}
        rules={rules}
        history={snap.history}
        sheet={sheet}
        setSheet={setSheet}
        builder={builder}
        selected={selected}
        setSelected={setSelected}
        onStep={doStep}
        onUndo={undo}
        onConfirm={confirm}
        onCubeAnswer={cubeAnswer}
        cubeInFlight={inFlight === "cube"}
        clockReading={clockReading}
        onResign={resign}
        resignInFlight={inFlight === "resign"}
        resignError={resignError}
        reconnecting={reconnecting}
        reconnectFrom={reconnectFrom.current}
        attempt={socket.attempt}
        onRetryNow={socket.retryNow}
        now={now}
        ended={ended}
        limit={limit}
        prefs={prefs}
        setPref={setPref}
        showOpp={showOpp}
        setShowOpp={setShowOpp}
        reactions={{
          emojis: [...FREE_EMOJIS, ...owned.emojis.filter((k) => !FREE_EMOJIS.includes(k))],
          phrases: [...FREE_PHRASES, ...owned.phrases.filter((k) => !FREE_PHRASES.includes(k))],
          phraseText: (k) => phrases.find((x) => x.key === k)?.text[f.locale] ?? (t.has(`reactions.phrase.${k}`) ? t(`reactions.phrase.${k}`) : k),
          onSend: sendReaction,
          cooldown,
        }}
        lastMoveText={lastOppMove ? t("match.move.summary", { username: names(lastOppMove.player), moves: notation(lastOppMove.moves, lastOppMove.hits) }) : null}
        suspended={me?.status === "suspended"}
      />
    </Screen>
  );
}
