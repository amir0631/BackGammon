"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@bg/api-client";
import { normalizeMobileNumber } from "@bg/i18n";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BannedPanel } from "@/components/auth/BannedPanel";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { ActionButton } from "@/components/forms/ActionButton";
import { FieldError } from "@/components/forms/FieldText";
import { PasswordField } from "@/components/forms/PasswordField";
import { PhoneField } from "@/components/forms/PhoneField";
import { PromptLink, StandaloneLink } from "@/components/forms/StandaloneLink";
import { retryAfter, toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { resetFlow } from "@/lib/flows";
import { useCompleteSignIn, useGuestOnly } from "@/lib/session";
import { readJson, removeKey, storageKeys, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { visuallyHidden } from "@/theme/layout";

// AU-06 Login `/login` (auth.md §3.2, §4). Phone + password in a real <form> (password managers,
// Enter submits). Wrong credentials never say which part was wrong. The lock countdown survives a
// reload. A banned account (AUTH_BANNED, only after the password matched) replaces the form with
// the AU-14 panel.

interface Lock {
  phone: string;
  until: number;
}

type FormError = ({ kind: "message" } & ErrorText) | { kind: "locked" };

export function LoginScreen({ next, banned: bannedOnArrival = false }: { next: string | null; banned?: boolean }) {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const errorText = useErrorText();
  const completeSignIn = useCompleteSignIn();
  const [completing, setCompleting] = useState(false);
  const ready = useGuestOnly(next, !completing);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [banned, setBanned] = useState(bannedOnArrival);
  const [lock, setLock] = useState<Lock | null>(null);
  const [lockEnded, setLockEnded] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // Phone handed over by "Log in with this number" (in memory, never in the URL), and a lock that
  // survived a reload.
  useEffect(() => {
    const handed = readJson<string>("session", storageKeys.loginPhone);
    if (handed) {
      setPhone(handed);
      removeKey("session", storageKeys.loginPhone);
    }
    const stored = readJson<Lock>("session", storageKeys.loginLock);
    if (stored && stored.until > Date.now()) {
      setLock(stored);
      if (!handed) setPhone(stored.phone);
      setFormError({ kind: "locked" });
    }
  }, []);

  const normalized = normalizeMobileNumber(phone);
  const activeLock = lock && normalized === lock.phone ? lock : null;
  const lockLeft = useCountdown(activeLock?.until);

  useEffect(() => {
    if (activeLock && lockLeft === 0) {
      setLock(null);
      setLockEnded(true);
      setFormError(null);
      removeKey("session", storageKeys.loginLock);
    }
  }, [activeLock, lockLeft]);

  const validate = (): boolean => {
    let ok = true;
    if (!phone) {
      setPhoneError(t("auth.phone.error.required"));
      ok = false;
    } else if (!normalized) {
      setPhoneError(t("auth.phone.error.invalid"));
      ok = false;
    } else setPhoneError(null);
    if (!password) {
      setPasswordError(t("auth.password.error.required"));
      ok = false;
    } else setPasswordError(null);
    if (!ok) {
      if (!phone || !normalized) phoneRef.current?.focus();
      else passwordRef.current?.focus();
    }
    return ok;
  };

  const submit = async () => {
    if (busy || !online || (activeLock && lockLeft > 0)) return;
    setLockEnded(false);
    if (!validate() || !normalized) return;
    setBusy(true);
    setFormError(null);
    try {
      const me = await api.auth.login(normalized, password);
      removeKey("session", storageKeys.loginLock);
      setCompleting(true);
      completeSignIn(me, next);
    } catch (error) {
      const e = toApiError(error);
      setPassword("");
      if (e.code === "AUTH_BANNED") {
        setBanned(true);
      } else if (e.code === "AUTH_LOCKED") {
        const seconds = retryAfter(e) ?? 900;
        const nextLock = { phone: normalized, until: Date.now() + seconds * 1000 };
        writeJson("session", storageKeys.loginLock, nextLock);
        setLock(nextLock);
        setFormError({ kind: "locked" });
      } else if (e.code === "PHONE_INVALID" || e.code === "VALIDATION") {
        setPhoneError(t("auth.phone.error.invalid"));
        phoneRef.current?.focus();
      } else {
        setFormError({ kind: "message", ...errorText(e) });
        passwordRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <AuthScreen title={t("auth.login.title")} pending>{null}</AuthScreen>;

  const locked = Boolean(activeLock && lockLeft > 0);

  return (
    <AuthScreen
      title={t("auth.login.title")}
      onSubmit={() => void submit()}
      replaceWith={
        banned ? (
          <BannedPanel
            onBack={() => {
              setBanned(false);
              setPhone("");
              setPassword("");
              setFormError(null);
            }}
          />
        ) : undefined
      }
      footer={
        <>
          {formError && (
            <div id={errorId}>
              {formError.kind === "locked" && activeLock ? (
                <Banner
                  severity="error"
                  action={{
                    label: t("auth.login.lockedReset"),
                    href: "/password/reset",
                    onClick: () => resetFlow.patch({ phone: normalized ?? phone }),
                  }}
                >
                  <CountdownText
                    seconds={lockLeft}
                    clock={f.clock}
                    render={(time) => t("errors.auth.locked", { time })}
                  />
                </Banner>
              ) : formError.kind === "message" ? (
                <Banner severity="error">
                  {formError.message}
                  {formError.code && (
                    <Typography variant="caption" component="span" sx={{ display: "block" }}>
                      <bdi>{t("common.errorCode", { code: formError.code })}</bdi>
                    </Typography>
                  )}
                </Banner>
              ) : null}
            </div>
          )}
          <span role="status" style={visuallyHidden}>
            {lockEnded ? t("auth.login.lockEnded") : ""}
          </span>
          <ActionButton
            type="submit"
            loading={busy}
            loadingLabel={t("auth.login.loggingIn")}
            disabledReason={!online ? t("net.offlineAction") : null}
            blockedBy={locked ? errorId : null}
          >
            {t("auth.login.cta")}
          </ActionButton>
          <Stack sx={{ alignItems: "center" }}>
            <StandaloneLink
              href="/password/reset"
              onClick={() => resetFlow.patch({ phone: normalized ?? phone })}
            >
              {t("auth.login.forgot")}
            </StandaloneLink>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {t.rich("auth.login.noAccount", {
                signup: (chunks) => (
                  <PromptLink href="/signup">{chunks}</PromptLink>
                ),
              })}
            </Typography>
          </Stack>
        </>
      }
    >
      <PhoneField
        value={phone}
        onChange={(v) => {
          setPhone(v);
          if (phoneError) setPhoneError(null);
        }}
        onBlur={() => phone && !normalizeMobileNumber(phone) && setPhoneError(t("auth.phone.error.invalid"))}
        inputRef={phoneRef}
        name="phone"
        error={Boolean(phoneError)}
        helperText={phoneError ? <FieldError>{phoneError}</FieldError> : undefined}
      />
      <PasswordField
        autoComplete="current-password"
        name="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (passwordError) setPasswordError(null);
        }}
        inputRef={passwordRef}
        error={Boolean(passwordError)}
        helperText={passwordError ? <FieldError>{passwordError}</FieldError> : undefined}
      />
    </AuthScreen>
  );
}
