"use client";

import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import { digitsOnly, groupMobileNumber, isolate } from "@bg/i18n";
import type { OtpPurpose } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { ActionButton } from "@/components/forms/ActionButton";
import { OtpInput } from "@/components/forms/OtpInput";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { ChevronForwardIcon } from "@/components/icons";
import { retryAfter, toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import type { ResetFlow, SignupFlow } from "@/lib/flows";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { visuallyHidden } from "@/theme/layout";
import { AuthScreen } from "./AuthScreen";
import { useSupportContact } from "@/lib/config";

// SMS code step shared by signup (AU-03) and password reset (AU-08), auth.md §3.1 step 4, §6.3.
// - The single code input auto-submits on the 5th digit; "Verify" stays for keyboard users.
// - Validity and resend countdowns come from the server (`expires_in`, `resend_after`).
// - Wrong code: tries left, field cleared and refocused. No tries left or expired: the field is
//   disabled and "Get a new code" is the only action. Nothing auto-resends.
// - Offline: a complete code waits in the field and is checked when the connection returns.
// - Android WebOTP fills and submits the code when the SMS carries the origin-bound line.
// - If SMS gets switched off meanwhile, a resend answers `{sms: false, verification_token}` and
//   the flow continues without a code (register only).

const CODE_LENGTH = 5;

type CodeError = { kind: "invalid"; attempts: number } | { kind: "dead" } | { kind: "expired" };

type Flow = SignupFlow | ResetFlow;

interface FlowStore<T extends Flow> {
  read: () => T | null;
  patch: (value: Partial<T>) => T;
}

export interface CodeStepProps<T extends Flow> {
  purpose: OtpPurpose;
  store: FlowStore<T>;
  /** Where to go without a phone in this tab (direct open). */
  startHref: string;
  title: string;
  step: { current: number; total: number };
  /** "We sent a code to {phone}" (signup) or the neutral reset copy. */
  sentTo: (phone: string) => string;
  /** Extra links under the actions (reset: "No account? Create one"). */
  extra?: ReactNode;
  /** A verification token was issued (after a code, or directly when SMS is off). */
  onVerified: (token: string) => void;
}

interface NavigatorWithOtp {
  credentials?: { get: (options: unknown) => Promise<{ code?: string } | null> };
}

export function CodeStep<T extends Flow>({
  purpose,
  store,
  startHref,
  title,
  step,
  sentTo,
  extra,
  onVerified,
}: CodeStepProps<T>) {
  const t = useTranslations();
  const supportContact = useSupportContact(t("support.contact.fallback"));
  const f = useFormat();
  const router = useRouter();
  const online = useOnline();
  const errorText = useErrorText();

  const [flow, setFlow] = useState<T | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  const [actionError, setActionError] = useState<ErrorText | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [waitingOnline, setWaitingOnline] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const inputWrap = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const errorId = useId();

  useEffect(() => {
    const current = store.read();
    if (!current?.phone || current.sms !== true || !current.expiresAt) {
      // SMS off with a signup token in this tab: continue to the account step (auth.md §3.5.2 step 7).
      const smsOffToken = purpose === "register" && current?.sms === false && Boolean(current.token);
      router.replace(smsOffToken ? "/signup/account" : startHref);
      return;
    }
    setFlow(current);
    // Read once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expiresLeft = useCountdown(flow?.expiresAt);
  const resendLeft = useCountdown(flow?.resendAt);
  const rateLeft = useCountdown(rateLimitUntil);
  const expired = Boolean(flow) && expiresLeft === 0;
  const dead = codeError?.kind === "dead";
  const locked = expired || dead || codeError?.kind === "expired";

  const focusInput = () => inputWrap.current?.querySelector("input")?.focus();

  const verify = useCallback(
    async (value: string) => {
      if (!flow || verifying || value.length !== CODE_LENGTH) return;
      if (!navigator.onLine) {
        setWaitingOnline(true);
        return;
      }
      setWaitingOnline(false);
      setVerifying(true);
      setActionError(null);
      try {
        const res = await api.auth.verifyOtp(flow.phone, purpose, value);
        store.patch({ token: res.verification_token, tokenAt: Date.now() } as Partial<T>);
        onVerified(res.verification_token);
      } catch (error) {
        const e = toApiError(error);
        if (e.code === "AUTH_OTP_INVALID") {
          const left = typeof e.details.attempts_left === "number" ? e.details.attempts_left : 0;
          setCode("");
          setCodeError(left > 0 ? { kind: "invalid", attempts: left } : { kind: "dead" });
          if (left > 0) window.setTimeout(focusInput, 0);
        } else if (e.code === "AUTH_OTP_EXPIRED") {
          setCodeError({ kind: "expired" });
        } else {
          setActionError(errorText(e));
        }
        setVerifying(false);
      }
    },
    [flow, verifying, purpose, store, onVerified, errorText],
  );

  // A complete code typed while offline is checked when the connection returns.
  useEffect(() => {
    if (online && waitingOnline && code.length === CODE_LENGTH) void verify(code);
  }, [online, waitingOnline, code, verify]);

  // Android WebOTP (auth.md §6.3): fill and submit, aborted when leaving the screen.
  useEffect(() => {
    if (!flow || locked || !("OTPCredential" in window)) return;
    const controller = new AbortController();
    const nav = navigator as unknown as NavigatorWithOtp;
    nav.credentials
      ?.get({ otp: { transport: ["sms"] }, signal: controller.signal })
      .then((otp) => {
        const digits = digitsOnly(otp?.code ?? "").slice(0, CODE_LENGTH);
        if (digits.length === CODE_LENGTH) {
          setCode(digits);
          void verify(digits);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [flow, locked, verify]);

  const requestNewCode = async () => {
    if (!flow || sending || rateLeft > 0) return;
    setSending(true);
    setActionError(null);
    try {
      const res = await api.auth.requestOtp(flow.phone, purpose);
      const now = Date.now();
      if (!res.sms) {
        store.patch({ sms: false, token: res.verification_token, tokenAt: now } as Partial<T>);
        onVerified(res.verification_token);
        return;
      }
      const next = store.patch({
        sms: true,
        expiresAt: now + res.expires_in * 1000,
        resendAt: now + res.resend_after * 1000,
      } as Partial<T>);
      setFlow(next);
      setCode("");
      setCodeError(null);
      setAnnouncement(t("auth.verify.resent"));
      window.setTimeout(focusInput, 0);
    } catch (error) {
      const e = toApiError(error);
      if (e.code === "AUTH_OTP_RATE_LIMITED") {
        setRateLimitUntil(Date.now() + (retryAfter(e) ?? 60) * 1000);
        setActionError({ message: "" });
      } else setActionError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  if (!flow) return <AuthScreen title={title} pending>{null}</AuthScreen>;

  const phoneText = isolate(f.digits(groupMobileNumber(flow.phone)));
  const fieldError =
    codeError?.kind === "invalid"
      ? t("errors.auth.otpInvalid", { attempts: codeError.attempts })
      : dead
        ? t("auth.verify.noAttempts")
        : locked
          ? t("auth.verify.expired")
          : undefined;
  const rateLimited = rateLeft > 0;

  return (
    <AuthScreen
      title={title}
      step={step}
      backHref={startHref}
      focusHeading={false}
      onSubmit={() => void verify(code)}
      intro={sentTo(phoneText)}
    >
      <div ref={inputWrap}>
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (codeError?.kind === "invalid") setCodeError(null);
            if (v.length < CODE_LENGTH) setWaitingOnline(false);
          }}
          onComplete={(v) => void verify(v)}
          length={CODE_LENGTH}
          label={t("auth.verify.codeLabel")}
          error={fieldError}
          helperText={
            verifying
              ? t("auth.verify.verifying")
              : waitingOnline
                ? t("auth.verify.waitingOnline")
                : t("auth.verify.expiresIn", { time: `⁦${f.clock(expiresLeft)}⁩` })
          }
          disabled={locked || verifying}
          autoFocus
          name="code"
        />
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          {t("auth.verify.neverShare")}
        </Typography>
      </div>

      {actionError && (
        <div id={errorId}>
          {rateLimited ? (
            <Banner severity="error">
              <CountdownText seconds={rateLeft} clock={f.clock} render={(time) => t("errors.auth.otpRateLimited", { time })} />
            </Banner>
          ) : (
            actionError.message && (
              <Banner severity="error">
                {actionError.message}
                {actionError.code && (
                  <Typography variant="caption" component="span" sx={{ display: "block" }}>
                    <bdi>{t("common.errorCode", { code: actionError.code })}</bdi>
                  </Typography>
                )}
              </Banner>
            )
          )}
        </div>
      )}

      {locked ? (
        <ActionButton
          onClick={() => void requestNewCode()}
          loading={sending}
          disabledReason={!online ? t("net.offlineAction") : null}
          blockedBy={rateLimited ? errorId : null}
        >
          {t("auth.verify.newCode")}
        </ActionButton>
      ) : (
        <Stack spacing={1}>
          <ActionButton type="submit" loading={verifying} loadingLabel={t("auth.verify.verifying")}>
            {t("auth.verify.cta")}
          </ActionButton>
          {resendLeft > 0 ? (
            <Button variant="text" disabled fullWidth sx={{ fontVariantNumeric: "tabular-nums" }}>
              {t("auth.verify.resendIn", { time: `⁦${f.clock(resendLeft)}⁩` })}
            </Button>
          ) : (
            <ActionButton
              variant="text"
              size="medium"
              onClick={() => void requestNewCode()}
              loading={sending}
              disabledReason={!online ? t("net.offlineAction") : null}
              blockedBy={rateLimited ? errorId : null}
            >
              {t("auth.verify.resend")}
            </ActionButton>
          )}
        </Stack>
      )}

      <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
        <StandaloneLink href={startHref}>{t("auth.verify.changeNumber")}</StandaloneLink>
        {extra}
        <Button
          variant="text"
          color="inherit"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          aria-controls={helpId}
          // Down when collapsed, up when expanded (vertical, so it never mirrors).
          endIcon={<ChevronForwardIcon sx={{ transform: helpOpen ? "rotate(-90deg)" : "rotate(90deg)" }} />}
          sx={{ paddingInline: 0.5 }}
        >
          {t("auth.verify.help.title")}
        </Button>
        <Collapse in={helpOpen} id={helpId} sx={{ width: "100%" }}>
          <Typography component="ul" variant="body2" color="text.secondary" sx={{ m: 0, paddingInlineStart: 2.5, "& li": { mb: 0.75 } }}>
            <li>{t("auth.verify.help.checkNumber", { phone: phoneText })}</li>
            <li>{t("auth.verify.help.wait")}</li>
            <li>{t("auth.verify.help.blocked")}</li>
            <li>{t("auth.verify.help.support", { channel: isolate(supportContact) })}</li>
          </Typography>
        </Collapse>
      </Stack>
      <span role="status" style={visuallyHidden}>
        {announcement}
      </span>
    </AuthScreen>
  );
}
