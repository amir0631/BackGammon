"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from "react";
import { api, ibanLast4 } from "@bg/api-client";
import { isolate } from "@bg/i18n";
import { iconSize, layout, radii } from "@bg/design-tokens";
import type { BankAccountInfo, LedgerRow, Withdrawal } from "@bg/protocol";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { AddCoinsIcon, BankIcon, ClockIcon, CoinIcon, RefreshIcon, SendIcon, WithdrawIcon, type IconProps } from "@/components/icons";
import { NavGroup, NavRow } from "@/components/lists/NavList";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { bankName } from "@/components/wallet/BankAccount";
import { InfoLine } from "@/components/wallet/InfoLine";
import { LedgerList, TxDetail } from "@/components/wallet/Ledger";
import { toApiError } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { gutterStyles } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { useWalletFormat } from "./shared";
import { canGoBackInApp } from "@/lib/inAppNav";

// WA-01 Wallet `/wallet` (wallet.md §3.1–§3.3, §4 WA-01, WA-02, WA-04).
// - Server values only: the page computes nothing but the toman equivalent (§9 AC 1).
// - Get coins · Send coins · Withdraw are three equal buttons; none is primary or highlighted
//   (P§9.2). Suspended: Send and Get coins are disabled with the reason; Withdraw stays.
// - History: newest first, 30 per page, "Show more" (no auto-load); focus goes to the first new row.
// - Layout by container width: one column; two columns (summary | history) from 36rem (768 px
//   portrait with the rail, W-05); three
//   columns (summary | history | detail panel) from 64rem. Below that WA-02 opens as a sheet
//   (a centered dialog at md).

// Sheets load on first open (JS budget, §11.4); once loaded they stay mounted for the close animation.
const TxDetailSheet = dynamic(() => import("./WalletSheets").then((m) => m.TxDetailSheet), { ssr: false });
const GetCoinsSheet = dynamic(() => import("./WalletSheets").then((m) => m.GetCoinsSheet), { ssr: false });

const WIDE = "36rem";
/** Landscape phones (ia.md §3.3): the balance card collapses to one line (wallet.md §6). */
const COMPACT = `@media (orientation: landscape) and (max-height: ${layout.compactHeight - 0.02}px)`;
/** Side columns stick only when the viewport can show them whole. */
const TALL = "@media (min-height: 700px)";
const THREE = "64rem";

const Frame = styled("div")(({ theme }) => ({
  containerType: "inline-size",
  containerName: "wallet",
  flex: "1 1 auto",
  ...gutterStyles,
  paddingBlock: theme.spacing(2, 4),
  "& .wallet-grid": { display: "grid", gap: theme.spacing(3), gridTemplateColumns: "minmax(0, 1fr)" },
  "& .wallet-detail": { display: "none" },
  [`@container wallet (min-width: ${WIDE})`]: {
    "& .wallet-grid": {
      // The history column never gets under 18rem, so ledger rows stay readable (W-21).
      gridTemplateColumns: "minmax(16rem, 1fr) minmax(18rem, 1.25fr)",
      alignItems: "start",
    },
    [TALL]: { "& .wallet-summary": { position: "sticky", insetBlockStart: theme.spacing(10) } },
  },
  [`@container wallet (min-width: ${THREE})`]: {
    "& .wallet-grid": {
      gridTemplateColumns: `minmax(${layout.sidePanelWidth}px, ${layout.sidePanelWidthLg}px) minmax(0, 1fr) minmax(${layout.sidePanelWidth}px, ${layout.sidePanelWidthLg}px)`,
    },
    "& .wallet-detail": { display: "block" },
    [TALL]: { "& .wallet-detail": { position: "sticky", insetBlockStart: theme.spacing(10) } },
  },
}));

