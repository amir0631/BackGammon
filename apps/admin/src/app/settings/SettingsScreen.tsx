"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@bg/api-client";
import type { Locale } from "@bg/i18n";
import type { AdminSetting } from "@bg/protocol";
import { AdminShell, useOnline, visuallyHidden } from "@/components/AdminShell";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { CheckIcon, CopyIcon, EditIcon, HistoryIcon, ResetIcon } from "@/components/icons";
import { EditDialog, ResetDialog } from "@/components/SettingDialogs";
import { SmsCard } from "@/components/SmsCard";
import { useAdmin } from "@/lib/admin-context";
import { dateTime, formatValue, matchesSearch, num, rangeText, type Formatted, type T } from "@/lib/format";
import { groupSettings } from "@/lib/rules";

const other = (l: Locale): Locale => (l === "fa" ? "en" : "fa");

function Value({ f }: { f: Formatted }) {
  return (
    <Box>
      {f.chips && f.chips.length > 1 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {f.chips.map((c) => (
            <Chip key={c} size="small" variant="outlined" label={c} />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" dir={f.ltr ? "ltr" : undefined} sx={f.ltr ? { fontFamily: "monospace", textAlign: "start" } : undefined}>
          {f.text}
        </Typography>
      )}
      {f.secondary && (
        <Typography variant="caption" color="text.secondary">
          {f.secondary}
        </Typography>
      )}
    </Box>
  );
}

export function SettingsScreen() {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useSearchParams();
  const { admin, status, handleError } = useAdmin();
  const online = useOnline();

  const [rows, setRows] = useState<AdminSetting[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);
  const [forcedReadOnly, setForcedReadOnly] = useState(false);
  const [editing, setEditing] = useState<AdminSetting | null>(null);
  const [resetting, setResetting] = useState<AdminSetting | null>(null);
  const [history, setHistory] = useState<AdminSetting | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const returnFocus = useRef<string | null>(null);

  const q = params.get("q") ?? "";
  const group = params.get("group") ?? "";
  const onlyChanged = params.get("changed") === "1";
  const focusKey = params.get("key");

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    router.replace(s ? `/settings?${s}` : "/settings", { scroll: false });
  };

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.admin.settings();
      setRows(res.results);
      setLastLoaded(new Date().toISOString());
    } catch (error) {
      if (!handleError(error)) setLoadError(true);
    }
  }, [handleError]);

  useEffect(() => {
    if (status === "signedIn") void load();
  }, [status, load]);

  // Reload when the connection comes back (spec §5, reconnecting).
  useEffect(() => {
    if (online && rows) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    if (!focusKey || !rows) return;
    document.getElementById(`setting-${focusKey}`)?.scrollIntoView({ block: "center" });
  }, [focusKey, rows]);

  const all = useMemo(() => new Map((rows ?? []).map((r) => [r.key, r])), [rows]);
  const coinPrice = Number(all.get("coin.price_toman")?.value ?? 1000);
  const canEdit = admin?.role === "superadmin" && !forcedReadOnly;
  const canSeeSms = admin?.role === "superadmin" || admin?.role === "finance";
  const changedCount = rows?.filter((r) => !r.is_default).length ?? 0;

  const visible = useMemo(
    () => (rows ?? []).filter((r) => (!onlyChanged || !r.is_default) && (!group || r.group === group) && matchesSearch(r, q)),
    [rows, onlyChanged, group, q],
  );
  const groups = groupSettings(visible);
  const allGroups = groupSettings(rows ?? []);

  function saved(row: AdminSetting) {
    setRows((prev) => (prev ?? []).map((r) => (r.key === row.key ? row : r)));
    setEditing(null);
    setResetting(null);
    setSavedKey(row.key);
    setToast(t("admin.settings.savedToast", { key: row.key, value: formatValue(t, locale, row, row.value, coinPrice).text }));
    setTimeout(() => setSavedKey((k) => (k === row.key ? null : k)), 4000);
    setTimeout(() => document.getElementById(`edit-${row.key}`)?.focus(), 50);
  }
  const outcome = {
    onSaved: saved,
    onUnknown: () => {
      setEditing(null);
      setResetting(null);
      setScreenError(t("admin.settings.unknown"));
      void load();
    },
    onForbidden: () => {
      setEditing(null);
      setResetting(null);
      setForcedReadOnly(true);
    },
  };
  const closeDialog = () => {
    const key = returnFocus.current;
    setEditing(null);
    setResetting(null);
    setTimeout(() => key && document.getElementById(`edit-${key}`)?.focus(), 50);
  };

  const actions = (r: AdminSetting) =>
    canEdit ? (
      <Stack direction="row" spacing={0.5}>
        <Tooltip title={t("admin.settings.edit", { name: r.description[locale] })}>
          <span>
            <IconButton
              id={`edit-${r.key}`}
              onClick={() => {
                returnFocus.current = r.key;
                setEditing(r);
              }}
              disabled={!online}
              aria-label={t("admin.settings.edit", { name: r.description[locale] })}
            >
              <EditIcon />
            </IconButton>
          </span>
        </Tooltip>
        {!r.is_default && (
          <Tooltip title={t("admin.settings.reset", { name: r.description[locale] })}>
            <span>
              <IconButton
                onClick={() => {
                  returnFocus.current = r.key;
                  setResetting(r);
                }}
                disabled={!online}
                aria-label={t("admin.settings.reset", { name: r.description[locale] })}
              >
                <ResetIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Tooltip title={t("admin.settings.history", { name: r.description[locale] })}>
          <IconButton onClick={() => setHistory(r)} aria-label={t("admin.settings.history", { name: r.description[locale] })}>
            <HistoryIcon />
          </IconButton>
        </Tooltip>
      </Stack>
    ) : null;

  const statusChip = (r: AdminSetting) => (
    <Stack spacing={0.5} alignItems="flex-start">
      {r.is_default ? (
        <Chip size="small" variant="outlined" label={t("admin.settings.status.default")} />
      ) : (
        <Chip size="small" color="warning" variant="outlined" icon={<EditIcon />} label={t("admin.settings.status.changed")} />
      )}
      {savedKey === r.key && (
        <Chip size="small" color="success" icon={<CheckIcon />} label={t("admin.settings.saved")} />
      )}
    </Stack>
  );

  const nameCell = (r: AdminSetting) => (
    <Box>
      <Typography variant="body2" fontWeight={600}>
        {r.description[locale]}
      </Typography>
      <Typography variant="caption" color="text.secondary" lang={other(locale)} display="block">
        {r.description[other(locale)]}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="caption" component="code" dir="ltr" sx={{ fontFamily: "monospace" }}>
          {r.key}
        </Typography>
        <IconButton
          size="small"
          aria-label={t("admin.settings.copyKey", { key: r.key })}
          onClick={() => {
            void navigator.clipboard?.writeText(r.key);
            setToast(t("admin.settings.copied"));
          }}
        >
          <CopyIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Stack>
      {r.updated_by && r.updated_at && (
        <Typography variant="caption" color="text.secondary" display="block">
          {t("admin.settings.lastChanged", { admin: r.updated_by, time: dateTime(locale, r.updated_at) })}
        </Typography>
      )}
    </Box>
  );

  const fmt = (r: AdminSetting, v: unknown) => formatValue(t, locale, r, v, coinPrice);

  return (
    <AdminShell mainId="settings-main">
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: "auto" }}>
        <Typography variant="h4" component="h1">
          {t("admin.settings.title")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t("admin.settings.intro")}
        </Typography>
        {admin && !canEdit && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("admin.settings.readOnly")}
          </Alert>
        )}
        {screenError && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setScreenError(null)}>
            {screenError}
          </Alert>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }} useFlexGap flexWrap="wrap">
          <TextField
            size="small"
            label={t("admin.settings.search")}
            helperText={t("admin.settings.searchHelp")}
            value={q}
            onChange={(e) => setParam({ q: e.target.value })}
            sx={{ minWidth: { sm: 320 } }}
            type="search"
          />
          <FormControlLabel
            control={<Switch checked={onlyChanged} onChange={(e) => setParam({ changed: e.target.checked ? "1" : null })} />}
            label={t("admin.settings.onlyChanged", { count: num(locale, changedCount) })}
          />
          <TextField
            select
            size="small"
            label={t("admin.settings.groupIndex")}
            value={group}
            onChange={(e) => setParam({ group: e.target.value || null })}
            sx={{ minWidth: 200, display: { xl: "none" } }}
          >
            <MenuItem value="">{t("admin.settings.allGroups")}</MenuItem>
            {allGroups.map(([g, items]) => (
              <MenuItem key={g} value={g}>
                {t.has(`admin.settings.group.${g}`) ? t(`admin.settings.group.${g}`) : g} ({num(locale, items.length)})
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Box aria-live="polite" sx={visuallyHidden}>
          {rows && t("admin.settings.shown", { n: num(locale, visible.length) })}
        </Box>
        {!online && lastLoaded && (
          <Typography variant="caption" color="text.secondary">
            {t("admin.settings.lastLoaded", { time: dateTime(locale, lastLoaded) })}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
          <Box component="nav" aria-label={t("admin.settings.groupIndex")} sx={{ display: { xs: "none", xl: "block" }, width: 220, flexShrink: 0, position: "sticky", top: 80 }}>
            <Typography variant="overline">{t("admin.settings.groupIndex")}</Typography>
            <Stack component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
              {allGroups.map(([g, items]) => {
                const changed = items.filter((r) => !r.is_default).length;
                return (
                  <li key={g}>
                    <Button href={`#group-${g}`} size="small" sx={{ justifyContent: "flex-start", width: "100%" }}>
                      {t.has(`admin.settings.group.${g}`) ? t(`admin.settings.group.${g}`) : g} ({num(locale, items.length)})
                      {changed > 0 && ` · ${t("admin.settings.status.changed")} ${num(locale, changed)}`}
                    </Button>
                  </li>
                );
              })}
            </Stack>
          </Box>

          <Box sx={{ flexGrow: 1, minWidth: 0, containerType: "inline-size" }}>
            {loadError && (
              <Alert severity="error" action={<Button onClick={load}>{t("common.retry")}</Button>}>
                {t("admin.settings.loadError")}
              </Alert>
            )}
            {!rows && !loadError && <Skeleton variant="rounded" height={320} />}
            {rows && visible.length === 0 && (
              <Paper variant="outlined" sx={{ p: 3 }}>
                {q ? (
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography>{t("admin.settings.empty.search", { q })}</Typography>
                    <Button onClick={() => setParam({ q: null })}>{t("admin.settings.empty.clear")}</Button>
                  </Stack>
                ) : (
                  <Typography>{t("admin.settings.empty.noneChanged")}</Typography>
                )}
              </Paper>
            )}

            {groups.map(([g, items]) => (
              <Box component="section" key={g} id={`group-${g}`} aria-labelledby={`group-title-${g}`} sx={{ mb: 4, scrollMarginTop: 80 }}>
                <Typography id={`group-title-${g}`} variant="h5" component="h2" sx={{ mb: 1.5 }}>
                  {t.has(`admin.settings.group.${g}`) ? t(`admin.settings.group.${g}`) : g}
                </Typography>
                {g === "sms" && (
                  <SmsCard
                    canView={canSeeSms}
                    fromNumber={String(all.get("sms.from_number")?.value ?? "")}
                    lowCreditRial={Number(all.get("sms.low_credit_alert_rial")?.value ?? 0)}
                  />
                )}

                {/* Table when the content area is wide, cards otherwise (container query, survives 200% zoom). */}
                <Paper variant="outlined" sx={{ display: "none", "@container (min-width: 900px)": { display: "block" } }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {["setting", "current", "default", "allowed", "status"].map((c) => (
                          <TableCell key={c} scope="col">
                            {t(`admin.settings.col.${c}`)}
                          </TableCell>
                        ))}
                        {canEdit && <TableCell scope="col">{t("admin.settings.col.actions")}</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((r) => (
                        <TableRow
                          key={r.key}
                          id={`setting-${r.key}`}
                          sx={focusKey === r.key ? { outline: 2, outlineColor: "primary.main", outlineStyle: "solid" } : undefined}
                        >
                          <TableCell component="th" scope="row" sx={{ width: "32%" }}>
                            {nameCell(r)}
                          </TableCell>
                          <TableCell>
                            <Value f={fmt(r, r.value)} />
                          </TableCell>
                          <TableCell>
                            <Value f={fmt(r, r.default)} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{rangeText(t, locale, r)}</Typography>
                          </TableCell>
                          <TableCell>{statusChip(r)}</TableCell>
                          {canEdit && <TableCell>{actions(r)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>

                <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", p: 0, m: 0, "@container (min-width: 900px)": { display: "none" } }}>
                  {items.map((r) => (
                    <Paper component="li" variant="outlined" key={r.key} sx={{ p: 2 }}>
                      {nameCell(r)}
                      <Box sx={{ my: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {t("admin.settings.col.current")}
                        </Typography>
                        <Box sx={{ fontSize: 18 }}>
                          <Value f={fmt(r, r.value)} />
                        </Box>
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {t("admin.settings.col.default")}: {fmt(r, r.default).text} · {t("admin.settings.col.allowed")}: {rangeText(t, locale, r)}
                      </Typography>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                        {statusChip(r)}
                        {actions(r)}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {editing && <EditDialog setting={editing} all={all} coinPrice={coinPrice} onClose={closeDialog} {...outcome} />}
      {resetting && <ResetDialog setting={resetting} all={all} coinPrice={coinPrice} onClose={closeDialog} {...outcome} />}
      <HistoryDrawer setting={history} coinPrice={coinPrice} onClose={() => setHistory(null)} />
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} />
    </AdminShell>
  );
}
