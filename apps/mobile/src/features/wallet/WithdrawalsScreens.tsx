"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import { iconSize, layout, radii } from "@bg/design-tokens";
import type { Withdrawal, WithdrawalStatus } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/Toast";
import { ChevronForwardIcon, ClockIcon, CloseIcon, CoinIcon } from "@/components/icons";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { BankAccountCard } from "@/components/wallet/BankAccount";
import { CopyButton } from "@/components/wallet/CopyButton";
import { InfoLine } from "@/components/wallet/InfoLine";
import { WithdrawalStatusChip, WithdrawalTimeline, type TimelineStep } from "@/components/wallet/WithdrawalStatus";
import { errorStatus, toApiError, useErrorText } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { gutterStyles } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { detailString, tehranToday, useWalletFormat } from "./shared";

// WD-06 Withdrawal requests `/wallet/withdrawals`, WD-07 detail `/wallet/withdrawals/[id]`, and
// WD-09 cancel (wallet.md §3.7). The route layout keeps the list mounted:
// - Narrow: the list, or the detail alone on its own route.
// - Container ≥ 44rem (md/lg with room): list + detail panel; the URL follows the selection
//   (ia.md §3.3), so deep links and Back behave the same at every width.
// Status chips and timeline steps use icon + text, color is secondary (P§13).

const WIDE = "44rem";

interface ListState {
  rows: Withdrawal[] | null;
  next: string | null;
  error: { offline: boolean; code?: string } | null;
  loadingMore: boolean;
  reload: () => void;
  more: () => void;
  /** A detail screen learned a newer version of a row (cancelled, decided). */
  update: (w: Withdrawal) => void;
}

const ListContext = createContext<ListState | null>(null);

const Frame = styled("div")(({ theme }) => ({
  containerType: "inline-size",
  containerName: "withdrawals",
  flex: "1 1 auto",
  ...gutterStyles,
  paddingBlock: theme.spacing(3),
  "& .wd-grid": { display: "grid", gap: theme.spacing(3), gridTemplateColumns: "minmax(0, 1fr)" },
  "&[data-detail='true'] .wd-list": { display: "none" },
  "&[data-detail='false'] .wd-detail": { display: "none" },
  "& .wd-detail, & .wd-list": { minWidth: 0, width: "100%", maxWidth: layout.taskFlowMaxWidth, marginInline: "auto" },
  [`@container withdrawals (min-width: ${WIDE})`]: {
    "& .wd-grid": {
      gridTemplateColumns: `minmax(${layout.sidePanelWidth}px, ${layout.sidePanelWidthLg}px) minmax(0, 1fr)`,
      alignItems: "start",
    },
    "&[data-detail='true'] .wd-list, &[data-detail='false'] .wd-detail": { display: "block" },
    "& .wd-detail, & .wd-list": { maxWidth: "none", marginInline: 0 },
    "@media (min-height: 700px)": { "& .wd-list": { position: "sticky", insetBlockStart: theme.spacing(10) } },
  },
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

const Row = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    minHeight: layout.listRowMinHeight,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 1.5, 1.5, 2),
    textAlign: "start",
    color: t.textPrimary,
    "& .wd-main": { flex: "1 1 auto", minWidth: 0, display: "grid", gap: theme.spacing(0.5) },
    "& .wd-chevron": { flex: "none", color: t.textSecondary, alignSelf: "center", fontSize: iconSize.sm },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "&[aria-current='page']": { backgroundColor: t.primaryContainer, color: t.onPrimaryContainer },
    "&[aria-current='page'] .wd-chevron": { color: "inherit" },
    "&.Mui-focusVisible": { outlineOffset: -2 },
  };
}) as typeof ButtonBase;

