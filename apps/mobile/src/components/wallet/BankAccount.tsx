"use client";

import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode } from "react";
import { radii } from "@bg/design-tokens";
import type { BankAccountInfo, Lang } from "@bg/protocol";
import { BankIcon } from "@/components/icons";
import { ibanLast4, maskedIbanGroups } from "@bg/api-client";
import { tokensOf } from "@/theme/theme";

// Bank account (Sheba) building blocks (wallet.md §3.5, WD-08, WD-02).
// - Sheba numbers are always LTR with Latin digits (P§10), grouped in 4s; groups wrap between
//   each other at 200% text, never inside a group.
// - The masked Sheba reads "{bank} account, Sheba ending {last4}" to screen readers, not bullets.

const Groups = styled("span")(({ theme }) => ({
  display: "inline-flex",
  flexWrap: "wrap",
  columnGap: "0.4em",
  rowGap: theme.spacing(0.25),
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
  "& > span": { whiteSpace: "nowrap" },
}));

export function bankName(bank: Record<Lang, string>, locale: string): string {
  return (locale === "en" ? bank.en : bank.fa) || bank.fa || bank.en;
}

/** Masked Sheba from the API, `IR82 •••• … ••90 02`, with a spoken label. */
export function MaskedIban({ account }: { account: BankAccountInfo }) {
  const t = useTranslations("bank");
  const locale = useLocale();
  return (
    <Groups
      role="img"
      dir="ltr"
      aria-label={t("card.a11y", { bank: bankName(account.bank, locale) || account.bank_code, last4: ibanLast4(account.iban) })}
    >
      {maskedIbanGroups(account.iban).map((g, i) => (
        <span key={i} aria-hidden>
          {g}
        </span>
      ))}
    </Groups>
  );
}

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    containerType: "inline-size",
    "& .bank-head": { display: "flex", gap: theme.spacing(1.5), alignItems: "flex-start" },
    "& .bank-icon": { flex: "none", color: t.primary, marginBlockStart: theme.spacing(0.25) },
  };
});

/** The one registered account: bank name in the UI language and the masked Sheba (+ actions). */
export function BankAccountCard({ account, actions, title }: { account: BankAccountInfo; actions?: ReactNode; title?: string }) {
  const locale = useLocale();
  const name = bankName(account.bank, locale);
  return (
    <Card>
      <div className="bank-head">
        <BankIcon className="bank-icon" />
        <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          {title && (
            <Typography variant="labelSmall" component="p" color="text.secondary">
              {title}
            </Typography>
          )}
          <Typography variant="body1" component="p" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {name || <bdi dir="ltr">{account.bank_code}</bdi>}
          </Typography>
          <Typography variant="body1" component="p" color="text.secondary">
            <MaskedIban account={account} />
          </Typography>
        </Stack>
      </div>
      {actions && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          {actions}
        </Stack>
      )}
    </Card>
  );
}

export function BankAccountCardSkeleton() {
  return <Skeleton variant="rectangular" height="7.5rem" sx={{ borderRadius: `${radii.lg}px` }} aria-hidden />;
}
