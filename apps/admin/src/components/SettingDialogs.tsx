"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiRequestError } from "@bg/api-client";
import type { Locale } from "@bg/i18n";
import type { AdminSetting } from "@bg/protocol";
import { ArrowIcon } from "@/components/icons";
import { SettingEditor } from "@/components/SettingEditors";
import { PatternStatusChip } from "@/components/SmsCard";
import { useAdmin } from "@/lib/admin-context";
import { formatValue, num, type T } from "@/lib/format";
import { impact, serverError, validate, warnings, type Message } from "@/lib/rules";

const REASON_MAX = 500;

function canonical(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  }
  return JSON.stringify(value);
}

export const sameValue = (a: unknown, b: unknown) => canonical(a) === canonical(b);

interface Outcome {
  onSaved: (row: AdminSetting) => void;
  onUnknown: () => void;
  onForbidden: () => void;
}

/** Resolves a rules.ts message; parameters naming settings or keys are rendered in the UI language. */
function useMessage(all: Map<string, AdminSetting>) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  return (m: Message): string => {
    const p: Record<string, string | number> = { ...m.params };
    for (const [k, v] of Object.entries(p)) {
      if (k === "rule" && typeof v === "string") p[k] = t(v);
      else if (typeof v === "number") p[k] = num(locale, v);
    }
    if (m.params?.minKey) p.minName = all.get(String(m.params.minKey))?.description[locale] ?? "";
    if (m.params?.maxKey) p.maxName = all.get(String(m.params.maxKey))?.description[locale] ?? "";
    if (m.params?.nameKey) p.name = all.get(String(m.params.nameKey))?.description[locale] ?? "";
    return t(m.key, p);
  };
}

function BeforeAfter({ before, after, caption }: { before: string; after: string; caption?: ReactNode }) {
  const t = useTranslations("admin.edit");
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: "wrap", my: 1 }}>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t("current")}
        </Typography>
        <Typography>{before}</Typography>
      </Box>
      <ArrowIcon aria-hidden />
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t("new")}
        </Typography>
        <Typography fontWeight={700}>{after}</Typography>
      </Box>
      {caption}
    </Stack>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <TextField
      label={t("admin.edit.reason")}
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, REASON_MAX))}
      multiline
      minRows={2}
      required
      fullWidth
      helperText={t("admin.edit.reasonCounter", { count: num(locale, value.length) })}
    />
  );
}

function useFullScreen() {
  return useMediaQuery("(max-width: 599px)");
}

