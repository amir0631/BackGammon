"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { api } from "@bg/api-client";
import type { FinancialRow } from "@bg/protocol";
import {
  CsvButton,
  DataTable,
  DateRangeBar,
  Kv,
  LoadError,
  Loading,
  Ltr,
  PageHeader,
  Screen,
  Section,
  defaultRange,
  useApi,
  useFmt,
  useT,
  type Range,
} from "@/components/common";
import { useAdmin } from "@/lib/admin-context";

type TabKey = "financial" | "games" | "users";

const FIN_COLUMNS: (keyof Omit<FinancialRow, "day">)[] = [
  "sales_rial",
  "payments",
  "purchased_coins",
  "topup_coins",
  "rewards_coins",
  "sinks_coins",
  "rake_table",
  "rake_prediction",
  "rake_tournament",
  "rake_fees",
  "referral_paid",
  "withdrawn_coins",
  "adjustments_coins",
];

function Financial({ range }: { range: Range }) {
  const t = useT();
  const f = useFmt();
  const r = useApi((signal) => api.admin.financialReport(range, { signal }), [range.from, range.to]);
  if (r.error) return <LoadError error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  return (
    <>
      <Section title={t("admin.reports.totals")} action={<CsvButton href={api.admin.reportCsvUrl("financial", range)} />}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 4 }}>
          {FIN_COLUMNS.map((c) => (
            <Kv key={c} label={t(`admin.reports.fin.${c}`)}>
              {c === "sales_rial" ? t("admin.common.toman", { amount: f.n(d.totals[c] / 10) }) : f.n(d.totals[c])}
            </Kv>
          ))}
          <Kv label={t("admin.reports.fin.balances")}>{f.n(d.balances.users)}</Kv>
          <Kv label={t("admin.reports.fin.escrow")}>{f.n(d.balances.escrow)}</Kv>
        </Box>
      </Section>
      <Section title={t("admin.reports.byDay")}>
        <DataTable
          rows={d.rows}
          rowKey={(row) => row.day}
          empty={t("admin.reports.empty")}
          columns={[
            { key: "day", label: t("admin.reports.day"), render: (row) => f.date(`${row.day}T00:00:00Z`) },
            ...FIN_COLUMNS.map((c) => ({ key: c, label: t(`admin.reports.fin.${c}`), align: "right" as const, render: (row: FinancialRow) => f.n(row[c]) })),
          ]}
        />
      </Section>
      <Section title={t("admin.reports.byPackage")}>
        <DataTable
          rows={d.by_package}
          rowKey={(p) => p.coins}
          empty={t("admin.reports.empty")}
          columns={[
            { key: "coins", label: t("admin.shop.coins"), align: "right", render: (p) => f.n(p.coins) },
            { key: "n", label: t("admin.reports.fin.payments"), align: "right", render: (p) => f.n(p.payments) },
            { key: "rial", label: t("admin.reports.fin.sales_rial"), align: "right", render: (p) => t("admin.common.toman", { amount: f.n(p.rial / 10) }) },
          ]}
        />
      </Section>
      <Section title={t("admin.reports.reconciliation")}>
        <DataTable
          rows={d.reconciliation}
          rowKey={(x) => `${x.day}-${x.gateway}`}
          empty={t("admin.reports.noReconciliation")}
          columns={[
            { key: "day", label: t("admin.reports.day"), render: (x) => f.date(`${x.day}T00:00:00Z`) },
            { key: "gw", label: t("admin.reports.gateway"), render: (x) => <Ltr>{x.gateway}</Ltr> },
            { key: "n", label: t("admin.reports.fin.payments"), align: "right", render: (x) => f.n(x.verified) },
            { key: "rial", label: t("admin.reports.fin.sales_rial"), align: "right", render: (x) => t("admin.common.toman", { amount: f.n(x.verified_rial / 10) }) },
            { key: "problems", label: t("admin.reports.problems"), render: (x) => (x.problems.length ? <Typography color="error" variant="body2">{f.n(x.problems.length)}</Typography> : "✓") },
          ]}
        />
      </Section>
    </>
  );
}

