"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ApiRequestError, api } from "@bg/api-client";
import { tehranToday, toLatinDigits } from "@bg/i18n";
import type { AdminWithdrawal, WithdrawalStatus } from "@bg/protocol";
import {
  CopyButton,
  CsvButton,
  DataTable,
  Kv,
  LoadError,
  Loading,
  Ltr,
  PageHeader,
  ReasonDialog,
  Screen,
  StatusChip,
  errorText,
  useApi,
  useFmt,
  useT,
} from "@/components/common";
import { CloseIcon, RefreshIcon, WarningIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

const TABS = ["pending", "paid", "rejected", "cancelled", "all"] as const;
type TabKey = (typeof TABS)[number];

function groups(iban: string): string {
  return (iban.match(/.{1,4}/g) ?? []).join(" ");
}

function ApproveDialog({ w, onClose, onDone }: { w: AdminWithdrawal; onClose: () => void; onDone: (msg: string) => void }) {
  const t = useT();
  const f = useFmt();
  const { handleError } = useAdmin();
  const [reference, setReference] = useState("");
  const [ack, setAck] = useState(false);
  const [bannedAck, setBannedAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<{ status: string; reference: string | null } | null>(null);
  const [claimedBy, setClaimedBy] = useState<string | null>(null);
  const sms = useApi((signal) => api.admin.settings({ signal }), []);
  const smsOn = sms.data?.results.find((s) => s.key === "sms.enabled")?.value === true;

  useEffect(() => {
    // Claim the request so a second admin can't pay it at the same time (the server enforces it).
    api.admin.claimWithdrawal(w.id).catch((e: unknown) => {
      if (handleError(e)) return;
      if (e instanceof ApiRequestError && e.body.code === "WITHDRAWAL_CLAIMED") {
        setClaimedBy(String(e.body.details.claimed_by ?? "?"));
      } else if (e instanceof ApiRequestError && e.body.code === "WITHDRAWAL_NOT_PENDING") {
        setDecided({ status: String(e.body.details.status ?? ""), reference: null });
      }
    });
  }, [w.id, handleError]);

  const ref = toLatinDigits(reference).trim();
  const banned = w.user.status === "banned";
  const ready = ref.length >= 3 && ref.length <= 64 && ack && (!banned || bannedAck) && !claimedBy && !decided;
  const toman = f.n(w.payout_toman);
  const rial = f.n(w.payout_rial);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.admin.approveWithdrawal(w.id, ref);
      onDone(t("admin.approve.done", { id: f.n(w.id) }));
      onClose();
    } catch (e) {
      if (handleError(e)) return;
      if (e instanceof ApiRequestError && e.body.code === "WITHDRAWAL_NOT_PENDING") {
        setDecided({ status: String(e.body.details.status ?? ""), reference: null });
      } else if (e instanceof ApiRequestError && e.body.code === "WITHDRAWAL_CLAIMED") {
        setClaimedBy(String(e.body.details.claimed_by ?? "?"));
      } else {
        setError(errorText(t, e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="approve-title">
      <DialogTitle id="approve-title">{t("admin.approve.title", { id: f.n(w.id) })}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Kv label={t("admin.withdrawals.col.player")}>
            <Ltr>@{w.user.username}</Ltr> · <StatusChip status={w.user.status} />
          </Kv>
          <Kv label={t("admin.withdrawals.col.amount")}>
            {f.n(w.amount)} · {t("admin.withdrawals.fee", { fee: f.n(w.fee) })}
          </Kv>
          <Typography variant="h6" component="p">
            {t("admin.approve.pay", { toman, rial })}
          </Typography>
          <Kv label={t("admin.withdrawals.col.bank")}>
            {w.bank.bank?.[f.locale] ?? w.bank.bank_code} · <Ltr>{groups(w.iban)}</Ltr>
            <CopyButton value={w.iban} label={t("admin.withdrawals.copySheba")} />
          </Kv>
          <Kv label={t("admin.withdrawals.col.expected")}>{f.date(`${w.expected_by}T00:00:00Z`)}</Kv>
          {claimedBy && <Alert severity="warning" icon={<WarningIcon />}>{t("admin.approve.claimedBy", { admin: claimedBy })}</Alert>}
          {decided && (
            <Alert severity="warning" icon={<WarningIcon />}>
              {t("admin.decision.already", { status: decided.status })}
              {decided.status === "paid" && ` ${t("admin.approve.dontPayAgain", { reference: decided.reference ?? "—" })}`}
              {decided.status === "cancelled" && ` ${t("admin.approve.cancelledByPlayer")}`}
            </Alert>
          )}
          <Typography variant="body2">{t("admin.approve.instruction")}</Typography>
          <TextField
            label={t("admin.approve.reference")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            error={reference.length > 0 && (ref.length < 3 || ref.length > 64)}
            helperText={reference.length > 0 && (ref.length < 3 || ref.length > 64) ? t("admin.approve.error.reference") : " "}
            slotProps={{ htmlInput: { dir: "ltr", maxLength: 64, style: { fontFamily: "monospace" } } }}
          />
          <FormControlLabel control={<Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} />} label={t("admin.approve.ack", { toman })} />
          {w.user.status !== "active" && (
            <Alert severity="warning">{t(banned ? "admin.approve.banned" : "admin.approve.suspended")}</Alert>
          )}
          {banned && (
            <FormControlLabel control={<Checkbox checked={bannedAck} onChange={(e) => setBannedAck(e.target.checked)} />} label={t("admin.approve.bannedAck")} />
          )}
          <Typography variant="body2" color="text.secondary">
            {t(smsOn ? "admin.approve.smsOn" : "admin.approve.smsOff")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} autoFocus>
          {decided ? t("admin.common.close") : t("admin.common.cancel")}
        </Button>
        {!decided && (
          <Button variant="contained" disabled={!ready || busy} onClick={() => void submit()}>
            {busy ? t("admin.approve.saving") : t("admin.approve.cta")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function Withdrawals() {
  const t = useT();
  const f = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const { admin } = useAdmin();
  const tab = (TABS as readonly string[]).includes(params.get("status") ?? "") ? (params.get("status") as TabKey) : "pending";
  const openId = Number(params.get("id") ?? 0) || null;
  const list = useApi(
    (signal) => api.admin.withdrawals({ status: tab === "all" ? undefined : (tab as WithdrawalStatus), order: tab === "pending" ? "asc" : "desc" }, { signal }),
    [tab],
  );
  const [approving, setApproving] = useState<AdminWithdrawal | null>(null);
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rows = useMemo(() => list.data?.results ?? [], [list.data]);
  const today = tehranToday();
  const drawer = openId ? rows.find((r) => r.id === openId) ?? null : null;

  useEffect(() => {
    const refresh = () => list.reload();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [list]);

  const setParams = (status: string, id?: number) => router.replace(`/withdrawals?status=${status}${id ? `&id=${id}` : ""}`, { scroll: false });
  const totalCoins = rows.reduce((s, r) => s + r.amount, 0);
  const totalToman = rows.reduce((s, r) => s + r.payout_toman, 0);
  const overdue = rows.filter((r) => r.status === "pending" && today > r.expected_by).length;
  const canDecide = admin?.role === "finance" || admin?.role === "superadmin";

  return (
    <>
      <PageHeader
        title={t("admin.withdrawals.title")}
        subtitle={tab === "pending" ? t("admin.withdrawals.rule") : undefined}
        actions={
          <>
            <Button startIcon={<RefreshIcon />} onClick={list.reload}>
              {t("admin.withdrawals.refresh")}
            </Button>
            <CsvButton href={api.admin.withdrawalsCsvUrl({ status: tab === "all" ? undefined : (tab as WithdrawalStatus) })} />
          </>
        }
      />
      <Tabs value={tab} onChange={(_, v: string) => setParams(v)} sx={{ mb: 2 }} variant="scrollable">
        {TABS.map((k) => (
          <Tab key={k} value={k} label={t(`admin.withdrawals.tab.${k}`)} />
        ))}
      </Tabs>
      {tab === "pending" && rows.length > 0 && (
        <Alert severity={overdue ? "warning" : "info"} sx={{ mb: 2 }}>
          {t("admin.withdrawals.summary", { count: f.n(rows.length), coins: f.n(totalCoins), toman: f.n(totalToman) })}
          {overdue > 0 && ` · ${t("admin.withdrawals.overdueCount", { count: f.n(overdue) })}`}
        </Alert>
      )}
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading rows={8} />
      ) : (
        <DataTable<AdminWithdrawal>
          rows={rows}
          rowKey={(r) => r.id}
          empty={tab === "pending" ? t("admin.withdrawals.emptyPending") : t("admin.withdrawals.emptyStatus")}
          onRowClick={(r) => setParams(tab, r.id)}
          columns={[
            {
              key: "requested",
              label: t("admin.withdrawals.col.requested"),
              render: (r) => (
                <>
                  <Ltr>#{r.id}</Ltr> · {f.dateTime(r.created_at)}
                </>
              ),
            },
            {
              key: "expected",
              label: t("admin.withdrawals.col.expected"),
              render: (r) => (
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <span>{f.date(`${r.expected_by}T00:00:00Z`)}</span>
                  {r.status === "pending" && today > r.expected_by && (
                    <Typography variant="caption" color="error" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                      <WarningIcon fontSize="inherit" /> {t("admin.withdrawals.overdue")}
                    </Typography>
                  )}
                </Stack>
              ),
            },
            {
              key: "player",
              label: t("admin.withdrawals.col.player"),
              render: (r) => (
                <Link href={`/users/${r.user.id}`} onClick={(e) => e.stopPropagation()}>
                  <Ltr>@{r.user.username ?? r.user.id}</Ltr>
                </Link>
              ),
            },
            { key: "amount", label: t("admin.withdrawals.col.amount"), align: "right", render: (r) => f.n(r.amount) },
            {
              key: "pay",
              label: t("admin.withdrawals.col.pay"),
              align: "right",
              render: (r) => (
                <>
                  <strong>{t("admin.common.toman", { amount: f.n(r.payout_toman) })}</strong>
                  <Typography variant="caption" component="div" color="text.secondary">
                    {t("admin.withdrawals.rial", { rial: f.n(r.payout_rial) })}
                  </Typography>
                </>
              ),
            },
            {
              key: "bank",
              label: t("admin.withdrawals.col.bank"),
              render: (r) => (
                <Stack direction="row" sx={{ alignItems: "center" }}>
                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                    <Ltr>{groups(r.iban)}</Ltr>
                  </Box>
                  <CopyButton value={r.iban} label={t("admin.withdrawals.copySheba")} />
                </Stack>
              ),
            },
            {
              key: "status",
              label: tab === "pending" ? t("admin.withdrawals.col.actions") : t("admin.withdrawals.col.status"),
              render: (r) =>
                r.status === "pending" && canDecide ? (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={(e) => {
                        e.stopPropagation();
                        setApproving(r);
                      }}
                    >
                      {t("admin.withdrawals.approve")}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRejecting(r);
                      }}
                    >
                      {t("admin.withdrawals.reject")}
                    </Button>
                  </Stack>
                ) : (
                  t(`admin.withdrawals.tab.${r.status}`)
                ),
            },
          ]}
        />
      )}

      <Drawer anchor="right" open={Boolean(openId)} onClose={() => setParams(tab)}>
        <Box sx={{ width: { xs: "100vw", sm: 440 }, p: 2 }} role="region" aria-label={openId ? t("admin.withdrawal.drawerTitle", { id: openId }) : undefined}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6">{openId ? t("admin.withdrawal.drawerTitle", { id: f.n(openId) }) : ""}</Typography>
            <IconButton onClick={() => setParams(tab)} aria-label={t("admin.common.close")}>
              <CloseIcon />
            </IconButton>
          </Stack>
          {!drawer ? (
            <Alert severity="info">{t("admin.withdrawals.notInList")}</Alert>
          ) : (
            <Stack spacing={0.5}>
              <Kv label={t("admin.withdrawals.col.player")}>
                <Link href={`/users/${drawer.user.id}`}>
                  <Ltr>@{drawer.user.username}</Ltr>
                </Link>{" "}
                <StatusChip status={drawer.user.status} />
              </Kv>
              <Kv label={t("admin.withdrawals.col.requested")}>{f.dateTime(drawer.created_at)}</Kv>
              <Kv label={t("admin.withdrawals.col.decided")}>{drawer.decided_at ? f.dateTime(drawer.decided_at) : "—"}</Kv>
              <Kv label={t("admin.withdrawals.col.amount")}>{f.n(drawer.amount)}</Kv>
              <Kv label={t("admin.withdrawals.col.pay")}>{t("admin.approve.pay", { toman: f.n(drawer.payout_toman), rial: f.n(drawer.payout_rial) })}</Kv>
              <Kv label={t("admin.withdrawal.rateLabel")}>
                {drawer.amount - drawer.fee > 0 ? t("admin.withdrawal.rateAtRequest", { price: f.n(Math.round(drawer.payout_toman / (drawer.amount - drawer.fee))) }) : "—"}
              </Kv>
              <Kv label={t("admin.withdrawals.col.bank")}>
                <Ltr>{groups(drawer.iban)}</Ltr>
              </Kv>
              <Kv label={t("admin.withdrawals.col.refReason")}>{drawer.bank_reference ?? drawer.reject_reason ?? "—"}</Kv>
              <Kv label={t("admin.withdrawal.decidedBy")}>{drawer.decided_by ?? drawer.claimed_by ?? "—"}</Kv>
              {drawer.status === "pending" && canDecide && (
                <Stack direction="row" spacing={1} sx={{ pt: 2 }}>
                  <Button variant="contained" onClick={() => setApproving(drawer)}>
                    {t("admin.withdrawals.approve")}
                  </Button>
                  <Button color="error" onClick={() => setRejecting(drawer)}>
                    {t("admin.withdrawals.reject")}
                  </Button>
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Drawer>

      {approving && (
        <ApproveDialog
          w={approving}
          onClose={() => setApproving(null)}
          onDone={(msg) => {
            setToast(msg);
            list.reload();
          }}
        />
      )}
      {rejecting && (
        <ReasonDialog
          open
          title={t("admin.reject.title", { id: f.n(rejecting.id) })}
          body={
            <>
              <Alert severity="info">{t("admin.reject.effect", { amount: f.n(rejecting.amount) })}</Alert>
              <Typography variant="body2">{t("admin.reject.helper")}</Typography>
            </>
          }
          confirmLabel={t("admin.reject.cta", { amount: f.n(rejecting.amount) })}
          destructive
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await api.admin.rejectWithdrawal(rejecting.id, reason);
            setToast(t("admin.reject.done", { id: f.n(rejecting.id) }));
            list.reload();
          }}
        />
      )}
      <Snackbar open={toast !== null} autoHideDuration={6000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}

export default function WithdrawalsPage() {
  return (
    <Screen roles={["finance", "superadmin"]}>
      <Suspense>
        <Withdrawals />
      </Suspense>
    </Screen>
  );
}
