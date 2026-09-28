"use client";

// A list-and-edit screen for the admin catalogs (CLAUDE.md §13 Shop and Content): coin packages,
// items, phrases, announcements, text overrides. Fields are described once; the server validates
// (both languages required, prices, dates) and audits every write.

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useState, type ReactNode } from "react";
import { ApiRequestError } from "@bg/api-client";
import { DataTable, LoadError, Loading, errorText, useApi, useT, type Column } from "@/components/common";
import { AddIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

export type FieldType = "text" | "ltr" | "number" | "bool" | "bilingual" | "select" | "json" | "datetime";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  /** Only when creating (identity fields such as a key). */
  createOnly?: boolean;
  multiline?: boolean;
}

interface CrudApi<R> {
  list: (o?: { signal?: AbortSignal }) => Promise<{ results: R[] }>;
  create: (row: never) => Promise<R>;
  update: (id: number, change: never) => Promise<R>;
  remove: (id: number) => Promise<void>;
}

type Values = Record<string, unknown>;

function toForm(fields: Field[], row: Values | null): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of fields) {
    const v = row?.[f.key];
    if (f.type === "bool") out[f.key] = row ? Boolean(v) : true;
    else if (f.type === "bilingual") {
      const b = (v as { fa?: string; en?: string } | undefined) ?? {};
      out[`${f.key}.fa`] = b.fa ?? "";
      out[`${f.key}.en`] = b.en ?? "";
    } else if (f.type === "json") out[f.key] = v === undefined ? "{}" : JSON.stringify(v, null, 2);
    else if (f.type === "datetime") out[f.key] = typeof v === "string" ? v.slice(0, 16) : "";
    else out[f.key] = v === undefined || v === null ? "" : String(v);
  }
  return out;
}

function fromForm(fields: Field[], form: Record<string, string | boolean>, creating: boolean): Values | string {
  const out: Values = {};
  for (const f of fields) {
    if (f.createOnly && !creating) continue;
    if (f.type === "bool") out[f.key] = Boolean(form[f.key]);
    else if (f.type === "bilingual") out[f.key] = { fa: String(form[`${f.key}.fa`] ?? ""), en: String(form[`${f.key}.en`] ?? "") };
    else if (f.type === "number") out[f.key] = Number(form[f.key] || 0);
    else if (f.type === "json") {
      try {
        out[f.key] = JSON.parse(String(form[f.key] || "{}"));
      } catch {
        return f.key;
      }
    } else if (f.type === "datetime") out[f.key] = form[f.key] ? new Date(String(form[f.key])).toISOString() : null;
    else out[f.key] = String(form[f.key] ?? "");
  }
  return out;
}

function Editor({
  fields,
  row,
  title,
  onClose,
  onSave,
}: {
  fields: Field[];
  row: Values | null;
  title: string;
  onClose: () => void;
  onSave: (values: Values) => Promise<void>;
}) {
  const t = useT();
  const { handleError } = useAdmin();
  const [form, setForm] = useState(() => toForm(fields, row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creating = row === null;

  const field = (f: Field): ReactNode => {
    const disabled = Boolean(f.createOnly && !creating);
    switch (f.type) {
      case "bool":
        return (
          <FormControlLabel
            key={f.key}
            control={<Checkbox checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />}
            label={f.label}
          />
        );
      case "bilingual":
        return (
          <Stack key={f.key} spacing={1}>
            {(["fa", "en"] as const).map((lang) => (
              <TextField
                key={lang}
                label={`${f.label} (${t(`admin.common.lang.${lang}`)})`}
                value={form[`${f.key}.${lang}`]}
                onChange={(e) => setForm({ ...form, [`${f.key}.${lang}`]: e.target.value })}
                multiline={f.multiline}
                minRows={f.multiline ? 2 : undefined}
                slotProps={{ htmlInput: { dir: lang === "fa" ? "rtl" : "ltr" } }}
              />
            ))}
          </Stack>
        );
      case "select":
        return (
          <TextField key={f.key} select label={f.label} value={form[f.key]} disabled={disabled} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
            {(f.options ?? []).map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        );
      case "json":
        return (
          <TextField
            key={f.key}
            label={f.label}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { dir: "ltr", style: { fontFamily: "monospace" } } }}
          />
        );
      case "datetime":
        return (
          <TextField
            key={f.key}
            type="datetime-local"
            label={f.label}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: "ltr" } }}
          />
        );
      default:
        return (
          <TextField
            key={f.key}
            label={f.label}
            value={form[f.key]}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            slotProps={{ htmlInput: { dir: f.type === "number" || f.type === "ltr" ? "ltr" : undefined, inputMode: f.type === "number" ? "numeric" : undefined } }}
          />
        );
    }
  };

  const save = async () => {
    const values = fromForm(fields, form, creating);
    if (typeof values === "string") {
      setError(t("admin.catalog.badJson", { field: values }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(values);
      onClose();
    } catch (e) {
      if (handleError(e)) return;
      const fieldsErr = e instanceof ApiRequestError ? (e.body.details.fields as Record<string, unknown> | undefined) : undefined;
      setError(fieldsErr ? `${errorText(t, e)} ${Object.keys(fieldsErr).join(", ")}` : errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="catalog-edit-title">
      <DialogTitle id="catalog-edit-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {fields.map(field)}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("admin.common.cancel")}
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy}>
          {busy ? t("admin.common.saving") : t("admin.common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CatalogEditor<R extends { id: number }>({
  crud,
  fields,
  columns,
  canWrite,
  deletes,
  noun,
}: {
  crud: CrudApi<R>;
  fields: Field[];
  columns: Column<R>[];
  canWrite: boolean;
  /** true: delete removes the row; false: it deactivates (rows other records point to). */
  deletes: boolean;
  noun: string;
}) {
  const t = useT();
  const { handleError } = useAdmin();
  const list = useApi((signal) => crud.list({ signal }), [crud]);
  const [editing, setEditing] = useState<R | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const actions: Column<R> = {
    key: "_actions",
    label: "",
    render: (r) =>
      canWrite ? (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => setEditing(r)}>
            {t("admin.common.edit")}
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => {
              if (!window.confirm(t(deletes ? "admin.catalog.confirmDelete" : "admin.catalog.confirmDeactivate"))) return;
              crud
                .remove(r.id)
                .then(() => {
                  setToast(t("admin.common.saved"));
                  list.reload();
                })
                .catch((e: unknown) => {
                  if (!handleError(e)) setToast(errorText(t, e));
                });
            }}
          >
            {t(deletes ? "admin.common.delete" : "admin.catalog.deactivate")}
          </Button>
        </Stack>
      ) : null,
  };

  return (
    <>
      {canWrite && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")} sx={{ mb: 2 }}>
          {t("admin.catalog.add", { noun })}
        </Button>
      )}
      {list.error ? <LoadError error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <DataTable<R> rows={list.data?.results ?? []} rowKey={(r) => r.id} empty={t("admin.catalog.empty")} columns={[...columns, actions]} />
      )}
      {editing && (
        <Editor
          fields={fields}
          row={editing === "new" ? null : (editing as unknown as Values)}
          title={editing === "new" ? t("admin.catalog.add", { noun }) : t("admin.catalog.edit", { noun })}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (editing === "new") await crud.create(values as never);
            else await crud.update(editing.id, values as never);
            setToast(t("admin.common.saved"));
            list.reload();
          }}
        />
      )}
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />
    </>
  );
}
