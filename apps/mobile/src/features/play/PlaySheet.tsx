"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { iconSize } from "@bg/design-tokens";
import type { Tier } from "@bg/protocol";
import { ChoiceGroup, type ChoiceOption } from "@/components/forms/ChoiceGroup";
import { ActionButton } from "@/components/forms/ActionButton";
import { InfoIcon, WarningIcon } from "@/components/icons";
import { BotIcon, RatedIcon } from "@/components/icons/game";
import { useCostConfirmationParts } from "@/components/money/CostConfirmation";
import { ValueRows } from "@/components/money/ValueRows";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { InfoLine } from "@/components/wallet/InfoLine";
import { SupportTopupContent } from "@/components/wallet/SupportTopup";
import { useFormat } from "@/lib/useFormat";
import { InsufficientOptions } from "./InsufficientOptions";
import { BOT_LEVELS, VARIANTS, useGameLabels, type BotLevel, type Variant } from "./labels";

// One sheet for the lobby's steps (play.md PL-02 … PL-05; P§1: never stack sheets, swap the content
// of one instance). Centered dialog at md/lg (BottomSheet does that).
//
// - setup (PL-02): the tapped tier is chosen; variant and length are not (P§2.2).
// - confirm (PL-03): the full cost block from server values before `queue.join`.
// - bot (PL-04): level, variant, length, nothing pre-selected; free, unrated, no XP.
// - insufficient (PL-05): shortfall, then cheaper tiers, the bot, and "Get coins".
// - getCoins (WA-04 content) from PL-05.

export type SheetState =
  | { step: "setup"; tierId: number | null; variant: Variant | null; length: number | null; notice?: string }
  | { step: "confirm"; tierId: number; variant: Variant; length: number }
  | { step: "bot"; level: BotLevel | null; variant: Variant | null; length: number | null; notice?: string }
  | {
      step: "insufficient";
      tierId: number;
      variant: Variant | null;
      length: number | null;
      mode: "normal" | "removed";
      /** Server balance from WALLET_INSUFFICIENT, when given. */
      balance: number | null;
    }
  | { step: "getCoins"; back: SheetState };

export interface PlaySheetProps {
  state: SheetState | null;
  onState: (next: SheetState | null) => void;
  tiers: readonly Tier[];
  balance: number | null;
  coinPriceToman: number | null;
  username: string | null;
  /** `GET config.allowed_lengths` for the bot sheet. */
  botLengths: readonly number[];
  /** PL-03 in flight (queue.join sent, no reply yet). */
  joining: boolean;
  joinSlow: boolean;
  joinError: ReactNode | null;
  onJoin: (req: { tier_id: number; variant: Variant; length: number }) => void;
  /** Socket not open / offline: the join primary is disabled with this reason. */
  joinBlocked: string | null;
  botInFlight: boolean;
  botError: ReactNode | null;
  onStartBot: (level: BotLevel, variant: Variant, length: number) => void;
  botBlocked: string | null;
}