function Games({ range }: { range: Range }) {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const r = useApi((signal) => api.admin.gameReport(range, { signal }), [range.from, range.to]);
  if (r.error) return <LoadError error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  const pct = (v: number) => `${f.n(v)}%`;
  return (
    <>
      <Section title={t("admin.reports.totals")} action={<CsvButton href={api.admin.reportCsvUrl("games", range)} />}>
        <Kv label={t("admin.reports.games.human")}>{f.n(d.human_matches)}</Kv>
        <Kv label={t("admin.reports.games.duration")}>{d.avg_duration_seconds === null ? "—" : t("admin.reports.minutes", { n: f.n(Math.round(d.avg_duration_seconds / 60)) })}</Kv>
        <Kv label={t("admin.reports.games.resign")}>{pct(d.resign_rate_pct)}</Kv>
        <Kv label={t("admin.reports.games.timeout")}>{pct(d.timeout_forfeit_rate_pct)}</Kv>
        <Kv label={t("admin.reports.games.disconnect")}>{pct(d.disconnect_rate_pct)}</Kv>
        <Kv label={t("admin.reports.games.disconnectForfeit")}>{pct(d.disconnect_forfeit_rate_pct)}</Kv>
        <Kv label={t("admin.reports.games.wait")}>{t("admin.reports.seconds", { n: f.n(d.queue_wait.avg_seconds) })} · {f.n(d.queue_wait.samples)}</Kv>
      </Section>
      <Section title={t("admin.reports.byTable")}>
        <DataTable
          rows={d.by_table}
          rowKey={(x) => `${x.variant}-${x.entry}-${x.bot}`}
          empty={t("admin.reports.empty")}
          columns={[
            { key: "v", label: t("admin.matches.col.variant"), render: (x) => t(`admin.variant.${x.variant}`) },
            { key: "e", label: t("admin.matches.col.entry"), align: "right", render: (x) => (x.bot ? t("admin.reports.bot") : f.n(x.entry)) },
            { key: "n", label: t("admin.reports.games.matches"), align: "right", render: (x) => f.n(x.matches) },
            { key: "a", label: t("admin.reports.games.aborted"), align: "right", render: (x) => f.n(x.aborted) },
          ]}
        />
      </Section>
      <Section
        title={t("admin.reports.diceTests")}
        action={
          admin?.role === "superadmin" ? (
            <Button variant="outlined" onClick={() => void api.admin.runDiceTest().then(r.reload)}>
              {t("admin.reports.runDice")}
            </Button>
          ) : null
        }
      >
        <DataTable
          rows={d.dice_tests}
          rowKey={(x) => x.created_at}
          empty={t("admin.dashboard.diceNone")}
          columns={[
            { key: "when", label: t("admin.dashboard.diceWhen"), render: (x) => f.dateTime(x.created_at) },
            { key: "n", label: t("admin.dashboard.diceCount"), align: "right", render: (x) => f.n(x.dice) },
            { key: "faces", label: t("admin.dashboard.diceFaces"), render: (x) => <Ltr>{x.counts.join(" · ")}</Ltr> },
            { key: "p", label: t("admin.dashboard.diceP"), render: (x) => <Ltr>{x.p_value.toFixed(4)}</Ltr> },
          ]}
        />
      </Section>
    </>
  );
}

function Users({ range }: { range: Range }) {
  const t = useT();
  const f = useFmt();
  const r = useApi((signal) => api.admin.userReport(range, { signal }), [range.from, range.to]);
  if (r.error) return <LoadError error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  const pct = (v: number | null) => (v === null ? "—" : `${f.n(v)}%`);
  return (
    <>
      <Section title={t("admin.reports.totals")} action={<CsvButton href={api.admin.reportCsvUrl("users", range)} />}>
        <Kv label={t("admin.reports.users.signups")}>{f.n(d.signups)}</Kv>
        <Kv label="D1 / D7 / D30">
          {pct(d.retention_pct.d1)} / {pct(d.retention_pct.d7)} / {pct(d.retention_pct.d30)}
        </Kv>
        <Kv label={t("admin.reports.users.conversion")}>{pct(d.purchase_conversion_pct)}</Kv>
        <Kv label={t("admin.reports.users.paying")}>{f.n(d.paying_users)}</Kv>
        <Kv label={t("admin.reports.users.revenue")}>{t("admin.common.toman", { amount: f.n(d.revenue_rial / 10) })}</Kv>
        <Kv label="ARPPU">{t("admin.common.toman", { amount: f.n(d.arppu_rial / 10) })}</Kv>
      </Section>
      <Section title={t("admin.reports.byDay")}>
        <DataTable
          rows={d.rows}
          rowKey={(x) => x.day}
          empty={t("admin.reports.empty")}
          columns={[
            { key: "day", label: t("admin.reports.day"), render: (x) => f.date(`${x.day}T00:00:00Z`) },
            { key: "s", label: t("admin.reports.users.signups"), align: "right", render: (x) => f.n(x.signups) },
            { key: "dau", label: "DAU", align: "right", render: (x) => f.n(x.dau) },
            { key: "mau", label: "MAU", align: "right", render: (x) => f.n(x.mau) },
          ]}
        />
      </Section>
    </>
  );
}

function Reports() {
  const t = useT();
  const { admin } = useAdmin();
  const money = admin?.role === "finance" || admin?.role === "superadmin";
  const [tab, setTab] = useState<TabKey>(money ? "financial" : "games");
  const [range, setRange] = useState<Range>(() => defaultRange(30));
  return (
    <>
      <PageHeader title={t("admin.reports.title")} subtitle={t("admin.reports.subtitle")} />
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2 }}>
        {money && <Tab value="financial" label={t("admin.reports.financial")} />}
        <Tab value="games" label={t("admin.reports.games.title")} />
        <Tab value="users" label={t("admin.reports.users.title")} />
      </Tabs>
      <DateRangeBar value={range} onChange={setRange} />
      {tab === "financial" && money && <Financial range={range} />}
      {tab === "games" && <Games range={range} />}
      {tab === "users" && <Users range={range} />}
    </>
  );
}

export default function ReportsPage() {
  return (
    <Screen>
      <Reports />
    </Screen>
  );
}
