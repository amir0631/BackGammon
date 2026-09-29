"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type ReactNode } from "react";
import { estimatePayout, predictionOutcome, quickPicks, type Estimate } from "@bg/api-client";
import { iconSize, minTouchTarget, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { PredictionRow } from "@bg/protocol";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { CheckIcon, HelpIcon, InfoIcon, SuccessIcon, WarningIcon } from "@/components/icons";
import { CostConfirmation } from "@/components/money/CostConfirmation";
import { ValueRows } from "@/components/money/ValueRows";
import { Avatar } from "@/components/profile/Avatar";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { AmountField } from "@/components/wallet/AmountField";
import { InfoLine } from "@/components/wallet/InfoLine";
import { usePublicConfig, useSupportContact } from "@/lib/config";
import { readJson, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { useGameLabels } from "../play/labels";
import { OutcomeChip, useOutcomeAmount } from "./outcome";
import type { PredictionFlow } from "./usePredictionFlow";

// PR-01 prediction panel, PR-02 confirmation, PR-03 result, and the insufficient-coins sheet
// (predictions.md §3–§4; live.md §3.4–§3.7). Rendered by the spectator view: the panel inside a
// bottom sheet at `sm` and in the side panel at `md`/`lg`; PR-02 is always a sheet / centered dialog.
// Never names devices, IPs, flags, or fraud; wins and losses get the same visual weight (P§9.2).

export interface PredictionPlayer {
  username: string;
  avatar: string;
  elo: number;
}

const HINT_KEY = "bg.predict.hintSeen";

/** The rule sentence (P§2.4) with the fee when the pool exposes it (predictions.md §3.2 step 4). */
function useHowItWorks(rakePct: number | undefined) {
  const t = useTranslations();
  const f = useFormat();
  return rakePct !== undefined ? t("predict.howItWorks", { pct: f.number(rakePct) }) : t("predict.howItWorksNoPct");
}

function EstimateLine({ estimate, username, other }: { estimate: Estimate; username: string; other: string }) {
  const t = useTranslations();
  const f = useFormat();
  if (estimate.kind === "unknown") return null;
  if (estimate.kind === "oneSided") return <InfoLine icon={InfoIcon}>{t("predict.estimateOneSided", { username: isolate(other) })}</InfoLine>;
  if (estimate.kind === "zero") return <InfoLine icon={WarningIcon} tone="primary">{t("predict.estimateZero", { username: isolate(username) })}</InfoLine>;
  if (estimate.kind === "belowStake")
    return (
      <InfoLine icon={WarningIcon} tone="primary">
        {t("predict.estimateBelowStake", { username: isolate(username), estimate: f.number(estimate.estimate), total: f.number(estimate.total) })}
      </InfoLine>
    );
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">{t("predict.estimateLine", { username: isolate(username), estimate: f.number(estimate.estimate) })}</Typography>
      <Typography variant="caption" color="text.secondary">
        {t("predict.estimate")}
      </Typography>
    </Stack>
  );
}

function SideCard({ player, total, mine }: { player: PredictionPlayer; total: number; mine: boolean }) {
  const t = useTranslations();
  const f = useFormat();
  return (
    <Stack spacing={0.75} sx={{ p: 1.5, borderRadius: `${radii.lg}px`, border: 1, borderColor: mine ? "tokens.primary" : "tokens.outline", minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        {player.avatar && <Avatar avatarKey={player.avatar} size={32} />}
        <Typography variant="label" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <bdi dir="ltr">{player.username}</bdi>
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {t("predict.sideTotal", { total: f.number(total) })}
      </Typography>
      {mine && (
        <Typography variant="labelSmall" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          <CheckIcon sx={{ fontSize: iconSize.sm }} />
          {t("predict.yourSide")}
        </Typography>
      )}
    </Stack>
  );
}

export function PredictionPanel({ flow, players, ended }: { flow: PredictionFlow; players: [PredictionPlayer, PredictionPlayer]; ended: { winner: number | null } | null }) {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const support = useSupportContact(t("support.contact.fallback"));
  const howItWorks = useHowItWorks(flow.entry?.rake_pct);
  const reasonId = useId();
  const [hintSeen, setHintSeen] = useState(true);

  useEffect(() => {
    setHintSeen(Boolean(readJson<boolean>("local", HINT_KEY)));
    writeJson("local", HINT_KEY, true);
  }, []);

  if (ended && flow.own && !(flow.rows && flow.rows.length > 0)) {
    return <Typography variant="body2" role="status">{flow.resultPending ? t("predict.result.pending") : t("common.loading")}</Typography>;
  }
  if (ended && flow.rows && flow.rows.length > 0) {
    return <PredictionResult rows={flow.rows} players={players} aborted={ended.winner === null} winnerSide={ended.winner === 0 || ended.winner === 1 ? ended.winner : null} pending={flow.resultPending} />;
  }

  const totals = flow.totals;
  const totalOf = (s: 0 | 1) => (s === 0 ? (totals?.total_a ?? 0) : (totals?.total_b ?? 0));
  const open = Boolean(totals?.open) && !ended;
  const refusedBlock = flow.refused === "review" || flow.refused === "linked" || flow.refused === "referral" || flow.refused === "player" ? flow.refused : null;
  const blocked = refusedBlock ?? flow.blocked;

  if (flow.loadError) {
    return (
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <InfoLine icon={WarningIcon} tone="primary">
          {t("predict.loadError")}
        </InfoLine>
        <Button variant="outlined" onClick={flow.reload}>
          {t("common.retry")}
        </Button>
      </Stack>
    );
  }
  if (flow.entry === undefined) {
    return (
      <Stack spacing={1.5} aria-busy="true">
        <Skeleton variant="text" width="60%" />
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))" }}>
          <Skeleton variant="rounded" height={88} />
          <Skeleton variant="rounded" height={88} />
        </Box>
      </Stack>
    );
  }

  const help = (
    <MuiLink component={NextLink} href="/help/predictions" aria-label={t("common.help")} sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: minTouchTarget, minHeight: minTouchTarget }}>
      <HelpIcon sx={{ fontSize: iconSize.sm }} />
    </MuiLink>
  );
  const rule = (
    <Stack direction="row" sx={{ alignItems: "flex-start", gap: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flex: "1 1 auto", pt: 1.25 }}>
        {howItWorks}
      </Typography>
      {help}
    </Stack>
  );
  const staticCards = (
    <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))" }}>
      {([0, 1] as const).map((s) => (
        <SideCard key={s} player={players[s]} total={totalOf(s)} mine={flow.own?.side === s} />
      ))}
    </Box>
  );
  const stakedLine = flow.own ? (
    <InfoLine icon={CheckIcon} tone="primary">
      {t("predict.staked", { amount: f.number(flow.own.total), username: isolate(players[flow.own.side].username) })}
    </InfoLine>
  ) : null;

  // Blocked (§3.1): totals and the rule read-only, a plain respectful reason, no stake field.
  if (blocked) {
    return (
      <Stack spacing={2}>
        <Typography variant="body1" tabIndex={-1}>
          {t(`predict.blocked.${blocked}`)}
        </Typography>
        {refusedBlock && <InfoLine>{t("predict.blocked.nothingCharged")}</InfoLine>}
        {blocked === "review" && <InfoLine icon={InfoIcon}>{t("predict.blocked.support", { channel: support })}</InfoLine>}
        {staticCards}
        {rule}
      </Stack>
    );
  }

  // Closed (no own stake → a short notice; with one → totals and "Your prediction").
  if (!open) {
    return (
      <Stack spacing={2}>
        <Typography variant="body2" role="status">
          {flow.refused === "closed" || flow.closedWhileEntering ? t("predict.error.closed") : t("predict.closed")}
        </Typography>
        {stakedLine}
        {staticCards}
        {rule}
      </Stack>
    );
  }

  const readOnly = flow.suspended;
  const side = flow.side;
  const other = side === null ? null : ((1 - side) as 0 | 1);
  const estimate =
    side !== null && flow.stake !== null && flow.field === null
      ? estimatePayout({ totalA: totals?.total_a ?? 0, totalB: totals?.total_b ?? 0, side, own: flow.own?.total ?? 0, stake: flow.stake, rakePct: flow.entry?.rake_pct ?? null })
      : null;
  const picks = flow.entry ? quickPicks(flow.entry.max_stake_per_user, flow.remaining) : [];
  const reason = side === null ? t("predict.reason.chooseSide") : flow.stake === null && flow.field === null ? t("predict.reason.enterStake") : !online ? t("net.offlineAction") : null;
  const fieldError =
    flow.field?.kind === "invalid"
      ? t("predict.stake.invalid")
      : flow.field?.kind === "overRemaining"
        ? t("predict.error.maxStake", { remaining: f.number(flow.field.remaining) })
        : flow.field?.kind === "maxReached"
          ? t("predict.error.maxStakeReached")
          : undefined;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t("predict.openUntil")}
      </Typography>
      {!hintSeen && !flow.own && <InfoLine icon={InfoIcon}>{t("predict.firstHint")}</InfoLine>}
      {rule}
      {flow.placed && (
        <Stack direction="row" role="status" spacing={1} sx={{ alignItems: "center", color: "tokens.success" }}>
          <SuccessIcon sx={{ fontSize: iconSize.sm }} />
          <Typography variant="body2" sx={{ color: "inherit" }}>
            {t("predict.placed", { amount: f.number(flow.placed.amount), username: isolate(players[flow.placed.side].username) })}
          </Typography>
        </Stack>
      )}
      {stakedLine}
      {readOnly ? (
        <>
          {staticCards}
          <InfoLine icon={WarningIcon} tone="primary">
            {t("account.suspended.actionBlocked")}{" "}
            <MuiLink component={NextLink} href="/account/status">
              {t("account.suspended.details")}
            </MuiLink>
          </InfoLine>
        </>
      ) : (
        <>
          <ChoiceGroup<0 | 1>
            legend={t("predict.title")}
            layout="grid"
            value={side}
            onChange={flow.chooseSide}
            options={([0, 1] as const).map((s) => {
              const locked = flow.own !== null && flow.own.side !== s;
              return {
                value: s,
                label: (
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    {players[s].avatar && <Avatar avatarKey={players[s].avatar} size={28} />}
                    <bdi dir="ltr" style={{ overflowWrap: "anywhere" }}>
                      {players[s].username}
                    </bdi>
                  </Box>
                ),
                ariaLabel: `${players[s].username}, ${t("predict.sideTotal", { total: f.number(totalOf(s)) })}`,
                description: t("predict.sideTotal", { total: f.number(totalOf(s)) }),
                note: flow.own?.side === s ? t("predict.yourSide") : locked ? t("predict.otherSideLocked", { username: isolate(players[flow.own!.side].username) }) : t("predict.elo", { elo: f.number(players[s].elo) }),
                disabled: locked,
              };
            })}
          />
          {flow.refused === "other_side" && <InfoLine icon={WarningIcon} tone="primary">{t("predict.error.otherSide")}</InfoLine>}
          {flow.remaining <= 0 && flow.own ? (
            <InfoLine icon={InfoIcon}>{t("predict.error.maxStakeReached")}</InfoLine>
          ) : (
            <>
              <Typography variant="body2">{t("predict.balance", { balance: flow.balance === null ? "…" : f.number(flow.balance) })}</Typography>
              <AmountField
                name="stake"
                label={flow.own ? t("predict.addMore") : t("predict.stake.label")}
                value={flow.stakeText}
                onChange={flow.setStakeText}
                error={fieldError}
                helpers={[t("predict.stake.helper", { remaining: f.number(flow.remaining), balance: flow.balance === null ? "…" : f.number(flow.balance) })]}
              />
              {picks.length > 0 && (
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {picks.map((v) => (
                    <Button key={v} variant="outlined" size="small" onClick={() => flow.setStakeText(String(v))} sx={{ minHeight: minTouchTarget, borderRadius: `${radii.pill}px` }}>
                      {f.number(v)}
                    </Button>
                  ))}
                </Stack>
              )}
              {estimate && side !== null && other !== null && <EstimateLine estimate={estimate} username={players[side].username} other={players[other].username} />}
              {flow.refused === "pool_full" && <InfoLine icon={WarningIcon} tone="primary">{t("predict.error.poolFull")}</InfoLine>}
              <Button variant="contained" size="large" fullWidth onClick={flow.toContinue} disabled={Boolean(reason)} aria-describedby={reason ? reasonId : undefined} sx={{ minHeight: 48 }}>
                {t("predict.continue")}
              </Button>
              {reason && (
                <Typography id={reasonId} variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  {reason}
                </Typography>
              )}
            </>
          )}
        </>
      )}
    </Stack>
  );
}

