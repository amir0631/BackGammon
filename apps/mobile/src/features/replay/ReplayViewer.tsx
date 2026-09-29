"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { iconSize, layout, minTouchTarget, radii, zIndex } from "@bg/design-tokens";
import { pipCount, type Player } from "@bg/game-core";
import { buildReplay, STEP_TYPES } from "@bg/game-core/src/replay";
import { isolate } from "@bg/i18n";
import type { GameEndedOut, MatchEndedOut, Replay, TurnMovedOut } from "@bg/protocol";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { BackIcon, ChevronForwardIcon, LockIcon } from "@/components/icons";
import { MediaPauseIcon, MediaPlayIcon, MenuIcon, ShieldIcon, StepBackIcon, StepForwardIcon } from "@/components/icons/game";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { CopyButton } from "@/components/wallet/CopyButton";
import { canGoBackInApp } from "@/lib/inAppNav";
import { useDevicePref, usePrefs } from "@/lib/prefs";
import { useFormat } from "@/lib/useFormat";
import { safeInsetBottom, safeInsetTop, visuallyHidden } from "@/theme/layout";
import { useReducedMotion } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";
import { BoardStage } from "../match/BoardStage";
import { EMOJI, useNames, useNotation } from "../match/panels";
import { CubeChip, PlayerBar, SeedText } from "../match/parts";
import { useSceneLabels } from "../match/useSceneLabels";
import { useGameLabels } from "../play/labels";
import { VerifyDiceSheet } from "./VerifyDiceSheet";

// RP-01 Replay viewer (history-replay.md §3.3, §4): the match's event log re-applied with game-core
// (`buildReplay`) and shown in the 3D board from the viewer's side. Paused at the start of game 1;
// play, step, scrub, and jump to a game; dice throws use the recorded `throw_seed`, so they land on
// the recorded values (§11.1; lite mode fades). Pacing is not real time. Media controls and the
// scrubber keep LTR direction in fa (P§11). No share, link, download, or export control exists.

const SPEEDS = [0.5, 1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];
type Sheet = "moves" | "games" | "menu" | "verify" | "private" | null;

const LANDSCAPE_PHONE = `@media (orientation: landscape) and (max-height: ${layout.compactHeight - 0.02}px)`;
const WIDE = `@media (min-width: 900px) and (min-height: ${layout.compactHeight}px) and (min-aspect-ratio: 1/1)`;

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
    gridTemplateRows: "auto auto minmax(min(45svh, 100vw), 1fr) auto auto",
    gridTemplateAreas: `"top" "opp" "board" "own" "controls"`,
    "& .r-info": { display: "contents" },
    "& .r-top": { gridArea: "top" },
    "& .r-opp": { gridArea: "opp", minWidth: 0, containerType: "inline-size", containerName: "pbar" },
    "& .r-board": { gridArea: "board", minHeight: 0, minWidth: 0, position: "relative" },
    "& .r-own": { gridArea: "own", minWidth: 0, containerType: "inline-size", containerName: "pbar" },
    "& .r-controls": { gridArea: "controls", minWidth: 0 },
    "& .r-end": { display: "none" },
    // The replay has no rating or level to show in the bars (spec §4 RP-01: avatar, name, pips).
    "& .bar-rating": { display: "none" },
    [LANDSCAPE_PHONE]: {
      overflowY: "hidden",
      gridTemplateColumns: "minmax(min(10rem, 22vw), min(12rem, 24vw)) minmax(50vw, 1fr) minmax(min(11rem, 26vw), min(13rem, 28vw))",
      gridTemplateRows: "minmax(0, 1fr)",
      gridTemplateAreas: `"info board controls"`,
      "& .r-info": { display: "flex", flexDirection: "column", gridArea: "info", minHeight: 0, minWidth: 0, overflowY: "auto" },
      "& .r-controls": { overflowY: "auto", minHeight: 0, borderInlineStart: `1px solid ${t.outlineSubtle}` },
    },
    [WIDE]: {
      gridTemplateColumns: `minmax(0, 1fr) ${layout.sidePanelWidth}px`,
      gridTemplateRows: "auto auto minmax(min(45svh, 60vw), 1fr) auto auto",
      gridTemplateAreas: `"top end" "opp end" "board end" "own end" "controls end"`,
      "& .r-end": { display: "flex", gridArea: "end", borderInlineStart: `1px solid ${t.outlineSubtle}` },
    },
  };
});

