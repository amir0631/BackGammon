"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import { avatarSize, iconSize, layout, minTouchTarget, radii, zIndex } from "@bg/design-tokens";
import type { MatchView, Player, TurnBuilder } from "@bg/game-core";
import type { GameResultOut, MatchEndedOut, MatchRulesOut, Tier, UserPrefs } from "@bg/protocol";
import { ActionButton } from "@/components/forms/ActionButton";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { BackIcon, ChevronForwardIcon, InfoIcon, OfflineIcon, WarningIcon } from "@/components/icons";
import { BotIcon, CubeIcon, FlagIcon, HistoryIcon, KeyboardIcon, ShieldIcon } from "@/components/icons/game";
import { ValueRows, type ValueRow } from "@/components/money/ValueRows";
import { Avatar } from "@/components/profile/Avatar";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { CopyButton } from "@/components/wallet/CopyButton";
import { InfoLine } from "@/components/wallet/InfoLine";
import { markFreshMatch } from "@/lib/match/fresh";
import type { HistoryItem } from "@/lib/match/store";
import { useGameSocket } from "@/lib/socket";
import { useFormat } from "@/lib/useFormat";
import { useWallet } from "@/lib/wallet";
import { safeInsetBottom, safeInsetTop } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { InsufficientOptions } from "../play/InsufficientOptions";
import { useGameLabels } from "../play/labels";
import { Choice, MatchInfo, MoveEntry, MoveHistory, ReactionPicker, resignPreview, useNames, type ReactionsProps } from "./panels";
import { ClockDisplay } from "./parts";
import { gamePoints, type ClockReading } from "./rules";

// Sheets, dialogs, and overlays of the match screen (match.md MA-03 … MA-19). One sheet at a time
// (P§1): the sheet kinds swap content inside one BottomSheet. MA-07 (double offered), MA-10
// (reconnecting), and MA-13b (match ended) are blocking and close any open sheet first.

export type SheetKind = "menu" | "history" | "reactions" | "resign" | "leave" | "peek" | "moveEntry" | "cancelMatch";

export interface MatchOverlaysProps {
  matchId: string;
  view: MatchView | null;
  you: Player | null;
  rules: MatchRulesOut | null;
  history: HistoryItem[];
  sheet: SheetKind | null;
  setSheet: (s: SheetKind | null) => void;
  builder: TurnBuilder | null;
  selected: number | null;
  setSelected: (s: number | null) => void;
  onStep: (from: number, to: number) => void;
  onUndo: () => void;
  onConfirm: () => void;
  onCubeAnswer: (take: boolean) => void;
  cubeInFlight: boolean;
  clockReading: ClockReading | null;
  onResign: (scope: "game" | "match") => void;
  resignInFlight: boolean;
  resignError: string | null;
  reconnecting: boolean;
  reconnectFrom: number | null;
  attempt: number;
  onRetryNow: () => void;
  now: number;
  ended: MatchEndedOut | null;
  limit: number | null;
  prefs: UserPrefs;
  setPref: (key: keyof UserPrefs, value: boolean) => void;
  showOpp: boolean;
  setShowOpp: (v: boolean) => void;
  reactions: ReactionsProps;
  lastMoveText: string | null;
  suspended: boolean;
}

/** Before the match's first roll: resigning the match cancels it with refunds (§3.12, §10 Q4). */
function beforeFirstRoll(view: MatchView, history: HistoryItem[]): boolean {
  return view.gameNo === 1 && view.phase === "opening" && !view.dice && view.results.length === 0 && history.every((h) => h.kind === "game");
}

