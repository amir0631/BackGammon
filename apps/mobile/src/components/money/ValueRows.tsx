"use client";

import { styled } from "@mui/material/styles";
import type { ReactNode } from "react";
import { iconSize, radii } from "@bg/design-tokens";
import { CoinIcon } from "@/components/icons";
import { useFormat, type Amount } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";

// Label/value rows in the cost-block style (P§2.1, P§9.1): the insufficient-coins facts (play.md
// PL-05) and the match result coin rows (match.md MA-13b). A `<dl>`; stacks label over value under
// an 18rem container (200% text). Formats only: values come from the server.

const List = styled("dl")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    margin: 0,
    padding: theme.spacing(1, 2),
    borderRadius: radii.lg,
    backgroundColor: t.surfaceSunken,
    border: `1px solid ${t.outlineSubtle}`,
    containerType: "inline-size",
    containerName: "valuerows",
  };
});

const Row = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  paddingBlock: theme.spacing(0.75),
  "& dt": { ...theme.typography.body2, color: tokensOf(theme).textSecondary, margin: 0 },
  "& dd": { ...theme.typography.body1, margin: 0, textAlign: "end", fontVariantNumeric: "tabular-nums" },
  "&[data-divider='true']": {
    borderBlockStart: `1px solid ${tokensOf(theme).outlineSubtle}`,
    marginBlockStart: theme.spacing(0.5),
    paddingBlockStart: theme.spacing(1.25),
  },
  "&[data-emphasis='true'] dd": { fontWeight: theme.typography.label.fontWeight },
  "@container valuerows (max-width: 18rem)": {
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing(0.25),
    "& dd": { textAlign: "start" },
  },
}));

const Coins = styled("span")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(0.5),
  flexWrap: "wrap",
}));

export interface ValueRow {
  label: ReactNode;
  /** A coin amount (formatted with the coin glyph) or ready-made content. */
  value: Amount | ReactNode;
  coins?: boolean;
  emphasis?: boolean;
  divider?: boolean;
}

export function ValueRows({ rows, label }: { rows: ValueRow[]; label?: string }) {
  const f = useFormat();
  return (
    <List aria-label={label}>
      {rows.map((row, i) => (
        <Row key={i} data-emphasis={row.emphasis ? "true" : undefined} data-divider={row.divider ? "true" : undefined}>
          <dt>{row.label}</dt>
          <dd>
            {row.coins && (typeof row.value === "number" || typeof row.value === "bigint") ? (
              <Coins>
                <CoinIcon sx={{ fontSize: iconSize.sm }} />
                {f.coins(row.value)}
              </Coins>
            ) : (
              (row.value as ReactNode)
            )}
          </dd>
        </Row>
      ))}
    </List>
  );
}