/** AD-04: edit, then confirm with before → after, impact, warnings, acknowledgment, and reason. */
export function EditDialog({
  setting,
  all,
  coinPrice,
  onClose,
  ...outcome
}: { setting: AdminSetting; all: Map<string, AdminSetting>; coinPrice: number; onClose: () => void } & Outcome) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const message = useMessage(all);
  const { handleError } = useAdmin();
  const fullScreen = useFullScreen();
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [draft, setDraft] = useState<unknown>(setting.value);
  const [touched, setTouched] = useState(false);
  const [serverMsg, setServerMsg] = useState<Message | null>(null);
  const [reason, setReason] = useState("");
  const [acked, setAcked] = useState(false);
  const [patternStatus, setPatternStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [conflict, setConflict] = useState<unknown>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const error = validate(setting, draft) ?? serverMsg;
  const unchanged = sameValue(draft, setting.value);
  const isPattern = setting.key.startsWith("sms.pattern_");
  const effect = useMemo(() => impact(setting.key, setting.value, draft, all), [setting, draft, all]);
  const ackKey = effect.ack ?? (isPattern && patternStatus !== null && patternStatus !== "active" ? "admin.impact.patternAck" : null);
  const softWarnings = step === "confirm" ? warnings(setting.key, draft, all) : [];
  const show = (v: unknown) => {
    const f = formatValue(t, locale, setting, v, coinPrice);
    return [f.text, f.secondary].filter(Boolean).join(" · ");
  };

  useEffect(() => headingRef.current?.focus(), [step]);

  function review() {
    if (error || unchanged) return;
    setStep("confirm");
    setConflict(undefined);
    if (isPattern) {
      setPatternStatus(null);
      api.admin
        .smsPattern(String(draft))
        .then((r) => setPatternStatus(r.status))
        .catch(() => setPatternStatus("unknown"));
    }
  }

  async function save() {
    if (saving || !reason.trim() || (ackKey && !acked) || (isPattern && patternStatus === null)) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      outcome.onSaved(await api.admin.updateSetting(setting.key, draft, reason.trim(), setting.value));
    } catch (err) {
      if (handleError(err)) return;
      if (!(err instanceof ApiRequestError) || err.status === 0) {
        setSaveFailed(true);
        return;
      }
      const code = err.body.code;
      if (code === "SETTING_INVALID") {
        setServerMsg(serverError(setting, err.body.details?.reason));
        setStep("edit");
      } else if (code === "SETTING_CONFLICT") {
        setConflict(err.body.details?.current);
      } else if (code === "SETTING_UNKNOWN") {
        outcome.onUnknown();
      } else if (code === "ADMIN_FORBIDDEN") {
        outcome.onForbidden();
      } else {
        setSaveFailed(true);
      }
    } finally {
      setSaving(false);
    }
  }

  /** After a timeout the server may already have applied the change: re-read before resending. */
  async function tryAgain() {
    try {
      const rows = (await api.admin.settings()).results;
      const row = rows.find((r) => r.key === setting.key);
      if (row && sameValue(row.value, draft)) {
        outcome.onSaved(row);
        return;
      }
    } catch {
      // still offline: fall through to a normal save, which reports the failure again
    }
    await save();
  }

  const blockedReason =
    step === "edit"
      ? error
        ? t("admin.edit.invalid")
        : unchanged
          ? t("admin.edit.unchanged")
          : null
      : !reason.trim()
        ? t("admin.edit.reasonRequired")
        : ackKey && !acked
          ? t("admin.edit.ackRequired")
          : null;

  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
      disableEscapeKeyDown={saving}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      aria-labelledby="edit-title"
    >
      <DialogTitle id="edit-title" ref={headingRef} tabIndex={-1} sx={{ outline: "none" }}>
        <Typography variant="overline" color="text.secondary" component="span" display="block">
          {t(step === "edit" ? "admin.edit.step1" : "admin.edit.step2")}
        </Typography>
        {setting.description[locale]}
        <Typography variant="body2" color="text.secondary" component="span" display="block" dir="ltr" sx={{ fontFamily: "monospace", textAlign: "start" }}>
          {setting.key}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {step === "edit" ? (
          <Stack spacing={2}>
            <Typography variant="body2">
              {t("admin.edit.current")}: <strong>{show(setting.value)}</strong> · {t("admin.edit.default")}: {show(setting.default)}
            </Typography>
            <SettingEditor
              setting={setting}
              value={draft}
              onChange={(v) => {
                setDraft(v);
                setServerMsg(null);
                setTouched(true);
              }}
              error={touched && error ? message(error) : null}
              coinPrice={coinPrice}
              onEnter={review}
            />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <BeforeAfter before={show(setting.value)} after={show(draft)} />
            <Typography variant="body2" color="text.secondary">
              {t("admin.edit.default")}: {show(setting.default)}
              {sameValue(draft, setting.default) && ` — ${t("admin.edit.isDefault")}`}
            </Typography>
            {conflict !== undefined && (
              <Alert severity="error" role="alert">
                {t("admin.edit.conflict", { value: show(conflict) })}
              </Alert>
            )}
            {isPattern && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">{t("admin.edit.patternStatus")}:</Typography>
                {patternStatus === null ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("admin.edit.patternChecking")}
                  </Typography>
                ) : (
                  <PatternStatusChip status={patternStatus} />
                )}
              </Stack>
            )}
            {effect.notes.map((note) => (
              <Alert key={note.key} severity="info">
                {message(note)}
              </Alert>
            ))}
            {softWarnings.map((w, i) => (
              <Alert key={i} severity="warning" title={t("admin.edit.warning.title")}>
                {message(w)}
              </Alert>
            ))}
            {ackKey && (
              <FormControlLabel
                control={<Checkbox checked={acked} onChange={(e) => setAcked(e.target.checked)} />}
                label={t(ackKey)}
              />
            )}
            <ReasonField value={reason} onChange={setReason} />
            {saveFailed && (
              <Alert
                severity="error"
                role="alert"
                action={
                  <Button color="inherit" size="small" onClick={tryAgain}>
                    {t("admin.edit.tryAgain")}
                  </Button>
                }
              >
                {t("admin.edit.saveFailed")}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1, position: fullScreen ? "sticky" : "static", bottom: 0, bgcolor: "background.paper" }}>
        {blockedReason && (
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
            {blockedReason}
          </Typography>
        )}
        {step === "edit" ? (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="contained" onClick={review} disabled={Boolean(error) || unchanged}>
              {t("admin.edit.review")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep("edit")} disabled={saving}>
              {t("admin.edit.back")}
            </Button>
            <Button
              variant="contained"
              onClick={save}
              disabled={Boolean(blockedReason) || saving || conflict !== undefined || (isPattern && patternStatus === null)}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {saving ? t("admin.edit.saving") : t("admin.edit.save")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** AD-05: current → default, impact, acknowledgment, and reason. Cancel has initial focus. */
export function ResetDialog({
  setting,
  all,
  coinPrice,
  onClose,
  ...outcome
}: { setting: AdminSetting; all: Map<string, AdminSetting>; coinPrice: number; onClose: () => void } & Outcome) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const message = useMessage(all);
  const { handleError } = useAdmin();
  const fullScreen = useFullScreen();
  const [reason, setReason] = useState("");
  const [acked, setAcked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const effect = impact(setting.key, setting.value, setting.default, all);
  const show = (v: unknown) => formatValue(t, locale, setting, v, coinPrice).text;
  const blocked = !reason.trim() || (effect.ack !== null && !acked);

  async function reset() {
    if (blocked || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      outcome.onSaved(await api.admin.resetSetting(setting.key, reason.trim(), setting.value));
    } catch (err) {
      if (handleError(err)) return;
      if (err instanceof ApiRequestError && err.body.code === "SETTING_CONFLICT") {
        setFailed(t("admin.edit.conflict", { value: show(err.body.details?.current) }));
      } else if (err instanceof ApiRequestError && err.body.code === "SETTING_UNKNOWN") {
        outcome.onUnknown();
      } else if (err instanceof ApiRequestError && err.body.code === "ADMIN_FORBIDDEN") {
        outcome.onForbidden();
      } else {
        setFailed(t("admin.edit.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen} aria-labelledby="reset-title">
      <DialogTitle id="reset-title">{t("admin.reset.title", { name: setting.description[locale] })}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <BeforeAfter before={show(setting.value)} after={show(setting.default)} />
          {effect.notes.map((note) => (
            <Alert key={note.key} severity="info">
              {message(note)}
            </Alert>
          ))}
          {effect.ack && (
            <FormControlLabel control={<Checkbox checked={acked} onChange={(e) => setAcked(e.target.checked)} />} label={t(effect.ack)} />
          )}
          <ReasonField value={reason} onChange={setReason} />
          {failed && (
            <Alert severity="error" role="alert">
              {failed}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} autoFocus disabled={saving}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={reset}
          disabled={blocked || saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t("admin.reset.cta")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
