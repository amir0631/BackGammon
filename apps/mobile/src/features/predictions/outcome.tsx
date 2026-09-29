"use client";

import Box from "@mui/material/Box";
import { useTranslations } from "next-intl";
import type { Outcome } from "@bg/api-client";
import { iconSize, radii } from "@bg/design-tokens";
import { CloseIcon, InfoIcon, PendingIcon, SuccessIcon, WarningIcon } from "@/components/icons";
import { ShieldIcon } from "@/components/icons/game";
import { useFormat } from "@/lib/useFormat";

// Outcome chip and signed amount for PR-03 and PR-04 (predictions.md §3.3, §3.4): icon + text,
// sign + word, never color alone. Kept apart from the panel so /me/predictions stays light.

const OUTCOME_ICON = { won: SuccessIcon, wonLess: WarningIcon, wonZero: WarningIcon, lost: CloseIcon, refunded: InfoIcon, held: ShieldIcon, open: PendingIcon, closed: PendingIcon } as const;

/** The signed amount for an outcome (sign + word, never color alone; U+2212 for minus). */
export function useOutcomeAmount() {
  const t = useTranslations();
  const f = useFormat();
  return (o: Outcome): string => {
    if (o.kind === "refunded") return t("predict.result.returnedInFull");
    if (o.kind === "open" || o.kind === "closed" || o.kind === "held") return f.coins(o.stake);
    const net = o.net ?? 0;
    if (o.kind === "won") return t("predict.result.signWon", { amount: f.number(net) });
    if (o.kind === "lost") return t("predict.result.signLost", { amount: f.number(o.stake - (o.payout ?? 0)) });
    return t("predict.result.signNet", { sign: net < 0 ? "−" : "+", amount: f.number(Math.abs(net)) });
  };
}

export function outcomeStatusKey(kind: Outcome["kind"]): string {
  return `predict.mine.status.${kind === "wonZero" ? "wonLess" : kind}`;
}

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const t = useTranslations();
  const Icon = OUTCOME_ICON[outcome.kind];
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, minHeight: 28, borderRadius: `${radii.pill}px`, border: 1, borderColor: "tokens.outline", typography: "labelSmall", maxWidth: "100%" }}
    >
      <Icon sx={{ fontSize: iconSize.sm, flex: "none" }} aria-hidden />
      <span style={{ overflowWrap: "anywhere" }}>{t(outcomeStatusKey(outcome.kind))}</span>
    </Box>
  );
}

