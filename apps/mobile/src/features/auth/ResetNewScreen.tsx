"use client";

import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@bg/api-client";
import { iconSize } from "@bg/design-tokens";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BannedPanel } from "@/components/auth/BannedPanel";
import { Banner } from "@/components/feedback/Banner";
import { useToast } from "@/components/feedback/Toast";
import { ActionButton } from "@/components/forms/ActionButton";
import { FieldError } from "@/components/forms/FieldText";
import { PasswordField } from "@/components/forms/PasswordField";
import { InfoIcon } from "@/components/icons";
import { toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { hasToken, resetFlow, type ResetFlow } from "@/lib/flows";
import { useCompleteSignIn } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";
import { passwordRules } from "./validation";

// AU-09 Reset: new password `/password/reset/new` (auth.md §3.3 step 3). Success signs the user in
// here and signs out every other device (§12.1), with a snackbar saying so. A banned account gets
// the AU-14 panel and no session.

type FormError = { kind: "verification" } | { kind: "smsOff" } | ({ kind: "message" } & ErrorText);

export function ResetNewScreen() {
  const t = useTranslations();
  const router = useRouter();
  const online = useOnline();
  const toast = useToast();
  const errorText = useErrorText();
  const completeSignIn = useCompleteSignIn();

  const [flow, setFlow] = useState<ResetFlow | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [common, setCommon] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [banned, setBanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const errorId = useId();

  useEffect(() => {
    const current = resetFlow.read();
    if (!hasToken(current)) {
      router.replace("/password/reset");
      return;
    }
    setFlow(current);
    // Read once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rules = passwordRules(password, common);

  const sendNewCode = async () => {
    if (!flow || busy) return;
    setBusy(true);
    try {
      const res = await api.auth.requestOtp(flow.phone, "password_reset");
      const now = Date.now();
      if (res.sms) {
        resetFlow.patch({ sms: true, token: undefined, tokenAt: undefined, expiresAt: now + res.expires_in * 1000, resendAt: now + res.resend_after * 1000 });
        router.push("/password/reset/verify");
      } else {
        setFlow(resetFlow.patch({ token: res.verification_token, tokenAt: now }));
        setFormError(null);
      }
    } catch (error) {
      const e = toApiError(error);
      if (e.code === "SMS_UNAVAILABLE") setFormError({ kind: "smsOff" });
      // A rate limit here needs no countdown of its own: the user can retry from the code step.
      else setFormError({ kind: "message", ...errorText(e.code === "AUTH_OTP_RATE_LIMITED" ? { ...e, message_key: "errors.throttled" } : e) });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!flow?.token || busy || !online) return;
    if (!password || rules.some((r) => r.met === false)) {
      setPasswordError(password ? t("errors.auth.passwordWeak") : t("auth.password.error.required"));
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const me = await api.auth.resetPassword(flow.token, password);
      const next = flow.next;
      resetFlow.clear();
      toast.show({ message: t("auth.reset.done") });
      completeSignIn(me, next);
    } catch (error) {
      const e = toApiError(error);
      if (e.code === "PASSWORD_WEAK") {
        const failed = Array.isArray(e.details.rules) ? (e.details.rules as string[]) : [];
        setCommon(failed.includes("password_too_common"));
        setPasswordError(t("errors.auth.passwordWeak"));
        setPassword("");
        passwordRef.current?.focus();
      } else if (e.code === "AUTH_VERIFICATION_INVALID") setFormError({ kind: "verification" });
      else if (e.code === "AUTH_BANNED") {
        resetFlow.clear();
        setBanned(true);
      } else setFormError({ kind: "message", ...errorText(e) });
      setBusy(false);
    }
  };

  const title = t("auth.reset.new.title");
  if (!flow) return <AuthScreen title={title} pending>{null}</AuthScreen>;

  return (
    <AuthScreen
      title={title}
      step={{ current: 3, total: 3 }}
      backHref="/password/reset"
      onSubmit={() => void submit()}
      replaceWith={banned ? <BannedPanel onBack={() => router.replace("/login")} /> : undefined}
      footer={
        <>
          {formError && (
            <div id={errorId}>
              {formError.kind === "verification" && (
                <Banner severity="error" action={{ label: t("auth.verification.sendNew"), onClick: () => void sendNewCode() }}>
                  {t("auth.verification.expired")}
                </Banner>
              )}
              {formError.kind === "smsOff" && <Banner severity="info">{t("errors.auth.smsUnavailable")}</Banner>}
              {formError.kind === "message" && (
                <Banner severity="error">
                  {formError.message}
                  {formError.code && (
                    <Typography variant="caption" component="span" sx={{ display: "block" }}>
                      <bdi>{t("common.errorCode", { code: formError.code })}</bdi>
                    </Typography>
                  )}
                </Banner>
              )}
            </div>
          )}
          <Typography
            id={noteId}
            variant="body2"
            color="text.secondary"
            sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}
          >
            <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
            <span>{t("auth.reset.new.note")}</span>
          </Typography>
          <ActionButton
            type="submit"
            loading={busy}
            loadingLabel={t("auth.reset.new.saving")}
            disabledReason={!online ? t("net.offlineAction") : null}
            blockedBy={formError?.kind === "verification" ? errorId : null}
            aria-describedby={noteId}
          >
            {t("auth.reset.new.cta")}
          </ActionButton>
        </>
      }
    >
      <PasswordField
        autoComplete="new-password"
        name="new-password"
        label={t("auth.password.newLabel")}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setCommon(false);
          if (passwordError) setPasswordError(null);
        }}
        inputRef={passwordRef}
        error={Boolean(passwordError)}
        helperText={passwordError ? <FieldError>{passwordError}</FieldError> : undefined}
        requirements={rules.map((r) => ({ label: t(`auth.password.rules.${r.key}`), met: r.met }))}
      />
      {/* Hidden username field so password managers file the new password under this account. */}
      <input type="text" name="username" autoComplete="username" value={flow.phone} readOnly hidden />
    </AuthScreen>
  );
}
