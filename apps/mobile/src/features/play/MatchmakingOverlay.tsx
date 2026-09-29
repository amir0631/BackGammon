"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import { styled, useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { avatarSize, layout, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { MatchFoundOut } from "@bg/protocol";
import { InfoIcon, OfflineIcon } from "@/components/icons";
import { BotIcon, ShieldIcon } from "@/components/icons/game";
import { Avatar } from "@/components/profile/Avatar";
import { InfoLine } from "@/components/wallet/InfoLine";
import { useCloseOnBack } from "@/lib/useCloseOnBack";
import { useFormat } from "@/lib/useFormat";
import { safeInsetBottom, safeInsetTop, visuallyHidden } from "@/theme/layout";
import { useReducedMotion } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "./labels";
import type { QueueState } from "./usePlayQueue";

// PL-06 matchmaking and PL-07 match found (play.md §3.4, §3.5): one overlay, full screen on phones
// (nav hidden), a centered card over the dimmed lobby from md. Only one action besides the
// long-wait text actions: "Cancel search", in the bottom 40% on phones. Cancel, back, and Esc all
// leave the queue at once, without a confirmation. The elapsed timer is announced only at 1 minute
// and at the long-wait note, never every second.

/** After this long, the neutral "few players" line with other options appears (§3.4 step 3). */
const LONG_WAIT_MS = 120_000;
const MINUTE_MS = 60_000;
/** Found → the match screen opens by itself after this long (§3.5 step 2). */
const FOUND_NAVIGATE_MS = 1500;

const Body = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  minHeight: "100%",
  gap: theme.spacing(2),
  paddingInline: theme.spacing(2.5),
  paddingBlockStart: `calc(${theme.spacing(4)} + ${safeInsetTop})`,
  paddingBlockEnd: `calc(${theme.spacing(2.5)} + ${safeInsetBottom})`,
  "& .mm-main": { flex: "1 1 auto", display: "flex", flexDirection: "column", gap: theme.spacing(2), justifyContent: "center" },
  "& .mm-actions": { flex: "none", display: "flex", flexDirection: "column", gap: theme.spacing(1) },
  "&[data-wide='true']": { paddingBlock: theme.spacing(3), minHeight: 0 },
  // Landscape phones: summary on the start side, Cancel on the end side (§6).
  [`@media (orientation: landscape) and (max-height: ${layout.compactHeight - 0.02}px)`]: {
    flexDirection: "row",
    alignItems: "center",
    paddingBlockStart: `calc(${theme.spacing(2)} + ${safeInsetTop})`,
    "& .mm-main": { flex: "1 1 60%", minWidth: 0 },
    "& .mm-actions": { flex: "1 1 40%", minWidth: 0 },
  },
}));

const OpponentCard = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    backgroundColor: t.surfaceRaised,
    border: `1px solid ${t.outlineSubtle}`,
    containerType: "inline-size",
    "@container (max-width: 16rem)": { flexDirection: "column", alignItems: "flex-start" },
  };
});

export interface MatchmakingOverlayProps {
  state: QueueState;
  /** Players waiting at this tier (`Tier.waiting`); null hides the line (§10 Q8). */
  waiting: number | null;
  payout: number | null;
  onCancel: () => void;
  onChangeTable: () => void;
  onPlayBot: () => void;
  /** Open the match (PL-07 "Go to match", or after 1.5 s). */
  onGo: (found: MatchFoundOut) => void;
  /** Race variant: open the match with the cancel-match sheet (MA-19). */
  onCancelMatch: (found: MatchFoundOut) => void;
}