function selectedFrom(pathname: string): number | null {
  const m = pathname.match(/^\/wallet\/withdrawals\/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Route layout for /wallet/withdrawals and /wallet/withdrawals/[id]. */
export function WithdrawalsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname() ?? "/wallet/withdrawals";
  const selected = selectedFrom(pathname);
  const { handleAuthError } = useSession();
  const { noteWithdrawals } = useWallet();

  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<ListState["error"]>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    api.wallet
      .withdrawals()
      .then((page) => {
        setRows(page.results);
        setNext(page.next);
        noteWithdrawals(page.results);
      })
      .catch((e) => {
        if (handleAuthError(e)) return;
        const err = toApiError(e);
        setError({ offline: err.code === "NETWORK", code: err.code === "NETWORK" ? undefined : err.code });
      });
  }, [handleAuthError, noteWithdrawals]);

  useEffect(reload, [reload]);

  const more = () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    api.wallet
      .withdrawals(next)
      .then((page) => {
        setRows((r) => [...(r ?? []), ...page.results]);
        setNext(page.next);
      })
      .catch((e) => handleAuthError(e))
      .finally(() => setLoadingMore(false));
  };

  const update = useCallback((w: Withdrawal) => {
    setRows((r) => (r ? r.map((x) => (x.id === w.id ? w : x)) : r));
  }, []);

  const value: ListState = { rows, next, error, loadingMore, reload, more, update };

  const back = () => {
    if (selected !== null && window.history.length > 1) router.back();
    else router.push(selected !== null ? "/wallet/withdrawals" : "/wallet");
  };

  return (
    <ListContext.Provider value={value}>
      <SignedInShell
        topBar={{
          title: selected !== null ? t("withdrawals.detail.title") : t("withdrawals.title"),
          leading: "back",
          onNavigate: back,
        }}
      >
        <Frame data-detail={selected !== null ? "true" : "false"}>
          <div className="wd-grid">
            <section className="wd-list" aria-label={t("withdrawals.title")}>
              <WithdrawalsList selected={selected} />
            </section>
            <div className="wd-detail">{children}</div>
          </div>
        </Frame>
      </SignedInShell>
    </ListContext.Provider>
  );
}

function useList(): ListState {
  const v = useContext(ListContext);
  if (!v) throw new Error("inside WithdrawalsLayout only");
  return v;
}

function WithdrawalsList({ selected }: { selected: number | null }) {
  const t = useTranslations();
  const f = useWalletFormat();
  const router = useRouter();
  const online = useOnline();
  const { rows, next, error, loadingMore, reload, more } = useList();

  if (error && !rows) {
    return (
      <ErrorState
        kind={error.offline ? "offline" : "error"}
        message={error.offline ? t("net.offline") : t("withdrawals.loadError")}
        code={error.code}
        onRetry={reload}
      />
    );
  }
  if (!rows) return <LoadingState variant="list" rows={4} />;
  if (rows.length === 0) return <EmptyState message={t("withdrawals.empty")} />;

  return (
    <Stack spacing={2}>
      <Rows>
        {rows.map((w) => (
          <li key={w.id}>
            <Row
              onClick={() => router.push(`/wallet/withdrawals/${w.id}`)}
              aria-current={selected === w.id ? "page" : undefined}
              aria-label={t("withdrawals.row.a11y", {
                amount: f.coins(w.amount),
                status: t(`withdrawals.status.${w.status}`),
                date: f.date(w.created_at),
              })}
            >
              <span className="wd-main" aria-hidden>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                  <Typography component="span" variant="label" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <CoinIcon sx={{ fontSize: iconSize.sm }} />
                    {f.coins(w.amount)}
                  </Typography>
                  <WithdrawalStatusChip status={w.status} />
                </Stack>
                <Typography component="span" variant="body2" color="text.secondary">
                  {`${t("withdrawals.detail.payout")}: ${f.toman(w.payout_toman)}`}
                </Typography>
                <Typography component="span" variant="body2" color="text.secondary">
                  {t("withdrawals.requestedAt", { date: f.date(w.created_at) })}
                  {w.status === "pending" && ` · ${t("withdrawals.expectedBy", { date: f.dayOnly(w.expected_by) })}`}
                </Typography>
              </span>
              <ChevronForwardIcon className="wd-chevron" />
            </Row>
          </li>
        ))}
      </Rows>
      {next && (
        <Button variant="outlined" onClick={more} loading={loadingMore} disabled={!online} sx={{ alignSelf: "center" }}>
          {t("common.showMore")}
        </Button>
      )}
    </Stack>
  );
}

/** `/wallet/withdrawals` detail slot: a prompt beside the list (hidden on narrow screens). */
export function WithdrawalsPrompt() {
  const t = useTranslations();
  return (
    <Box sx={{ py: 4 }}>
      <Typography color="text.secondary" sx={{ textAlign: "center" }}>
        {t("withdrawals.selectPrompt")}
      </Typography>
    </Box>
  );
}

// ---- WD-07 detail + WD-09 cancel ----------------------------------------------------------------------

const Facts = styled("dl")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    margin: 0,
    padding: theme.spacing(1.5, 2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surfaceSunken,
    containerType: "inline-size",
    "& > div": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: theme.spacing(2),
      paddingBlock: theme.spacing(0.75),
    },
    "& dt": { ...theme.typography.body2, color: t.textSecondary },
    "& dd": { ...theme.typography.body1, margin: 0, textAlign: "end", fontVariantNumeric: "tabular-nums", minWidth: 0, overflowWrap: "anywhere" },
    "@container (max-width: 18rem)": { "& > div": { flexDirection: "column", alignItems: "stretch", gap: theme.spacing(0.25) }, "& dd": { textAlign: "start" } },
  };
});

