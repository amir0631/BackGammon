"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { iconSize, layout, minTouchTarget, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import { BAR, OFF, countAt, pipCount, type Player, type TurnBuilder } from "@bg/game-core";
import type { MatchView } from "@bg/game-core";
import { CheckIcon, ErrorIcon, EyeIcon, InfoIcon } from "@/components/icons";
import { KeyboardIcon, ShieldIcon } from "@/components/icons/game";
import { InfoLine } from "@/components/wallet/InfoLine";
import { CopyButton } from "@/components/wallet/CopyButton";
import type { HistoryItem } from "@/lib/match/store";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";
import { useGameLabels } from "../play/labels";
import { SeedText } from "./parts";

// Content shared by bottom sheets (phones) and side panels (md/lg): match info (MA-03), move
// history (MA-04), reactions (MA-05), move entry (MA-18), resign options (MA-08). Container
// queries, not viewport queries, so each fits a sheet or a 320 px panel.

import { EMOJI } from "./emoji";

export { EMOJI, FREE_EMOJIS, FREE_PHRASES } from "./emoji";

export function useNames(v: MatchView | null) {
  const labels = useGameLabels();
  return (p: number): string => {
    const pl = v?.players[p];
    if (!pl) return "";
    if (pl.is_bot) return labels.botName(pl.bot_level);
    return isolate(pl.username);
  };
}

// ---- Move notation ----------------------------------------------------------------------------

export function useNotation() {
  const t = useTranslations("match.history");
  const f = useFormat();
  const point = (p: number) => (p === BAR ? t("bar") : p === OFF ? t("off") : f.number(p));
  return (moves: number[][], hits: boolean[] = []) =>
    moves.map(([a, b], i) => `${point(a!)}/${point(b!)}${hits[i] ? "*" : ""}`).join(t("sep"));
}

// ---- MA-04 Move history -----------------------------------------------------------------------

export function MoveHistory({ view, history, you }: { view: MatchView | null; history: HistoryItem[]; you: Player | null }) {
  const t = useTranslations();
  const f = useFormat();
  const names = useNames(view);
  const notation = useNotation();
  const games: { gameNo: number; items: HistoryItem[] }[] = [];
  for (const item of history) {
    if (item.kind === "game" || games.length === 0) games.push({ gameNo: item.kind === "game" ? item.gameNo : (view?.gameNo ?? 1), items: [] });
    if (item.kind !== "game") games[games.length - 1]!.items.push(item);
  }
  const who = (p: number) => (p === you ? t("match.history.you") : names(p));
  const dice = (d: [number, number] | null) => (d ? `${f.number(d[0])}–${f.number(d[1])}` : "");
  const pips = view
    ? t("match.history.pips", {
        self: f.number(pipCount(view.position, you ?? 0)),
        username: names(you === null ? 1 : 1 - you),
        opp: f.number(pipCount(view.position, (you === null ? 1 : 1 - you) as Player)),
      })
    : null;

  return (
    <Stack spacing={2}>
      {pips && <Typography variant="body2">{pips}</Typography>}
      {games.every((g) => g.items.length === 0) ? (
        <Typography variant="body2" color="text.secondary">
          {t("match.history.empty")}
        </Typography>
      ) : (
        [...games].reverse().map((g) => (
          <Box component="section" key={g.gameNo} aria-label={t("match.game.number", { n: f.number(g.gameNo) })}>
            <Typography variant="labelSmall" component="h3" color="text.secondary" sx={{ mb: 0.5 }}>
              {t("match.game.number", { n: f.number(g.gameNo) })}
            </Typography>
            <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.5 }}>
              {g.items.map((item, i) => (
                <Typography component="li" variant="body2" key={i} sx={{ overflowWrap: "anywhere" }}>
                  {item.kind === "opening" && t("match.history.opening", { a: f.number(item.dice[0]), b: f.number(item.dice[1]) })}
                  {item.kind === "move" && (
                    <>
                      {who(item.player)} {dice(item.dice)}: <bdi dir="ltr">{notation(item.moves, item.hits)}</bdi>
                      {item.auto && ` · ${t(item.auto === "forced" ? "match.history.forced" : "match.history.timeout")}`}
                    </>
                  )}
                  {item.kind === "pass" && `${who(item.player)} ${dice(item.dice)}: ${t("match.history.noMove")}`}
                  {item.kind === "cube" &&
                    `${who(item.player)}: ${
                      item.action === "offer"
                        ? t("match.history.doubled", { value: f.number(item.value) })
                        : item.action === "take"
                          ? t("match.history.took")
                          : t("match.history.dropped")
                    }`}
                  {item.kind === "result" &&
                    t("match.history.gameResult", { winner: who(item.result.winner), points: item.result.points })}
                </Typography>
              ))}
            </Box>
          </Box>
        ))
      )}
    </Stack>
  );
}


