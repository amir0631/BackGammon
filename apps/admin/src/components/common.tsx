"use client";

// Building blocks shared by the admin sections (CLAUDE.md §13): data loading with the session and
// access handling of admin-context, tables, a reason dialog for audited writes, the Jalali/Gregorian
// date range, and small formatting pieces.

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactNode } from "react";
import { ApiRequestError } from "@bg/api-client";
import { formatDate, formatDateInput, formatNumber, parseDateInput, tehranToday, type Locale } from "@bg/i18n";
import type { UserStatus } from "@bg/protocol";
import { CheckIcon, CopyIcon, DownloadIcon, InfoIcon, RefreshIcon, WarningIcon } from "@/components/icons";
import { AdminShell } from "@/components/AdminShell";
import { useAdmin } from "@/lib/admin-context";
import type { T } from "@/lib/format";

export function useT(): T {
  return useTranslations() as unknown as T;
}

export function useLocaleTyped(): Locale {
  return useLocale() as Locale;
}

/** The localized text of an API error (its message_key), or the generic error. */
export function errorText(t: T, error: unknown): string {
  if (error instanceof ApiRequestError) {
    const key = error.body.message_key;
    return t.has(key) ? t(key) : t("errors.generic");
  }
  return t("errors.generic");
}

export interface Loaded<D> {
  data: D | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/** Loads with cancellation; session expiry and IP/host denials are handled globally. */
export function useApi<D>(load: (signal: AbortSignal) => Promise<D>, deps: DependencyList): Loaded<D> {
  const { handleError } = useAdmin();
  const [data, setData] = useState<D | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRef
      .current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (!handleError(e)) setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, handleError]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5, mb: 3 }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>{actions}</Stack>}
    </Stack>
  );
}

/** The content column every admin page uses. */
export function Page({ children }: { children: ReactNode }) {
  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: "auto" }}>{children}</Box>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5, gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  return (
    <Alert
      severity="error"
      icon={<WarningIcon />}
      action={
        <Button color="inherit" size="small" onClick={onRetry} startIcon={<RefreshIcon />}>
          {t("admin.common.retry")}
        </Button>
      }
    >
      {errorText(t, error)}
    </Alert>
  );
}

export function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <Stack spacing={1} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={36} />
      ))}
    </Stack>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary", py: 2 }}>
      <InfoIcon fontSize="small" />
      <Typography variant="body2">{children}</Typography>
    </Stack>
  );
}