export function MatchOverlays(props: MatchOverlaysProps) {
  const { view, you, sheet, setSheet, rules, history } = props;
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const names = useNames(view);
  const labels = useGameLabels();
  const [resignChoice, setResignChoice] = useState<"game" | "match" | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (sheet !== "resign") setResignChoice(null);
  }, [sheet]);

  const opp = (you === null ? 1 : 1 - you) as Player;
  const oppName = names(opp);
  const oppInfo = view?.players[opp];
  const active = view?.status === "active";
  const doubleOffered = Boolean(view && active && view.phase === "cube_offered" && you !== null && view.turn !== you);
  const matchOver = Boolean(props.ended) || view?.phase === "match_over";
  const blocking = doubleOffered || props.reconnecting || matchOver;
  const sheetOpen = sheet !== null && !blocking && view !== null;

  let title: ReactNode = "";
  let body: ReactNode = null;
  let footer: ReactNode = null;
  let dismissible = true;

  if (sheetOpen && view) {
    switch (sheet) {
      case "menu":
        title = t("match.menu.title");
        body = (
          <Stack spacing={2.5}>
            <MatchInfo view={view} payout={rules?.payout ?? null} />
            <Stack spacing={0.5}>
              <MenuRow icon={HistoryIcon} label={t("match.menu.moves")} onClick={() => setSheet("history")} />
              <MenuRow icon={KeyboardIcon} label={t("match.menu.moveEntry")} onClick={() => setSheet("moveEntry")} />
            </Stack>
            <Box sx={{ borderRadius: `${radii.lg}px`, border: 1, borderColor: "tokens.outlineSubtle", overflow: "hidden" }}>
              <SwitchRow label={t("match.reactions.showOpponent")} checked={props.showOpp} onChange={props.setShowOpp} />
              <SwitchRow label={t("settings.sound.label")} checked={props.prefs.sound} onChange={(v) => props.setPref("sound", v)} />
              {typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && (
                <SwitchRow label={t("settings.vibration.label")} checked={props.prefs.vibration} onChange={(v) => props.setPref("vibration", v)} />
              )}
              <SwitchRow label={t("settings.lite.label")} description={t("settings.lite.desc")} checked={props.prefs.graphics_lite} onChange={(v) => props.setPref("graphics_lite", v)} />
            </Box>
            <Stack spacing={0.5}>
              {active && <MenuRow icon={BackIcon} label={t("match.leave")} onClick={() => setSheet("leave")} />}
              {active && <MenuRow icon={FlagIcon} label={t("match.menu.resign")} onClick={() => setSheet("resign")} />}
            </Stack>
          </Stack>
        );
        break;
      case "history":
        title = t("match.menu.moves");
        body = <MoveHistory view={view} history={history} you={you} />;
        break;
      case "reactions":
        title = t("match.reactions.title");
        body = <ReactionPicker {...props.reactions} />;
        break;
      case "moveEntry":
        title = t("match.moveEntry.title");
        body = (
          <MoveEntry
            builder={props.builder}
            view={view}
            you={you}
            lastMove={props.lastMoveText}
            selected={props.selected}
            onSelect={props.setSelected}
            onMove={props.onStep}
            onUndo={props.onUndo}
            onConfirm={() => {
              props.onConfirm();
              setSheet(null);
            }}
            canConfirm={Boolean(props.builder?.complete)}
          />
        );
        break;
      case "peek":
        title = oppInfo?.is_bot ? labels.botName(oppInfo.bot_level) : <bdi dir="ltr">@{oppInfo?.username}</bdi>;
        body = oppInfo ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Avatar avatarKey={oppInfo.avatar} size={avatarSize.md} />
              {!oppInfo.is_bot && (
                <Typography variant="body1">{t("match.bar.levelElo", { level: f.number(oppInfo.level), elo: f.number(oppInfo.elo) })}</Typography>
              )}
              {oppInfo.is_bot && (
                <Typography variant="body1" sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                  <BotIcon sx={{ fontSize: iconSize.sm }} />
                  {t("play.bot.label")}
                </Typography>
              )}
            </Stack>
            {!oppInfo.is_bot && (
              <>
                {view.turn === you && active && <InfoLine>{t("match.peek.keepsGoing")}</InfoLine>}
                <Button variant="outlined" component={NextLink} href={`/profile/${encodeURIComponent(oppInfo.username)}`}>
                  {t("match.peek.viewProfile")}
                </Button>
              </>
            )}
          </Stack>
        ) : null;
        break;
      case "leave":
        title = t("match.leaveSheet.title");
        body = (
          <Stack spacing={1.5}>
            <Typography>{t("match.leaveSheet.body")}</Typography>
            {view.turn === you && active && <InfoLine icon={WarningIcon} tone="primary">{t("match.leaveSheet.yourTurn")}</InfoLine>}
            {props.limit !== null && <Typography variant="body2" color="text.secondary">{t("match.leaveSheet.timeouts", { limit: f.number(props.limit) })}</Typography>}
          </Stack>
        );
        footer = (
          <>
            <Button ref={stayRef} variant="contained" size="large" fullWidth onClick={() => setSheet(null)} autoFocus>
              {t("match.leaveSheet.stay")}
            </Button>
            <Button variant="outlined" fullWidth onClick={() => router.push("/play")}>
              {t("match.leaveSheet.leave")}
            </Button>
            {active && (
              <Button variant="text" fullWidth onClick={() => setSheet("resign")}>
                {t("match.leaveSheet.resign")}
              </Button>
            )}
          </>
        );
        break;
      case "resign": {
        title = t("match.resign.title");
        const early = beforeFirstRoll(view, history);
        const preview = you !== null ? resignPreview(view, you, rules) : null;
        const between = view.phase === "game_over";
        const bot = Boolean(oppInfo?.is_bot);
        dismissible = !props.resignInFlight;
        body = (
          <Stack spacing={1.5} role="radiogroup" aria-label={t("match.resign.title")}>
            {!early && (
              <Choice selected={resignChoice === "game"} onClick={() => setResignChoice("game")} title={t("match.resign.game")} disabled={between}>
                {between ? (
                  t("match.resign.gameUnavailable")
                ) : preview ? (
                  <>
                    {preview.points !== null &&
                      t("match.resign.gameBody", { username: oppName, points: preview.points, kind: t(`match.kind.${preview.kind}`), cube: f.number(view.cubeValue) })}{" "}
                    {t("match.resign.scoreAfter", { self: f.number(preview.scoreAfter[0]), opp: f.number(preview.scoreAfter[1]) })}
                    {preview.endsMatch && ` ${t("match.resign.endsMatch", { username: oppName })}`}
                  </>
                ) : null}
              </Choice>
            )}
            {early ? (
              <Choice selected={resignChoice === "match"} onClick={() => setResignChoice("match")} title={t("match.join.cancel")}>
                {t("match.join.cancelBody")}
              </Choice>
            ) : (
              <Choice selected={resignChoice === "match"} onClick={() => setResignChoice("match")} title={t("match.resign.match")}>
                {t("match.resign.matchBody", { username: oppName })}{" "}
                {bot
                  ? t("match.resign.practice")
                  : view.entry > 0 && rules
                    ? `${t("match.resign.matchCoins", { entry: f.number(view.entry), username: oppName, payout: f.number(rules.payout) })} ${t("match.resign.matchRated")}`
                    : t("match.resign.matchRated")}
              </Choice>
            )}
          </Stack>
        );
        footer = (
          <>
            {props.resignError && (
              <Typography role="alert" variant="body2" sx={{ color: "tokens.error" }}>
                {props.resignError}
              </Typography>
            )}
            {resignChoice && (
              <Button
                variant="contained"
                color="error"
                size="large"
                fullWidth
                startIcon={<FlagIcon />}
                loading={props.resignInFlight}
                onClick={() => props.onResign(resignChoice)}
              >
                {resignChoice === "game" ? t("match.resign.ctaGame") : early ? t("match.join.cancel") : t("match.resign.ctaMatch")}
              </Button>
            )}
            <Button variant="outlined" fullWidth onClick={() => setSheet(null)} disabled={props.resignInFlight} autoFocus>
              {t("common.cancel")}
            </Button>
          </>
        );
        break;
      }
      case "cancelMatch":
        title = t("match.join.cancelTitle");
        dismissible = !props.resignInFlight;
        body = <Typography>{t("match.join.cancelBody")}</Typography>;
        footer = (
          <>
            <Button variant="contained" color="error" size="large" fullWidth loading={props.resignInFlight} onClick={() => props.onResign("match")}>
              {t("match.join.cancel")}
            </Button>
            <Button variant="outlined" fullWidth onClick={() => setSheet(null)} disabled={props.resignInFlight} autoFocus>
              {t("match.join.keepWaiting")}
            </Button>
          </>
        );
        break;
      default:
        break;
    }
  }

  return (
    <>
      <BottomSheet open={sheetOpen} onClose={() => setSheet(null)} title={title} footer={footer} dismissible={dismissible}>
        {body}
      </BottomSheet>
      {view && doubleOffered && you !== null && (
        <DoubleDialog view={view} you={you} rules={rules} oppName={oppName} reading={props.clockReading} inFlight={props.cubeInFlight} onAnswer={props.onCubeAnswer} />
      )}
      {view && props.reconnecting && !matchOver && (
        <ReconnectOverlay
          view={view}
          you={you}
          graceSeconds={rules?.reconnect_grace_seconds ?? null}
          from={props.reconnectFrom}
          now={props.now}
          attempt={props.attempt}
          onRetry={props.onRetryNow}
        />
      )}
      {view && matchOver && <ResultSheet {...props} />}
    </>
  );
}