// ---- MA-03 Match info ------------------------------------------------------------------------

export function MatchInfo({ view, payout }: { view: MatchView; payout: number | null }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const bot = view.players.some((p) => p.is_bot);
  return (
    <Stack spacing={1.25}>
      <Typography variant="body1">
        {labels.variant(view.variant)}
        {t("common.listSep")}
        {labels.length(view.length)}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {bot
          ? t("match.menu.practice")
          : view.entry > 0 && payout !== null
            ? t("match.menu.entryPayout", { entry: f.number(view.entry), payout: f.number(payout) })
            : null}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {bot ? t("match.menu.unrated") : t("match.menu.rated")}
        {view.crawford && ` · ${t("match.crawford.label")}`}
      </Typography>
      <Box>
        <Typography variant="labelSmall" component="p" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <ShieldIcon sx={{ fontSize: iconSize.sm }} />
          {t("match.menu.seedCommit")}
        </Typography>
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}>
          <SeedText value={view.seedCommit} label={t("match.menu.seedCommit")} />
          <CopyButton value={view.seedCommit} label={t("common.copy")} />
        </Stack>
      </Box>
      {!bot && (
        <InfoLine icon={EyeIcon}>{t("match.spectatorsDetail", { count: view.spectators })}</InfoLine>
      )}
      <InfoLine icon={KeyboardIcon}>{t("match.menu.shortcuts")}</InfoLine>
    </Stack>
  );
}

// ---- MA-05 Reactions ---------------------------------------------------------------------------

