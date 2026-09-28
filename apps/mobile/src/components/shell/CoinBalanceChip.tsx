"use client";

import Skeleton from "@mui/material/Skeleton";
import { styled } from "@mui/material/styles";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { iconSize, minTouchTarget, radii } from "@bg/design-tokens";
import { CoinIcon } from "@/components/icons";
import { useFormat, type Amount } from "@/lib/useFormat";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Balance chip in the top bar (ia.md §3.2): available coins, opens /wallet.
// Never animates, pulses, or flashes (patterns.md §8). Announces a change once, politely.

const Root = styled(Link)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingInline: theme.spacing(1.5),
    borderRadius: radii.pill,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surfaceRaised,
    color: t.textPrimary,
    textDecoration: "none",
    flexShrink: 0,
    ...theme.typography.label,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    "@media (hover: hover)": { "&:hover": { borderColor: t.textSecondary } },
  };
});

export interface CoinBalanceChipProps {
  /** Available balance; `null` while loading. */
  balance: Amount | null;
  href?: string;
}

export function CoinBalanceChip({ balance, href = "/wallet" }: CoinBalanceChipProps) {
  const t = useTranslations();
  const f = useFormat();
  const previous = useRef<Amount | null>(balance);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (balance !== null && previous.current !== null && balance !== previous.current) {
      setAnnouncement(t("coins.balanceUpdated", { amount: f.number(balance), count: Number(balance) }));
    }
    previous.current = balance;
  }, [balance, f, t]);

  const label =
    balance === null
      ? t("common.loading")
      : t("coins.balanceChip", { amount: f.number(balance), count: Number(balance) });

  return (
    <>
      <Root href={href} aria-label={label}>
        <CoinIcon sx={{ fontSize: iconSize.sm }} />
        {balance === null ? (
          <Skeleton variant="text" width="3em" aria-hidden />
        ) : (
          <span aria-hidden>{f.number(balance)}</span>
        )}
      </Root>
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announcement}
      </span>
    </>
  );
}
