"use client";

import { styled } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { iconSize, radii } from "@bg/design-tokens";
import { CoinIcon } from "@/components/icons";
import { useFormat, type Amount } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";

// Cost block of every money confirmation (patterns.md §2.1 item 3). Always shown in full; rows
// that do not apply are omitted, never collapsed. Values are the server-confirmed ones: this
// component formats, it never computes.
//
// At narrow container widths (a sheet at 200% text) each row stacks label over value (§13).

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
  /** "cost" for purchases and entries, "amount" for transfers and withdrawals. */
  costLabel?: "cost" | "amount";
  /** Toman equivalent under the cost (patterns.md §2.1, open question 6). */
  tomanEquivalent?: Amount;
  /** Fee in coins (transfer, withdrawal; shown even when 0). */
  fee?: Amount;
  /** Coins the recipient receives (transfer). */
  recipientReceives?: Amount;
  /** Toman paid to the user's bank account (withdrawal). */
  youReceiveToman?: Amount;
  balance: Amount;
  balanceAfter: Amount;
}

export function CostBlock({
  cost,
  costLabel = "cost",
  tomanEquivalent,
  fee,
  recipientReceives,
  youReceiveToman,
  balance,
  balanceAfter,
}: CostBlockProps) {
  const t = useTranslations();
  const f = useFormat();

  const coins = (value: Amount): ReactNode => (
    <Value>
      <CoinIcon sx={{ fontSize: iconSize.sm }} />
      {f.coins(value)}
    </Value>
  );

  return (
    <List>
      <Row data-emphasis="true">
        <dt>{t(costLabel === "cost" ? "coins.cost" : "coins.amount")}</dt>
        <dd>
          {coins(cost)}
          {tomanEquivalent !== undefined && (
            <Secondary>{t("coins.tomanEquivalent", { amount: f.number(tomanEquivalent) })}</Secondary>
          )}
        </dd>
      </Row>
      {fee !== undefined && (
        <Row>
          <dt>{t("coins.fee")}</dt>
          <dd>{coins(fee)}</dd>
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
        <dt>{t("coins.balanceAfter")}</dt>
        <dd>{coins(balanceAfter)}</dd>
      </Row>
    </List>
  );
}