const Grid = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(${minTouchTarget + 8}px, 1fr))`,
  gap: theme.spacing(1),
}));

const Item = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    minHeight: minTouchTarget + 8,
    minWidth: minTouchTarget,
    borderRadius: radii.md,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    fontSize: "1.5rem",
    padding: theme.spacing(0.5, 1),
    "&[data-phrase='true']": { ...theme.typography.body2, justifyContent: "flex-start", width: "100%", textAlign: "start", paddingInline: theme.spacing(2) },
    "&[aria-disabled='true']": { opacity: 0.55 },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
  };
}) as typeof ButtonBase;

export interface ReactionsProps {
  emojis: string[];
  phrases: string[];
  phraseText: (key: string) => string;
  onSend: (kind: "emoji" | "phrase", key: string) => void;
  /** Seconds left in the 3 s cooldown (0 = can send). */
  cooldown: number;
}

export function ReactionPicker({ emojis, phrases, phraseText, onSend, cooldown }: ReactionsProps) {
  const t = useTranslations();
  const f = useFormat();
  const [tab, setTab] = useState(0);
  const [waitNote, setWaitNote] = useState(false);
  const send = (kind: "emoji" | "phrase", key: string) => {
    if (cooldown > 0) {
      setWaitNote(true);
      return;
    }
    setWaitNote(false);
    onSend(kind, key);
  };
  return (
    <Stack spacing={1.5}>
      <InfoLine icon={InfoIcon}>{t("match.reactions.note")}</InfoLine>
      {cooldown > 0 && (
        <Typography variant="body2" role="status" color={waitNote ? "text.primary" : "text.secondary"}>
          {waitNote ? `${t("match.reactions.wait")} · ` : ""}
          {t("match.reactions.cooldown", { seconds: f.number(cooldown) })}
        </Typography>
      )}
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="fullWidth" aria-label={t("match.reactions.title")}>
        <Tab label={t("match.reactions.emojis")} />
        <Tab label={t("match.reactions.phrases")} />
      </Tabs>
      {tab === 0 ? (
        <Grid role="list">
          {emojis.map((key) => (
            <div role="listitem" key={key}>
              <Item
                sx={{ width: "100%" }}
                aria-label={t.has(`reactions.emoji.${key}`) ? t(`reactions.emoji.${key}`) : key}
                aria-disabled={cooldown > 0 || undefined}
                onClick={() => send("emoji", key)}
              >
                <span aria-hidden>{EMOJI[key] ?? "⭐"}</span>
              </Item>
            </div>
          ))}
        </Grid>
      ) : (
        <Stack spacing={1} role="list">
          {phrases.map((key) => (
            <div role="listitem" key={key}>
              <Item data-phrase="true" aria-disabled={cooldown > 0 || undefined} onClick={() => send("phrase", key)}>
                {phraseText(key)}
              </Item>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ---- MA-18 Move entry --------------------------------------------------------------------------

export interface MoveEntryProps {
  builder: TurnBuilder | null;
  view: MatchView;
  you: Player | null;
  lastMove: string | null;
  selected: number | null;
  onSelect: (from: number | null) => void;
  onMove: (from: number, to: number) => void;
  onUndo: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
}

export function MoveEntry({ builder, view, you, lastMove, selected, onSelect, onMove, onUndo, onConfirm, canConfirm }: MoveEntryProps) {
  const t = useTranslations();
  const f = useFormat();
  const names = useNames(view);
  const [summary, setSummary] = useState<string | null>(null);
  const position = builder?.position ?? view.position;
  const side = (you ?? 0) as Player;
  const own = (p: number) => countAt(position, side, p);

  const readBoard = () => {
    const list = (s: Player) => {
      const parts: string[] = [];
      for (let p = 24; p >= 1; p--) {
        const n = countAt(position, s, p, side);
        if (n) parts.push(`${f.number(p)} ×${f.number(n)}`);
      }
      return parts.join(t("match.moveEntry.listSep"));
    };
    const opp = (1 - side) as Player;
    setSummary(
      t("match.moveEntry.board", {
        mine: list(side),
        username: names(opp),
        theirs: list(opp),
        barSelf: f.number(position.bar[side]),
        barOpp: f.number(position.bar[opp]),
        offSelf: f.number(position.off[side]),
        offOpp: f.number(position.off[opp]),
      }),
    );
  };

  return (
    <Stack spacing={2}>
      {builder && (
        <Typography variant="body2">
          {t("match.dice.remaining")}: {builder.remainingDice.map((d) => f.number(d)).join(t("common.listSep"))}
        </Typography>
      )}
      {lastMove && <Typography variant="body2">{t("match.moveEntry.lastMove", { summary: lastMove })}</Typography>}
      {builder && (
        <>
          <Typography variant="labelSmall" component="h3" color="text.secondary">
            {t("match.moveEntry.sources")}
          </Typography>
          <Stack spacing={1} role="list">
            {builder.sources().map((p) => (
              <div role="listitem" key={p}>
                <Button
                  fullWidth
                  variant={selected === p ? "contained" : "outlined"}
                  onClick={() => onSelect(selected === p ? null : p)}
                  aria-pressed={selected === p}
                  startIcon={selected === p ? <CheckIcon /> : undefined}
                  sx={{ justifyContent: "flex-start" }}
                >
                  {t("match.moveEntry.source", { point: String(p), label: f.number(p), count: own(p) })}
                </Button>
                {selected === p && (
                  <Stack spacing={1} sx={{ mt: 1, paddingInlineStart: 2 }} role="list">
                    {builder.targets(p).map((target) => (
                      <div role="listitem" key={target.to}>
                        <Button fullWidth variant="text" onClick={() => onMove(p, target.to)} sx={{ justifyContent: "flex-start" }}>
                          {target.to === OFF
                            ? t("match.moveEntry.bearOff", { die: f.number(target.die) })
                            : t("match.moveEntry.destination", { point: f.number(target.to), die: f.number(target.die) })}
                        </Button>
                      </div>
                    ))}
                  </Stack>
                )}
              </div>
            ))}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onUndo} disabled={!builder.steps.length} sx={{ flex: 1 }}>
              {t("match.action.undo")}
            </Button>
            <Button variant="contained" onClick={onConfirm} disabled={!canConfirm} sx={{ flex: 1 }}>
              {t("match.action.confirm")}
            </Button>
          </Stack>
        </>
      )}
      <Button variant="text" onClick={readBoard} startIcon={<KeyboardIcon />} sx={{ alignSelf: "flex-start" }}>
        {t("match.moveEntry.readBoard")}
      </Button>
      {summary && (
        <Typography variant="body2" role="status" sx={{ overflowWrap: "anywhere" }}>
          {summary}
        </Typography>
      )}
    </Stack>
  );
}


// ---- MA-08 Resign ------------------------------------------------------------------------------


export function Choice({ selected, onClick, title, children, disabled }: { selected: boolean; onClick: () => void; title: string; children: ReactNode; disabled?: boolean }) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onClick()}
      sx={(theme) => ({
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "start",
        gap: 0.5,
        width: "100%",
        p: 2,
        borderRadius: `${radii.md}px`,
        border: `${selected ? 2 : 1}px solid ${selected ? tokensOf(theme).error : tokensOf(theme).outline}`,
        bgcolor: selected ? "tokens.errorContainer" : "tokens.surface",
        color: selected ? "tokens.onErrorContainer" : "text.primary",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      })}
    >
      <Typography variant="label" component="span" sx={{ display: "flex", alignItems: "center", gap: 1, color: "inherit" }}>
        {selected ? <ErrorIcon sx={{ fontSize: iconSize.sm }} /> : null}
        {title}
      </Typography>
      <Box component="span" sx={{ typography: "body2", color: "inherit" }}>
        {children}
      </Box>
    </ButtonBase>
  );
}

export const panelWidth = layout.sidePanelWidth;
