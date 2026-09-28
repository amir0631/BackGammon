"use client";

import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@bg/api-client";
import { normalizeMobileNumber } from "@bg/i18n";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { ResetUnavailablePanel } from "@/components/auth/ResetUnavailablePanel";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { ActionButton } from "@/components/forms/ActionButton";
import { FieldError } from "@/components/forms/FieldText";
import { PhoneField } from "@/components/forms/PhoneField";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { retryAfter, toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { resetFlow } from "@/lib/flows";
import { safeNext } from "@/lib/nextPath";
import { nationalPhone } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { storageKeys, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";

// AU-07 Reset: phone `/password/reset` (auth.md §3.3 step 1). The answer is the same for any
// number (no enumeration). While SMS is off (`sms.enabled` false) the server answers 503
// SMS_UNAVAILABLE and the form is replaced in place by the AU-07U panel (§3.5.3), which explains
// that reset is unavailable and points to support. The panel is not stored: each visit starts
// with the form until a public mode flag exists.
// Signed-in users reach it from Settings → Change password (auth.md open question 6): the phone is
// prefilled from the account and the flow returns to `next`.

type FormError = { kind: "smsOff" } | { kind: "rateLimited"; until: number } | ({ kind: "message" } & ErrorText);

export function ResetPhoneScreen({ next }: { next: string | null }) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const online = useOnline();
  const errorText = useErrorText();
  const { status, me } = useSession();

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const safe = safeNext(next);

  // Prefill: typed on the login screen, or the signed-in account's own number.
  useEffect(() => {
    const flow = resetFlow.read();
    if (flow?.phone) setPhone(flow.phone);
  }, []);
  useEffect(() => {
    if (me && !phone) setPhone(nationalPhone(me.phone));
    // Only when the account arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const normalized = normalizeMobileNumber(phone);
  const rateLeft = useCountdown(formError?.kind === "rateLimited" ? formError.until : null);
  useEffect(() => {
    if (formError?.kind === "rateLimited" && rateLeft === 0) setFormError(null);
  }, [formError, rateLeft]);

  const submit = async () => {
    if (busy || !online || rateLeft > 0) return;
    if (!normalized) {
      setPhoneError(phone ? t("auth.phone.error.invalid") : t("auth.phone.error.required"));
      phoneRef.current?.focus();
      return;
    }
    setBusy(true);
    // "Try again" on the AU-07U panel keeps the panel until the answer arrives.
    setFormError((current) => (current?.kind === "smsOff" ? current : null));
    try {
      const res = await api.auth.requestOtp(normalized, "password_reset");
      const now = Date.now();
      if (res.sms) {
        resetFlow.write({
          phone: normalized,
          sms: true,
          expiresAt: now + res.expires_in * 1000,
          resendAt: now + res.resend_after * 1000,
          next: safe ?? undefined,
        });
        router.push("/password/reset/verify");
      } else {
        resetFlow.write({ phone: normalized, sms: false, token: res.verification_token, tokenAt: now, next: safe ?? undefined });
        router.push("/password/reset/new");
      }
    } catch (error) {
      const e = toApiError(error);
      if (e.code === "SMS_UNAVAILABLE") setFormError({ kind: "smsOff" });
      else if (e.code === "AUTH_OTP_RATE_LIMITED") setFormError({ kind: "rateLimited", until: Date.now() + (retryAfter(e) ?? 60) * 1000 });
      else if (e.code === "PHONE_INVALID" || e.code === "VALIDATION") {
        setPhoneError(t("auth.phone.error.invalid"));
        phoneRef.current?.focus();
      } else setFormError({ kind: "message", ...errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const signedIn = status === "user";

  return (
    <AuthScreen
      title={t("auth.reset.title")}
      step={{ current: 1, total: 3 }}
      intro={t("auth.reset.intro")}
      backHref={signedIn ? (safe ?? "/settings") : "/login"}
      onSubmit={() => void submit()}
      replaceWith={
        formError?.kind === "smsOff" ? (
          <ResetUnavailablePanel
            signedIn={signedIn}
            retrying={busy}
            offlineReason={!online ? t("net.offlineAction") : null}
            onRetry={() => void submit()}
            onBack={() => {
              if (signedIn) router.push(safe ?? "/settings");
              else {
                if (normalized) writeJson("session", storageKeys.loginPhone, normalized);
                router.push("/login");
              }
            }}
          />
        ) : undefined
      }
      footer={
        <>
          {formError && (
            <div id={errorId}>
                      {formError.kind === "rateLimited" && (
                <Banner severity="error">
                  <CountdownText seconds={rateLeft} clock={f.clock} render={(time) => t("errors.auth.otpRateLimited", { time })} />
                </Banner>
              )}
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
          <ActionButton
            type="submit"
            loading={busy}
            loadingLabel={t("auth.reset.sending")}
            disabledReason={!online ? t("net.offlineAction") : null}
            blockedBy={formError?.kind === "rateLimited" ? errorId : null}
          >
            {t("auth.reset.cta")}
          </ActionButton>
          {!signedIn && (
            <StandaloneLink href="/login" sx={{ alignSelf: "center" }}>
              {t("auth.reset.backToLogin")}
            </StandaloneLink>
          )}
        </>
      }
    >
      <PhoneField
        value={phone}
        onChange={(v) => {
          setPhone(v);
          if (phoneError) setPhoneError(null);
          resetFlow.patch({ phone: v });
        }}
        onBlur={() => phone && !normalizeMobileNumber(phone) && setPhoneError(t("auth.phone.error.invalid"))}
        inputRef={phoneRef}
        name="phone"
        label={t("auth.phone.label")}
        error={Boolean(phoneError)}
        helperText={phoneError ? <FieldError>{phoneError}</FieldError> : t("auth.phone.helper")}
      />
    </AuthScreen>
  );
}