const TopStrip = styled("header")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.5),
  minHeight: 48,
  paddingBlockStart: safeInsetTop,
  paddingInline: theme.spacing(0.5),
  backgroundColor: tokensOf(theme).surface,
  "& .r-title": { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
}));

const Controls = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1, 1.5),
    paddingBlockEnd: `calc(${theme.spacing(1)} + ${safeInsetBottom})`,
    backgroundColor: t.surface,
    borderBlockStart: `1px solid ${t.outlineSubtle}`,
    "& .r-media": { display: "flex", alignItems: "center", justifyContent: "center", gap: theme.spacing(2) },
    "& .r-play": { width: 56, height: 56, backgroundColor: t.primary, color: t.onPrimary, "&:hover": { backgroundColor: t.primary } },
    "& .r-chips": { display: "flex", gap: theme.spacing(1), overflowX: "auto", paddingBlockEnd: 2, scrollbarWidth: "thin" },
    "& .r-chips > *": { flex: "none" },
  };
});

const Panel = styled("aside")(({ theme }) => ({
  flexDirection: "column",
  gap: theme.spacing(1.5),
  padding: theme.spacing(2),
  overflowY: "auto",
  minHeight: 0,
  backgroundColor: tokensOf(theme).surface,
  containerType: "inline-size",
}));

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "absolute",
    insetInline: theme.spacing(2),
    insetBlockEnd: theme.spacing(2),
    marginInline: "auto",
    maxWidth: 400,
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    backgroundColor: t.surfaceRaised,
    border: `1px solid ${t.outline}`,
    boxShadow: "var(--bg-elevation-3)",
    zIndex: zIndex.hud,
    display: "grid",
    gap: theme.spacing(1),
    maxHeight: "calc(100% - 32px)",
    overflowY: "auto",
  };
});

const ListButton = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    width: "100%",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: theme.spacing(1),
    minHeight: minTouchTarget,
    padding: theme.spacing(0.75, 1.5),
    borderRadius: radii.md,
    textAlign: "start",
    ...theme.typography.body2,
    "&[aria-current='step']": { outline: `2px solid ${t.primary}`, outlineOffset: -2, fontWeight: 600 },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
  };
}) as typeof ButtonBase;

interface Line {
  frame: number;
  gameNo: number;
  text: string;
  /** Jump target (a step frame), or null for notes. */
  step: number | null;
}

