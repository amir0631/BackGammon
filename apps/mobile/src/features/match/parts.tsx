"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { styled, useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { avatarSize, iconSize, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { PlayerInfo } from "@bg/protocol";
import { WarningIcon } from "@/components/icons";
import { BotIcon, CubeIcon, HourglassIcon } from "@/components/icons/game";
import { Avatar } from "@/components/profile/Avatar";
import { useFormat } from "@/lib/useFormat";
import { mqXs, visuallyHidden } from "@/theme/layout";
import { useReducedMotion } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import type { ClockReading } from "@bg/game-core";

// Match screen building blocks (match.md §3.2, §3.4, §4 MA-02, MA-11, MA-12). HTML over solid
// surfaces, never text on the canvas. Ownership, timers, and the cube never rely on color alone.

// ---- Checker swatch (the side's rim marking, repeated from the board) --------------------------

/** Player A: light with a star; player B: dark with rings (3d-art-direction.md §3). */
export function CheckerSwatch({ side, size = 24 }: { side: number; size?: number }) {
  const theme = useTheme();
  const t = tokensOf(theme);
  const light = side === 0;
  const body = light ? t.playerLight : t.playerDark;
  const rim = light ? t.playerLightRim : t.playerDarkRim;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="10.5" fill={body} stroke={rim} strokeWidth="2.5" />
      {light ? (
        <path d="M12 6.2l1.6 3.7 3.8.5-2.9 2.5.9 3.8L12 14.7l-3.4 2 .9-3.8-2.9-2.5 3.8-.5z" fill="none" stroke={rim} strokeWidth="1.4" strokeLinejoin="round" />
      ) : (
        <>
          <circle cx="12" cy="12" r="5.5" fill="none" stroke={rim} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="2.4" fill="none" stroke={rim} strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

// ---- Clock ------------------------------------------------------------------------------------

const Ring = styled("svg")({ flex: "none", transform: "rotate(-90deg)" });

export function ClockDisplay({ reading, running, bank }: { reading: ClockReading; running: boolean; bank: number }) {
  const t = useTranslations("match.clock");
  const f = useFormat();
  const reduced = useReducedMotion();
  const theme = useTheme();
  const tk = tokensOf(theme);
  const secs = (ms: number) => Math.ceil(ms / 1000);

  if (!running || reading.remaining === null) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
        <HourglassIcon sx={{ fontSize: iconSize.sm }} />
        {t("bank", { time: `⁦${f.clock(Math.max(0, Math.round(bank)))}⁩` })}
      </Typography>
    );
  }
  const usingBank = reading.turnLeft <= 0;
  const warn = reading.remaining <= 10_000;
  const shown = usingBank ? reading.bankLeft : reading.turnLeft;
  const fraction = usingBank ? reading.bankLeft / Math.max(1, bank * 1000) : reading.turnLeft / Math.max(1, reading.turnMs);
  const color = warn ? tk.warning : usingBank ? tk.secondary : tk.primary;

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, color: warn ? "tokens.warning" : "text.primary" }}>
      {reduced ? (
        <Box aria-hidden sx={{ width: 28, height: 6, borderRadius: `${radii.pill}px`, bgcolor: "tokens.surfaceSunken", overflow: "hidden", border: 1, borderColor: "tokens.outline" }}>
          <Box sx={{ width: `${Math.round(Math.min(1, fraction) * 100)}%`, height: "100%", bgcolor: color }} />
        </Box>
      ) : (
        <Ring width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <circle cx="13" cy="13" r="10.5" fill="none" stroke={tk.outlineSubtle} strokeWidth="3" />
          <circle
            cx="13"
            cy="13"
            r="10.5"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${Math.max(0, Math.min(1, fraction)) * 66} 66`}
            strokeLinecap="round"
          />
        </Ring>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <Typography variant="label" component="span" sx={{ fontVariantNumeric: "tabular-nums", color: "inherit" }}>
          <bdi dir="ltr">{f.clock(secs(shown))}</bdi>
        </Typography>
        {usingBank ? (
          <Typography variant="caption" component="span" sx={{ display: "inline-flex", gap: 0.5, alignItems: "center", color: "inherit" }}>
            <HourglassIcon sx={{ fontSize: iconSize.sm - 4 }} />
            {t("usingBank")}
          </Typography>
        ) : warn ? (
          <Typography variant="caption" component="span" sx={{ display: "inline-flex", gap: 0.5, alignItems: "center", color: "inherit" }}>
            <WarningIcon sx={{ fontSize: iconSize.sm - 4 }} />
            {t("warning", { seconds: f.number(secs(reading.remaining)) })}
          </Typography>
        ) : (
          <Typography variant="caption" component="span" color="text.secondary">
            {t("bank", { time: `⁦${f.clock(Math.round(bank))}⁩` })}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ---- Player bar -------------------------------------------------------------------------------

const Bar = styled("section")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.25),
    minHeight: 56,
    paddingInline: theme.spacing(1.5),
    paddingBlock: theme.spacing(0.5),
    backgroundColor: t.surface,
    borderBlock: `1px solid ${t.outlineSubtle}`,
    "&[data-turn='true']": { boxShadow: `inset 0 -3px 0 ${t.primary}` },
    "& .bar-id": { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" },
    "& .bar-meta": { display: "flex", flexWrap: "wrap", columnGap: theme.spacing(1), alignItems: "center" },
    "& .bar-end": { flex: "none", display: "flex", alignItems: "center", gap: theme.spacing(1) },
    "& .bar-pips": {},
    [mqXs]: { "& .bar-pips": { display: "none" } },
    // Narrow bars (xs, landscape side column, 200% text): the clock moves to a second line. The
    // container is the bar's wrapper (a query never measures the element it styles).
    "@container pbar (max-width: 22rem)": {
      flexWrap: "wrap",
      "& .bar-end": { width: "100%", justifyContent: "space-between", paddingInlineStart: 52 },
    },
  };
});

const PeekButton = styled(ButtonBase)(({ theme }) => ({
  borderRadius: "50%",
  minWidth: 44,
  minHeight: 44,
  flex: "none",
  "&.Mui-focusVisible": { outline: `2px solid ${tokensOf(theme).focusRing}`, outlineOffset: 2 },
})) as typeof ButtonBase;

export interface PlayerBarProps {
  player: PlayerInfo;
  side: number;
  self: boolean;
  pips: number | null;
  clock: ReactNode;
  cube: number | null;
  /** This player's turn (a bar underline + the words in `turnText`). */
  turn: boolean;
  turnText?: string | null;
  /** Disconnected, timeout notices, persistent warning: icon + text lines. */
  status?: ReactNode;
  bubble?: ReactNode;
  onPeek: () => void;
  /** One accessible name for the bar (match.md §8). */
  label: string;
}

export function PlayerBar({ player, side, self, pips, clock, cube, turn, turnText, status, bubble, onPeek, label }: PlayerBarProps) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const name = player.is_bot ? labels.botName(player.bot_level) : player.username;

  return (
    <Bar aria-label={label} data-turn={turn ? "true" : undefined} data-self={self ? "true" : undefined}>
      {/* Own avatar opens the match menu, and is named so (M-23, WCAG 2.5.3). */}
      <PeekButton onClick={onPeek} aria-label={self ? t("match.menu.title") : player.is_bot ? name : t("match.peek.viewProfile") + ": " + isolate(player.username)}>
        <Avatar avatarKey={player.avatar} size={avatarSize.sm} />
      </PeekButton>
      <div className="bar-id">
        <Typography variant="label" component="p" sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
          <CheckerSwatch side={side} size={18} />
          {player.is_bot && <BotIcon sx={{ fontSize: iconSize.sm }} />}
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {self ? t("match.bar.you") : player.is_bot ? name : <bdi dir="ltr">{player.username}</bdi>}
          </Box>
        </Typography>
        <div className="bar-meta">
          {!player.is_bot && (
            <Typography className="bar-rating" variant="caption" color="text.secondary">
              {t("match.bar.levelElo", { level: f.number(player.level), elo: f.number(player.elo) })}
            </Typography>
          )}
          {pips !== null && (
            <Typography className="bar-pips" variant="caption" color="text.secondary">
              {t("match.bar.pips", { n: f.number(pips) })}
            </Typography>
          )}
          {turnText && (
            <Typography variant="caption" sx={{ color: "tokens.primary", fontWeight: 600 }}>
              {turnText}
            </Typography>
          )}
        </div>
        {status}
      </div>
      <div className="bar-end">
        {cube !== null && <CubeChip value={cube} label={t(self ? "match.cube.yours" : "match.cube.theirs", { username: isolate(player.username) })} />}
        {clock}
      </div>
      {bubble}
    </Bar>
  );
}

export function StatusLine({ children, tone = "warning", icon: Icon = WarningIcon }: { children: ReactNode; tone?: "warning" | "info"; icon?: typeof WarningIcon }) {
  return (
    <Typography
      variant="caption"
      component="p"
      sx={{ display: "flex", alignItems: "center", gap: 0.5, color: tone === "warning" ? "tokens.warning" : "text.secondary", m: 0 }}
    >
      <Icon sx={{ fontSize: iconSize.sm, flex: "none" }} />
      <span>{children}</span>
    </Typography>
  );
}

// ---- Cube -------------------------------------------------------------------------------------

export function CubeChip({ value, label, text }: { value: number; label: string; text?: string }) {
  const f = useFormat();
  return (
    <Box
      role="img"
      aria-label={`${label} ×${f.number(value)}`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        paddingInline: 1,
        minHeight: 32,
        borderRadius: `${radii.sm}px`,
        border: 2,
        borderColor: "tokens.primary",
        bgcolor: "tokens.surfaceRaised",
        typography: "label",
        whiteSpace: "nowrap",
      }}
    >
      <CubeIcon sx={{ fontSize: iconSize.sm }} aria-hidden />
      <span aria-hidden>{text ?? `×${f.number(value)}`}</span>
    </Box>
  );
}

// ---- Dice chips (action bar) --------------------------------------------------------------------

export function DiceChips({ dice, used, unusable }: { dice: number[]; used: boolean[]; unusable: boolean }) {
  const t = useTranslations("match.dice");
  const f = useFormat();
  return (
    <Box component="ul" aria-label={t("remaining")} sx={{ listStyle: "none", m: 0, p: 0, display: "flex", gap: 0.75, justifyContent: "center", flexWrap: "wrap" }}>
      {dice.map((d, i) => {
        const isUsed = used[i] ?? false;
        const cant = !isUsed && unusable;
        return (
          <Box
            component="li"
            key={i}
            sx={{
              minWidth: 36,
              minHeight: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.5,
              paddingInline: 1,
              borderRadius: `${radii.sm}px`,
              border: 1,
              borderColor: isUsed ? "tokens.outlineSubtle" : "tokens.outline",
              bgcolor: isUsed ? "transparent" : "tokens.surfaceRaised",
              // Used dice are information, not disabled controls: secondary text (≥ 4.5:1 on the
              // action bar surface in both schemes, M-05), struck through, and "used" for readers.
              color: isUsed ? "tokens.textSecondary" : "text.primary",
              textDecoration: isUsed ? "line-through" : "none",
              typography: "label",
            }}
          >
            <span aria-hidden>{f.number(d)}</span>
            <span style={visuallyHidden}>{isUsed ? t("used", { value: f.number(d) }) : cant ? t("unusable", { value: f.number(d) }) : t("chip", { value: f.number(d) })}</span>
            {cant && (
              <Typography variant="caption" component="span" aria-hidden sx={{ textDecoration: "none" }}>
                <WarningIcon sx={{ fontSize: iconSize.sm - 4, verticalAlign: "middle" }} />
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

// ---- Seed / commitment text ----------------------------------------------------------------------

/** A hex seed or commitment shortened in the middle ("first 8 … last 8"); the full value is the
 * accessible name and what the copy button copies (M-20). */
export function SeedText({ value, label }: { value: string; label: string }) {
  const short = value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
  return (
    <Typography
      variant="caption"
      component="span"
      dir="ltr"
      role="img"
      aria-label={`${label}: ${value}`}
      sx={{ fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis" }}
    >
      <span aria-hidden>{short}</span>
    </Typography>
  );
}