function MenuRow({ icon: Icon, label, onClick }: { icon: typeof BackIcon; label: string; onClick: () => void }) {
  return (
    <Button
      variant="text"
      onClick={onClick}
      startIcon={<Icon />}
      endIcon={<ChevronForwardIcon sx={{ fontSize: iconSize.sm }} />}
      sx={{ justifyContent: "flex-start", minHeight: layout.listRowMinHeight, "& .MuiButton-endIcon": { marginInlineStart: "auto" } }}
      fullWidth
    >
      {label}
    </Button>
  );
}

// ---- MA-07 Double offered ------------------------------------------------------------------------

function DoubleDialog({
  view,
  you,
  rules,
  oppName,
  reading,
  inFlight,
  onAnswer,
}: {
  view: MatchView;
  you: Player;
  rules: MatchRulesOut | null;
  oppName: string;
  reading: ClockReading | null;
  inFlight: boolean;
  onAnswer: (take: boolean) => void;
}) {
  const t = useTranslations("match.cube.offer");
  const f = useFormat();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const next = view.cubeValue * 2;
  const points = gamePoints(rules, "single", view.cubeValue) ?? view.cubeValue;
  const opp = 1 - you;
  const oppAfter = (view.score[opp] ?? 0) + points;
  return (
    <Dialog open aria-labelledby="cube-title" disableEscapeKeyDown slotProps={{ transition: { onEntered: () => titleRef.current?.focus() } }}>
      <Stack spacing={2} sx={{ p: 3 }}>
        <Typography id="cube-title" ref={titleRef} tabIndex={-1} variant="h4" component="h2" sx={{ display: "flex", gap: 1, alignItems: "center", "&:focus": { outline: "none" } }}>
          <CubeIcon />
          {t("title", { username: oppName, value: f.number(next) })}
        </Typography>
        <Typography>{t("take", { value: f.number(next) })}</Typography>
        <Typography>
          {t("drop", { username: oppName, points })} {t("scoreAfter", { self: f.number(view.score[you] ?? 0), opp: f.number(oppAfter) })}
          {oppAfter >= view.length && ` ${t("wouldWin", { username: oppName })}`}
        </Typography>
        {reading && <ClockDisplay reading={reading} running={reading.actor === you} bank={view.clock.bank[you] ?? 0} />}
        <InfoLine>{t("timeoutNote")}</InfoLine>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" size="large" fullWidth disabled={inFlight} onClick={() => onAnswer(true)}>
            {t("takeCta", { value: f.number(next) })}
          </Button>
          <Button variant="outlined" size="large" fullWidth disabled={inFlight} onClick={() => onAnswer(false)}>
            {t("dropCta", { points: f.number(points) })}
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
}

// ---- MA-10 Reconnecting ---------------------------------------------------------------------------

function ReconnectOverlay({
  view,
  you,
  graceSeconds,
  from,
  now,
  attempt,
  onRetry,
}: {
  view: MatchView;
  you: Player | null;
  graceSeconds: number | null;
  from: number | null;
  now: number;
  attempt: number;
  onRetry: () => void;
}) {
  const t = useTranslations("match.reconnect");
  const tMatch = useTranslations("match");
  const f = useFormat();
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const left = graceSeconds !== null && from !== null ? Math.max(0, Math.ceil((from + graceSeconds * 1000 - now) / 1000)) : null;
  const status = left === null ? null : left === 0 ? t("expired") : left <= 10 ? t("warning10") : left <= 30 ? t("warning30") : null;
  return (
    <Dialog
      open
      fullScreen
      disableEscapeKeyDown
      aria-labelledby="reconnect-title"
      slotProps={{
        transition: { onEntered: () => titleRef.current?.focus() },
        paper: { sx: { m: 0, width: "100%", maxWidth: "none", height: "100dvh", maxHeight: "none", borderRadius: 0, bgcolor: "tokens.scrim", display: "grid", placeItems: "center" } },
      }}
    >
      <Stack spacing={2} sx={{ p: 3, m: 2, maxWidth: layout.dialogMaxWidth, borderRadius: `${radii.lg}px`, bgcolor: "tokens.surfaceRaised", paddingBlockEnd: `calc(24px + ${safeInsetBottom})`, marginBlockStart: safeInsetTop }}>
        <Typography id="reconnect-title" ref={titleRef} tabIndex={-1} variant="h4" component="h2" sx={{ display: "flex", gap: 1, alignItems: "center", "&:focus": { outline: "none" } }}>
          <OfflineIcon />
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("attempt", { n: f.number(Math.max(1, attempt)) })}
        </Typography>
        {left !== null && left > 0 && (
          <Typography variant="h5" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {t("countdown", { time: `⁦${f.clock(left)}⁩` })}
          </Typography>
        )}
        {status && (
          <Typography role="status" sx={{ display: "flex", gap: 1, alignItems: "center", color: "tokens.warning" }}>
            <WarningIcon sx={{ fontSize: iconSize.sm }} />
            {status}
          </Typography>
        )}
        <Typography>{view.turn === you ? t("yourTurn") : t("notYourTurn")}</Typography>
        <Button variant="contained" size="large" onClick={onRetry}>
          {t("retryNow")}
        </Button>
        <Button variant="text" onClick={() => router.push("/play")}>
          {tMatch("leave")}
        </Button>
      </Stack>
    </Dialog>
  );
}

