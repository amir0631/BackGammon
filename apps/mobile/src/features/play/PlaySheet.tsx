"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { iconSize } from "@bg/design-tokens";
import type { PublicConfig, Tier } from "@bg/protocol";
import { ChoiceGroup, type ChoiceOption } from "@/components/forms/ChoiceGroup";
import { ActionButton } from "@/components/forms/ActionButton";
import { InfoIcon, WarningIcon } from "@/components/icons";
import { BotIcon, RatedIcon } from "@/components/icons/game";
import { CostBlock } from "@/components/money/CostBlock";
import { useCostConfirmationParts } from "@/components/money/CostConfirmation";
import { ValueRows } from "@/components/money/ValueRows";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { InfoLine } from "@/components/wallet/InfoLine";
import { SupportTopupContent } from "@/components/wallet/SupportTopup";
import { useFormat } from "@/lib/useFormat";
import { visuallyHidden } from "@/theme/layout";
import { InsufficientOptions } from "./InsufficientOptions";
import { BOT_LEVELS, VARIANTS, useGameLabels, type BotLevel, type Variant } from "./labels";

// One sheet for the lobby's steps (play.md PL-02 … PL-05; P§1: never stack sheets, swap the content
// of one instance). Centered dialog at md/lg (BottomSheet does that).
//
// - setup (PL-02): the tapped tier is chosen; variant and length are not (P§2.2).
// - confirm (PL-03): the full cost block from server values before `queue.join`. The balance is
//   never guessed: while the wallet is unread its rows are skeletons and the primary waits (P-01).
//   The footer follows the timing note (inline), so it can't cover the cost block (P-02).
// - bot (PL-04): level, variant, length, nothing pre-selected. Free, unrated, no XP; when the admin
//   enables a bot entry (`config.bot_entry`), the P§2 cost block and "Pay {entry} coins and start".
// - insufficient (PL-05): shortfall, then cheaper tiers, the bot, and "Get coins" (never after a
//   loss, P§9).
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

export type BotEntry = PublicConfig["bot_entry"];

export interface PlaySheetProps {
  state: SheetState | null;
  onState: (next: SheetState | null) => void;
  tiers: readonly Tier[];
  /** Available coins from `GET wallet`; null until read. */
  balance: number | null;
  /** The last wallet read failed (PL-03 offers Retry). */
  balanceFailed: boolean;
  onRetryBalance: () => void;
  coinPriceToman: number | null;
  username: string | null;
  /** `GET config.allowed_lengths` for the bot sheet. */
  botLengths: readonly number[];
  /** `GET config.bot_entry` (or the server's answer to BOT_ENTRY_CHANGED); null while unknown. */
  botEntry: BotEntry | null;
  /** Opened from a lost match (MA-13b): PL-05 never offers "Get coins" (P§9). */
  afterLoss: boolean;
  /** PL-03 in flight (queue.join sent, no reply yet). */
  joining: boolean;
  joinSlow: boolean;
  joinError: ReactNode | null;
  onJoin: (req: { tier_id: number; variant: Variant; length: number }) => void;
  /** Socket not open / offline: the join primary is disabled with this reason. */
  joinBlocked: string | null;
  botInFlight: boolean;
  botError: ReactNode | null;
  /** `entry`: the bot entry the player confirmed (0 when free). */
  onStartBot: (level: BotLevel, variant: Variant, length: number, entry: number) => void;
  botBlocked: string | null;
}