const Card = styled("section")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(2.5),
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    containerType: "inline-size",
    [COMPACT]: {
      padding: theme.spacing(1.5, 2),
      "& .balance-amount": { ...theme.typography.h3 },
      "& .balance-toman, & .balance-divider": { display: "none" },
    },
  };
});

const Actions = styled("div")(({ theme }) => ({
  containerType: "inline-size",
  "& .wallet-actions": {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: theme.spacing(1),
  },
  // 200% text or a very narrow column: full-width rows (wallet.md §6 xs).
  "@container (max-width: 17rem)": { "& .wallet-actions": { gridTemplateColumns: "minmax(0, 1fr)" } },
}));

const ActionButtonRoot = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(0.75),
    minHeight: layout.listRowMinHeight,
    padding: theme.spacing(1.5, 1),
    borderRadius: radii.md,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surfaceRaised,
    color: t.textPrimary,
    textAlign: "center",
    ...theme.typography.label,
    overflowWrap: "anywhere",
    "& svg": { color: t.primary, fontSize: iconSize.md },
    "@media (hover: hover)": { "&:hover": { borderColor: t.textSecondary } },
    "&[aria-disabled='true']": { color: t.textDisabled, borderColor: t.outlineSubtle, cursor: "not-allowed" },
    "&[aria-disabled='true'] svg": { color: t.textDisabled },
    "@container (max-width: 17rem)": { flexDirection: "row", justifyContent: "flex-start", textAlign: "start", paddingInline: theme.spacing(2) },
  };
}) as typeof ButtonBase;

function WalletAction({
  icon: Icon,
  label,
  href,
  onClick,
  blocked,
  describedBy,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  href?: string;
  onClick?: () => void;
  blocked: boolean;
  describedBy?: string;
}) {
  const common = {
    "aria-disabled": blocked || undefined,
    "aria-describedby": blocked ? describedBy : undefined,
  };
  if (href && !blocked) {
    return (
      <ActionButtonRoot component={NextLink} href={href} {...common}>
        <Icon />
        {label}
      </ActionButtonRoot>
    );
  }
  return (
    <ActionButtonRoot
      onClick={() => {
        if (!blocked) onClick?.();
      }}
      {...common}
    >
      <Icon />
      {label}
    </ActionButtonRoot>
  );
}

type Page = { rows: LedgerRow[]; next: string | null };
type Loadable<T> = { kind: "loading" } | { kind: "error"; code?: string; offline: boolean } | { kind: "ok"; value: T };

