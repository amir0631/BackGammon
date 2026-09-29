"use client";

import Alert from "@mui/material/Alert";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@bg/api-client";
import type { AdminUserRow } from "@bg/protocol";
import { DataTable, Loading, LoadError, Ltr, PageHeader, Screen, StatusChip, useApi, useFmt, useT } from "@/components/common";
import { SearchIcon } from "@/components/icons";
import { normalizeQuery } from "@/lib/search";

function Users() {
  const t = useT();
  const f = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(() => normalizeQuery(params.get("q") ?? ""));

  useEffect(() => {
    const id = setTimeout(() => {
      const next = normalizeQuery(text);
      if (next.q === query.q) return;
      if (next.q.length === 0 || next.q.length >= 2) setQuery(next);
    }, 400);
    return () => clearTimeout(id);
  }, [text, query.q]);

  useEffect(() => {
    // Usernames go in the URL for deep links; phone numbers never do (P§18).
    const url = query.q && !query.phone ? `/users?q=${encodeURIComponent(query.q)}` : "/users";
    router.replace(url, { scroll: false });
  }, [query, router]);

  const { data, error, loading, reload } = useApi((signal) => api.admin.users(query.q, undefined, { signal }), [query.q]);
  const rows = useMemo(() => data?.results ?? [], [data]);

  return (
    <>
      <PageHeader title={t("admin.users.title")} />
      <TextField
        autoFocus
        fullWidth
        label={t("admin.users.search")}
        helperText={t("admin.users.searchHelp")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setQuery(normalizeQuery(text));
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2, maxWidth: 520 }}
      />
      <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
        {query.q ? t("admin.users.resultsFor", { q: query.q }) : t("admin.users.newest")}
      </Typography>
      {error ? <LoadError error={error} onRetry={reload} /> : null}
      {loading && !data ? (
        <Loading rows={8} />
      ) : (
        <DataTable<AdminUserRow>
          caption={t("admin.users.title")}
          rows={rows}
          rowKey={(r) => r.id}
          empty={query.q ? t("admin.users.empty", { q: query.q }) : t("admin.users.emptyAll")}
          onRowClick={(r) => router.push(`/users/${r.id}`)}
          columns={[
            {
              key: "username",
              label: t("admin.users.col.username"),
              render: (r) =>
                r.username ? (
                  <Ltr>@{r.username}</Ltr>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {t("admin.users.noUsername")}
                  </Typography>
                ),
            },
            { key: "id", label: t("admin.users.col.id"), render: (r) => <Ltr>#{r.id}</Ltr> },
            { key: "phone", label: t("admin.users.col.phone"), render: (r) => <Ltr>{r.phone}</Ltr> },
            { key: "status", label: t("admin.users.col.status"), render: (r) => <StatusChip status={r.status} /> },
            { key: "joined", label: t("admin.users.col.joined"), render: (r) => f.date(r.created_at) },
            { key: "balance", label: t("admin.users.col.balance"), align: "right", render: (r) => f.n(r.balance) },
          ]}
        />
      )}
      {rows.length >= 50 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {t("admin.users.capped")}
        </Alert>
      )}
    </>
  );
}

export default function UsersPage() {
  return (
    <Screen>
      <Suspense>
        <Users />
      </Suspense>
    </Screen>
  );
}
