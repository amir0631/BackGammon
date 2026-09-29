"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@bg/api-client";
import { Kv, LoadError, Loading, PageHeader, Screen, Section, useApi, useFmt, useT } from "@/components/common";
import { RefreshIcon, WarningIcon } from "@/components/icons";

function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" component="p" sx={{ fontWeight: 600, mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      {body}
    </Link>
  ) : (
    body
  );
}

function Dashboard() {
  const t = useT();
  const f = useFmt();
  const { data, error, loading, reload } = useApi((signal) => api.admin.dashboard({ signal }), []);
  return (
    <>
      <PageHeader
        title={t("admin.dashboard.title")}
        actions={
          <Button startIcon={<RefreshIcon />} onClick={reload} disabled={loading}>
            {t("admin.common.refresh")}
          </Button>
        }
      />
      {error ? <LoadError error={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading rows={4} /> : null}
      {data && (
        <>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, mb: 3 }}>
              <Stat label={t("admin.dashboard.online")} value={f.n(data.online_users)} />
              <Stat label={t("admin.dashboard.live")} value={f.n(data.live_matches)} href="/matches?tab=live" />
              <Stat label={t("admin.dashboard.flags")} value={f.n(data.open_fraud_flags)} href="/fraud" />
              <Stat label={t("admin.dashboard.withdrawals")} value={f.n(data.pending_withdrawals)} href="/withdrawals" />
          </Box>
          <Section title={t("admin.dashboard.today")}>
            <Kv label={t("admin.dashboard.sales")}>{t("admin.common.toman", { amount: f.n(data.today.sales_rial / 10) })}</Kv>
            <Kv label={t("admin.dashboard.payments")}>{f.n(data.today.payments)}</Kv>
            <Kv label={t("admin.dashboard.topups")}>{t("admin.common.coins", { amount: f.n(data.today.topup_coins) })}</Kv>
            <Kv label={t("admin.dashboard.rake")}>{t("admin.common.coins", { amount: f.n(data.today.rake_coins) })}</Kv>
            <Kv label={t("admin.dashboard.signups")}>{f.n(data.today.signups)}</Kv>
          </Section>
          <Section title={t("admin.dashboard.dice")}>
            {data.dice_test ? (
              <Stack spacing={1}>
                {data.dice_test.p_value < 0.001 && (
                  <Alert severity="error" icon={<WarningIcon />}>
                    {t("admin.dashboard.diceAlert")}
                  </Alert>
                )}
                <Kv label={t("admin.dashboard.diceWhen")}>{f.dateTime(data.dice_test.created_at)}</Kv>
                <Kv label={t("admin.dashboard.diceCount")}>{f.n(data.dice_test.dice)}</Kv>
                <Kv label={t("admin.dashboard.diceFaces")}>
                  <bdi dir="ltr">{data.dice_test.counts.map((c, i) => `${i + 1}: ${f.n(c)}`).join(" · ")}</bdi>
                </Kv>
                <Kv label={t("admin.dashboard.diceP")}>
                  <bdi dir="ltr">{data.dice_test.p_value.toFixed(4)}</bdi>
                </Kv>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("admin.dashboard.diceNone")}
              </Typography>
            )}
          </Section>
        </>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Screen>
      <Dashboard />
    </Screen>
  );
}
