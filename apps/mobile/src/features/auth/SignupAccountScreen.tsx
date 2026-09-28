"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { api, passwordRules, usernameProblem, type UsernameProblem } from "@bg/api-client";
import { iconSize } from "@bg/design-tokens";
import { groupMobileNumber } from "@bg/i18n";
import type { UsernameAvailability } from "@bg/protocol";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { ActionButton } from "@/components/forms/ActionButton";
import { FieldError, FieldSuccess } from "@/components/forms/FieldText";
import { PasswordField } from "@/components/forms/PasswordField";
import { CloseIcon, InfoIcon } from "@/components/icons";
import { retryAfter, toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { hasToken, referral, signupFlow, type SignupFlow } from "@/lib/flows";
import { useGuestOnly, useSession } from "@/lib/session";
import { storageKeys, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";

// AU-04 Signup: account details `/signup/account` (auth.md §3.1 step 5, §4).
// Username (LTR, format check after the first blur, live availability check), password with the
// rule checklist visible before typing, optional referrer prefilled from `?ref=`. The referrer never
// blocks signup: "not found" is a field error with a Clear button.

type FormError =
  | { kind: "verification" }
  | { kind: "phoneTaken" }
  | { kind: "rateLimited"; until: number }
  | ({ kind: "message" } & ErrorText);

type Availability = { state: "idle" | "checking" | "available" } | { state: "unavailable"; reason: UsernameAvailability["reason"] };

const AVAILABILITY_DEBOUNCE_MS = 450;

export function SignupAccountScreen() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const online = useOnline();
  const errorText = useErrorText();
  const session = useSession();
  const [completing, setCompleting] = useState(false);
  const ready = useGuestOnly(null, !completing);

  const [flow, setFlow] = useState<SignupFlow | null>(null);
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameServerError, setUsernameServerError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordCommon, setPasswordCommon] = useState(false);
  const [referrer, setReferrer] = useState("");
  const [referrerError, setReferrerError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const referrerRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const headingId = useId();

  useEffect(() => {
    const current = signupFlow.read();
    if (!hasToken(current)) {
      router.replace("/signup");
      return;
    }
    setFlow(current);
    setUsername(current.username ?? "");
    setReferrer(current.referrer ?? referral.read());
    // Read once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problem: UsernameProblem | null = usernameProblem(username);
  // Persian/Arabic letters: hint right away that usernames use English letters (no transliteration).
  const hasPersian = /[\u0600-\u06FF\u0750-\u077F]/.test(username);
  const showFormat = usernameTouched && problem !== null;

  // Live availability check once the format is valid (patterns.md §12).
  useEffect(() => {
    if (problem !== null) {
      setAvailability({ state: "idle" });
      return;
    }
    setAvailability({ state: "checking" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.auth
        .usernameAvailable(username, { signal: controller.signal })
        .then((res) =>
          setAvailability(res.available ? { state: "available" } : { state: "unavailable", reason: res.reason }),
        )
        .catch(() => setAvailability({ state: "idle" }));
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [username, problem]);

  const rateLeft = useCountdown(formError?.kind === "rateLimited" ? formError.until : null);
  useEffect(() => {
    if (formError?.kind === "rateLimited" && rateLeft === 0) setFormError({ kind: "verification" });
  }, [formError, rateLeft]);

  const usernameMessage = (): { error?: string; ok?: string; checking?: boolean } => {
    if (usernameServerError) return { error: usernameServerError };
    if (showFormat && problem) return { error: t(`auth.username.error.${problem}`) };
    if (availability.state === "unavailable") {
      return {
        error:
          availability.reason === "taken"
            ? t("errors.auth.usernameTaken")
            : t(`errors.auth.usernameInvalidReason.${availability.reason === "reserved" || availability.reason === "profanity" ? availability.reason : "format"}`),
      };
    }
    if (availability.state === "available") return { ok: t("auth.username.available") };
    if (availability.state === "checking") return { checking: true };
    return {};
  };

  const rules = passwordRules(password, passwordCommon);
  const persist = (patch: Partial<SignupFlow>) => signupFlow.patch(patch);

  /**
   * The verification token expired. SMS on: a new code (AU-03), then back here with the password
   * cleared. SMS off: one tap renews the token and re-submits with the same entries (§3.5.2 step 4).
   */
  const renew = async () => {
    if (!flow || busy) return;
    setBusy(true);
    try {
      const res = await api.auth.requestOtp(flow.phone, "register");
      const now = Date.now();
      if (!res.sms) {
        const next = persist({ sms: false, token: res.verification_token, tokenAt: now });
        setFlow(next);
        setFormError(null);
        setBusy(false);
        await submit(res.verification_token);
        return;
      }
      setPassword("");
      persist({
        sms: true,
        token: undefined,
        tokenAt: undefined,
        expiresAt: now + res.expires_in * 1000,
        resendAt: now + res.resend_after * 1000,
      });
      router.push("/signup/verify");
    } catch (error) {
      const e = toApiError(error);
      if (e.code === "AUTH_OTP_RATE_LIMITED") setFormError({ kind: "rateLimited", until: Date.now() + (retryAfter(e) ?? 60) * 1000 });
      else if (e.code === "AUTH_PHONE_TAKEN") setFormError({ kind: "phoneTaken" });
      else setFormError({ kind: "message", ...errorText(e) });
    }
    setBusy(false);
  };

  const submit = async (tokenOverride?: string) => {
    const token = tokenOverride ?? flow?.token;
    if (!flow || !token || (busy && !tokenOverride) || !online) return;
    setUsernameTouched(true);
    const clientUsername = problem ? t(`auth.username.error.${problem}`) : null;
    const clientPassword = !password
      ? t("auth.password.error.required")
      : rules.some((r) => r.met === false)
        ? t("errors.auth.passwordWeak")
        : null;
    setPasswordError(clientPassword);
    if (clientUsername || clientPassword) {
      (clientUsername ? usernameRef : passwordRef).current?.focus();
      return;
    }

    setBusy(true);
    setFormError(null);
    setUsernameServerError(null);
    setReferrerError(null);
    const cleanReferrer = referrer.trim();
    try {
      const me = await api.auth.register({
        verification_token: token,
        username: username.trim(),
        password,
        age_confirmed: flow.age === true,
        ...(cleanReferrer ? { referrer: cleanReferrer } : {}),
        lang: f.locale,
      });
      referral.clear();
      signupFlow.clear();
      setCompleting(true);
      session.signIn(me);
      router.replace("/signup/avatar");
    } catch (error) {
      const e = toApiError(error);
      switch (e.code) {
        case "USERNAME_TAKEN":
          setUsernameServerError(t("errors.auth.usernameTaken"));
          usernameRef.current?.focus();
          break;
        case "USERNAME_INVALID": {
          const reason = e.details.reason;
          setUsernameServerError(
            reason === "format" || reason === "reserved" || reason === "profanity"
              ? t(`errors.auth.usernameInvalidReason.${reason}`)
              : t("errors.auth.usernameInvalid"),
          );
          usernameRef.current?.focus();
          break;
        }
        case "PASSWORD_WEAK": {
          const failed = Array.isArray(e.details.rules) ? (e.details.rules as string[]) : [];
          setPasswordCommon(failed.includes("password_too_common"));
          setPasswordError(t("errors.auth.passwordWeak"));
          setPassword("");
          passwordRef.current?.focus();
          break;
        }
        case "REFERRER_NOT_FOUND":
          setReferrerError(t("errors.auth.referrerNotFound"));
          referrerRef.current?.focus();
          break;
        case "AUTH_VERIFICATION_INVALID":
          setFormError({ kind: "verification" });
          break;
        case "AUTH_PHONE_TAKEN":
          setFormError({ kind: "phoneTaken" });
          break;
        case "AGE_NOT_CONFIRMED":
          persist({ ageError: true });
          router.replace("/signup");
          break;
        default:
          setFormError({ kind: "message", ...errorText(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  const smsOff = flow?.sms === false;
  const step = smsOff ? { current: 2, total: 2 } : { current: 3, total: 3 };
  const title = t("auth.account.title");

  if (!ready || !flow) return <AuthScreen title={title} pending>{null}</AuthScreen>;

  const u = usernameMessage();

  return (
    <AuthScreen
      title={title}
      step={step}
      backHref={smsOff ? "/signup" : "/signup/verify"}
      onSubmit={() => void submit()}
      headingId={headingId}
      footer={
        <>
          {formError && (
            <div id={errorId}>
              {formError.kind === "verification" && (
                <Banner
                  severity="error"
                  action={{ label: smsOff ? t("auth.verification.renew") : t("auth.verification.sendNew"), onClick: () => void renew() }}
                >
                  {smsOff ? t("auth.verification.expiredNoSms") : t("auth.verification.expired")}
                </Banner>
              )}
              {formError.kind === "rateLimited" && (
                <Banner severity="error">
                  <CountdownText seconds={rateLeft} clock={f.clock} render={(time) => t("errors.auth.otpRateLimited", { time })} />
                </Banner>
              )}
              {formError.kind === "phoneTaken" && (
                <Banner
                  severity="error"
                  action={{
                    label: t("auth.signup.loginWithNumber"),
                    href: "/login",
                    onClick: () => writeJson("session", storageKeys.loginPhone, flow.phone),
                  }}
                >
                  {t("errors.auth.phoneTaken")}
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
            loadingLabel={t("auth.account.creating")}
            disabledReason={!online ? t("net.offlineAction") : null}
            blockedBy={formError?.kind === "verification" || formError?.kind === "rateLimited" ? errorId : null}
          >
            {t("auth.account.cta")}
          </ActionButton>
        </>
      }
    >
      {smsOff && (
        <div>
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1 }}>
            <Typography sx={{ flex: "1 1 auto" }}>
              {t("auth.account.phoneLine", { phone: `\u2066${f.digits(groupMobileNumber(flow.phone))}\u2069` })}
            </Typography>
            <Button component={NextLink} href="/signup" aria-label={t("auth.account.changePhoneLabel")}>
              {t("auth.account.changePhone")}
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {t("auth.account.phoneCheck")}
          </Typography>
        </div>
      )}
      <TextField
        inputRef={usernameRef}
        name="username"
        label={t("auth.username.label")}
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setUsernameServerError(null);
          persist({ username: e.target.value });
        }}
        onBlur={() => username && setUsernameTouched(true)}
        error={Boolean(u.error)}
        autoComplete="username"
        slotProps={{
          htmlInput: {
            dir: "ltr",
            autoCapitalize: "off",
            autoCorrect: "off",
            spellCheck: false,
            maxLength: 20,
            "aria-invalid": Boolean(u.error) || undefined,
          },
          formHelperText: { component: "div" } as object,
        }}
        helperText={
          <>
            {u.error ? (
              <FieldError>{u.error}</FieldError>
            ) : u.ok ? (
              <FieldSuccess>{u.ok}</FieldSuccess>
            ) : u.checking ? (
              <span>{t("auth.username.checking")}</span>
            ) : null}
            {hasPersian && (
              <Typography component="span" variant="caption" role="status" sx={{ display: "flex", gap: 0.5, mt: 0.5, color: "text.primary" }}>
                <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
                {t("auth.username.latinHint")}
              </Typography>
            )}
            <Box component="span" sx={{ display: "block", mt: u.error || u.ok || u.checking || hasPersian ? 0.5 : 0 }}>
              {t("auth.username.helper")}
            </Box>
          </>
        }
      />
      <PasswordField
        autoComplete="new-password"
        name="new-password"
        label={t("auth.password.label")}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setPasswordCommon(false);
          if (passwordError) setPasswordError(null);
        }}
        inputRef={passwordRef}
        error={Boolean(passwordError)}
        helperText={passwordError ? <FieldError>{passwordError}</FieldError> : undefined}
        requirements={rules.map((r) => ({ label: t(`auth.password.rules.${r.key}`), met: r.met }))}
      />
      <TextField
        inputRef={referrerRef}
        name="referrer"
        label={t("auth.referrer.label")}
        value={referrer}
        onChange={(e) => {
          setReferrer(e.target.value);
          setReferrerError(null);
          persist({ referrer: e.target.value });
        }}
        error={Boolean(referrerError)}
        autoComplete="off"
        helperText={referrerError ? <FieldError>{referrerError}</FieldError> : t("auth.referrer.helper")}
        slotProps={{
          htmlInput: { dir: "ltr", autoCapitalize: "off", autoCorrect: "off", spellCheck: false, maxLength: 40 },
          input: {
            endAdornment: referrer ? (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  aria-label={t("auth.referrer.clear")}
                  onClick={() => {
                    setReferrer("");
                    setReferrerError(null);
                    persist({ referrer: "" });
                    referrerRef.current?.focus();
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
    </AuthScreen>
  );
}