export function ReplayViewer({ replay, you, openVerify }: { replay: Replay; you: Player; openVerify: boolean }) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const labels = useGameLabels();
  const sceneLabels = useSceneLabels();
  const notation = useNotation();
  const reduced = useReducedMotion();
  const { prefs, set: setPref } = usePrefs();
  const [showReactions, setShowReactions] = useDevicePref("replayReactions", true);
  const wide = useMediaQuery(WIDE.replace("@media ", ""));

  const tl = useMemo(() => buildReplay({ ...replay, you }), [replay, you]);
  const steps = useMemo(() => tl.frames.flatMap((fr, i) => (STEP_TYPES.has(fr.event.type) ? [i] : [])), [tl]);
  const gameStarts = useMemo(() => tl.games.map((g) => ({ gameNo: g.gameNo, step: Math.max(0, steps.indexOf(g.frame)) })), [tl, steps]);
  const initial = useMemo(() => {
    const param = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("game")) : NaN;
    const target = gameStarts.find((g) => g.gameNo === param) ?? gameStarts[0];
    return target?.step ?? 0;
  }, [gameStarts]);

  const [cur, setCur] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [sheet, setSheet] = useState<Sheet>(openVerify ? "verify" : null);
  const [snapKey, setSnapKey] = useState(0);
  /** The last change was one step forward (animate it); anything else snaps. */
  const [animated, setAnimated] = useState(false);
  const [bubble, setBubble] = useState<{ sender: number; text: string; key: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [hint, setHint] = useState(false);
  const prevFrame = useRef<number>(steps[initial] ?? 0);

  const frameIdx = steps[cur] ?? 0;
  const frame = tl.frames[frameIdx];
  const view = frame?.view ?? tl.frames[0]?.view ?? null;
  const names = useNames(view);
  const opp = (1 - you) as Player;
  const gameNo = view?.gameNo ?? 1;
  const last = cur >= steps.length - 1;

  // First-replay hint (P§14, once per device).
  useEffect(() => {
    try {
      if (!window.localStorage.getItem("bg.replay.verifyHint")) {
        setHint(true);
        window.localStorage.setItem("bg.replay.verifyHint", "1");
      }
    } catch {
      // Storage unavailable: no hint.
    }
  }, []);

  const jump = useCallback(
    (to: number, opts: { animate?: boolean } = {}) => {
      const next = Math.max(0, Math.min(steps.length - 1, to));
      setAnimated(Boolean(opts.animate) && !reduced);
      if (!opts.animate) setSnapKey((k) => k + 1);
      setCur(next);
    },
    [steps.length, reduced],
  );
  const forward = useCallback(() => jump(cur + 1, { animate: true }), [cur, jump]);

  // Summary of a step (move list, announcements).
  const stepText = useCallback(
    (i: number): string => {
      const fr = tl.frames[i];
      if (!fr) return "";
      const p = fr.event.payload as Record<string, unknown>;
      const who = (side: number) => (side === you ? t("match.history.you") : names(side));
      switch (fr.event.type) {
        case "game.started":
          return t("match.game.number", { n: f.number(Number(p.game_no ?? 1)) });
        case "turn.rolled": {
          const d = (p.dice as number[]) ?? [];
          if (p.opening) return t("match.history.opening", { a: f.number(d[0] ?? 0), b: f.number(d[1] ?? 0) });
          return `${who(Number(p.player))}: ${t("match.dice.label", { a: f.number(d[0] ?? 0), b: f.number(d[1] ?? 0) })}`;
        }
        case "turn.moved": {
          const m = p as unknown as TurnMovedOut;
          const auto = m.auto ? ` · ${t(m.auto === "forced" ? "match.history.forced" : "match.history.timeout")}` : "";
          return `${who(m.player)}: ${notation(m.moves, m.hits)}${auto}`;
        }
        case "turn.passed":
          return `${who(Number(p.player))}: ${t("match.history.noMove")}`;
        case "cube.update":
          return `${who(Number(p.player))}: ${
            p.action === "offer"
              ? t("match.history.doubled", { value: f.number(Number(p.value)) })
              : p.action === "take"
                ? t("match.history.took")
                : t("match.history.dropped")
          }`;
        case "game.ended": {
          const g = p as unknown as GameEndedOut;
          return t("match.history.gameResult", { winner: who(g.winner), points: g.points });
        }
        case "match.ended":
          return t("replay.end.title");
        default:
          return "";
      }
    },
    [tl, you, names, t, f, notation],
  );

  // Frame changes: reactions passed on the way, announcements.
  useEffect(() => {
    const from = prevFrame.current;
    prevFrame.current = frameIdx;
    if (frameIdx > from && showReactions) {
      const passed = tl.reactions.filter((r) => r.frame > from && r.frame <= frameIdx);
      const r = passed.at(-1);
      if (r) {
        const text = r.kind === "emoji" ? `${EMOJI[r.key] ?? ""} ${t.has(`reactions.emoji.${r.key}`) ? t(`reactions.emoji.${r.key}`) : ""}`.trim() : t.has(`reactions.phrase.${r.key}`) ? t(`reactions.phrase.${r.key}`) : r.key;
        const key = Date.now();
        setBubble({ sender: r.sender, text, key });
        window.setTimeout(() => setBubble((b) => (b?.key === key ? null : b)), Math.max(500, 2000 / speed));
      }
    }
    const type = tl.frames[frameIdx]?.event.type;
    // During playback only results are announced; manual steps announce every step (§8).
    if (!playing || type === "game.ended" || type === "match.ended") setAnnounce(stepText(frameIdx));
  }, [frameIdx, tl, showReactions, speed, t, playing, stepText]);

  // Playback pacing (§3.3 step 3): not real time; every duration scales with the speed.
  useEffect(() => {
    if (!playing) return;
    if (last) {
      setPlaying(false);
      return;
    }
    const type = frame?.event.type;
    const moves = type === "turn.moved" ? ((frame!.event.payload as unknown as TurnMovedOut).moves.length ?? 1) : 0;
    const base =
      type === "turn.rolled" ? (prefs.graphics_lite || reduced ? 300 : 1200) : type === "turn.moved" ? 300 * moves + 400 : type === "game.ended" ? 2000 : 700;
    const id = window.setTimeout(forward, base / speed);
    return () => window.clearTimeout(id);
  }, [playing, cur, last, frame, speed, prefs.graphics_lite, reduced, forward]);

  const togglePlay = () => {
    if (last && !playing) {
      jump(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };
  const stepBack = () => {
    setPlaying(false);
    jump(cur - 1);
  };
  const stepForward = () => {
    setPlaying(false);
    forward();
  };
  const cycleSpeed = (dir: 1 | -1 = 1) => {
    const i = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))] ?? 1);
  };
  const speedLabel = (s: Speed) => t("replay.speedValue", { value: f.number(s) });

  // Keyboard (§6): Space, ← / → (never mirrored), Home / End, 1–9, + / −, V. Not on a focused control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && target !== document.body && target.closest("button, a, input, [role=slider], [role=switch], [role=tab]")) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") stepForward();
      else if (e.key === "ArrowLeft") stepBack();
      else if (e.key === "Home") jump(0);
      else if (e.key === "End") jump(steps.length - 1);
      else if (/^[1-9]$/.test(e.key)) {
        const g = gameStarts.find((x) => x.gameNo === Number(e.key));
        if (g) {
          setPlaying(false);
          jump(g.step);
        }
      } else if (e.key === "+" || e.key === "=") cycleSpeed(1);
      else if (e.key === "-") cycleSpeed(-1);
      else if (e.key.toLowerCase() === "v") setSheet("verify");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Scene inputs ----------------------------------------------------------------------------------

  const rollFrame = useMemo(() => {
    // The roll whose dice belong to the current step (a roll, or the move right after it).
    for (let i = frameIdx; i >= 0; i--) {
      const type = tl.frames[i]?.event.type;
      if (type === "turn.rolled") return i;
      if (i < frameIdx && type !== "turn.rolled" && STEP_TYPES.has(type ?? "")) return -1;
    }
    return -1;
  }, [frameIdx, tl]);
  const diceShow = useMemo(() => {
    if (rollFrame < 0) return null;
    const type = frame?.event.type;
    if (type !== "turn.rolled" && type !== "turn.moved") return null;
    const rv = tl.frames[rollFrame]!.view;
    if (!rv.dice) return null;
    return {
      key: `r${rollFrame}`,
      values: rv.dice,
      throwSeed: rv.throwSeed ?? 0,
      thrower: (rv.opening ? "both" : rv.turn === you ? "self" : "opponent") as "both" | "self" | "opponent",
      animate: animated && type === "turn.rolled",
      dim: type === "turn.moved",
    };
  }, [rollFrame, frame, tl, you, animated]);
  const moveHint = useMemo(() => {
    if (!animated || frame?.event.type !== "turn.moved") return null;
    const m = frame.event.payload as unknown as TurnMovedOut;
    return { player: m.player as Player, moves: m.moves, key: `m${frameIdx}` };
  }, [animated, frame, frameIdx]);

  // ---- Lines (move list) ------------------------------------------------------------------------------

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    tl.frames.forEach((fr, i) => {
      const p = fr.event.payload as Record<string, unknown>;
      const gNo = fr.view.gameNo;
      if (STEP_TYPES.has(fr.event.type)) {
        const text = stepText(i);
        if (text) out.push({ frame: i, gameNo: gNo, text, step: steps.indexOf(i) });
      } else if (fr.event.type === "turn.timeout") {
        out.push({ frame: i, gameNo: gNo, step: null, text: t("replay.note.timeout", { username: names(Number(p.player)), count: f.number(Number(p.count)), limit: f.number(Number(p.limit)) }) });
      } else if (fr.event.type === "opponent.disconnected" || fr.event.type === "opponent.back") {
        const key = fr.event.type === "opponent.back" ? "replay.note.back" : "replay.note.disconnected";
        out.push({ frame: i, gameNo: gNo, step: null, text: t(key, { username: names(Number(p.player)) }) });
      } else if (fr.event.type === "react.recv") {
        const k = String(p.key ?? "");
        const text = p.kind === "emoji" ? `${EMOJI[k] ?? ""} ${t.has(`reactions.emoji.${k}`) ? t(`reactions.emoji.${k}`) : ""}`.trim() : t.has(`reactions.phrase.${k}`) ? t(`reactions.phrase.${k}`) : k;
        out.push({ frame: i, gameNo: gNo, step: null, text: t("replay.note.reaction", { username: names(Number(p.sender)), text }) });
      }
    });
    return out;
  }, [tl, steps, stepText, t, f, names]);

  const moveList = (
    <Stack spacing={1.5}>
      {[...new Set(lines.map((l) => l.gameNo))].map((g) => (
        <Box component="section" key={g} aria-label={t("match.game.number", { n: f.number(g) })}>
          <Typography variant="labelSmall" component="h3" color="text.secondary" sx={{ mb: 0.5 }}>
            {t("match.game.number", { n: f.number(g) })}
          </Typography>
          <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.25 }}>
            {lines
              .filter((l) => l.gameNo === g)
              .map((l) => (
                <li key={l.frame}>
                  {l.step !== null && l.step >= 0 ? (
                    <ListButton
                      aria-current={l.frame === frameIdx ? "step" : undefined}
                      onClick={() => {
                        setPlaying(false);
                        jump(l.step!);
                        if (!wide) setSheet(null);
                      }}
                    >
                      <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>{l.text}</span>
                      {l.frame === frameIdx && (
                        <Typography component="span" variant="labelSmall" sx={{ flex: "none", color: "tokens.primary" }}>
                          {t("replay.now")}
                        </Typography>
                      )}
                    </ListButton>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ paddingInline: 1.5, paddingBlock: 0.5, overflowWrap: "anywhere" }}>
                      {l.text}
                    </Typography>
                  )}
                </li>
              ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );

  // ---- Cards: game result (MA-13a content) and the final result ---------------------------------------

  const ended = tl.frames.at(-1)?.event.type === "match.ended" ? (tl.frames.at(-1)!.event.payload as unknown as MatchEndedOut) : null;
  let card: ReactNode = null;
  if (frame?.event.type === "game.ended") {
    const g = frame.event.payload as unknown as GameEndedOut;
    const youWon = g.winner === you;
    card = (
      <Card role="status">
        <Typography variant="h5" component="p">
          {youWon ? t("match.gameEnded.youWon", { n: f.number(g.game_no) }) : t("match.gameEnded.theyWon", { username: names(opp), n: f.number(g.game_no) })}
        </Typography>
        <Typography variant="body2">
          {youWon ? "+" : "−"}
          {t("match.gameEnded.value", { kind: t(`match.kind.${g.kind}`), cube: f.number(g.cube), points: g.points })}
        </Typography>
        <Typography variant="body2">
          {t("match.gameEnded.score", { self: f.number(g.score[you] ?? 0), opp: f.number(g.score[opp] ?? 0), n: f.number(replay.length) })}
        </Typography>
      </Card>
    );
  } else if (frame?.event.type === "match.ended" && ended) {
    const youWon = ended.winner === you;
    const reason = ended.reason ?? "";
    const reasonText =
      reason === "resign"
        ? youWon
          ? t("match.result.reason.resignTheirs", { username: names(opp) })
          : t("match.result.reason.resignYours")
        : reason.endsWith("timeouts")
          ? youWon
            ? t("match.summary.reason.timeoutsTheirs", { username: names(opp) })
            : t("match.summary.reason.timeoutsYours")
          : reason.endsWith("disconnect")
            ? youWon
              ? t("match.result.reason.disconnectTheirs", { username: names(opp) })
              : t("match.result.reason.disconnectYours")
            : t("match.result.reason.points");
    card = (
      <Card role="status">
        <Typography variant="h4" component="p">
          {youWon ? t("match.result.youWon") : t("match.result.theyWon", { username: names(opp) })}
        </Typography>
        <Typography variant="body1">
          {t("match.result.finalScore", { self: f.number(ended.score[you] ?? 0), opp: f.number(ended.score[opp] ?? 0) })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {reasonText}
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button variant="contained" onClick={() => jump(0)}>
            {t("replay.end.again")}
          </Button>
          <Button variant="outlined" startIcon={<ShieldIcon />} onClick={() => setSheet("verify")}>
            {t("replay.verify.title")}
          </Button>
        </Stack>
      </Card>
    );
  }

  // ---- Bars -------------------------------------------------------------------------------------------

  const bar = (p: Player) => {
    const info = view?.players[p];
    if (!info || !view) return null;
    const pips = pipCount(view.position, p);
    return (
      <PlayerBar
        player={info}
        side={p}
        self={p === you}
        pips={pips}
        clock={null}
        cube={view.cubeOwner === p && view.variant === "standard_cube" ? view.cubeValue : null}
        turn={view.turn === p && view.phase !== "game_over" && view.phase !== "match_over"}
        onPeek={() => setSheet("menu")}
        label={t("replay.bar.label", { name: p === you ? t("match.bar.you") : names(p), pips: f.number(pips) })}
        bubble={
          bubble && bubble.sender === p ? (
            <Box
              role="presentation"
              sx={{
                position: "absolute",
                insetInlineEnd: 8,
                insetBlockStart: "50%",
                transform: "translateY(-50%)",
                maxWidth: "60%",
                px: 1.5,
                py: 0.75,
                borderRadius: "12px",
                bgcolor: "tokens.inverseSurface",
                color: "tokens.onInverseSurface",
                typography: "body2",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                zIndex: zIndex.hud + 1,
              }}
            >
              {bubble.text}
            </Box>
          ) : null
        }
      />
    );
  };

  const oppInfo = view?.players[opp];
  const oppName = oppInfo ? (oppInfo.is_bot ? labels.botName(oppInfo.bot_level) : `@${isolate(oppInfo.username)}`) : "";
  const date = f.date(replay.ended_at ?? replay.created_at, { day: "numeric", month: "long", year: "numeric" });
  const leave = () => (canGoBackInApp() ? router.back() : router.push(`/match/${replay.id}`));
  const gameCount = Math.max(1, tl.games.length);
  const results = tl.frames.at(-1)?.view.results ?? [];

  return (
    <Screen>
      <div className="r-info">
        <TopStrip className="r-top">
          <IconButton aria-label={t("common.back")} onClick={leave}>
            <BackIcon />
          </IconButton>
          <div className="r-title">
            <Typography variant="h4" component="h1">
              {t("replay.title")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {oppInfo?.is_bot ? `${oppName} · ${date}` : t("replay.subtitle", { username: isolate(oppInfo?.username ?? ""), date })}
            </Typography>
          </div>
          <Button
            size="small"
            variant="text"
            startIcon={<LockIcon sx={{ fontSize: iconSize.sm }} />}
            onClick={() => setSheet("private")}
            sx={{ flex: "none" }}
          >
            {t("replay.private")}
          </Button>
          <IconButton aria-label={t("replay.menu")} onClick={() => setSheet("menu")}>
            <MenuIcon />
          </IconButton>
        </TopStrip>
        <div className="r-opp">{bar(opp)}</div>
        <div className="r-own">{bar(you)}</div>
      </div>

      <div className="r-board">
        <BoardStage
          label={t("match.board.label")}
          position={view?.position ?? tl.frames[0]!.view.position}
          perspective={you}
          lite={prefs.graphics_lite}
          reducedMotion={reduced}
          dice={diceShow}
          input={null}
          lastMove={null}
          moveHint={moveHint}
          snapKey={snapKey}
          labels={sceneLabels}
          themes={{ board: "default", checkers: ["default", "default"] }}
        >
          {view && view.variant === "standard_cube" && view.cubeOwner === null && (
            <Box sx={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", zIndex: zIndex.hud }}>
              <CubeChip value={view.cubeValue} label={t("match.cube.centered", { value: f.number(view.cubeValue) })} />
            </Box>
          )}
          {card}
        </BoardStage>
      </div>

      <Controls className="r-controls" aria-label={t("replay.controls")} role="group">
        {hint && (
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }} role="note">
            <Typography variant="body2" sx={{ flex: "1 1 auto" }}>
              {t("replay.hint.verify")}
            </Typography>
            <Button size="small" onClick={() => setHint(false)}>
              {t("common.close")}
            </Button>
          </Stack>
        )}
        {/* Media controls and the scrubber never mirror (P§11): → is always forward. */}
        <Box dir="ltr" sx={{ paddingInline: 1.5 }}>
          <Slider
            value={cur}
            min={0}
            max={Math.max(0, steps.length - 1)}
            step={1}
            marks={gameStarts.map((g) => ({ value: g.step, label: f.number(g.gameNo) }))}
            onChange={(_, v) => {
              setPlaying(false);
              jump(v as number);
            }}
            aria-label={t("replay.scrubber")}
            getAriaValueText={(v) => t("replay.position", { i: f.number(v + 1), n: f.number(steps.length), g: f.number(tl.frames[steps[v] ?? 0]?.view.gameNo ?? 1) })}
            sx={{ "& .MuiSlider-thumb": { width: 20, height: 20, "&::before": { boxShadow: "none" }, "&::after": { width: minTouchTarget, height: minTouchTarget } } }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }} aria-hidden>
          {t("replay.position", { i: f.number(cur + 1), n: f.number(steps.length), g: f.number(gameNo) })}
        </Typography>
        <div className="r-media" dir="ltr">
          <IconButton aria-label={t("replay.stepBack")} title={t("replay.stepBack")} onClick={stepBack} disabled={cur === 0}>
            <StepBackIcon />
          </IconButton>
          <IconButton className="r-play" aria-label={playing ? t("replay.pause") : t("replay.play")} onClick={togglePlay}>
            {playing ? <MediaPauseIcon /> : <MediaPlayIcon />}
          </IconButton>
          <IconButton aria-label={t("replay.stepForward")} title={t("replay.stepForward")} onClick={stepForward} disabled={last}>
            <StepForwardIcon />
          </IconButton>
        </div>
        <div className="r-chips">
          <Button
            variant="outlined"
            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
            aria-label={t("replay.speed", { speed: speedLabel(speed) })}
          >
            {speedLabel(speed)}
          </Button>
          <Button variant="outlined" onClick={() => setSheet("games")}>
            {t("replay.game.selector", { g: f.number(gameNo), m: f.number(gameCount) })}
          </Button>
          <Button variant="outlined" startIcon={<ShieldIcon />} onClick={() => setSheet("verify")}>
            {t("replay.verify.title")}
          </Button>
          {!wide && (
            <Button variant="outlined" onClick={() => setSheet("moves")}>
              {t("replay.moves")}
            </Button>
          )}
        </div>
      </Controls>

      {wide && (
        <Panel className="r-end" aria-label={t("replay.moves")}>
          <Typography variant="labelSmall" component="h2" color="text.secondary">
            {t("replay.moves")}
          </Typography>
          {moveList}
        </Panel>
      )}

      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announce}
      </span>

      <BottomSheet
        open={sheet === "moves" || sheet === "games" || sheet === "menu" || sheet === "private"}
        onClose={() => setSheet(null)}
        title={
          sheet === "moves"
            ? t("replay.moves")
            : sheet === "games"
              ? t("replay.game.selector", { g: f.number(gameNo), m: f.number(gameCount) })
              : sheet === "private"
                ? t("replay.private")
                : t("replay.menu")
        }
      >
        {sheet === "moves" && moveList}
        {sheet === "private" && <Typography>{t("replay.privateNote", { username: isolate(oppInfo?.username ?? "") })}</Typography>}
        {sheet === "games" && (
          <Stack spacing={0.5} component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {gameStarts.map((g) => {
              const r = results.find((x) => x.game_no === g.gameNo);
              const text = r
                ? r.winner === you
                  ? t("replay.game.itemYou", { g: f.number(g.gameNo), points: f.number(r.points), kind: t(`match.kind.${r.kind}`) })
                  : t("replay.game.itemThem", { g: f.number(g.gameNo), username: names(r.winner), points: f.number(r.points), kind: t(`match.kind.${r.kind}`) })
                : t("match.game.number", { n: f.number(g.gameNo) });
              return (
                <li key={g.gameNo}>
                  <ListButton
                    aria-current={g.gameNo === gameNo ? "step" : undefined}
                    onClick={() => {
                      setPlaying(false);
                      jump(g.step);
                      setSheet(null);
                    }}
                  >
                    <span style={{ flex: "1 1 auto" }}>{text}</span>
                    <ChevronForwardIcon sx={{ fontSize: iconSize.sm }} />
                  </ListButton>
                </li>
              );
            })}
          </Stack>
        )}
        {sheet === "menu" && (
          <Stack spacing={2}>
            <Box sx={{ borderRadius: `${radii.lg}px`, border: 1, borderColor: "tokens.outlineSubtle", overflow: "hidden" }}>
              <SwitchRow label={t("replay.showReactions")} checked={showReactions} onChange={setShowReactions} />
              <SwitchRow label={t("settings.lite.label")} description={t("settings.lite.desc")} checked={prefs.graphics_lite} onChange={(v) => setPref("graphics_lite", v)} />
              <SwitchRow label={t("settings.sound.label")} checked={prefs.sound} onChange={(v) => setPref("sound", v)} />
            </Box>
            <Stack spacing={1}>
              <Typography variant="labelSmall" component="h3" color="text.secondary">
                {t("replay.info")}
              </Typography>
              <Typography variant="body2">
                {labels.variant(replay.variant)}
                {t("common.listSep")}
                {labels.length(replay.length)}
                {t("common.listSep")}
                {replay.is_bot ? t("history.row.practice") : replay.entry > 0 ? t("history.row.table", { entry: f.number(replay.entry) }) : null}
              </Typography>
              <Typography variant="body2">{f.dateTime(replay.ended_at ?? replay.created_at)}</Typography>
              <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}>
                <SeedText value={replay.seed_commit} label={t("match.menu.seedCommit")} />
                <CopyButton value={replay.seed_commit} label={t("common.copy")} />
              </Stack>
            </Stack>
          </Stack>
        )}
      </BottomSheet>
      <VerifyDiceSheet open={sheet === "verify"} onClose={() => setSheet(null)} replay={replay} />
    </Screen>
  );
}