export function PlaySheet(props: PlaySheetProps) {
  const { state, onState, tiers, balance, coinPriceToman, joining, joinError, onJoin, joinBlocked, botInFlight, botEntry } = props;
  const t = useTranslations();
  const f = useFormat();
  const labels = useGameLabels();
  const variantErrorId = useId();

  const tier = (id: number | null) => tiers.find((x) => x.id === id) ?? null;

  // The wallet could not be read: say so and offer Retry next to the skeleton rows (P-01).
  const balanceNote =
    balance === null ? (
      <Stack direction="row" role="status" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <InfoLine icon={props.balanceFailed ? WarningIcon : InfoIcon} tone="primary">
          {props.balanceFailed ? t("play.join.balanceError") : t("play.join.balanceUnknown")}
        </InfoLine>
        {props.balanceFailed && (
          <Button size="small" variant="text" onClick={props.onRetryBalance}>
            {t("common.retry")}
          </Button>
        )}
      </Stack>
    ) : null;

  // Confirm parts are built on every render (hooks), with the confirm step's values when shown.
  const confirmTier = state?.step === "confirm" ? tier(state.tierId) : null;
  const confirm = useCostConfirmationParts({
    onCancel: () => onState(null),
    onConfirm: () => {
      if (state?.step !== "confirm" || !confirmTier || balance === null) return;
      if (balance < confirmTier.entry) {
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
          balance,
          balanceAfter: balance === null ? null : balance - confirmTier.entry,
          balanceAfterLabel: t("play.join.balanceAfterWhen"),
        }
      : { cost: 0, balance: null, balanceAfter: null },
    facts: (
      <>
        {t("play.join.timing")}
        {balanceNote && <Box sx={{ mt: 1.5 }}>{balanceNote}</Box>}
      </>
    ),
    confirmLabel: confirmTier ? t("play.join.cta", { entry: f.number(confirmTier.entry) }) : "",
    inFlightLabel: confirmTier ? t("play.join.cta", { entry: f.number(confirmTier.entry) }) : undefined,
    inFlight: joining,
    disabledReason: joining ? undefined : balance === null ? t("play.join.balanceUnknown") : (joinBlocked ?? undefined),
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
  let footerMode: "sticky" | "inline" = "sticky";
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
    footerMode = confirm.footerMode;
  } else if (state?.step === "bot") {
    title = (
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
        <BotIcon sx={{ fontSize: iconSize.md }} />
        {t("play.bot.title")}
      </Box>
    );
    const entry = botEntry?.enabled ? botEntry.entry : 0;
    const paid = entry > 0;
    const reason = !state.level
      ? t("play.setup.reason.level")
      : !state.variant
        ? t("play.setup.reason.variant")
        : !state.length
          ? t("play.setup.reason.length")
          : paid && balance === null
            ? t("play.join.balanceUnknown")
            : paid && balance !== null && balance < entry
              ? t("play.bot.needs", { entry: f.number(entry) })
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
        {paid && botEntry ? (
          <Stack spacing={1.5}>
            <CostBlock
              cost={entry}
              costLabel="entry"
              tomanEquivalent={coinPriceToman !== null ? entry * coinPriceToman : undefined}
              prize={botEntry.prize}
              balance={balance}
              balanceAfter={balance === null ? null : balance - entry}
            />
            <InfoLine>{t("play.bot.infoPaid")}</InfoLine>
            {balanceNote}
          </Stack>
        ) : (
          <InfoLine>{t("play.bot.info")}</InfoLine>
        )}
      </Stack>
    );
    // With an entry the footer follows the cost block (P§2.1), like PL-03.
    if (paid) footerMode = "inline";
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
          loadingLabel={paid ? t("play.bot.ctaPay", { entry: f.number(entry) }) : t("play.bot.cta")}
          onClick={() => {
            if (state.level && state.variant && state.length) props.onStartBot(state.level, state.variant, state.length, entry);
          }}
        >
          {paid ? t("play.bot.ctaPay", { entry: f.number(entry) }) : t("play.bot.cta")}
        </ActionButton>
        {paid && (
          <Button variant="text" fullWidth onClick={() => onState(null)} disabled={botInFlight}>
            {t("common.cancel")}
          </Button>
        )}
      </>
    );
  } else if (state?.step === "insufficient") {
    const x = tier(state.tierId);
    const have = state.balance ?? balance;
    const unknown = (
      <>
        <Skeleton variant="text" width="5rem" sx={{ display: "inline-block" }} aria-hidden />
        <span style={visuallyHidden}>{t("common.loading")}</span>
      </>
    );
    title = t("coins.insufficient.title");
    body = (
      <Stack spacing={2}>
        {state.mode === "removed" && <InfoLine icon={InfoIcon} tone="primary">{t("play.queue.removed.balance")}</InfoLine>}
        {x && (
          <ValueRows
            rows={[
              { label: t("play.join.entry"), value: x.entry, coins: true },
              { label: t("coins.balance"), value: have ?? unknown, coins: have !== null },
              {
                label: t("coins.shortfall"),
                value: have === null ? unknown : Math.max(0, x.entry - have),
                coins: have !== null,
                emphasis: true,
                divider: true,
              },
            ]}
          />
        )}
        <InsufficientOptions
          tiers={tiers}
          entry={x?.entry ?? 0}
          balance={have}
          botEntry={botEntry?.enabled ? botEntry.entry : 0}
          onTier={(lower) => onState({ step: "setup", tierId: lower.id, variant: state.variant, length: state.length })}
          onBot={() => onState({ step: "bot", level: null, variant: state.variant, length: state.length })}
          onGetCoins={props.afterLoss ? undefined : () => onState({ step: "getCoins", back: state })}
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
    <BottomSheet
      open={state !== null}
      onClose={() => onState(null)}
      title={title}
      footer={footer}
      footerMode={footerMode}
      dismissible={dismissible}
    >
      {body}
    </BottomSheet>
  );
}