export function MatchmakingOverlay({ state, waiting, payout, onCancel, onChangeTable, onPlayBot, onGo, onCancelMatch }: MatchmakingOverlayProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const open = state.kind === "waiting" || state.kind === "offline" || state.kind === "found";
  const titleRef = useRef<HTMLHeadingElement>(null);
  const searching = state.kind === "waiting" || state.kind === "offline";

  useCloseOnBack(open && searching, onCancel, true);

  return (
    <Dialog
      open={open}
      fullScreen={!wide}
      onClose={(_, reason) => {
        if (reason === "escapeKeyDown" && searching) onCancel();
      }}
      aria-labelledby="mm-title"
      slotProps={{
        transition: { onEntered: () => titleRef.current?.focus() },
        paper: {
          sx: wide
            ? { maxWidth: layout.dialogMaxWidth, width: "100%" }
            : // Full screen on phones: undo the theme's dialog margins and radius (nav hidden).
              { m: 0, width: "100%", maxWidth: "none", height: "100dvh", maxHeight: "none", borderRadius: 0, bgcolor: "background.default" },
        },
      }}
    >
      <Body data-wide={wide ? "true" : undefined}>
        {state.kind === "found" ? (
          <FoundContent state={state} titleRef={titleRef} onGo={onGo} onCancelMatch={onCancelMatch} />
        ) : searching ? (
          <SearchContent
            state={state}
            waiting={waiting}
            payout={payout}
            titleRef={titleRef}
            onCancel={onCancel}
            onChangeTable={onChangeTable}
            onPlayBot={onPlayBot}
          />
        ) : null}
      </Body>
    </Dialog>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function SearchContent({
  state,
  waiting,
  payout,
  titleRef,
  onCancel,
  onChangeTable,
  onPlayBot,
}: {
  state: Extract<QueueState, { kind: "waiting" | "offline" }>;
  waiting: number | null;
  payout: number | null;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onCancel: () => void;
  onChangeTable: () => void;
  onPlayBot: () => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const reduced = useReducedMotion();
  const offline = state.kind === "offline";
  const now = useNow(!offline);
  const elapsed = offline ? state.elapsed : Math.max(0, now - state.since);
  const seconds = Math.floor(elapsed / 1000);
  const longWait = elapsed >= LONG_WAIT_MS;
  const [announce, setAnnounce] = useState(t("play.queue.searchingAnnounce"));

  useEffect(() => {
    if (offline) setAnnounce(t("play.queue.offline"));
    else if (state.kind === "waiting" && state.again) setAnnounce(t("play.queue.searchingAgain"));
  }, [offline, state, t]);
  const minute = elapsed >= MINUTE_MS;
  useEffect(() => {
    if (minute && !longWait) setAnnounce(t("play.queue.minuteAnnounce"));
  }, [minute, longWait, t]);
  useEffect(() => {
    if (longWait) setAnnounce(t("play.queue.longWait"));
  }, [longWait, t]);

  const { tier_id: entry, variant, length } = state.req;

  return (
    <>
      <div className="mm-main">
        <Typography ref={titleRef} id="mm-title" variant="h3" component="h2" tabIndex={-1} sx={{ "&:focus": { outline: "none" } }}>
          {t("play.queue.title")}
        </Typography>
        <Typography variant="h4" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {t("play.queue.elapsed", { time: `\u2066${f.clock(seconds)}\u2069` })}
        </Typography>
        {offline ? (
          <InfoLine icon={OfflineIcon} tone="primary">
            {t("play.queue.offline")}
          </InfoLine>
        ) : reduced ? (
          <LinearProgress variant="determinate" value={100} aria-hidden sx={{ height: 6, borderRadius: radii.pill }} />
        ) : (
          <LinearProgress aria-hidden sx={{ height: 6, borderRadius: radii.pill }} />
        )}
        {state.kind === "waiting" && state.again && (
          <InfoLine icon={InfoIcon} tone="primary">
            {t("play.queue.searchingAgain")}
          </InfoLine>
        )}
        <Stack spacing={0.5}>
          <Typography variant="body1">
            {t("play.queue.summary", { entry: f.number(entry), variant: labels.variant(variant), n: f.number(length) })}
          </Typography>
          {payout !== null && (
            <Typography variant="body2" color="text.secondary">
              {t("play.tier.payout", { payout: f.number(payout) })}
            </Typography>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t("play.queue.widening")}
        </Typography>
        {waiting !== null && waiting > 0 && (
          <Typography variant="body2" color="text.secondary">
            {t("play.queue.waiting", { count: waiting })}
          </Typography>
        )}
        {longWait && !offline && (
          <Stack spacing={1}>
            <Typography variant="body2">{t("play.queue.longWait")}</Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button variant="text" onClick={onChangeTable}>
                {t("play.queue.changeTable")}
              </Button>
              <Button variant="text" onClick={onPlayBot} startIcon={<BotIcon />}>
                {t("play.practice.button")}
              </Button>
            </Stack>
          </Stack>
        )}
        <span role="status" style={visuallyHidden}>
          {announce}
        </span>
      </div>
      <div className="mm-actions">
        <Button variant="outlined" size="large" fullWidth onClick={onCancel} sx={{ minHeight: 48 }}>
          {t("play.queue.cancel")}
        </Button>
      </div>
    </>
  );
}

function FoundContent({
  state,
  titleRef,
  onGo,
  onCancelMatch,
}: {
  state: Extract<QueueState, { kind: "found" }>;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onGo: (found: MatchFoundOut) => void;
  onCancelMatch: (found: MatchFoundOut) => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const { found, race } = state;
  const opp = found.opponent;
  const goRef = useRef(onGo);
  goRef.current = onGo;

  useEffect(() => {
    if (race) return;
    const timer = window.setTimeout(() => goRef.current(found), FOUND_NAVIGATE_MS);
    return () => window.clearTimeout(timer);
  }, [race, found]);

  const name = opp.is_bot ? labels.botName(opp.bot_level) : `@${isolate(opp.username)}`;

  return (
    <>
      <div className="mm-main">
        <Typography ref={titleRef} id="mm-title" variant="h3" component="h2" tabIndex={-1} sx={{ "&:focus": { outline: "none" } }}>
          {t("play.found.title")}
        </Typography>
        <OpponentCard
          role="group"
          aria-label={t("play.found.opponentLabel", { username: isolate(opp.username), level: f.number(opp.level), elo: f.number(opp.elo) })}
        >
          <Avatar avatarKey={opp.avatar} size={avatarSize.md} />
          <Box sx={{ minWidth: 0 }} aria-hidden>
            <Typography variant="h4" component="p" sx={{ overflowWrap: "anywhere" }}>
              {opp.is_bot ? name : <bdi dir="ltr">{opp.username}</bdi>}
            </Typography>
            {!opp.is_bot && (
              <Typography variant="body2" color="text.secondary">
                {t("match.bar.levelElo", { level: f.number(opp.level), elo: f.number(opp.elo) })}
              </Typography>
            )}
          </Box>
        </OpponentCard>
        {race ? (
          <InfoLine icon={InfoIcon} tone="primary">
            {t("play.found.race", { entry: f.number(found.entry) })}
          </InfoLine>
        ) : (
          found.entry > 0 && <Typography variant="body1">{t("play.found.entryPaid", { entry: f.number(found.entry) })}</Typography>
        )}
        <InfoLine icon={ShieldIcon}>{t("play.found.fairDice")}</InfoLine>
        <span role="status" style={visuallyHidden}>
          {t("play.found.announce", { username: isolate(opp.username) })}
        </span>
      </div>
      <div className="mm-actions">
        <Button variant="contained" size="large" fullWidth onClick={() => onGo(found)}>
          {t("play.found.go")}
        </Button>
        {race && (
          <Button variant="text" fullWidth onClick={() => onCancelMatch(found)}>
            {t("play.found.cancelMatch")}
          </Button>
        )}
      </div>
    </>
  );
}