type Detail = { kind: "loading" } | { kind: "ok"; w: Withdrawal } | { kind: "notFound" } | { kind: "error"; offline: boolean; code?: string };

const ALREADY: Record<Exclude<WithdrawalStatus, "pending">, string> = {
  paid: "withdrawals.cancel.alreadyPaid",
  rejected: "withdrawals.cancel.alreadyRejected",
  cancelled: "withdrawals.cancel.alreadyCancelled",
};

export function WithdrawalDetail({ id, submitted }: { id: number; submitted: boolean }) {
  const t = useTranslations();
  const f = useWalletFormat();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const errorText = useErrorText();
  const { handleAuthError } = useSession();
  const wallet = useWallet();
  const list = useContext(ListContext);
  const [state, setState] = useState<Detail>({ kind: "loading" });
  const [dialog, setDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const { markWithdrawalSeen, refresh } = wallet;
  const update = list?.update;

  /** `silent`: re-check without replacing the screen by a skeleton (Check status, races). */
  const load = useCallback((silent = false) => {
    if (!silent) setState({ kind: "loading" });
    return api.wallet
      .withdrawal(id)
      .then((w) => {
        setState({ kind: "ok", w });
        markWithdrawalSeen(w.id);
        update?.(w);
        return w;
      })
      .catch((e) => {
        if (handleAuthError(e)) return null;
        if (errorStatus(e) === 404) setState({ kind: "notFound" });
        else {
          const err = toApiError(e);
          setState({ kind: "error", offline: err.code === "NETWORK", code: err.code === "NETWORK" ? undefined : err.code });
        }
        return null;
      });
  }, [id, handleAuthError, markWithdrawalSeen, update]);

  useEffect(() => {
    void load();
  }, [load]);

  // The submitted banner takes focus once, right after the flow (wallet.md §8 WD-07).
  useEffect(() => {
    if (submitted && state.kind === "ok") bannerRef.current?.focus();
  }, [submitted, state.kind]);

  const cancel = async () => {
    if (state.kind !== "ok" || cancelling) return;
    setCancelling(true);
    setDialogError(null);
    try {
      const w = await api.wallet.cancelWithdrawal(state.w.id);
      setState({ kind: "ok", w });
      update?.(w);
      setDialog(false);
      toast.show({ message: t("withdrawals.cancel.done", { amount: f.number(w.amount) }) });
      void refresh();
    } catch (e) {
      if (handleAuthError(e)) return;
      const err = toApiError(e);
      if (err.code === "WITHDRAWAL_NOT_PENDING") {
        setDialog(false);
        const status = detailString(err.details, "status");
        await load(true);
        if (status && status !== "pending") setNotice(t(ALREADY[status as keyof typeof ALREADY]));
        void refresh();
      } else {
        setDialogError(err.code === "NETWORK" ? t("errors.network") : errorText(err).message);
      }
    } finally {
      setCancelling(false);
    }
  };

  if (state.kind === "loading") return <LoadingState variant="cards" rows={2} />;
  if (state.kind === "notFound") {
    return <ErrorState message={t("withdrawals.notFound")} onBack={() => router.push("/wallet/withdrawals")} />;
  }
  if (state.kind === "error") {
    return (
      <ErrorState
        kind={state.offline ? "offline" : "error"}
        message={state.offline ? t("net.offline") : t("withdrawals.loadError")}
        code={state.code}
        onRetry={() => void load()}
      />
    );
  }

  const w = state.w;
  const late = w.status === "pending" && tehranToday() > w.expected_by;
  const steps: TimelineStep[] = [
    { key: "requested", label: t("withdrawals.detail.timeline.requested"), detail: f.dateTime(w.created_at), state: "done" },
    {
      key: "waiting",
      label: t("withdrawals.detail.timeline.waiting", { date: f.dayOnly(w.expected_by) }),
      state: w.status === "pending" ? "current" : "done",
    },
  ];
  if (w.status === "paid") {
    steps.push({
      key: "paid",
      label: t("withdrawals.detail.timeline.paid"),
      state: "done",
      detail: (
        <Stack spacing={0.5}>
          {w.decided_at && <span>{f.dateTime(w.decided_at)}</span>}
          {w.bank_reference && (
            <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
              <span>{t("withdrawals.detail.bankRef")}:</span>
              <bdi dir="ltr" style={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
                {w.bank_reference}
              </bdi>
              <CopyButton value={w.bank_reference} label={t("withdrawals.detail.copyRef")} />
            </Stack>
          )}
        </Stack>
      ),
    });
  } else if (w.status === "rejected") {
    steps.push({
      key: "rejected",
      label: t("withdrawals.detail.timeline.rejected"),
      state: "stopped",
      detail: w.decided_at ? f.dateTime(w.decided_at) : undefined,
    });
  } else if (w.status === "cancelled") {
    steps.push({
      key: "cancelled",
      label: t("withdrawals.detail.timeline.cancelled"),
      state: "neutral",
      detail: w.decided_at ? f.dateTime(w.decided_at) : undefined,
    });
  }

  return (
    <Stack spacing={3}>
      {submitted && (
        <div ref={bannerRef} tabIndex={-1} style={{ outline: "none" }}>
          <Banner severity="success">{t("withdrawals.detail.submitted")}</Banner>
        </div>
      )}
      {notice && <Banner severity="info">{notice}</Banner>}

      <Stack spacing={1}>
        <WithdrawalStatusChip status={w.status} />
        <Typography variant="h2" component="p" sx={{ display: "flex", alignItems: "center", gap: 1, fontVariantNumeric: "tabular-nums" }}>
          <CoinIcon sx={{ fontSize: iconSize.lg }} />
          {f.coins(w.amount)}
        </Typography>
        <Typography color="text.secondary">{`${t("withdrawals.detail.payout")}: ${f.toman(w.payout_toman)}`}</Typography>
        {w.status === "pending" && <InfoLine icon={ClockIcon} tone="primary">{t("withdrawals.expectedBy", { date: f.dayOnly(w.expected_by) })}</InfoLine>}
      </Stack>

      {late && <InfoLine>{t("withdrawals.detail.late")}</InfoLine>}

      {w.status === "rejected" && (
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            {t("withdrawals.detail.reason")}
          </Typography>
          {/* Admin free text, shown as written (open question 11). */}
          <Typography dir="auto">{w.reject_reason}</Typography>
          <InfoLine>{t("withdrawals.detail.returned", { amount: f.number(w.amount) })}</InfoLine>
        </Stack>
      )}

      <WithdrawalTimeline steps={steps} label={t("withdrawals.detail.title")} />

      <Facts>
        <div>
          <dt>{t("withdrawals.detail.amount")}</dt>
          <dd>{f.coins(w.amount)}</dd>
        </div>
        <div>
          <dt>{t("withdrawals.detail.fee")}</dt>
          <dd>{f.coins(w.fee)}</dd>
        </div>
        <div>
          <dt>{t("withdrawals.detail.payout")}</dt>
          <dd>{f.toman(w.payout_toman)}</dd>
        </div>
        <div>
          <dt>{t("withdrawals.detail.reference")}</dt>
          <dd>
            <bdi dir="ltr">{f.digits(String(w.id))}</bdi>
          </dd>
        </div>
      </Facts>
      <BankAccountCard account={w.bank} title={t("withdrawals.detail.bank")} />

      {w.status === "pending" && (
        <Stack spacing={1}>
          <Button
            variant="outlined"
            size="large"
            startIcon={<CloseIcon />}
            onClick={() => online && setDialog(true)}
            aria-disabled={!online || undefined}
            aria-describedby={!online ? "wd-offline" : undefined}
            sx={!online ? { color: "text.disabled", cursor: "not-allowed" } : undefined}
          >
            {t("withdrawals.detail.cancel")}
          </Button>
          {!online && <InfoLine id="wd-offline">{t("net.offlineAction")}</InfoLine>}
        </Stack>
      )}

      <ConfirmDialog
        open={dialog}
        onCancel={() => {
          setDialog(false);
          setDialogError(null);
        }}
        onConfirm={() => void cancel()}
        title={t("withdrawals.cancel.title")}
        confirmLabel={t("withdrawals.cancel.confirm")}
        cancelLabel={t("withdrawals.cancel.keep")}
        inFlight={cancelling}
        inFlightLabel={t("withdrawals.cancel.cancelling")}
        error={dialogError}
        disabledReason={online ? null : t("net.offlineAction")}
        onCheckStatus={() => {
          void load(true).then((fresh) => {
            if (fresh && fresh.status !== "pending") {
              setDialog(false);
              setCancelling(false);
            }
          });
        }}
      >
        {t("withdrawals.cancel.body", { amount: f.number(w.amount) })}
      </ConfirmDialog>
    </Stack>
  );
}
