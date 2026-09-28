"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "@bg/api-client";
import type { Locale } from "@bg/i18n";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { safeNext, useAdmin } from "@/lib/admin-context";
import { clock, normalizeDigits } from "@/lib/format";

type Failure = { kind: "invalid" } | { kind: "locked"; until: number } | { kind: "network" } | { kind: "generic" };

export function LoginForm() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useSearchParams();
  const { signedIn, handleError } = useAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const passwordRef = useRef<HTMLInputElement>(null);

  const lockedSeconds = failure?.kind === "locked" ? Math.max(0, Math.ceil((failure.until - now) / 1000)) : 0;
  useEffect(() => {
    if (failure?.kind !== "locked") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [failure]);

  const normalizedCode = normalizeDigits(code).replace(/\D/g, "").slice(0, 6);
  const complete = username.trim() !== "" && password !== "" && normalizedCode.length === 6;
  const canSubmit = complete && !busy && lockedSeconds === 0 && (typeof navigator === "undefined" || navigator.onLine);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    try {
      const me = await api.admin.login(username.trim(), password, normalizedCode);
      signedIn(me);
      router.replace(safeNext(params.get("next")));
    } catch (error) {
      setCode("");
      if (handleError(error)) return;
      if (error instanceof ApiRequestError && error.status === 0) {
        setFailure({ kind: "network" });
      } else if (error instanceof ApiRequestError && error.body.code === "ADMIN_LOCKED") {
        const retry = Number(error.body.details?.retry_after ?? 0);
        setNow(Date.now());
        setFailure({ kind: "locked", until: Date.now() + retry * 1000 });
        setPassword("");
      } else if (error instanceof ApiRequestError && error.body.code === "ADMIN_INVALID_CREDENTIALS") {
        setFailure({ kind: "invalid" });
        setFailedOnce(true);
        setPassword("");
        passwordRef.current?.focus();
      } else {
        setFailure({ kind: "generic" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="main" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <Box sx={{ position: "absolute", insetBlockStart: 16, insetInlineEnd: 16 }}>
        <LanguageSwitch />
      </Box>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Stack component="form" spacing={2.5} onSubmit={submit} noValidate>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {t("app.name")} · {t("admin.title")}
            </Typography>
            <Typography variant="h5" component="h1">
              {t("admin.login.title")}
            </Typography>
          </Box>
          <TextField
            label={t("admin.login.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            slotProps={{ htmlInput: { dir: "ltr", autoCapitalize: "off", spellCheck: false } }}
          />
          <TextField
            label={t("admin.login.password")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            inputRef={passwordRef}
            slotProps={{
              htmlInput: { dir: "ltr" },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-label={t(showPassword ? "admin.login.hide" : "admin.login.show")}
                      edge="end"
                      size="small"
                    >
                      <Typography variant="caption" component="span">
                        {t(showPassword ? "admin.login.hide" : "admin.login.show")}
                      </Typography>
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            label={t("admin.login.totp")}
            value={code}
            onChange={(e) => setCode(normalizeDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            helperText={failedOnce ? t("admin.login.totpHelp") : undefined}
            slotProps={{
              htmlInput: { dir: "ltr", inputMode: "numeric", maxLength: 6, style: { letterSpacing: "0.4em" } },
            }}
          />
          <Box aria-live="assertive">
            {failure?.kind === "invalid" && <Alert severity="error">{t("errors.admin.invalidCredentials")}</Alert>}
            {failure?.kind === "locked" && lockedSeconds > 0 && (
              <Alert severity="error">{t("errors.admin.locked", { time: clock(locale, lockedSeconds) })}</Alert>
            )}
            {failure?.kind === "network" && <Alert severity="error">{t("errors.network")}</Alert>}
            {failure?.kind === "generic" && <Alert severity="error">{t("errors.generic")}</Alert>}
          </Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={!canSubmit}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {busy ? t("admin.login.signingIn") : t("admin.login.cta")}
          </Button>
          {!complete && !busy && (
            <Typography variant="caption" color="text.secondary" textAlign="center">
              {t("admin.login.disabled")}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            {t("admin.login.help")}
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