// ---- Board cards: MA-19 waiting to join, MA-13a game ended --------------------------------------

const BoardCard = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "absolute",
    insetInline: theme.spacing(2),
    insetBlockStart: "50%",
    transform: "translateY(-50%)",
    marginInline: "auto",
    maxWidth: 400,
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    backgroundColor: t.surfaceRaised,
    border: `1px solid ${t.outline}`,
    boxShadow: `var(--bg-elevation-3)`,
    zIndex: zIndex.hud,
    display: "grid",
    gap: theme.spacing(1),
  };
});

function BoardCards({
  view,
  waitingJoin,
  attachedAt,
  now,
  oppName,
  lastResult,
  you,
  onCancelMatch,
}: {
  view: MatchView | null;
  waitingJoin: boolean;
  attachedAt: number | null;
  now: number;
  oppName: string;
  lastResult: GameResultOut | null;
  you: Player | null;
  onCancelMatch: () => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  if (!view) return null;
  if (waitingJoin) {
    const elapsed = attachedAt ? Math.floor((now - attachedAt) / 1000) : 0;
    return (
      <BoardCard role="status">
        <Typography variant="h5" component="p">
          {t("match.join.waiting", { username: oppName })}
        </Typography>
        <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {t("match.join.elapsed", { time: `⁦${f.clock(elapsed)}⁩` })}
        </Typography>
        {view.entry > 0 && <InfoLine>{t("match.join.refundNote", { username: oppName })}</InfoLine>}
        <Button variant="outlined" onClick={onCancelMatch}>
          {t("match.join.cancel")}
        </Button>
      </BoardCard>
    );
  }
  if (lastResult) {
    const youWon = lastResult.winner === you;
    const reason =
      lastResult.reason === "bear_off"
        ? t("match.gameEnded.reason.bear_off")
        : lastResult.reason === "drop"
          ? youWon
            ? t("match.gameEnded.reason.dropTheirs", { username: oppName })
            : t("match.gameEnded.reason.dropYours")
          : youWon
            ? t("match.gameEnded.reason.resignTheirs", { username: oppName })
            : t("match.gameEnded.reason.resignYours");
    const self = you ?? 0;
    return (
      <BoardCard role="status">
        <Typography variant="h5" component="p">
          {youWon ? t("match.gameEnded.youWon", { n: f.number(lastResult.game_no) }) : t("match.gameEnded.theyWon", { username: oppName, n: f.number(lastResult.game_no) })}
        </Typography>
        <Typography variant="body2">
          {youWon ? "+" : "−"}
          {t("match.gameEnded.value", { kind: t(`match.kind.${lastResult.kind}`), cube: f.number(lastResult.cube), points: lastResult.points })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {reason}
        </Typography>
        <Typography variant="body2">
          {t("match.gameEnded.score", { self: f.number(view.score[self] ?? 0), opp: f.number(view.score[1 - self] ?? 0), n: f.number(view.length) })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("match.gameEnded.next")}
        </Typography>
      </BoardCard>
    );
  }
  return null;
}
MatchOverlays.BoardCards = BoardCards;

// ---- MA-13b Match ended ----------------------------------------------------------------------------

function ResultSheet({ matchId, view, you, ended, rules, suspended }: MatchOverlaysProps) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const names = useNames(view);
  const wallet = useWallet();
  const socket = useGameSocket();
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [botInFlight, setBotInFlight] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  if (!view) return null;

  const opp = (you === null ? 1 : 1 - you) as Player;
  const oppName = names(opp);
  const oppInfo = view.players[opp];
  const bot = Boolean(oppInfo?.is_bot);
  const winner = ended ? ended.winner : view.winner;
  const reasonRaw = ended?.reason ?? view.endReason ?? "";
  const aborted = reasonRaw.startsWith("aborted") || (ended !== null && ended.winner === null);
  const youWon = winner !== null && winner === you;
  const score = ended?.score ?? view.score;
  const self = you ?? 0;
  const seed = ended?.seed ?? view.seed;
  const settlement = ended?.settlement ?? null;
  const side = self === 0 ? "a" : "b";
  const elo = ended?.elo?.[side];
  const xp = ended?.xp?.[side];
  const balance = wallet.summary?.balance ?? null;
  const entry = view.entry;
  const unaffordable = !bot && !aborted && entry > 0 && balance !== null && balance < entry;

  const headline = aborted ? t("match.result.cancelled") : youWon ? t("match.result.youWon") : t("match.result.theyWon", { username: oppName });
  const reason = aborted
    ? t("match.result.reason.aborted")
    : reasonRaw === "resign"
      ? youWon
        ? t("match.result.reason.resignTheirs", { username: oppName })
        : t("match.result.reason.resignYours")
      : reasonRaw.endsWith("timeouts")
        ? youWon
          ? t("match.result.reason.timeoutsTheirs", { username: oppName, limit: f.number(rules?.max_consecutive_timeouts ?? 0) })
          : t("match.result.reason.timeoutsYours", { limit: f.number(rules?.max_consecutive_timeouts ?? 0) })
        : reasonRaw.endsWith("disconnect")
          ? youWon
            ? t("match.result.reason.disconnectTheirs", { username: oppName })
            : t("match.result.reason.disconnectYours")
          : t("match.result.reason.points");

  const coinRows: ValueRow[] = [];
  if (settlement && !bot && "pot" in settlement) {
    const sign = (n: number, won: boolean) => (won ? t("match.result.signWon", { amount: f.number(n) }) : t("match.result.signLost", { amount: f.number(n) }));
    coinRows.push({ label: t("match.result.entry"), value: sign(settlement.entry ?? entry, false) });
    if (youWon) {
      coinRows.push({ label: t("match.result.pot"), value: settlement.pot ?? 0, coins: true });
      coinRows.push({ label: t("match.result.fee"), value: sign(settlement.rake ?? 0, false) });
      coinRows.push({ label: t("match.result.received"), value: sign(settlement.payout ?? 0, true), emphasis: true });
      coinRows.push({ label: t("match.result.net"), value: sign((settlement.payout ?? 0) - (settlement.entry ?? entry), true), emphasis: true, divider: true });
    } else {
      coinRows.push({ label: t("match.result.net"), value: sign(settlement.entry ?? entry, false), emphasis: true, divider: true });
    }
  }

  const leave = (to: string) => {
    socket.detach();
    router.push(to);
  };
  const playAgainBot = async () => {
    setBotInFlight(true);
    setBotError(null);
    try {
      const created = await api.matches.startBot(
        (oppInfo?.bot_level as "easy" | "medium" | "hard") ?? "easy",
        view.variant,
        view.length,
      );
      markFreshMatch(created.match_id, null);
      socket.detach();
      router.push(`/match/${created.match_id}`);
    } catch {
      setBotError(t("errors.generic"));
      setBotInFlight(false);
    }
  };
  const again = `${entry}:${view.variant}:${view.length}`;
  if (unaffordable && tiers === null) void api.matches.tiers().then((p) => setTiers(p.results)).catch(() => setTiers([]));

  const footer = (
    <>
      {botError && (
        <Typography role="alert" variant="body2" sx={{ color: "tokens.error" }}>
          {botError}
        </Typography>
      )}
      {aborted ? (
        <ActionButton disabledReason={suspended ? t("account.suspended.actionBlocked") : null} onClick={() => leave(`/play?again=${again}`)}>
          {t("match.result.searchAgain")}
        </ActionButton>
      ) : bot ? (
        <ActionButton disabledReason={suspended ? t("account.suspended.actionBlocked") : null} loading={botInFlight} onClick={() => void playAgainBot()}>
          {t("match.result.playAgain")}
        </ActionButton>
      ) : (
        <ActionButton
          disabledReason={suspended ? t("account.suspended.actionBlocked") : unaffordable ? t("match.result.playAgainUnaffordable") : null}
          onClick={() => leave(`/play?again=${again}`)}
        >
          {t("match.result.playAgain")}
        </ActionButton>
      )}
      {!aborted && (
        <Button variant="outlined" fullWidth onClick={() => leave(`/replay/${matchId}`)}>
          {t("match.result.viewReplay")}
        </Button>
      )}
      <Button variant="text" fullWidth onClick={() => leave("/play")}>
        {t("match.result.backToLobby")}
      </Button>
    </>
  );

  return (
    <BottomSheet open onClose={() => undefined} title={headline} footer={footer} dismissible={false} hideCloseButton closeOnBack={false}>
      <Stack spacing={2}>
        <Typography>{reason}</Typography>
        {!aborted && (
          <>
            <Typography variant="h4" component="p">
              {t("match.result.finalScore", { self: f.number(score[self] ?? 0), opp: f.number(score[1 - self] ?? 0) })}
            </Typography>
            {view.results.length > 0 && (
              <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 0.5 }}>
                {view.results.map((r) => (
                  <Typography component="li" variant="body2" key={r.game_no}>
                    {t("match.result.gameLine", {
                      n: f.number(r.game_no),
                      winner: r.winner === you ? t("match.result.gameWinnerYou") : oppName,
                      kind: t(`match.kind.${r.kind}`),
                      points: `${r.winner === you ? "+" : "−"}${f.number(r.points)}`,
                    })}
                  </Typography>
                ))}
              </Box>
            )}
          </>
        )}
        {aborted && settlement && "refund" in settlement && (
          <InfoLine icon={InfoIcon} tone="primary">
            {t("match.result.refunded", { refund: f.number(settlement.refund ?? entry) })}
          </InfoLine>
        )}
        {bot && !aborted && <InfoLine icon={BotIcon}>{t("match.result.practice")}</InfoLine>}
        {coinRows.length > 0 && <ValueRows rows={coinRows} label={t("match.result.coinsTitle")} />}
        {!bot && !aborted && typeof elo === "number" && (
          <Typography variant="body1">
            {elo > 0 ? t("match.result.eloUp", { delta: f.number(elo) }) : elo < 0 ? t("match.result.eloDown", { delta: f.number(-elo) }) : t("match.result.eloSame")}
          </Typography>
        )}
        {!bot && !aborted && typeof xp === "number" && <Typography variant="body1">{t("match.result.xp", { xp: f.number(xp) })}</Typography>}
        {unaffordable && tiers && (
          <InsufficientOptions
            tiers={tiers}
            entry={entry}
            balance={balance}
            onTier={(tier) => leave(`/play?setup=${tier.id}:${view.variant}:${view.length}`)}
            onBot={() => leave(`/play?bot=${view.variant}:${view.length}`)}
          />
        )}
        {seed && !aborted && (
          <Stack spacing={1} component="section" aria-labelledby="seed-title">
            <Typography id="seed-title" variant="h5" component="h3" sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <ShieldIcon sx={{ fontSize: iconSize.md }} />
              {t("match.result.seedTitle")}
            </Typography>
            <Typography variant="body2">{t("match.result.seedBody")}</Typography>
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}>
              <Typography variant="caption" dir="ltr" sx={{ fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto" }}>
                {seed}
              </Typography>
              <CopyButton value={seed} label={t("match.result.seedCopy")} />
            </Stack>
            <MuiLink component={NextLink} href={`/replay/${matchId}?verify=1`} sx={{ minHeight: minTouchTarget, display: "inline-flex", alignItems: "center", alignSelf: "flex-start" }} onClick={() => socket.detach()}>
              {t("match.result.verify")}
            </MuiLink>
            <Typography variant="caption" color="text.secondary">
              {bot ? null : t("match.result.privacy", { username: oppName })}
            </Typography>
          </Stack>
        )}
      </Stack>
    </BottomSheet>
  );
}
