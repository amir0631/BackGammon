"use client";

import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@bg/api-client";
import type { AdminMatchSearchRow, LiveMatchRow } from "@bg/protocol";
import { DataTable, DateRangeBar, LoadError, Loading, Ltr, PageHeader, Screen, useApi, useFmt, useT, type Range } from "@/components/common";
import { EyeIcon, RefreshIcon, SearchIcon } from "@/components/icons";

function Search() {
  const t = useT();
  const f = useFmt();
  const router = useRouter();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState<Range | null>(null);
  const list = useApi(
    (signal) => api.admin.matches({ q: q || undefined, status: status || undefined, from: range?.from, to: range?.to }, { signal }),
    [q, status, range?.from, range?.to],
  );
  return (
    <>
      <Stack
        component="form"
        direction="row"
        spacing={1}
        sx={{ mb: 1, flexWrap: "wrap", gap: 1, alignItems: "flex-start" }}
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text.trim());
        }}
      >
        <TextField size="small" label={t("admin.matches.search")} value={text} onChange={(e) => setText(e.target.value)} sx={{ minWidth: 320 }} />
        <TextField select size="small" label={t("admin.matches.col.status")} value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">{t("admin.common.all")}</MenuItem>
          {["active", "finished", "aborted", "voided"].map((s) => (
            <MenuItem key={s} value={s}>
              {t(`admin.matches.status.${s}`)}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} sx={{ minHeight: 40 }}>
          {t("admin.common.search")}
        </Button>
      </Stack>
      <DateRangeBar value={range ?? { from: "", to: "" }} onChange={setRange} />
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<AdminMatchSearchRow>
          rows={list.data?.results ?? []}
          rowKey={(r) => r.id}
          empty={t("admin.matches.empty")}
          onRowClick={(r) => router.push(`/matches/${r.id}`)}
          columns={[
            { key: "date", label: t("admin.matches.col.date"), render: (r) => (r.started_at ? f.dateTime(r.started_at) : "—") },
            {
              key: "players",
              label: t("admin.matches.col.players"),
              render: (r) => (
                <Ltr>
                  @{r.players[0]?.username ?? "?"} – {r.is_bot ? `bot_${r.bot_level}` : `@${r.players[1]?.username ?? "?"}`}
                </Ltr>
              ),
            },
            { key: "variant", label: t("admin.matches.col.variant"), render: (r) => `${t(`admin.variant.${r.variant}`)} · ${f.n(r.length)}` },
            { key: "entry", label: t("admin.matches.col.entry"), align: "right", render: (r) => f.n(r.entry) },
            { key: "score", label: t("admin.matches.col.score"), render: (r) => <Ltr>{`${r.score[0]}–${r.score[1]}`}</Ltr> },
            {
              key: "status",
              label: t("admin.matches.col.status"),
              render: (r) => (
                <Stack direction="row" spacing={0.5}>
                  <Chip size="small" label={t(`admin.matches.status.${r.status}`)} />
                  {r.tournament_id && <Chip size="small" variant="outlined" label={t("admin.matches.tournament")} />}
                </Stack>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

function Live() {
  const t = useT();
  const f = useFmt();
  const list = useApi((signal) => api.admin.liveMatches({ signal }), []);
  return (
    <>
      <Button startIcon={<RefreshIcon />} onClick={list.reload} sx={{ mb: 1 }}>
        {t("admin.common.refresh")}
      </Button>
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<LiveMatchRow>
          rows={list.data?.results ?? []}
          rowKey={(r) => r.match_id}
          empty={t("admin.matches.noLive")}
          columns={[
            { key: "players", label: t("admin.matches.col.players"), render: (r) => <Ltr>{r.players.map((p) => `@${p.username}`).join(" – ")}</Ltr> },
            { key: "variant", label: t("admin.matches.col.variant"), render: (r) => `${t(`admin.variant.${r.variant}`)} · ${f.n(r.length)}` },
            { key: "entry", label: t("admin.matches.col.entry"), align: "right", render: (r) => f.n(r.entry) },
            { key: "score", label: t("admin.matches.col.score"), render: (r) => <Ltr>{`${r.score[0]}–${r.score[1]}`}</Ltr> },
            { key: "spectators", label: t("admin.matches.col.spectators"), align: "right", render: (r) => f.n(r.spectators) },
            { key: "pool", label: t("admin.matches.col.pool"), align: "right", render: (r) => f.n(r.pool) },
            {
              key: "watch",
              label: "",
              render: (r) => (
                <Button size="small" component={Link} href={`/matches/${r.match_id}?live=1`} startIcon={<EyeIcon />}>
                  {t("admin.matches.watch")}
                </Button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

function Matches() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "live" ? "live" : "search";
  return (
    <>
      <PageHeader title={t("admin.matches.title")} subtitle={t("admin.matches.subtitle")} />
      <Tabs value={tab} onChange={(_, v: string) => router.replace(`/matches?tab=${v}`)} sx={{ mb: 2 }}>
        <Tab value="search" label={t("admin.matches.tabSearch")} />
        <Tab value="live" label={t("admin.matches.tabLive")} />
      </Tabs>
      {tab === "live" ? <Live /> : <Search />}
    </>
  );
}

export default function MatchesPage() {
  return (
    <Screen>
      <Suspense>
        <Matches />
      </Suspense>
    </Screen>
  );
}
