"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { api, type AuditFilter } from "@bg/api-client";
import type { AdminAccount, AdminAuditEntry, AdminCredentials, AdminRole } from "@bg/protocol";
import {
  CopyButton,
  CsvButton,
  DataTable,
  DateRangeBar,
  LoadError,
  Loading,
  Ltr,
  PageHeader,
  ReasonDialog,
  Screen,
  errorText,
  useApi,
  useFmt,
  useT,
  type Range,
} from "@/components/common";
import { AddIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

const ROLES: AdminRole[] = ["support", "finance", "superadmin"];

function Credentials({ creds, username, onClose }: { creds: AdminCredentials; username: string; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open aria-labelledby="creds-title" disableEscapeKeyDown>
      <DialogTitle id="creds-title">{t("admin.access.credentials", { username })}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("admin.access.onceOnly")}
        </Alert>
        {(
          [
            ["password", creds.password],
            ["totpSecret", creds.totp_secret],
            ["totpUri", creds.totp_uri],
          ] as const
        ).map(([k, v]) => (
          <Stack key={k} direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 120 }}>
              {t(`admin.access.${k}`)}
            </Typography>
            <Typography variant="body2" dir="ltr" sx={{ fontFamily: "monospace", wordBreak: "break-all", flex: 1 }}>
              {v}
            </Typography>
            <CopyButton value={v} label={t("admin.common.copy")} />
          </Stack>
        ))}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          {t("admin.common.done")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Admins() {
  const t = useT();
  const f = useFmt();
  const { admin: me, handleError } = useAdmin();
  const list = useApi((signal) => api.admin.admins({ signal }), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", role: "support" as AdminRole });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ creds: AdminCredentials; username: string } | null>(null);
  const [change, setChange] = useState<{ a: AdminAccount; role?: AdminRole; is_active?: boolean; reset?: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ mb: 2 }}>
        {t("admin.access.add")}
      </Button>
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<AdminAccount>
          rows={list.data?.results ?? []}
          rowKey={(r) => r.id}
          empty={t("admin.catalog.empty")}
          columns={[
            { key: "u", label: t("admin.access.username"), render: (r) => <Ltr>{r.username}</Ltr> },
            {
              key: "role",
              label: t("admin.access.role"),
              render: (r) => (
                <TextField
                  select
                  size="small"
                  value={r.role}
                  disabled={r.username === me?.username}
                  onChange={(e) => setChange({ a: r, role: e.target.value as AdminRole })}
                  aria-label={t("admin.access.role")}
                >
                  {ROLES.map((x) => (
                    <MenuItem key={x} value={x}>
                      {t(`admin.role.${x}`)}
                    </MenuItem>
                  ))}
                </TextField>
              ),
            },
            { key: "active", label: t("admin.catalog.active"), render: (r) => <Chip size="small" variant="outlined" color={r.is_active ? "success" : "default"} label={t(r.is_active ? "admin.common.yes" : "admin.common.no")} /> },
            { key: "last", label: t("admin.access.lastLogin"), render: (r) => (r.last_login_at ? f.dateTime(r.last_login_at) : "—") },
            {
              key: "actions",
              label: "",
              render: (r) =>
                r.username === me?.username ? null : (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => setChange({ a: r, is_active: !r.is_active })}>
                      {t(r.is_active ? "admin.access.disable" : "admin.access.enable")}
                    </Button>
                    <Button size="small" onClick={() => setChange({ a: r, reset: true })}>
                      {t("admin.access.reset")}
                    </Button>
                  </Stack>
                ),
            },
          ]}
        />
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} fullWidth maxWidth="xs" aria-labelledby="add-admin">
        <DialogTitle id="add-admin">{t("admin.access.add")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("admin.access.username")}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              helperText={t("admin.access.usernameHelp")}
              slotProps={{ htmlInput: { dir: "ltr", maxLength: 40 } }}
            />
            <TextField select label={t("admin.access.role")} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}>
              {ROLES.map((x) => (
                <MenuItem key={x} value={x}>
                  {t(`admin.role.${x}`)}
                </MenuItem>
              ))}
            </TextField>
            {createError && <Alert severity="error">{createError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>{t("admin.common.cancel")}</Button>
          <Button
            variant="contained"
            disabled={!/^[a-z][a-z0-9_.-]{2,39}$/.test(form.username)}
            onClick={() => {
              setCreateError(null);
              api.admin
                .createAdmin(form.username, form.role)
                .then((res) => {
                  setCreating(false);
                  setCreds({ creds: res.credentials, username: res.username });
                  list.reload();
                })
                .catch((e: unknown) => {
                  if (!handleError(e)) setCreateError(errorText(t, e));
                });
            }}
          >
            {t("admin.access.create")}
          </Button>
        </DialogActions>
      </Dialog>

      {change && (
        <ReasonDialog
          open
          title={
            change.reset
              ? t("admin.access.resetTitle", { username: change.a.username })
              : change.role
                ? t("admin.access.roleTitle", { username: change.a.username, role: t(`admin.role.${change.role}`) })
                : t(change.is_active ? "admin.access.enableTitle" : "admin.access.disableTitle", { username: change.a.username })
          }
          body={change.reset ? <Alert severity="warning">{t("admin.access.resetEffect")}</Alert> : <Alert severity="info">{t("admin.access.signOutEffect")}</Alert>}
          confirmLabel={t("admin.common.confirm")}
          onClose={() => setChange(null)}
          onConfirm={async (reason) => {
            if (change.reset) {
              const res = await api.admin.resetAdmin(change.a.id, reason);
              setCreds({ creds: res.credentials, username: res.username });
            } else {
              await api.admin.updateAdmin(change.a.id, { role: change.role, is_active: change.is_active, reason });
              setToast(t("admin.common.saved"));
            }
            list.reload();
          }}
        />
      )}
      {creds && <Credentials creds={creds.creds} username={creds.username} onClose={() => setCreds(null)} />}
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}

function Audit() {
  const t = useT();
  const f = useFmt();
  const [filter, setFilter] = useState<AuditFilter>({});
  const [admin, setAdmin] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const list = useApi((signal) => api.admin.audit(filter, { signal }), [JSON.stringify(filter)]);
  const [extra, setExtra] = useState<{ rows: AdminAuditEntry[]; next: string | null } | null>(null);
  const shown = [...(list.data?.results ?? []), ...(extra?.rows ?? [])];
  const next = extra ? extra.next : (list.data?.next ?? null);

  return (
    <>
      <Stack
        component="form"
        direction="row"
        spacing={1}
        sx={{ flexWrap: "wrap", gap: 1, mb: 1 }}
        onSubmit={(e) => {
          e.preventDefault();
          setExtra(null);
          setFilter({ admin: admin || undefined, action: action || undefined, from: range.from || undefined, to: range.to || undefined });
        }}
      >
        <TextField size="small" label={t("admin.access.byAdmin")} value={admin} onChange={(e) => setAdmin(e.target.value)} slotProps={{ htmlInput: { dir: "ltr" } }} />
        <TextField size="small" label={t("admin.access.byAction")} value={action} onChange={(e) => setAction(e.target.value)} slotProps={{ htmlInput: { dir: "ltr" } }} />
        <Button type="submit" variant="contained">
          {t("admin.common.search")}
        </Button>
        <CsvButton href={api.admin.auditCsvUrl(filter)} />
      </Stack>
      <DateRangeBar value={range} onChange={(r) => { setRange(r); setExtra(null); setFilter({ ...filter, from: r.from, to: r.to }); }} />
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<AdminAuditEntry>
          rows={shown}
          rowKey={(r) => r.id}
          empty={t("admin.access.noAudit")}
          columns={[
            { key: "when", label: t("admin.replay.col.time"), render: (r) => f.dateTime(r.created_at) },
            { key: "admin", label: t("admin.access.username"), render: (r) => <Ltr>{r.admin}</Ltr> },
            { key: "action", label: t("admin.access.action"), render: (r) => <Ltr>{r.action}</Ltr> },
            { key: "target", label: t("admin.access.target"), render: (r) => <Ltr>{`${r.target_type} ${r.target_id}`}</Ltr> },
            { key: "reason", label: t("admin.common.reason"), render: (r) => r.reason || "—" },
            {
              key: "change",
              label: t("admin.access.change"),
              render: (r) => (
                <Typography variant="caption" dir="ltr" sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap", display: "block", maxWidth: 360 }}>
                  {JSON.stringify(r.before)} → {JSON.stringify(r.after)}
                </Typography>
              ),
            },
          ]}
        />
      )}
      {next && (
        <Button
          sx={{ mt: 1 }}
          onClick={() => void api.admin.audit({ ...filter, cursor: next }).then((more) => setExtra({ rows: [...(extra?.rows ?? []), ...more.results], next: more.next }))}
        >
          {t("admin.common.more")}
        </Button>
      )}
    </>
  );
}

function Access() {
  const t = useT();
  const [tab, setTab] = useState<"admins" | "audit">("admins");
  return (
    <>
      <PageHeader title={t("admin.access.title")} />
      <Tabs value={tab} onChange={(_, v: "admins" | "audit") => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="admins" label={t("admin.access.admins")} />
        <Tab value="audit" label={t("admin.access.audit")} />
      </Tabs>
      {tab === "admins" ? <Admins /> : <Audit />}
    </>
  );
}

export default function AccessPage() {
  return (
    <Screen roles={["superadmin"]}>
      <Access />
    </Screen>
  );
}
