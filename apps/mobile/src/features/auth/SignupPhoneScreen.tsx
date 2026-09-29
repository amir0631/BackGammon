"use client";

import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@bg/api-client";
import { normalizeMobileNumber } from "@bg/i18n";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { ActionButton } from "@/components/forms/ActionButton";
import { CheckboxField, FieldError } from "@/components/forms/FieldText";
import { PhoneField } from "@/components/forms/PhoneField";
import { PromptLink, StandaloneLink } from "@/components/forms/StandaloneLink";
import { retryAfter, toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { hasLiveCode, signupFlow, VERIFICATION_TTL_MS } from "@/lib/flows";
import { useGuestOnly } from "@/lib/session";
import { storageKeys, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";

// AU-02 Signup: phone, 18+, terms `/signup` (auth.md §3.1 steps 2–3).
// Both consents start unticked and are separate checkboxes. The primary action stays aria-disabled
// with a visible reason until the number is valid and both boxes are ticked.
// SMS mode (auth.md §3.5): `POST auth/otp` answers either `{sms: true, …}` (code step AU-03 next)
// or `{sms: false, verification_token}` (straight to AU-04). There is no public mode flag yet, so
// this screen uses mode-neutral copy: "Step 1", the phone note, and "Continue" (§3.5.1). Coming
// back with the same phone and an SMS-off token under 10 minutes old goes straight to AU-04
// without a new request (§3.5.2 step 5).

export function SignupPhoneScreen() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const online = useOnline();
  const errorText = useErrorText();
  const ready = useGuestOnly(null);

  const [phone, setPhone] = useState("");
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [formError, setFormError] = useState<ErrorText | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [liveCode, setLiveCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // Back from a later step keeps every entry (auth.md §4 AU-02).
  useEffect(() => {
    const flow = signupFlow.read();
    if (!flow) return;
    setPhone(flow.phone);
    setAge(flow.age);
    setTerms(flow.terms);
    setLiveCode(hasLiveCode(flow));
    if (flow.ageError) setAgeError(t("auth.signup.ageError"));
    // Restore once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalized = normalizeMobileNumber(phone);
  const rateLeft = useCountdown(rateLimitUntil);
  const rateLimited = rateLeft > 0;

  useEffect(() => {
    if (rateLimitUntil && rateLeft === 0) {
      setRateLimitUntil(null);
      setFormError(null);
    }
  }, [rateLimitUntil, rateLeft]);

  const persist = (patch: { phone?: string; age?: boolean; terms?: boolean }) => {
    const stored = signupFlow.read();
    const nextPhone = patch.phone ?? phone;
    // A different number invalidates a token issued for the old one.
    const dropToken = stored?.token && normalizeMobileNumber(nextPhone) !== stored.phone;
    return signupFlow.patch({
      phone,
      age,
      terms,
      ...patch,
      ageError: false,
      ...(dropToken ? { token: undefined, tokenAt: undefined } : {}),
    });
  };

  const disabledReason = !online
    ? t("net.offlineAction")
    : !normalized
      ? t("auth.signup.disabled.phone")
      : !age || !terms
        ? t("auth.signup.disabled.checks")
        : null;

  /** Reveal every field error and focus the first invalid field. */
  const showErrors = () => {
    const phoneMsg = !phone ? t("auth.phone.error.required") : !normalized ? t("auth.phone.error.invalid") : null;
    setPhoneError(phoneMsg);
    setAgeError(age ? null : t("auth.signup.ageError"));
    setTermsError(terms ? null : t("auth.signup.termsError"));
    if (phoneMsg) phoneRef.current?.focus();
    else if (!age) ageRef.current?.focus();
    else if (!terms) termsRef.current?.focus();
  };

  const submit = async () => {
    if (busy || rateLimited) return;
    if (disabledReason) {
      if (online) showErrors();
      return;
    }
    if (!normalized) return;
    const stored = signupFlow.read();
    if (
      stored?.sms === false &&
      stored.token &&
      stored.phone === normalized &&
      stored.tokenAt &&
      Date.now() - stored.tokenAt < VERIFICATION_TTL_MS
    ) {
      signupFlow.patch({ age, terms, ageError: false });
      router.push("/signup/account");
      return;
    }
    setBusy(true);
    setFormError(null);
    setPhoneTaken(false);
    try {
      const res = await api.auth.requestOtp(normalized, "register");
      const now = Date.now();
      if (res.sms) {
        signupFlow.patch({
          phone: normalized,
          age,
          terms,
          ageError: false,
          sms: true,
          expiresAt: now + res.expires_in * 1000,
          resendAt: now + res.resend_after * 1000,
          token: undefined,
          tokenAt: undefined,
        });
        router.push("/signup/verify");
      } else {
        signupFlow.patch({
          phone: normalized,
          age,
          terms,
          ageError: false,
          sms: false,
          token: res.verification_token,
          tokenAt: now,
          expiresAt: undefined,
          resendAt: undefined,
        });
        router.push("/signup/account");
      }
    } catch (error) {
      const e = toApiError(error);
      if (e.code === "AUTH_PHONE_TAKEN") {
        setPhoneTaken(true);
        setPhoneError(t("errors.auth.phoneTaken"));
        phoneRef.current?.focus();
      } else if (e.code === "PHONE_INVALID" || e.code === "VALIDATION") {
        setPhoneError(t("auth.phone.error.invalid"));
        phoneRef.current?.focus();
      } else if (e.code === "AUTH_OTP_RATE_LIMITED") {
        setRateLimitUntil(Date.now() + (retryAfter(e) ?? 60) * 1000);
        setLiveCode(hasLiveCode(signupFlow.read()));
        setFormError({ message: "" });
      } else {
        setFormError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const step = { current: 1 };

  if (!ready) return <AuthScreen title={t("auth.signup.title")} pending>{null}</AuthScreen>;

  return (
    <AuthScreen
      title={t("auth.signup.title")}
      step={step}
      backHref="/"
      onSubmit={() => void submit()}
      footer={
        <>
          {formError && (
            <div id={errorId}>
              {rateLimited ? (
                <Banner
                  severity="error"
                  action={liveCode ? { label: t("auth.signup.haveCode"), href: "/signup/verify" } : undefined}
                >
                  <CountdownText
                    seconds={rateLeft}
                    clock={f.clock}
                    render={(time) => t("errors.auth.otpRateLimited", { time })}
                  />
                </Banner>
              ) : (
                formError.message && (
                  <Banner severity="error">
                    {formError.message}
                    {formError.code && (
                      <Typography variant="caption" component="span" sx={{ display: "block" }}>
                        <bdi>{t("common.errorCode", { code: formError.code })}</bdi>
                      </Typography>
                    )}
                  </Banner>
                )
              )}
            </div>
          )}
          <ActionButton
            type="submit"
            loading={busy}
            loadingLabel={t("auth.signup.sending")}
            disabledReason={disabledReason}
            blockedBy={rateLimited ? errorId : null}
            onBlockedClick={showErrors}
          >
            {t("auth.signup.ctaNeutral")}
          </ActionButton>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            {t.rich("auth.signup.haveAccount", {
              login: (chunks) => (
                <PromptLink href="/login">{chunks}</PromptLink>
              ),
            })}
          </Typography>
        </>
      }
    >
      <div>
        <PhoneField
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setPhoneTaken(false);
            if (phoneError) setPhoneError(null);
            persist({ phone: v });
          }}
          onBlur={() => phone && !normalizeMobileNumber(phone) && setPhoneError(t("auth.phone.error.invalid"))}
          inputRef={phoneRef}
          name="phone"
          label={t("auth.phone.label")}
          error={Boolean(phoneError)}
          helperText={phoneError ? <FieldError>{phoneError}</FieldError> : t("auth.phone.helper")}
        />
        {phoneTaken && (
          <Stack sx={{ alignItems: "flex-start", mt: 0.5 }}>
            <StandaloneLink href="/login" onClick={() => writeJson("session", storageKeys.loginPhone, normalized)}>
              {t("auth.signup.loginWithNumber")}
            </StandaloneLink>
          </Stack>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {t("auth.signup.phoneNote")}
        </Typography>
      </div>
      <Stack spacing={0.5}>
        <CheckboxField
          ref={ageRef}
          checked={age}
          onChange={(v) => {
            setAge(v);
            if (v) setAgeError(null);
            persist({ age: v });
          }}
          label={t("auth.signup.ageLabel")}
          error={ageError}
        />
        <CheckboxField
          ref={termsRef}
          checked={terms}
          onChange={(v) => {
            setTerms(v);
            if (v) setTermsError(null);
            persist({ terms: v });
          }}
          label={t.rich("auth.signup.terms", {
            terms: (chunks) => (
              <Link component={NextLink} href="/terms">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link component={NextLink} href="/privacy">
                {chunks}
              </Link>
            ),
          })}
          error={termsError}
        />
      </Stack>
    </AuthScreen>
  );
}
