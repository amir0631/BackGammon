"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@bg/api-client";
import type { AdminLedgerRow, AdminMatchRow, AdminWithdrawal, FraudFlag, UserStatus } from "@bg/protocol";
import {
  CopyButton,
  DataTable,
  Kv,
  LoadError,
  Loading,
  Ltr,
  PageHeader,
  ReasonDialog,
  Screen,
  Section,
  StatusChip,
  useApi,
  useFmt,
  useT,
} from "@/components/common";
import { BalanceDialog } from "@/components/wallet-dialogs";
import { useAdmin } from "@/lib/admin-context";

const MONEY = ["finance", "superadmin"];
const ACCOUNT = ["support", "superadmin"];

function UserDetail({ id }: { id: number }) {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const role = admin?.role ?? "support";
  const user = useApi((signal) => api.admin.user(id, { signal }), [id]);
  const flags = useApi((signal) => api.admin.fraudFlags({ user_id: id }, { signal }), [id]);
  const links = useApi((signal) => api.admin.userLinks(id, { signal }), [id]);
  const audit = useApi(
    (signal) => (role === "superadmin" ? api.admin.audit({ target_type: "user", target_id: String(id) }, { signal }) : Promise.resolve(null)),
    [id, role],
  );
  const settings = useApi((signal) => api.admin.settings({ signal }), []);
  const cap = Number(settings.data?.results.find((s) => s.key === "admin.topup_max_amount")?.value ?? 0);
  const [dialog, setDialog] = useState<"topup" | "adjust" | UserStatus | "password" | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (user.error) return <LoadError error={user.error} onRetry={user.reload} />;
  if (!user.data) return <Loading rows={10} />;
  const u = user.data;
  const w = u.wallet;

  const statusActions: UserStatus[] = (["active", "suspended", "banned"] as UserStatus[]).filter((s) => s !== u.status);

  return (
    <>
      <PageHeader
        title={u.username ? `@${u.username}` : t("admin.users.noUsername")}
        subtitle={
          <Stack direction="row" spacing={1} component="span" sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Ltr>#{u.id}</Ltr>
            <StatusChip status={u.status} />
            <Ltr>{u.phone}</Ltr>
            <CopyButton value={u.phone} label={t("admin.user.copyPhone")} />
          </Stack>
        }
        actions={
          <>
            {MONEY.includes(role) && (
              <>
                <Button variant="contained" onClick={() => setDialog("topup")}>
                  {t("admin.user.topup")}
                </Button>
                <Button variant="outlined" onClick={() => setDialog("adjust")}>
                  {t("admin.adjust.open")}
                </Button>
              </>
            )}
            {ACCOUNT.includes(role) &&
              statusActions.map((s) => (
                <Button key={s} variant="outlined" color={s === "banned" ? "error" : s === "suspended" ? "warning" : "success"} onClick={() => setDialog(s)}>
                  {t(`admin.user.setStatus.${s}`)}
                </Button>
              ))}
            {ACCOUNT.includes(role) && (
              <Button variant="outlined" onClick={() => setDialog("password")}>
                {t("admin.user.resetPassword")}
              </Button>
            )}
          </>
        }
      />
      {!MONEY.includes(role) && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("admin.user.topupRoleNote")}
        </Typography>
      )}

      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
        <Box>
          <Section title={t("admin.user.profile")}>
            <Kv label={t("admin.users.col.joined")}>{f.date(u.created_at)}</Kv>
            <Kv label={t("admin.user.langLabel")}>{t(`admin.user.langName.${u.lang}`)}</Kv>
            <Kv label="ELO">{f.n(u.elo)}</Kv>
            <Kv label={t("admin.user.levelLabel")}>{f.n(u.level)}</Kv>
            <Kv label={t("admin.user.phoneVerified")}>{t(u.phone_verified ? "admin.common.yes" : "admin.common.no")}</Kv>
            <Kv label={t("admin.user.referrer")}>{u.referrer ? <Ltr>@{u.referrer}</Ltr> : "—"}</Kv>
            <Kv label={t("admin.user.sessions")}>
              {f.n(u.sessions.active)}
              {u.sessions.last_used_at ? ` · ${f.dateTime(u.sessions.last_used_at)}` : ""}
            </Kv>
            <Kv label={t("admin.user.bank")}>
              {u.bank_account ? (
                <>
                  {u.bank_account.bank[f.locale]} · <Ltr>{u.bank_account.iban}</Ltr>
                </>
              ) : (
                "—"
              )}
            </Kv>
          </Section>

          <Section title={t("admin.user.wallet.title")}>
            <Kv label={t("admin.user.wallet.available")}>
              {t("admin.common.coins", { amount: f.n(w.balance) })} · {t("admin.common.toman", { amount: f.n(w.balance * w.coin_price_toman) })}
            </Kv>
            <Kv label={t("admin.user.wallet.onHold")}>{f.n(w.locked)}</Kv>
            <Kv label={t("admin.user.wallet.bonusLocked")}>{f.n(w.bonus_locked)}</Kv>
            <Kv label={t("admin.user.wallet.withdrawable")}>{f.n(w.withdrawable)}</Kv>
            <Kv label={t("admin.user.wallet.transferable")}>{f.n(w.transferable)}</Kv>
            <Kv label={t("admin.user.wallet.transfers24h", { used: f.n(w.transfer.used_24h), max: f.n(w.transfer.daily_max) })}>
              {w.transfer.next_available_at ? t("admin.user.wallet.nextFree", { time: f.dateTime(w.transfer.next_available_at) }) : ""}
            </Kv>
            <Kv label={t("admin.user.wallet.withdrawals24h", { used: f.n(w.withdraw.used_24h), max: f.n(w.withdraw.daily_max) })}>
              {w.withdraw.next_available_at ? t("admin.user.wallet.nextFree", { time: f.dateTime(w.withdraw.next_available_at) }) : ""}
            </Kv>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t(w.withdraw.confirm === "sms" ? "admin.user.wallet.confirmSms" : "admin.user.wallet.confirmPassword")}
            </Typography>
          </Section>

          <Section title={t("admin.user.fraud")}>
            {flags.data?.results.length ? (
              <Stack spacing={1}>
                {flags.data.results.map((fl: FraudFlag) => (
                  <Stack key={fl.id} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Chip size="small" label={t(`admin.fraud.rule.${fl.rule}`)} />
                    <Chip size="small" variant="outlined" label={t(`admin.fraud.status.${fl.status}`)} />
                    <Typography variant="body2">{f.dateTime(fl.created_at)}</Typography>
                    <Button size="small" component={Link} href={`/fraud?flag=${fl.id}`}>
                      {t("admin.common.open")}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("admin.user.noFlags")}
              </Typography>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              {t("admin.fraud.links")}
            </Typography>
            {links.data && links.data.edges.length > 0 ? (
              <Stack spacing={0.5}>
                {links.data.edges.map((e) => {
                  const other = links.data?.nodes.find((n) => n.id === e.to);
                  return (
                    <Stack key={`${e.to}-${e.reason}`} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip size="small" variant="outlined" label={t(`admin.fraud.linkReason.${e.reason}`)} />
                      <Link href={`/users/${e.to}`}>
                        <Ltr>{other?.username ? `@${other.username}` : `#${e.to}`}</Ltr>
                      </Link>
                    </Stack>
                  );
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("admin.fraud.noLinks")}
              </Typography>
            )}
          </Section>
        </Box>

        <Box>
          <Section title={t("admin.user.ledger.title")}>
            <DataTable<AdminLedgerRow>
              rows={u.ledger}
              rowKey={(r) => r.id}
              empty={t("admin.user.ledger.empty")}
              columns={[
                { key: "date", label: t("admin.user.ledger.col.date"), render: (r) => f.dateTime(r.created_at) },
                {
                  key: "type",
                  label: t("admin.user.ledger.col.type"),
                  render: (r) =>
                    r.type === "transfer"
                      ? t(r.amount > 0 ? "admin.user.tx.transferIn" : "admin.user.tx.transferOut")
                      : t.has(`wallet.tx.${r.type}`)
                        ? t(`wallet.tx.${r.type}`)
                        : r.type,
                },
                { key: "amount", label: t("admin.user.ledger.col.amount"), align: "right", render: (r) => <Ltr>{r.amount > 0 ? `+${f.n(r.amount)}` : f.n(r.amount)}</Ltr> },
                { key: "id", label: t("admin.user.ledger.col.id"), render: (r) => <Ltr>{r.id}</Ltr> },
              ]}
            />
            <Typography variant="caption" color="text.secondary">
              {t("admin.user.ledger.capped")}
            </Typography>
          </Section>

          <Section title={t("admin.user.withdrawals")}>
            <DataTable<AdminWithdrawal>
              rows={u.withdrawals}
              rowKey={(r) => r.id}
              empty={t("admin.withdrawals.emptyStatus")}
              columns={[
                { key: "id", label: "#", render: (r) => <Link href={`/withdrawals?status=${r.status}&id=${r.id}`}><Ltr>#{r.id}</Ltr></Link> },
                { key: "date", label: t("admin.withdrawals.col.requested"), render: (r) => f.date(r.created_at) },
                { key: "amount", label: t("admin.withdrawals.col.amount"), align: "right", render: (r) => f.n(r.amount) },
                { key: "status", label: t("admin.withdrawals.col.status"), render: (r) => t(`admin.withdrawals.tab.${r.status}`) },
              ]}
            />
          </Section>

          <Section title={t("admin.user.matches")}>
            <DataTable<AdminMatchRow>
              rows={u.matches}
              rowKey={(r) => r.id}
              empty={t("admin.matches.empty")}
              columns={[
                { key: "date", label: t("admin.matches.col.date"), render: (r) => f.dateTime(r.created_at) },
                { key: "opp", label: t("admin.matches.col.opponent"), render: (r) => (r.opponent ? <Ltr>@{r.opponent}</Ltr> : "—") },
                { key: "variant", label: t("admin.matches.col.variant"), render: (r) => `${t(`admin.variant.${r.variant}`)} · ${f.n(r.length)}` },
                { key: "result", label: t("admin.matches.col.result"), render: (r) => (r.won === null ? t(`admin.matches.status.${r.status}`) : t(r.won ? "admin.matches.won" : "admin.matches.lost")) },
                { key: "open", label: "", render: (r) => <Link href={`/matches/${r.id}`}>{t("admin.matches.replay")}</Link> },
              ]}
            />
          </Section>

          {role === "superadmin" && (
            <Section title={t("admin.user.audit.title")}>
              {audit.data?.results.length ? (
                <Stack spacing={1}>
                  {audit.data.results.map((a) => (
                    <Box key={a.id}>
                      <Typography variant="body2">
                        {f.dateTime(a.created_at)} · <Ltr>{a.admin}</Ltr> · <Ltr>{a.action}</Ltr>
                      </Typography>
                      {a.reason && (
                        <Typography variant="caption" color="text.secondary">
                          {a.reason}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("admin.user.audit.empty")}
                </Typography>
              )}
            </Section>
          )}
        </Box>
      </Box>

      {(dialog === "topup" || dialog === "adjust") && (
        <BalanceDialog
          mode={dialog}
          user={u}
          cap={dialog === "topup" ? cap : null}
          open
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setToast(message);
            user.reload();
          }}
        />
      )}
      {(dialog === "active" || dialog === "suspended" || dialog === "banned") && (
        <ReasonDialog
          open
          title={t(`admin.user.setStatus.${dialog}`)}
          body={<Alert severity={dialog === "active" ? "info" : "warning"}>{t(`admin.user.statusEffect.${dialog}`)}</Alert>}
          confirmLabel={t(`admin.user.setStatus.${dialog}`)}
          destructive={dialog === "banned"}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await api.admin.setUserStatus(u.id, dialog, reason);
            setToast(t("admin.common.saved"));
            user.reload();
          }}
        />
      )}
      {dialog === "password" && (
        <ReasonDialog
          open
          title={t("admin.user.resetPassword")}
          body={<Alert severity="warning">{t("admin.user.resetPasswordEffect")}</Alert>}
          confirmLabel={t("admin.user.resetPassword")}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const res = await api.admin.resetUserPassword(u.id, reason);
            setPassword(res.password);
          }}
        />
      )}
      <Dialog open={password !== null} aria-labelledby="new-password-title">
        <DialogTitle id="new-password-title">{t("admin.user.newPassword")}</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography sx={{ fontFamily: "monospace", fontSize: 20 }} dir="ltr">
              {password}
            </Typography>
            {password && <CopyButton value={password} label={t("admin.common.copy")} />}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("admin.user.newPasswordNote")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setPassword(null)}>
            {t("admin.common.done")}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={toast !== null} autoHideDuration={6000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}

export default function UserPage() {
  const params = useParams<{ id: string }>();
  return (
    <Screen>
      <UserDetail id={Number(params.id)} />
    </Screen>
  );
}