export function PlaySheet(props: PlaySheetProps) {
  const { state, onState, tiers, balance, coinPriceToman, joining, joinError, onJoin, joinBlocked, botInFlight } = props;
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const variantErrorId = useId();

  const tier = (id: number | null) => tiers.find((x) => x.id === id) ?? null;

  // Confirm parts are built on every render (hooks), with the confirm step's values when shown.
  const confirmTier = state?.step === "confirm" ? tier(state.tierId) : null;
  const known = balance ?? 0;
  const confirm = useCostConfirmationParts({
    onCancel: () => onState(null),
    onConfirm: () => {
      if (state?.step !== "confirm" || !confirmTier) return;
      if (balance !== null && balance < confirmTier.entry) {
        onState({ step: "insufficient", tierId: confirmTier.id, variant: state.variant, length: state.length, mode: "normal", balance: null });
        return;
      }
      onJoin({ tier_id: confirmTier.id, variant: state.variant, length: state.length });
    },
    summary:
      state?.step === "confirm" ? (
        <Stack spacing={0.5}>
          <Typography variant="body1">
            {labels.variant(state.variant)}
            {t("common.listSep")}
            {labels.length(state.length)}
          </Typography>
          <InfoLine icon={RatedIcon} tone="primary">
            {t("play.join.rated")}
          </InfoLine>
        </Stack>
      ) : null,
    cost: confirmTier
      ? {
          cost: confirmTier.entry,
          tomanEquivalent: coinPriceToman !== null ? confirmTier.entry * coinPriceToman : undefined,
          fee: confirmTier.pot - confirmTier.payout,
          feeLabel: t("play.join.fee", { pct: f.percent(confirmTier.rake_pct / 100), pot: f.number(confirmTier.pot) }),
          winnerReceives: confirmTier.payout,
          balance: known,
          balanceAfter: known - confirmTier.entry,
          balanceAfterLabel: t("play.join.balanceAfterWhen"),
        }
      : { cost: 0, balance: 0, balanceAfter: 0 },
    facts: t("play.join.timing"),
    confirmLabel: confirmTier ? t("play.join.cta", { entry: f.number(confirmTier.entry) }) : "",
    inFlightLabel: confirmTier ? t("play.join.cta", { entry: f.number(confirmTier.entry) }) : undefined,
    inFlight: joining,
    disabledReason: joining ? undefined : (joinBlocked ?? undefined),
    error: joinError ?? undefined,
    onCheckStatus: props.joinSlow && state?.step === "confirm" && confirmTier
      ? () => onJoin({ tier_id: confirmTier.id, variant: state.variant, length: state.length })
      : undefined,
  });

  const variantOptions = (): ChoiceOption<Variant>[] =>
    VARIANTS.map((v) => ({ value: v, label: labels.variant(v), description: labels.variantDesc(v) }));
  const lengthOptions = (lengths: readonly number[]): ChoiceOption<number>[] =>
    lengths.map((n) => ({ value: n, label: labels.length(n) }));

  let title: ReactNode = "";
  let body: ReactNode = null;
  let footer: ReactNode = null;
  const dismissible = !(joining && state?.step === "confirm") && !(botInFlight && state?.step === "bot");

  if (state?.step === "setup") {
    const chosen = tier(state.tierId);
    title = t("play.setup.title");
    const reason = !state.variant ? t("play.setup.reason.variant") : !state.length ? t("play.setup.reason.length") : null;
    body = (
      <Stack spacing={3}>
        {state.notice && (
          <InfoLine icon={WarningIcon} tone="primary">
            {state.notice}
          </InfoLine>
        )}
        <ChoiceGroup<number>
          legend={t("play.setup.table")}
          layout="grid"
          value={state.tierId}
          onChange={(id) => onState({ ...state, tierId: id, notice: undefined })}
          options={tiers.map((x) => ({
            value: x.id,
            label: labels.tierName(x.entry),
            description: t("play.tier.payout", { payout: f.number(x.payout) }),
            note:
              balance !== null && balance < x.entry ? (
                <Box component="span" sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                  <InfoIcon sx={{ fontSize: iconSize.sm }} />
                  {t("play.tier.needs", { entry: f.number(x.entry) })}
                </Box>
              ) : undefined,
          }))}
        />
        <ChoiceGroup<Variant>
          legend={t("play.setup.variant")}
          value={state.variant}
          onChange={(v) => onState({ ...state, variant: v, notice: undefined })}
          options={variantOptions()}
          describedBy={variantErrorId}
        />
        <ChoiceGroup<number>
          legend={t("play.length.label")}
          layout="chips"
          value={state.length}
          onChange={(n) => onState({ ...state, length: n, notice: undefined })}
          options={lengthOptions(chosen?.lengths ?? [])}
        />
      </Stack>
    );
    footer = (
      <ActionButton
        disabledReason={reason ?? (!chosen ? t("play.error.tierGone") : null)}
        onClick={() => {
          if (!chosen || !state.variant || !state.length) return;
          if (balance !== null && balance < chosen.entry) {
            onState({ step: "insufficient", tierId: chosen.id, variant: state.variant, length: state.length, mode: "normal", balance: null });
          } else {
            onState({ step: "confirm", tierId: chosen.id, variant: state.variant, length: state.length });
          }
        }}
      >
        {t("play.setup.continue")}
      </ActionButton>
    );
  } else if (state?.step === "confirm") {
    title = confirmTier ? t("play.join.title", { entry: f.number(confirmTier.entry) }) : "";
    body = confirm.body;
    footer = confirm.footer;
  } else if (state?.step === "bot") {
    title = (
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
        <BotIcon sx={{ fontSize: iconSize.md }} />
        {t("play.bot.title")}
      </Box>
    );
    const reason = !state.level
      ? t("play.setup.reason.level")
      : !state.variant
        ? t("play.setup.reason.variant")
        : !state.length
          ? t("play.setup.reason.length")
          : null;
    body = (
      <Stack spacing={3}>
        {state.notice && (
          <InfoLine icon={WarningIcon} tone="primary">
            {state.notice}
          </InfoLine>
        )}
        <ChoiceGroup<BotLevel>
          legend={t("play.bot.levelLabel")}
          value={state.level}
          onChange={(level) => onState({ ...state, level })}
          options={BOT_LEVELS.map((level) => ({
            value: level,
            icon: BotIcon,
            label: t("play.bot.row", { level: t(`play.bot.level.${level}`) }),
            description: t(`play.bot.levelDesc.${level}`),
          }))}
        />
        <ChoiceGroup<Variant>
          legend={t("play.setup.variant")}
          value={state.variant}
          onChange={(v) => onState({ ...state, variant: v })}
          options={variantOptions()}
        />
        <ChoiceGroup<number>
          legend={t("play.length.label")}
          layout="chips"
          value={state.length}
          onChange={(n) => onState({ ...state, length: n, notice: undefined })}
          options={lengthOptions(props.botLengths)}
        />
        <InfoLine>{t("play.bot.info")}</InfoLine>
      </Stack>
    );
    footer = (
      <>
        {props.botError && (
          <Typography variant="body2" role="alert" sx={{ color: "tokens.error" }}>
            {props.botError}
          </Typography>
        )}
        <ActionButton
          disabledReason={botInFlight ? null : (reason ?? props.botBlocked)}
          loading={botInFlight}
          loadingLabel={t("play.bot.cta")}
          onClick={() => {
            if (state.level && state.variant && state.length) props.onStartBot(state.level, state.variant, state.length);
          }}
        >
          {t("play.bot.cta")}
        </ActionButton>
      </>
    );
  } else if (state?.step === "insufficient") {
    const x = tier(state.tierId);
    const have = state.balance ?? balance ?? 0;
    title = t("coins.insufficient.title");
    body = (
      <Stack spacing={2}>
        {state.mode === "removed" && <InfoLine icon={InfoIcon} tone="primary">{t("play.queue.removed.balance")}</InfoLine>}
        {x && (
          <ValueRows
            rows={[
              { label: t("play.join.entry"), value: x.entry, coins: true },
              { label: t("coins.balance"), value: have, coins: true },
              { label: t("coins.shortfall"), value: Math.max(0, x.entry - have), coins: true, emphasis: true, divider: true },
            ]}
          />
        )}
        <InsufficientOptions
          tiers={tiers}
          entry={x?.entry ?? 0}
          balance={have}
          onTier={(lower) => onState({ step: "setup", tierId: lower.id, variant: state.variant, length: state.length })}
          onBot={() => onState({ step: "bot", level: null, variant: state.variant, length: state.length })}
          onGetCoins={() => onState({ step: "getCoins", back: state })}
        />
      </Stack>
    );
    footer = (
      <Button variant="text" fullWidth onClick={() => onState(null)}>
        {t("common.close")}
      </Button>
    );
  } else if (state?.step === "getCoins") {
    title = t("coins.getCoins");
    body = <SupportTopupContent username={props.username} coinPriceToman={coinPriceToman} />;
    footer = (
      <Button variant="text" fullWidth onClick={() => onState(state.back)}>
        {t("common.back")}
      </Button>
    );
  }

  return (
    <BottomSheet open={state !== null} onClose={() => onState(null)} title={title} footer={footer} dismissible={dismissible}>
      {body}
    </BottomSheet>
  );
}