/** PR-02 confirmation and the PL-05 prediction variant; mounted once by the spectator view. */
export function PredictionSheets({
  flow,
  players,
  matchLine,
  entry,
}: {
  flow: PredictionFlow;
  players: [PredictionPlayer, PredictionPlayer];
  /** "@a vs @b · variant · first to n" */
  matchLine: string;
  entry: number;
}) {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const config = usePublicConfig();
  const howItWorks = useHowItWorks(flow.entry?.rake_pct);
  const side = flow.side;
  const stake = flow.stake ?? 0;
  const name = side === null ? "" : isolate(players[side].username);
  const estimate =
    side !== null && flow.stake !== null
      ? estimatePayout({ totalA: flow.totals?.total_a ?? 0, totalB: flow.totals?.total_b ?? 0, side, own: flow.own?.total ?? 0, stake, rakePct: flow.entry?.rake_pct ?? null })
      : null;
  const errorText =
    flow.actionError === "closed"
      ? t("predict.error.closed")
      : flow.actionError === "pool_full"
        ? t("predict.error.poolFull")
        : flow.actionError === "network"
          ? t("errors.network")
          : flow.actionError;
  const shortfall = Math.max(0, stake - (flow.insufficientBalance ?? 0));

  return (
    <>
      <CostConfirmation
        open={flow.step === "confirm" && side !== null}
        onCancel={flow.back}
        onConfirm={() => void flow.confirm()}
        title={t("predict.confirm.title", { username: name })}
        summary={
          <Stack spacing={0.5}>
            <Typography variant="body2">{matchLine}</Typography>
            {entry > 0 && (
              <Typography variant="body2" color="text.secondary">
                {t("spectate.info.entry", { entry: f.number(entry) })}
              </Typography>
            )}
          </Stack>
        }
        cost={{
          cost: stake,
          tomanEquivalent: config ? stake * config.coin_price_toman : undefined,
          balance: flow.balance,
          balanceAfter: flow.balance === null ? null : flow.balance - stake,
        }}
        facts={
          <Stack spacing={1} component="span">
            <span>
              {t("predict.confirm.poolNow", {
                a: isolate(players[0].username),
                b: isolate(players[1].username),
                totalA: f.number(flow.totals?.total_a ?? 0),
                totalB: f.number(flow.totals?.total_b ?? 0),
              })}
            </span>
            <span>{howItWorks}</span>
            {estimate && estimate.kind !== "zero" && side !== null && (
              <EstimateLine estimate={estimate} username={players[side].username} other={players[(1 - side) as 0 | 1].username} />
            )}
            <span>{t("predict.confirm.final")}</span>
            {estimate?.kind === "zero" && side !== null && (
              <EstimateLine estimate={estimate} username={players[side].username} other={players[(1 - side) as 0 | 1].username} />
            )}
          </Stack>
        }
        confirmLabel={t("predict.confirm.cta", { amount: f.number(stake), username: name })}
        inFlight={flow.inFlight}
        disabledReason={flow.closedWhileEntering ? t("predict.error.closed") : !online && !flow.inFlight ? t("net.offlineAction") : flow.balance === null ? t("common.loading") : undefined}
        error={errorText}
        onCheckStatus={() => void flow.checkStatus()}
        helpHref="/help/predictions"
      />
      <BottomSheet open={flow.step === "insufficient"} onClose={flow.dismiss} title={t("coins.insufficient.title")}>
        <Stack spacing={2}>
          <ValueRows
            rows={[
              { label: t("predict.confirm.stake"), value: stake, coins: true, emphasis: true },
              { label: t("coins.balance"), value: flow.insufficientBalance ?? 0, coins: true, divider: true },
              { label: t("coins.shortfall"), value: shortfall, coins: true, emphasis: true },
            ]}
          />
          <Button variant="contained" size="large" onClick={flow.changeStake}>
            {t("predict.insufficient.changeStake")}
          </Button>
          <Button variant="text" component={NextLink} href="/shop/coins">
            {t("coins.getCoins")}
          </Button>
          <Button variant="text" onClick={flow.dismiss}>
            {t("common.close")}
          </Button>
        </Stack>
      </BottomSheet>
    </>
  );
}

