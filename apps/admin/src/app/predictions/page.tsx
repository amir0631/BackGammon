"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Link from "next/link";
import { useState } from "react";
import { api } from "@bg/api-client";
import type { AdminPool } from "@bg/protocol";
import { DataTable, LoadError, Loading, Ltr, PageHeader, ReasonDialog, Screen, useApi, useFmt, useT } from "@/components/common";
import { SettingsIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

const STATUSES: AdminPool["status"][] = ["held", "open", "closed", "settled", "refunded"];

function Predictions() {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const [status, setStatus] = useState<AdminPool["status"]>("held");
  const list = useApi((signal) => api.admin.pools(status, { signal }), [status]);
  const [deciding, setDeciding] = useState<{ pool: AdminPool; approve: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canDecide = admin?.role === "superadmin" || admin?.role === "support";

  return (
    <>
      <PageHeader
        title={t("admin.predictions.title")}
        subtitle={t("admin.predictions.subtitle")}
        actions={
          <Button component={Link} href="/settings?q=predict" startIcon={<SettingsIcon />}>
            {t("admin.predictions.settings")}
          </Button>
        }
      />
      <Tabs value={status} onChange={(_, v: AdminPool["status"]) => setStatus(v)} sx={{ mb: 2 }} variant="scrollable">
        {STATUSES.map((s) => (
          <Tab key={s} value={s} label={t(`admin.predictions.status.${s}`)} />
        ))}
      </Tabs>
      {status === "held" && <Alert severity="info" sx={{ mb: 2 }}>{t("admin.predictions.heldNote")}</Alert>}
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<AdminPool>
          rows={list.data?.results ?? []}
          rowKey={(r) => r.id}
          empty={t("admin.predictions.empty")}
          columns={[
            { key: "match", label: t("admin.predictions.match"), render: (r) => <Link href={`/matches/${r.match_id}`}><Ltr>{r.players.map((p) => `@${p ?? "?"}`).join(" – ")}</Ltr></Link> },
            { key: "a", label: "A", align: "right", render: (r) => f.n(r.total_a) },
            { key: "b", label: "B", align: "right", render: (r) => f.n(r.total_b) },
            { key: "rake", label: t("admin.predictions.rake"), align: "right", render: (r) => `${f.n(r.rake_pct)}%` },
            { key: "winner", label: t("admin.predictions.winner"), render: (r) => (r.winner_side === null ? "—" : r.winner_side === 0 ? "A" : "B") },
            { key: "reason", label: t("admin.predictions.reason"), render: (r) => (r.hold_reason ? t.has(`admin.fraud.rule.${r.hold_reason}`) ? t(`admin.fraud.rule.${r.hold_reason}`) : r.hold_reason : "—") },
            { key: "opened", label: t("admin.predictions.opened"), render: (r) => f.dateTime(r.opened_at) },
            {
              key: "decide",
              label: "",
              render: (r) =>
                r.status === "held" && canDecide ? (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="contained" onClick={() => setDeciding({ pool: r, approve: true })}>
                      {t("admin.predictions.settle")}
                    </Button>
                    <Button size="small" color="error" onClick={() => setDeciding({ pool: r, approve: false })}>
                      {t("admin.predictions.refund")}
                    </Button>
                  </Stack>
                ) : null,
            },
          ]}
        />
      )}
      {deciding && (
        <ReasonDialog
          open
          title={t(deciding.approve ? "admin.predictions.settle" : "admin.predictions.refund")}
          body={<Alert severity="info">{t(deciding.approve ? "admin.predictions.settleEffect" : "admin.predictions.refundEffect")}</Alert>}
          confirmLabel={t(deciding.approve ? "admin.predictions.settle" : "admin.predictions.refund")}
          destructive={!deciding.approve}
          onClose={() => setDeciding(null)}
          onConfirm={async (reason) => {
            await api.admin.decidePool(deciding.pool.id, deciding.approve, reason);
            setToast(t("admin.common.saved"));
            list.reload();
          }}
        />
      )}
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}

export default function PredictionsPage() {
  return (
    <Screen>
      <Predictions />
    </Screen>
  );
}