export interface Column<R> {
  key: string;
  label: string;
  render: (row: R) => ReactNode;
  align?: "left" | "right" | "center";
  /** Numbers and identifiers read left to right with Latin digits where noted. */
  ltr?: boolean;
}

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  caption,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string | number;
  empty: string;
  onRowClick?: (row: R) => void;
  caption?: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={caption}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.key} align={c.align} sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              hover={Boolean(onRowClick)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter") onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              sx={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} dir={c.ltr ? "ltr" : undefined}>
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function StatusChip({ status }: { status: UserStatus }) {
  const t = useT();
  const color = status === "active" ? "success" : status === "suspended" ? "warning" : "error";
  return (
    <Chip
      size="small"
      variant="outlined"
      color={color}
      icon={status === "active" ? <CheckIcon /> : <WarningIcon />}
      label={t(`admin.status.${status}`)}
    />
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <Tooltip title={done ? t("admin.withdrawals.copied") : label}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}

/** Coins in locale digits; money is never abbreviated (finance copies exact values). */
export function useFmt() {
  const locale = useLocaleTyped();
  return {
    locale,
    n: (value: number) => formatNumber(locale, value),
    date: (iso: string) => formatDate(locale, new Date(iso), { dateStyle: "medium" }),
    dateTime: (iso: string) => formatDate(locale, new Date(iso), { dateStyle: "medium", timeStyle: "medium" }),
  };
}

// ---- date range (§13: every report filters by Jalali or Gregorian dates) ----

export interface Range {
  from: string;
  to: string;
}

function isoDaysAgo(days: number): string {
  const today = tehranToday();
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function defaultRange(days = 30): Range {
  return { from: isoDaysAgo(days - 1), to: tehranToday() };
}

/**
 * Two text fields that accept a date in either calendar (1403/01/01 or 2024-03-20, any digits); the
 * value sent is always ISO. fa users see Jalali, en users Gregorian.
 */
export function DateRangeBar({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const t = useT();
  const locale = useLocaleTyped();
  const show = (iso: string) => (iso ? formatDateInput(locale, iso) : "");
  const [text, setText] = useState({ from: show(value.from), to: show(value.to) });
  const [bad, setBad] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    setText({ from: value.from ? formatDateInput(locale, value.from) : "", to: value.to ? formatDateInput(locale, value.to) : "" });
  }, [locale, value.from, value.to]);

  const apply = () => {
    const from = parseDateInput(text.from);
    const to = parseDateInput(text.to);
    if (!from) return setBad("from");
    if (!to || to < from) return setBad("to");
    setBad(null);
    onChange({ from, to });
  };

  const presets: [string, number][] = [
    ["admin.range.days7", 7],
    ["admin.range.days30", 30],
    ["admin.range.days90", 90],
  ];

  return (
    <Stack
      component="form"
      direction="row"
      spacing={1}
      sx={{ alignItems: "flex-start", flexWrap: "wrap", gap: 1, mb: 2 }}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      {(["from", "to"] as const).map((k) => (
        <TextField
          key={k}
          size="small"
          label={t(`admin.range.${k}`)}
          value={text[k]}
          onChange={(e) => setText({ ...text, [k]: e.target.value })}
          error={bad === k}
          helperText={bad === k ? t("admin.range.invalid") : t("admin.range.hint")}
          slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }}
          sx={{ width: 170 }}
        />
      ))}
      <Button type="submit" variant="outlined" sx={{ minHeight: 40 }}>
        {t("admin.range.apply")}
      </Button>
      {presets.map(([key, days]) => (
        <Button key={key} size="small" onClick={() => onChange(defaultRange(days))} sx={{ minHeight: 40 }}>
          {t(key)}
        </Button>
      ))}
    </Stack>
  );
}

export function CsvButton({ href }: { href: string }) {
  const t = useT();
  return (
    <Button component="a" href={href} variant="outlined" startIcon={<DownloadIcon />} download>
      {t("admin.common.csv")}
    </Button>
  );
}

// ---- audited writes ----

/**
 * A confirmation with a required reason (3–500 characters, saved in the audit log). `children` adds
 * fields above the reason; `ready` gates the confirm button on them.
 */
export function ReasonDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  ready = true,
  children,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  ready?: boolean;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const t = useT();
  const { handleError } = useAdmin();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const valid = reason.trim().length >= 3 && reason.length <= 500 && ready;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="reason-dialog-title">
      <DialogTitle id="reason-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {body}
          {children}
          <TextField
            label={t("admin.common.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            required
            helperText={t("admin.common.reasonHelp", { count: reason.length })}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} autoFocus>
          {t("admin.common.cancel")}
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          disabled={!valid || busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            onConfirm(reason.trim())
              .then(onClose)
              .catch((e: unknown) => {
                if (!handleError(e)) setError(errorText(t, e));
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? t("admin.common.saving") : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", py: 0.5, borderBottom: 1, borderColor: "divider" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ textAlign: "end" }}>
        {children}
      </Typography>
    </Stack>
  );
}

export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/**
 * An admin page: the shell, then the content once the admin is known, so every load below runs
 * signed in. `roles` hides the content (with a note) from roles the section isn't for.
 */
export function Screen({ children, roles }: { children: ReactNode; roles?: readonly string[] }) {
  const t = useT();
  const { status, admin } = useAdmin();
  const allowed = !roles || roles.length === 0 || (admin !== null && roles.includes(admin.role));
  return (
    <AdminShell mainId="main">
      <Page>
        {status !== "signedIn" ? (
          <Loading />
        ) : allowed ? (
          children
        ) : (
          <Alert severity="info" icon={<InfoIcon />}>
            {t("admin.common.noAccess")}
          </Alert>
        )}
      </Page>
    </AdminShell>
  );
}
