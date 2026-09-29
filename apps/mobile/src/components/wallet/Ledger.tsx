"use client";

import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, type ComponentType } from "react";
import { iconSize, layout, radii, space } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { LedgerRow, LedgerType } from "@bg/protocol";
import {
  AddCoinsIcon,
  BankIcon,
  ChevronForwardIcon,
  CoinIcon,
  CoinsInIcon,
  CoinsOutIcon,
  GiftIcon,
  SendIcon,
  SupportIcon,
  type IconProps,
} from "@/components/icons";
import { useFormat } from "@/lib/useFormat";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { CopyButton } from "./CopyButton";
import { InfoLine } from "./InfoLine";

// Ledger history (wallet.md §3.2, WA-01 list, WA-02 detail).
// - Rows grouped by local calendar day: "Today", "Yesterday", then the date (Jalali in fa).
// - Each row is one button whose name is "{type}, {n coins added|deducted}, {time}"; the "+"/"−"
//   glyphs are hidden from screen readers in favor of the words (§8). Sign + label carry the
//   meaning, never color alone (P§13).
// - Transfers name the other player by username, never by phone (§2 rule 11).
// - Unknown types (added later) render "Transaction" with the raw type, never hidden.

const KNOWN: ReadonlySet<LedgerType> = new Set<LedgerType>([
  "purchase", "match_entry", "match_payout", "match_refund", "rake", "referral_commission",
  "prediction_stake", "prediction_payout", "prediction_refund", "tournament_entry", "tournament_prize",
  "tournament_refund", "signup_bonus", "level_reward", "achievement_reward", "shop_purchase",
  "username_change", "admin_adjustment", "admin_topup", "withdrawal_hold", "withdrawal_payout",
  "withdrawal_refund", "transfer",
]);

export function isKnownType(type: string): type is LedgerType {
  return KNOWN.has(type as LedgerType);
}

/** Type label for rows, details, and notices (wallet.md §7 `wallet.tx.*`). */
export function useTxLabel() {
  const t = useTranslations("wallet.tx");
  return (row: Pick<LedgerRow, "type" | "amount" | "counterparty">): string => {
    if (row.type === "transfer") {
      if (!row.counterparty) return t("transfer.unknownParty");
      const username = isolate(`@${row.counterparty}`);
      return row.amount < 0 ? t("transfer.out", { username }) : t("transfer.in", { username });
    }
    return isKnownType(row.type) ? t(row.type) : t("unknown");
  };
}

function iconFor(row: LedgerRow): ComponentType<IconProps> {
  switch (row.type) {
    case "transfer":
      return row.amount < 0 ? SendIcon : CoinsInIcon;
    case "signup_bonus":
    case "level_reward":
    case "achievement_reward":
      return GiftIcon;
    case "withdrawal_hold":
    case "withdrawal_payout":
    case "withdrawal_refund":
      return BankIcon;
    case "admin_topup":
    case "admin_adjustment":
      return SupportIcon;
    case "purchase":
      return AddCoinsIcon;
    default:
      return row.amount < 0 ? CoinsOutIcon : CoinsInIcon;
  }
}

/** "+۲۰۰" / "−۱۰۰" with U+2212, isolated so the sign stays at the start in reading order (§7). */
export function SignedAmount({ amount, size = "body" }: { amount: number; size?: "body" | "large" }) {
  const t = useTranslations("wallet");
  const f = useFormat();
  const value = f.number(Math.abs(amount));
  return (
    <Typography
      component="span"
      variant={size === "large" ? "h2" : "label"}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
    >
      <CoinIcon sx={{ fontSize: size === "large" ? iconSize.lg : iconSize.sm }} />
      <bdi aria-hidden>{amount < 0 ? t("amount.out", { amount: value }) : t("amount.in", { amount: value })}</bdi>
      <span style={visuallyHidden}>
        {amount < 0 ? t("amount.a11yOut", { amount: value }) : t("amount.a11yIn", { amount: value })}
      </span>
    </Typography>
  );
}

const DayTitle = styled("h3")(({ theme }) => ({
  ...theme.typography.labelSmall,
  color: tokensOf(theme).textSecondary,
  margin: 0,
  paddingInline: theme.spacing(1),
  paddingBlock: theme.spacing(1.5, 0.75),
}));

const Rows = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "& > li + li": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

const RowButton = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    minHeight: layout.listRowMinHeight,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1, 1.5, 1, 2),
    textAlign: "start",
    color: t.textPrimary,
    containerType: "inline-size",
    "& .tx-icon": { flex: "none", color: t.textSecondary },
    "& .tx-main": { flex: "1 1 auto", minWidth: 0 },
    "& .tx-amount": { flex: "none" },
    "& .tx-chevron": { flex: "none", color: t.textSecondary, fontSize: iconSize.sm },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    // Selected: fill plus a start-edge bar and semibold text, not color alone (W-10).
    "&[aria-current='true']": {
      position: "relative",
      backgroundColor: t.primaryContainer,
      color: t.onPrimaryContainer,
      "& .tx-main *": { fontWeight: 600 },
      "&::before": { content: '""', position: "absolute", insetBlock: 0, insetInlineStart: 0, width: 3, backgroundColor: t.primary },
    },
    "&[aria-current='true'] .tx-icon, &[aria-current='true'] .tx-chevron": { color: "inherit" },
    "&.Mui-focusVisible": { outlineOffset: -2 },
    // Narrow rows (xs at 200% text, narrow columns): icon, label, and chevron stay on the first
    // line with the label at least 8rem wide; the amount takes its own line (W-21).
    "@container (max-width: 16rem)": {
      flexWrap: "wrap",
      "& .tx-main": { flex: "1 1 0", minWidth: "8rem", order: 1 },
      "& .tx-icon": { order: 0 },
      "& .tx-chevron": { order: 2 },
      "& .tx-amount": { order: 3, flexBasis: "100%", paddingInlineStart: iconSize.md + space.md },
    },
  };
}) as typeof ButtonBase;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface LedgerListProps {
  rows: LedgerRow[];
  onSelect: (row: LedgerRow) => void;
  selectedId?: number | null;
  /** Row that receives focus after "Show more" (the first new one). */
  focusId?: number | null;
}

