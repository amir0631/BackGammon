"use client";

import Skeleton from "@mui/material/Skeleton";
import { styled } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { iconSize, radii } from "@bg/design-tokens";
import { CoinIcon } from "@/components/icons";
import { useFormat, type Amount } from "@/lib/useFormat";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Cost block of every money confirmation (patterns.md §2.1 item 3). Always shown in full; rows
// that do not apply are omitted, never collapsed. Values are the server-confirmed ones: this
// component formats, it never computes.
//
// At narrow container widths (a sheet at 200% text) each row stacks label over value (§13).
// A balance the app has not read yet is `null`: its rows show a skeleton, never a made-up 0
// (play.md P-01); the caller keeps the primary disabled until it arrives.

const List = styled("dl")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    margin: 0,
    padding: theme.spacing(1.5, 2),
    borderRadius: radii.lg,
    backgroundColor: t.surfaceSunken,
    border: `1px solid ${t.outlineSubtle}`,
    containerType: "inline-size",
    containerName: "costblock",
  };
});

const Row = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  paddingBlock: theme.spacing(1),
  "& dt": { ...theme.typography.body2, color: tokensOf(theme).textSecondary, margin: 0 },
  "& dd": {
    ...theme.typography.body1,
    margin: 0,
    textAlign: "end",
    fontVariantNumeric: "tabular-nums",
  },
  "&[data-divider='true']": {
    borderBlockStart: `1px solid ${tokensOf(theme).outlineSubtle}`,
    marginBlockStart: theme.spacing(0.5),
    paddingBlockStart: theme.spacing(1.5),
  },
  "&[data-emphasis='true'] dd": { fontWeight: theme.typography.label.fontWeight },
  "@container costblock (max-width: 18rem)": {
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing(0.25),
    "& dd": { textAlign: "start" },
  },
}));

const Value = styled("span")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(0.5),
  flexWrap: "wrap",
}));

const Secondary = styled("span")(({ theme }) => ({
  display: "block",
  ...theme.typography.caption,
  color: tokensOf(theme).textSecondary,
}));

export interface CostBlockProps {
  /** Coins charged or moved. */
  cost: Amount;
  /** "cost" for purchases and entries, "amount" for transfers and withdrawals, "entry" for a bot entry. */
  costLabel?: "cost" | "amount" | "entry";
  /** Toman equivalent under the cost (patterns.md §2.1, open question 6). */
  tomanEquivalent?: Amount;
  /** Fee in coins (transfer, withdrawal; shown even when 0). */
  fee?: Amount;
  /** Fee row label when it needs values ("Platform fee (10% of the pot of 200)"); default "Fee". */
  feeLabel?: string;
  /** Coins the winner receives (table entry, play.md PL-03). */
  winnerReceives?: Amount;
  /** Fixed prize for winning a bot match with an entry (play.md §3.6 step 7). */
  prize?: Amount;
  /** Coins the recipient receives (transfer). */
  recipientReceives?: Amount;
  /** Toman paid to the user's bank account (withdrawal). */
  youReceiveToman?: Amount;
  /** `null` while the wallet has not been read (skeleton row). */
  balance: Amount | null;
  balanceAfter: Amount | null;
  /** "Balance after the match starts" when the charge happens later (play.md §3.3). */
  balanceAfterLabel?: string;
}

export function CostBlock({
  cost,
  costLabel = "cost",
  tomanEquivalent,
  fee,
  feeLabel,
  winnerReceives,
  prize,
  recipientReceives,
  youReceiveToman,
  balance,
  balanceAfter,
  balanceAfterLabel,
}: CostBlockProps) {
  const t = useTranslations();
  const f = useFormat();

  const coins = (value: Amount | null): ReactNode =>
    value === null ? (
      <>
        <Skeleton variant="text" width="6rem" sx={{ display: "inline-block" }} aria-hidden />
        <span style={visuallyHidden}>{t("common.loading")}</span>
      </>
    ) : (
      <Value>
        <CoinIcon sx={{ fontSize: iconSize.sm }} />
        {f.coins(value)}
      </Value>
    );

  return (
    <List>
      <Row data-emphasis="true">
        <dt>{t(costLabel === "cost" ? "coins.cost" : costLabel === "entry" ? "play.join.entry" : "coins.amount")}</dt>
        <dd>
          {coins(cost)}
          {tomanEquivalent !== undefined && (
            <Secondary>{t("coins.tomanEquivalent", { amount: f.number(tomanEquivalent) })}</Secondary>
          )}
        </dd>
      </Row>
      {fee !== undefined && (
        <Row>
          <dt>{feeLabel ?? t("coins.fee")}</dt>
          <dd>{coins(fee)}</dd>
        </Row>
      )}
      {winnerReceives !== undefined && (
        <Row data-emphasis="true">
          <dt>{t("play.join.payout")}</dt>
          <dd>{coins(winnerReceives)}</dd>
        </Row>
      )}
      {prize !== undefined && (
        <Row data-emphasis="true">
          <dt>{t("play.bot.prize")}</dt>
          <dd>{coins(prize)}</dd>
        </Row>
      )}
      {recipientReceives !== undefined && (
        <Row>
          <dt>{t("transfer.recipientReceives")}</dt>
          <dd>{coins(recipientReceives)}</dd>
        </Row>
      )}
      {youReceiveToman !== undefined && (
        <Row>
          <dt>{t("withdraw.youReceive")}</dt>
          <dd>{f.toman(youReceiveToman)}</dd>
        </Row>
      )}
      <Row data-divider="true">
        <dt>{t("coins.balance")}</dt>
        <dd>{coins(balance)}</dd>
      </Row>
      <Row data-emphasis="true">
        <dt>{balanceAfterLabel ?? t("coins.balanceAfter")}</dt>
        <dd>{coins(balanceAfter)}</dd>
      </Row>
    </List>
  );
}