export function WalletHomeScreen({ initialTx }: { initialTx?: number | null }) {
  const t = useTranslations();
  const f = useWalletFormat();
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const { me, handleAuthError } = useSession();
  const wallet = useWallet();
  const { summary, refresh, markLedgerSeen, noteWithdrawals } = wallet;
  // The detail panel exists only when the container is wide enough (a container query, so it
  // follows text size too); rows open the sheet otherwise.
  const detailRef = useRef<HTMLElement>(null);
  const panelVisible = () => Boolean(detailRef.current && getComputedStyle(detailRef.current).display !== "none");

  const [ledger, setLedger] = useState<Loadable<Page>>({ kind: "loading" });
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [pending, setPending] = useState<Withdrawal[] | null>(null);
  const [bank, setBank] = useState<BankAccountInfo | null | undefined>(undefined);
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const [sheetRow, setSheetRow] = useState<LedgerRow | null>(null);
  const [getCoinsOpen, setGetCoinsOpen] = useState(false);
  const [sheetsUsed, setSheetsUsed] = useState({ detail: false, coins: false });
  useEffect(() => {
    if (sheetRow || getCoinsOpen) setSheetsUsed((u) => ({ detail: u.detail || Boolean(sheetRow), coins: u.coins || getCoinsOpen }));
  }, [sheetRow, getCoinsOpen]);
  const [whyOpen, setWhyOpen] = useState(false);
  const [triedSummary, setTriedSummary] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reasonId = useId();
  const whyId = useId();
  const lastTrigger = useRef<HTMLElement | null>(null);

  const suspended = me?.status === "suspended";

  const loadLedger = useCallback(() => {
    setLedger({ kind: "loading" });
    api.wallet
      .ledger()
      .then((page) => {
        setLedger({ kind: "ok", value: { rows: page.results, next: page.next } });
        markLedgerSeen(page.results);
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        const e = toApiError(error);
        setLedger({ kind: "error", offline: e.code === "NETWORK", code: e.code === "NETWORK" ? undefined : e.code });
      });
  }, [handleAuthError, markLedgerSeen]);

  const loadSide = useCallback(() => {
    api.wallet
      .withdrawals()
      .then((page) => {
        noteWithdrawals(page.results);
        setPending(page.results.filter((w) => w.status === "pending"));
      })
      .catch(() => setPending((p) => p ?? []));
    api.wallet
      .bankAccounts()
      .then((page) => setBank(page.results[0] ?? null))
      .catch(() => setBank((b) => (b === undefined ? null : b)));
  }, [noteWithdrawals]);

  const loadAll = useCallback(() => {
    void refresh().finally(() => setTriedSummary(true));
    loadLedger();
    loadSide();
  }, [refresh, loadLedger, loadSide]);

  useEffect(loadAll, [loadAll]);

  // Refresh on focus and when the connection returns (§3.1 step 2); the summary itself is
  // refreshed by the wallet provider.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        loadLedger();
        loadSide();
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [loadLedger, loadSide]);

  // `?tx=<id>` from a notice: open that row once it is loaded.
  useEffect(() => {
    if (!initialTx || ledger.kind !== "ok") return;
    const row = ledger.value.rows.find((r) => r.id === initialTx);
    if (row) (panelVisible() ? setSelected : setSheetRow)(row);
  }, [initialTx, ledger]);

  const showMore = () => {
    if (ledger.kind !== "ok" || !ledger.value.next || moreLoading) return;
    setMoreLoading(true);
    setMoreError(false);
    api.wallet
      .ledger(ledger.value.next)
      .then((page) => {
        setLedger({ kind: "ok", value: { rows: [...ledger.value.rows, ...page.results], next: page.next } });
        setFocusId(page.results[0]?.id ?? null);
      })
      .catch((error) => {
        if (!handleAuthError(error)) setMoreError(true);
      })
      .finally(() => setMoreLoading(false));
  };

  const openRow = (row: LedgerRow) => {
    lastTrigger.current = document.activeElement as HTMLElement | null;
    if (panelVisible()) setSelected(row);
    else setSheetRow(row);
  };

  // ---- Balance card ------------------------------------------------------------------------------
  const balanceCard = (() => {
    if (!summary) {
      if (wallet.failed && triedSummary) {
        return (
          <ErrorState
            kind={online ? "error" : "offline"}
            message={online ? t("wallet.loadError") : t("net.offline")}
            onRetry={() => void refresh()}
          />
        );
      }
      return (
        <Card aria-busy="true" aria-label={t("wallet.available")}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" sx={{ typography: "h1" }} />
          <Skeleton variant="text" width="45%" />
        </Card>
      );
    }
    const s = summary;
    const showMovable = s.bonus_locked > 0;
    return (
      <Card aria-labelledby="wallet-available">
        <Typography id="wallet-available" variant="labelSmall" component="h2" color="text.secondary">
          {t("wallet.available")}
        </Typography>
        <Typography
          variant="h1"
          component="p"
          className="balance-amount"
          sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}
        >
          <CoinIcon sx={{ fontSize: iconSize.lg }} />
          <span>{f.coins(s.balance)}</span>
        </Typography>
        <Typography variant="body2" color="text.secondary" className="balance-toman">
          {t("wallet.tomanLine", { amount: f.number(s.balance * s.coin_price_toman) })}
        </Typography>

        {(s.locked > 0 || showMovable) && <Box component="hr" aria-hidden className="balance-divider" sx={(theme) => ({ border: 0, borderBlockStart: `1px solid ${tokensOf(theme).outlineSubtle}`, my: 1, width: "100%" })} />}
        {s.locked > 0 && (
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1 }}>
            <InfoLine icon={ClockIcon} tone="primary">
              {t("wallet.onHold", { amount: f.number(s.locked) })}
            </InfoLine>
            <StandaloneLink href="/wallet/withdrawals">{t("wallet.onHoldLink")}</StandaloneLink>
          </Stack>
        )}
        {showMovable && (
          <>
            <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1 }}>
              <InfoLine tone="primary">{t("wallet.bonusLocked.line", { amount: f.number(s.bonus_locked) })}</InfoLine>
              <Button
                variant="text"
                size="small"
                aria-expanded={whyOpen}
                aria-controls={whyId}
                onClick={() => setWhyOpen((v) => !v)}
              >
                {t("wallet.bonusLocked.why")}
              </Button>
            </Stack>
            <Collapse in={whyOpen} id={whyId}>
              <Typography variant="body2" color="text.secondary" sx={{ paddingInlineStart: 3.25 }}>
                {t("wallet.bonusLocked.explain")}
              </Typography>
            </Collapse>
            {s.transferable === s.withdrawable ? (
              <InfoLine tone="primary">{t("wallet.movable", { amount: f.number(s.transferable) })}</InfoLine>
            ) : (
              <>
                <InfoLine tone="primary">{t("wallet.transferable", { amount: f.number(s.transferable) })}</InfoLine>
                <InfoLine tone="primary">{t("wallet.withdrawable", { amount: f.number(s.withdrawable) })}</InfoLine>
              </>
            )}
          </>
        )}
        {/* W-08: an on-demand refresh (the installed PWA has no browser reload). */}
        <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1 }}>
          {(!online || wallet.failed) && wallet.updatedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ flex: "1 1 auto" }}>
              {t("wallet.lastUpdated", { time: f.dateTime(new Date(wallet.updatedAt)) })}
            </Typography>
          )}
          <Button
            variant="text"
            size="small"
            startIcon={<RefreshIcon />}
            loading={refreshing}
            disabled={!online}
            onClick={() => {
              setRefreshing(true);
              void Promise.all([refresh(), loadLedger()]).finally(() => setRefreshing(false));
            }}
            sx={{ minHeight: 44 }}
          >
            {t("wallet.refresh")}
          </Button>
        </Stack>
      </Card>
    );
  })();

  // ---- Actions ---------------------------------------------------------------------------------
  const reason = !online ? t("net.offlineAction") : suspended ? t("account.suspended.actionBlocked") : null;
  const actions = (
    <Actions>
      <nav aria-label={t("wallet.actions.label")}>
        <div className="wallet-actions">
          <WalletAction
            icon={AddCoinsIcon}
            label={t("wallet.actions.getCoins")}
            onClick={() => setGetCoinsOpen(true)}
            blocked={!online || suspended}
            describedBy={reasonId}
          />
          <WalletAction
            icon={SendIcon}
            label={t("wallet.actions.send")}
            href="/wallet/transfer"
            blocked={!online || suspended}
            describedBy={reasonId}
          />
          <WalletAction icon={WithdrawIcon} label={t("wallet.actions.withdraw")} href="/wallet/withdraw" blocked={!online} describedBy={reasonId} />
        </div>
      </nav>
      {reason && (
        <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1, mt: 1 }}>
          <InfoLine id={reasonId}>{reason}</InfoLine>
          {online && suspended && <StandaloneLink href="/account/status?next=%2Fwallet">{t("account.suspended.details")}</StandaloneLink>}
        </Stack>
      )}
    </Actions>
  );

  // ---- Pending summary and links --------------------------------------------------------------------
  const pendingSummary =
    pending && pending.length > 0 ? (
      <NavGroup>
        <NavRow
          href={pending.length === 1 ? `/wallet/withdrawals/${pending[0]!.id}` : "/wallet/withdrawals"}
          icon={ClockIcon}
          label={t("wallet.pending.summary", {
            count: pending.length,
            date: f.dayOnly([...pending].sort((a, b) => a.expected_by.localeCompare(b.expected_by))[0]!.expected_by),
          })}
        />
      </NavGroup>
    ) : null;

  const links = (
    <NavGroup>
      <NavRow href="/wallet/withdrawals" icon={WithdrawIcon} label={t("wallet.links.withdrawals")} />
      <NavRow
        href="/wallet/bank-accounts"
        icon={BankIcon}
        label={t("wallet.links.bankAccount")}
        secondary={
          bank === undefined ? undefined : bank ? (
            t("wallet.links.bankAccountValue", { bank: bankName(bank.bank, locale) || bank.bank_code, last4: isolate(ibanLast4(bank.iban)) })
          ) : (
            t("wallet.links.bankAccountEmpty")
          )
        }
      />
    </NavGroup>
  );

  // ---- History ---------------------------------------------------------------------------------------
  const history = (
    <section aria-labelledby="wallet-history">
      <Typography id="wallet-history" variant="h4" component="h2" sx={{ mb: 0.5 }}>
        {t("wallet.history.title")}
      </Typography>
      {ledger.kind === "loading" && <LoadingState variant="list" rows={6} />}
      {ledger.kind === "error" && (
        <ErrorState
          kind={ledger.offline ? "offline" : "error"}
          message={ledger.offline ? t("net.offline") : t("wallet.history.loadError")}
          code={ledger.code}
          onRetry={loadLedger}
        />
      )}
      {ledger.kind === "ok" &&
        (ledger.value.rows.length === 0 ? (
          <EmptyState message={t("wallet.history.empty")} />
        ) : (
          <Stack spacing={2}>
            <LedgerList rows={ledger.value.rows} onSelect={openRow} selectedId={selected?.id ?? null} focusId={focusId} />
            {ledger.value.next ? (
              <Stack spacing={1} sx={{ alignItems: "center" }}>
                {moreError && <InfoLine>{t("wallet.history.loadError")}</InfoLine>}
                <Button variant="outlined" onClick={showMore} loading={moreLoading} disabled={!online}>
                  {moreError ? t("common.retry") : t("wallet.history.more")}
                </Button>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                {t("wallet.history.end")}
              </Typography>
            )}
          </Stack>
        ))}
    </section>
  );

  return (
    <SignedInShell topBar={{ title: t("wallet.title"), leading: "back", onNavigate: () => (canGoBackInApp() ? router.back() : router.push("/me")) }}>
      <Frame>
        <div className="wallet-grid">
          <Stack spacing={2.5} className="wallet-summary">
            {balanceCard}
            {actions}
            {pendingSummary}
            {links}
          </Stack>
          {history}
          <aside ref={detailRef} className="wallet-detail" aria-label={t("wallet.detail.title")}>
            <Card>
              <Typography variant="h4" component="h2">
                {t("wallet.detail.title")}
              </Typography>
              {selected ? (
                <TxDetail row={selected} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("wallet.detail.panelEmpty")}
                </Typography>
              )}
            </Card>
          </aside>
        </div>
      </Frame>

      {(sheetRow || sheetsUsed.detail) && (
        <TxDetailSheet
          row={sheetRow}
          onClose={() => {
            setSheetRow(null);
            lastTrigger.current?.focus();
          }}
        />
      )}
      {(getCoinsOpen || sheetsUsed.coins) && (
        <GetCoinsSheet
          open={getCoinsOpen}
          onClose={() => setGetCoinsOpen(false)}
          username={me?.username ?? null}
          coinPriceToman={summary?.coin_price_toman ?? null}
        />
      )}
    </SignedInShell>
  );
}
