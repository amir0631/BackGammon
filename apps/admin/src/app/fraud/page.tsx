"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@bg/api-client";
import type { FraudFlag, FraudFlagStatus, FraudRule } from "@bg/protocol";
import { DataTable, Kv, LoadError, Loading, Ltr, PageHeader, ReasonDialog, Screen, StatusChip, useApi, useFmt, useT } from "@/components/common";
import { CloseIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

const STATUSES: FraudFlagStatus[] = ["open", "dismissed", "confirmed"];
const RULES: FraudRule[] = ["chip_dumping", "multi_account", "referral_farm", "prediction_collusion", "engine_assist", "linked_transfer"];

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const f = useFmt();
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {Object.entries(evidence).map(([k, v]) => (
        <Stack key={k} direction="row" spacing={2} sx={{ py: 0.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography component="dt" variant="body2" color="text.secondary" sx={{ minWidth: 120 }} dir="ltr">
            {k}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontFamily: "monospace" }} dir="ltr">
            {typeof v === "number" ? f.n(v) : typeof v === "string" ? v : JSON.stringify(v)}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

function FlagDrawer({ flag, onClose, onDecided }: { flag: FraudFlag; onClose: () => void; onDecided: (msg: string) => void }) {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const links = useApi((signal) => api.admin.userLinks(flag.user.id, { signal }), [flag.user.id]);
  const [deciding, setDeciding] = useState<"dismiss" | "confirm" | null>(null);
  const [action, setAction] = useState<"none" | "suspend" | "ban">("none");
  const canDecide = admin?.role === "superadmin" || admin?.role === "support";

  return (
    <Box sx={{ width: { xs: "100vw", sm: 480 }, p: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6">{t("admin.fraud.flagTitle", { id: f.n(flag.id) })}</Typography>
        <IconButton onClick={onClose} aria-label={t("admin.common.close")}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Kv label={t("admin.fraud.col.rule")}>{t(`admin.fraud.rule.${flag.rule}`)}</Kv>
        <Kv label={t("admin.fraud.col.status")}>{t(`admin.fraud.status.${flag.status}`)}</Kv>
        <Kv label={t("admin.fraud.col.user")}>
          <Link href={`/users/${flag.user.id}`}>
            <Ltr>@{flag.user.username ?? flag.user.id}</Ltr>
          </Link>{" "}
          <StatusChip status={flag.user.status} />
        </Kv>
        {flag.other && (
          <Kv label={t("admin.fraud.col.other")}>
            <Link href={`/users/${flag.other.id}`}>
              <Ltr>@{flag.other.username ?? flag.other.id}</Ltr>
            </Link>{" "}
            <StatusChip status={flag.other.status} />
          </Kv>
        )}
        <Kv label={t("admin.fraud.col.created")}>{f.dateTime(flag.created_at)}</Kv>
        {flag.match_id && (
          <Kv label={t("admin.fraud.match")}>
            <Link href={`/matches/${flag.match_id}`}>{t("admin.matches.replay")}</Link>
          </Kv>
        )}
        {flag.decided_at && (
          <Kv label={t("admin.fraud.decided")}>
            {flag.decided_by} · {f.dateTime(flag.decided_at)} · {flag.decision_reason}
          </Kv>
        )}
      </Stack>
      <Typography variant="subtitle2">{t("admin.fraud.evidence")}</Typography>
      <Evidence evidence={flag.evidence} />
      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        {t("admin.fraud.links")}
      </Typography>
      {links.data?.edges.length ? (
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
      {flag.status === "open" && canDecide && (
        <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={() => setDeciding("dismiss")}>
            {t("admin.fraud.dismiss")}
          </Button>
          <Button variant="contained" color="error" onClick={() => setDeciding("confirm")}>
            {t("admin.fraud.confirm")}
          </Button>
        </Stack>
      )}
      {deciding && (
        <ReasonDialog
          open
          title={t(deciding === "dismiss" ? "admin.fraud.dismiss" : "admin.fraud.confirm")}
          body={<Alert severity="info">{t(`admin.fraud.effect.${deciding}`)}</Alert>}
          confirmLabel={t(deciding === "dismiss" ? "admin.fraud.dismiss" : "admin.fraud.confirm")}
          destructive={deciding === "confirm"}
          onClose={() => setDeciding(null)}
          onConfirm={async (reason) => {
            await api.admin.decideFlag(flag.id, { decision: deciding, reason, action: deciding === "confirm" ? action : "none" });
            onDecided(t("admin.common.saved"));
          }}
        >
          {deciding === "confirm" && (
            <RadioGroup value={action} onChange={(e) => setAction(e.target.value as typeof action)} aria-label={t("admin.fraud.action")}>
              {(["none", "suspend", "ban"] as const).map((a) => (
                <FormControlLabel key={a} value={a} control={<Radio />} label={t(`admin.fraud.actionOption.${a}`)} />
              ))}
            </RadioGroup>
          )}
        </ReasonDialog>
      )}
    </Box>
  );
}

function Fraud() {
  const t = useT();
  const f = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") as FraudFlagStatus | null) ?? "open";
  const rule = (params.get("rule") as FraudRule | null) ?? undefined;
  const openId = Number(params.get("flag") ?? 0) || null;
  const list = useApi((signal) => api.admin.fraudFlags({ status, rule }, { signal }), [status, rule]);
  const [toast, setToast] = useState<string | null>(null);
  const rows = list.data?.results ?? [];
  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const go = (next: { status?: string; rule?: string; flag?: number }) => {
    const q = new URLSearchParams();
    q.set("status", next.status ?? status);
    const r = next.rule ?? rule;
    if (r) q.set("rule", r);
    if (next.flag) q.set("flag", String(next.flag));
    router.replace(`/fraud?${q.toString()}`, { scroll: false });
  };

  return (
    <>
      <PageHeader title={t("admin.fraud.title")} subtitle={t("admin.fraud.subtitle")} />
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <Tabs value={status} onChange={(_, v: string) => go({ status: v })}>
          {STATUSES.map((s) => (
            <Tab key={s} value={s} label={t(`admin.fraud.status.${s}`)} />
          ))}
        </Tabs>
        <TextField select size="small" label={t("admin.fraud.col.rule")} value={rule ?? ""} onChange={(e) => go({ rule: e.target.value })} sx={{ minWidth: 200 }}>
          <MenuItem value="">{t("admin.common.all")}</MenuItem>
          {RULES.map((r) => (
            <MenuItem key={r} value={r}>
              {t(`admin.fraud.rule.${r}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<FraudFlag>
          rows={rows}
          rowKey={(r) => r.id}
          empty={t("admin.fraud.empty")}
          onRowClick={(r) => go({ flag: r.id })}
          columns={[
            { key: "id", label: "#", render: (r) => <Ltr>#{r.id}</Ltr> },
            { key: "rule", label: t("admin.fraud.col.rule"), render: (r) => t(`admin.fraud.rule.${r.rule}`) },
            { key: "user", label: t("admin.fraud.col.user"), render: (r) => <Ltr>@{r.user.username ?? r.user.id}</Ltr> },
            { key: "other", label: t("admin.fraud.col.other"), render: (r) => (r.other ? <Ltr>@{r.other.username ?? r.other.id}</Ltr> : "—") },
            { key: "created", label: t("admin.fraud.col.created"), render: (r) => f.dateTime(r.created_at) },
          ]}
        />
      )}
      <Drawer anchor="right" open={Boolean(open)} onClose={() => go({})}>
        {open && (
          <FlagDrawer
            flag={open}
            onClose={() => go({})}
            onDecided={(msg) => {
              setToast(msg);
              go({});
              list.reload();
            }}
          />
        )}
      </Drawer>
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}

export default function FraudPage() {
  return (
    <Screen>
      <Suspense>
        <Fraud />
      </Suspense>
    </Screen>
  );
}
