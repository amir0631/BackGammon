"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState } from "react";
import { api } from "@bg/api-client";
import { parseDateInput } from "@bg/i18n";
import type { TournamentInfo, Variant } from "@bg/protocol";
import { DataTable, LoadError, Loading, Ltr, PageHeader, ReasonDialog, Screen, Section, errorText, useApi, useFmt, useT } from "@/components/common";
import { AddIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

const VARIANTS: Variant[] = ["standard_cube", "standard_nocube", "traditional"];

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const { handleError } = useAdmin();
  const [form, setForm] = useState({ fa: "", en: "", variant: "standard_cube" as Variant, length: "3", entry: "100", capacity: "8", date: "", time: "20:00", split: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = parseDateInput(form.date);
  const ok = form.fa.trim() && form.en.trim() && day && /^\d{1,2}:\d{2}$/.test(form.time);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!day) return;
    setBusy(true);
    setError(null);
    try {
      // The time is Tehran time (UTC+03:30).
      const startsAt = new Date(`${day}T${form.time.padStart(5, "0")}:00+03:30`).toISOString();
      const split = form.split.trim() ? form.split.split(/[,،\s]+/).filter(Boolean).map(Number) : undefined;
      await api.admin.createTournament({
        name: { fa: form.fa.trim(), en: form.en.trim() },
        variant: form.variant,
        length: Number(form.length),
        entry: Number(form.entry),
        capacity: Number(form.capacity),
        starts_at: startsAt,
        prize_split: split,
      });
      onCreated();
      onClose();
    } catch (e) {
      if (!handleError(e)) setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="create-t">
      <DialogTitle id="create-t">{t("admin.tournaments.create")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t("admin.common.nameFa")} value={form.fa} onChange={set("fa")} slotProps={{ htmlInput: { dir: "rtl", maxLength: 80 } }} />
          <TextField label={t("admin.common.nameEn")} value={form.en} onChange={set("en")} slotProps={{ htmlInput: { dir: "ltr", maxLength: 80 } }} />
          <TextField select label={t("admin.matches.col.variant")} value={form.variant} onChange={set("variant")}>
            {VARIANTS.map((v) => (
              <MenuItem key={v} value={v}>
                {t(`admin.variant.${v}`)}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <TextField select label={t("admin.tournaments.length")} value={form.length} onChange={set("length")} fullWidth>
              {["1", "3", "5", "7", "11"].map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={t("admin.tournaments.capacity")} value={form.capacity} onChange={set("capacity")} fullWidth>
              {["4", "8", "16", "32", "64"].map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={t("admin.tournaments.entry")} value={form.entry} onChange={set("entry")} fullWidth slotProps={{ htmlInput: { inputMode: "numeric", dir: "ltr" } }} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label={t("admin.tournaments.date")} helperText={t("admin.range.hint")} value={form.date} onChange={set("date")} fullWidth slotProps={{ htmlInput: { dir: "ltr" } }} />
            <TextField label={t("admin.tournaments.time")} helperText={t("admin.tournaments.tehran")} value={form.time} onChange={set("time")} fullWidth slotProps={{ htmlInput: { dir: "ltr" } }} />
          </Stack>
          <TextField label={t("admin.tournaments.split")} helperText={t("admin.tournaments.splitHelp")} value={form.split} onChange={set("split")} slotProps={{ htmlInput: { dir: "ltr" } }} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("admin.common.cancel")}
        </Button>
        <Button variant="contained" disabled={!ok || busy} onClick={() => void submit()}>
          {busy ? t("admin.common.saving") : t("admin.tournaments.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Bracket({ id }: { id: number }) {
  const t = useT();
  const f = useFmt();
  const data = useApi((signal) => api.admin.bracket(id, { signal }), [id]);
  if (data.error) return <LoadError error={data.error} onRetry={data.reload} />;
  if (!data.data) return <Loading rows={3} />;
  const rounds = [...new Set(data.data.slots.map((s) => s.round))];
  return (
    <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1 }}>
      {rounds.map((r) => (
        <Stack key={r} spacing={1} sx={{ minWidth: 200 }}>
          <Typography variant="subtitle2">{t("admin.tournaments.round", { n: f.n(r) })}</Typography>
          {data.data!.slots
            .filter((s) => s.round === r)
            .map((s) => (
              <Paper key={`${s.round}-${s.position}`} variant="outlined" sx={{ p: 1 }}>
                {s.players.map((p, i) => (
                  <Typography key={i} variant="body2" sx={{ fontWeight: s.winner && s.winner === p ? 700 : 400 }}>
                    <Ltr>{p ? `@${p}` : "—"}</Ltr>
                    {s.score ? ` · ${f.n(s.score[i] ?? 0)}` : ""}
                  </Typography>
                ))}
                {s.match_id && (
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    {s.live && <Chip size="small" color="error" label={t("admin.tournaments.live")} />}
                    <Link href={`/matches/${s.match_id}${s.live ? "?live=1" : ""}`}>{t(s.live ? "admin.matches.watch" : "admin.matches.replay")}</Link>
                  </Stack>
                )}
              </Paper>
            ))}
        </Stack>
      ))}
    </Box>
  );
}

function Tournaments() {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const list = useApi((signal) => api.admin.tournaments({ signal }), []);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<TournamentInfo | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const superadmin = admin?.role === "superadmin";

  return (
    <>
      <PageHeader
        title={t("admin.tournaments.title")}
        actions={
          superadmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
              {t("admin.tournaments.create")}
            </Button>
          )
        }
      />
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<TournamentInfo>
          rows={list.data?.results ?? []}
          rowKey={(r) => r.id}
          empty={t("admin.tournaments.empty")}
          onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
          columns={[
            { key: "name", label: t("admin.tournaments.name"), render: (r) => r.name[f.locale] },
            { key: "starts", label: t("admin.tournaments.starts"), render: (r) => f.dateTime(r.starts_at) },
            { key: "variant", label: t("admin.matches.col.variant"), render: (r) => `${t(`admin.variant.${r.variant}`)} · ${f.n(r.length)}` },
            { key: "entries", label: t("admin.tournaments.entries"), align: "right", render: (r) => `${f.n(r.entries)} / ${f.n(r.capacity)}` },
            { key: "entry", label: t("admin.tournaments.entry"), align: "right", render: (r) => f.n(r.entry) },
            { key: "status", label: t("admin.matches.col.status"), render: (r) => <Chip size="small" label={t(`admin.tournaments.status.${r.status}`)} /> },
            {
              key: "actions",
              label: "",
              render: (r) =>
                superadmin && (r.status === "scheduled" || r.status === "running") ? (
                  <Button
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCancelling(r);
                    }}
                  >
                    {t("admin.tournaments.cancel")}
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      {open && (
        <Section title={t("admin.tournaments.bracket")}>
          <Bracket id={open} />
        </Section>
      )}
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={() => { setToast(t("admin.common.saved")); list.reload(); }} />}
      {cancelling && (
        <ReasonDialog
          open
          title={t("admin.tournaments.cancelTitle", { name: cancelling.name[f.locale] })}
          body={<Alert severity="warning">{t("admin.tournaments.cancelEffect")}</Alert>}
          confirmLabel={t("admin.tournaments.cancel")}
          destructive
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            await api.admin.cancelTournament(cancelling.id, reason);
            setToast(t("admin.common.saved"));
            list.reload();
          }}
        />
      )}
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}

export default function TournamentsPage() {
  return (
    <Screen>
      <Tournaments />
    </Screen>
  );
}