/** PR-03 (predictions.md §3.3): from the match winner and the row side, summed over the match's stakes. */
export function PredictionResult({
  rows,
  players,
  aborted,
  winnerSide,
  pending,
}: {
  rows: PredictionRow[];
  players: [PredictionPlayer, PredictionPlayer] | [string, string];
  aborted: boolean;
  winnerSide: 0 | 1 | null;
  pending: boolean;
}) {
  const t = useTranslations();
  const f = useFormat();
  const amountText = useOutcomeAmount();
  const outcome = predictionOutcome(rows, winnerSide);
  const nameOf = (s: 0 | 1) => {
    const p = players[s];
    return isolate(typeof p === "string" ? p : p.username);
  };
  const pick = nameOf(outcome.side);
  let text: ReactNode;
  switch (outcome.kind) {
    case "won":
      text = t("predict.result.won", { username: pick, payout: f.number(outcome.payout ?? 0) });
      break;
    case "wonLess":
      text = t("predict.result.wonLess", { username: pick, payout: f.number(outcome.payout ?? 0), amount: f.number(outcome.stake) });
      break;
    case "wonZero":
      text = t("predict.result.wonZero", { username: pick });
      break;
    case "lost":
      text = t("predict.result.lost", { username: pick, amount: f.number(outcome.stake) });
      break;
    case "refunded":
      text = aborted ? t("predict.result.refundedCancelled") : t("predict.result.refundedOneSided");
      break;
    case "held":
      text = t("predict.result.held");
      break;
    default:
      text = pending ? t("predict.result.pending") : t("common.loading");
  }
  const settled = outcome.kind === "won" || outcome.kind === "wonLess" || outcome.kind === "wonZero" || outcome.kind === "lost";
  return (
    <Stack spacing={1} role="status" sx={{ p: 1.5, borderRadius: `${radii.md}px`, border: 1, borderColor: "tokens.outlineSubtle" }}>
      <Typography variant="labelSmall" color="text.secondary">
        {t("predict.yourPrediction")}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
        <OutcomeChip outcome={outcome} />
        <Typography variant="label" component="span">
          <bdi>{amountText(outcome)}</bdi>
        </Typography>
      </Stack>
      <Typography variant="body2">{text}</Typography>
      {settled && (
        <Typography variant="caption" color="text.secondary">
          {t("predict.result.stakePaid", { amount: f.number(outcome.stake), payout: f.number(outcome.payout ?? 0) })}
        </Typography>
      )}
      {pending && (
        <MuiLink component={NextLink} href="/me/predictions" sx={{ alignSelf: "flex-start", minHeight: minTouchTarget, display: "inline-flex", alignItems: "center" }}>
          {t("predict.mine.title")}
        </MuiLink>
      )}
    </Stack>
  );
}

export function useMatchLine() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  return (a: string, b: string, variant: string, length: number) =>
    t("predict.confirm.match", { a: isolate(a), b: isolate(b), variant: labels.variant(variant), n: f.number(length) });
}