export function LedgerList({ rows, onSelect, selectedId, focusId }: LedgerListProps) {
  const t = useTranslations("wallet");
  const f = useFormat();
  const label = useTxLabel();

  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const groups: { key: string; title: string; rows: LedgerRow[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.created_at);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const title =
        key === today
          ? t("history.today")
          : key === yesterday
            ? t("history.yesterday")
            : f.date(row.created_at, { day: "numeric", month: "long", year: "numeric" });
      group = { key, title, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }

  return (
    <div>
      {groups.map((g) => (
        <Fragment key={g.key}>
          <DayTitle>{g.title}</DayTitle>
          <Rows>
            {g.rows.map((row) => {
              const Icon = iconFor(row);
              const type = label(row);
              const time = f.date(row.created_at, { timeStyle: "short" });
              const value = f.number(Math.abs(row.amount));
              const amountText = row.amount < 0 ? t("amount.a11yOut", { amount: value }) : t("amount.a11yIn", { amount: value });
              return (
                <li key={row.id}>
                  <RowButton
                    onClick={() => onSelect(row)}
                    aria-label={t("row.a11y", { type, amount: amountText, time })}
                    aria-current={selectedId === row.id ? "true" : undefined}
                    data-ledger-id={row.id}
                    ref={
                      focusId === row.id
                        ? (el: HTMLButtonElement | null) => {
                            el?.focus();
                          }
                        : undefined
                    }
                  >
                    <Icon className="tx-icon" />
                    <span className="tx-main" aria-hidden>
                      <Typography component="span" variant="body1" sx={{ display: "block", overflowWrap: "anywhere" }}>
                        {type}
                      </Typography>
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
                        {time}
                      </Typography>
                    </span>
                    <span className="tx-amount" aria-hidden>
                      <SignedAmount amount={row.amount} />
                    </span>
                    <ChevronForwardIcon className="tx-chevron" />
                  </RowButton>
                </li>
              );
            })}
          </Rows>
        </Fragment>
      ))}
    </div>
  );
}

// ---- WA-02 transaction detail ---------------------------------------------------------------------

const Facts = styled("dl")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    margin: 0,
    display: "grid",
    gap: theme.spacing(1.5),
    "& > div": { display: "grid", gap: theme.spacing(0.25) },
    "& dt": { ...theme.typography.body2, color: t.textSecondary },
    "& dd": { ...theme.typography.body1, margin: 0, minWidth: 0, overflowWrap: "anywhere" },
  };
});

const NOTES: Partial<Record<LedgerType, string>> = {
  withdrawal_hold: "detail.note.withdrawal_hold",
  withdrawal_refund: "detail.note.withdrawal_refund",
  admin_topup: "detail.note.admin_topup",
  signup_bonus: "detail.note.signup_bonus",
  transfer: "detail.note.transfer",
};

/** Where a row links (wallet.md §3.2 step 4): withdrawal requests and transfer profiles only. */
export function relatedLink(row: LedgerRow): { href: string; kind: "withdrawal" | "profile" } | null {
  if (row.ref_type === "withdrawal" && row.ref_id) return { href: `/wallet/withdrawals/${encodeURIComponent(row.ref_id)}`, kind: "withdrawal" };
  if (row.type === "transfer" && row.counterparty) return { href: `/profile/${encodeURIComponent(row.counterparty)}`, kind: "profile" };
  return null;
}

export function TxDetail({ row }: { row: LedgerRow }) {
  const t = useTranslations("wallet");
  const f = useFormat();
  const label = useTxLabel();
  const link = relatedLink(row);
  const noteKey = isKnownType(row.type) ? NOTES[row.type] : undefined;
  const Icon = iconFor(row);

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Icon sx={{ color: "text.secondary", flex: "none" }} />
        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {label(row)}
          </Typography>
          {!isKnownType(row.type) && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
              <bdi dir="ltr">{t("detail.rawType", { type: row.type })}</bdi>
            </Typography>
          )}
        </Stack>
      </Stack>
      <SignedAmount amount={row.amount} size="large" />
      <Facts>
        <div>
          <dt>{t("detail.date")}</dt>
          <dd>{f.dateTime(row.created_at)}</dd>
        </div>
        {row.type === "transfer" && row.counterparty && (
          <div>
            <dt>{t("detail.counterparty")}</dt>
            <dd>
              <bdi dir="ltr">@{row.counterparty}</bdi>
            </dd>
          </div>
        )}
        <div>
          <dt>{t("detail.reference")}</dt>
          <dd>
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
              <Typography component="span" variant="body2" dir="ltr" sx={{ fontFamily: "monospace", overflowWrap: "anywhere", flex: "1 1 10rem", minWidth: 0 }}>
                {row.tx_id}
              </Typography>
              <CopyButton value={row.tx_id} label={t("detail.copyReference")} />
            </Stack>
          </dd>
        </div>
      </Facts>
      {noteKey && <InfoLine>{t(noteKey)}</InfoLine>}
      {link && (
        <Button variant="outlined" component={NextLink} href={link.href} endIcon={<ChevronForwardIcon />}>
          {t(link.kind === "withdrawal" ? "detail.open.withdrawal" : "detail.open.profile")}
        </Button>
      )}
    </Stack>
  );
}
