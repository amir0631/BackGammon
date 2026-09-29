"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  amountProblem,
  api,
  feeFor,
  newIdempotencyKey,
  parseAmount,
  type AmountProblem,
  type AmountRules,
} from "@bg/api-client";
import { isolate } from "@bg/i18n";
import type { WalletSummary } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { CountdownText } from "@/components/feedback/CountdownText";
import { SlowNotice, useSlowRequest } from "@/components/feedback/SlowNotice";
import { TaskFlow } from "@/components/flow/TaskFlow";
import { ActionButton } from "@/components/forms/ActionButton";
import { OtpInput } from "@/components/forms/OtpInput";
import { FieldError } from "@/components/forms/FieldText";
import { PasswordField } from "@/components/forms/PasswordField";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { ClockIcon, LockIcon } from "@/components/icons";
import { CostBlock } from "@/components/money/CostBlock";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { AmountField } from "@/components/wallet/AmountField";
import { BankAccountCard } from "@/components/wallet/BankAccount";
import { InfoLine } from "@/components/wallet/InfoLine";
import { retryAfter, toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { readJson, removeKey, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFlowSteps } from "@/lib/useFlowSteps";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { visuallyHidden } from "@/theme/layout";
import { BankAccountBody } from "./BankAccountBody";
import { useBankAccountEditor } from "./BankAccountEditor";
import {
  detailNumber,
  detailString,
  isPasswordLocked,
  isWrongPassword,
  passwordLock,
  useAmountErrorText,
  useWalletFormat,
} from "./shared";
import { canGoBackInApp } from "@/lib/inAppNav";



// Withdraw `/wallet/withdraw` (wallet.md §3.6, WD-01 … WD-05, WD-10; CLAUDE.md §7.12).
// - WD-01 replaces step 1 when nothing can be withdrawn (welcome coins only, below the minimum,
//   24-hour limit) or the account is under review. Suspended accounts may withdraw (§12.1).
// - Confirmation follows `withdraw.confirm`: SMS mode has 4 steps (bank, amount, review, code);
//   password mode (SMS off) has 3 and never promises a text message (§18).
// - One Idempotency-Key per amount, created when the review is first shown and kept across
//   retries and code resends. "Check status" re-sends the same body with the same key.
// - Success replaces the flow with the new request's detail, so Back never re-enters the flow.

const STORE = "bg.wallet.withdraw";
const CODE_LENGTH = 5;

interface Stored {
  amount: string;
  key: string | null;
  keyFor: string | null;
  /** SMS mode: when the current code expires and when another may be requested (epoch ms). */
  expiresAt?: number;
  resendAt?: number;
}

const EMPTY: Stored = { amount: "", key: null, keyFor: null };

type Unavailable = "bonus" | "belowMin" | "limit" | "blocked";

function unavailable(s: WalletSummary): Unavailable | null {
  if (s.withdrawable < s.withdraw.min && s.bonus_locked > 0) return "bonus";
  if (s.withdrawable < s.withdraw.min) return "belowMin";
  if (s.withdraw.remaining < s.withdraw.min) return "limit";
  return null;
}

function rulesOf(s: WalletSummary): AmountRules {
  return {
    min: s.withdraw.min,
    balance: s.balance,
    movable: s.withdrawable,
    bonusLocked: s.bonus_locked,
    remaining: s.withdraw.remaining,
    dailyMax: s.withdraw.daily_max,
    nextAvailableAt: s.withdraw.next_available_at,
  };
}

type CodeError = { kind: "invalid"; attempts: number } | { kind: "dead" } | { kind: "expired" };

export function WithdrawScreen() {
  const t = useTranslations();
  const f = useWalletFormat();
  const router = useRouter();
  const online = useOnline();
  const { me, reload: reloadMe, handleAuthError } = useSession();
  const wallet = useWallet();
  const errorText = useErrorText();
  const amountText = useAmountErrorText("withdraw");
  const bank = useBankAccountEditor();

  const [stored, setStored] = useState<Stored>(() => readJson<Stored>("session", STORE) ?? EMPTY);
  const [hadOrigin] = useState(() => canGoBackInApp());
  const [ready, setReady] = useState(false);
  const [amountShown, setAmountShown] = useState(false);
  const [serverAmountError, setServerAmountError] = useState<string | null>(null);
  const [bankNotice, setBankNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<"smsOff" | "modeChanged" | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState<number | null>(() => passwordLock.read("withdraw"));
  const [actionError, setActionError] = useState<(ErrorText & { retry?: () => void }) | null>(null);
  const [rateUntil, setRateUntil] = useState<number | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [forced, setForced] = useState<Unavailable | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [hintSeen, setHintSeen] = useState(true);
  const passwordRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [previewAnnounce, setPreviewAnnounce] = useState("");
  const firing = useRef(false);
  const rateId = useId();

  const save = useCallback((patch: Partial<Stored>) => {
    setStored((prev) => {
      const next = { ...prev, ...patch };
      writeJson("session", STORE, next);
      return next;
    });
  }, []);

  const summary = wallet.summary;
  const mode = summary?.withdraw.confirm ?? "password";
  const total = mode === "sms" ? 4 : 3;
  const dirty = Boolean(stored.amount.trim() || bank.digits);
  const locked = inFlight || uncertain;

  const flow = useFlowSteps({
    locked,
    onLeaveAttempt: () => {
      if (dirty) {
        setDiscardOpen(true);
        return true;
      }
      return false;
    },
    canRestore: (step) => (step >= 3 ? parseAmount(stored.amount) !== "empty" : true) && step <= 3,
  });

  useEffect(() => {
    void Promise.all([wallet.refresh(), reloadMe()]).finally(() => setReady(true));
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hintKey = me ? `bg.wallet.withdrawHintSeen.${me.id}` : null;
  useEffect(() => {
    if (hintKey) setHintSeen(Boolean(readJson<boolean>("local", hintKey)));
  }, [hintKey]);

  const blockedBy = forced ?? (summary ? unavailable(summary) : null);

  // ---- Amount ------------------------------------------------------------------------------------
  const problem: AmountProblem | null = summary ? amountProblem(stored.amount, rulesOf(summary)) : { kind: "required" };
  const amount = parseAmount(stored.amount);
  const amountValue = typeof amount === "number" ? amount : 0;
  const fee = summary ? feeFor(amountValue, summary.withdraw.fee_pct) : 0;
  const payoutToman = summary ? (amountValue - fee) * summary.coin_price_toman : 0;
  const amountError = serverAmountError ?? (amountShown && problem ? amountText(problem) : null);
  const maxAmount = summary ? Math.min(summary.withdrawable, summary.withdraw.remaining) : 0;

  // ---- Countdowns -----------------------------------------------------------------------------------
  const lockSeconds = useCountdown(lockUntil);
  const rateSeconds = useCountdown(rateUntil);
  const expiresLeft = useCountdown(stored.expiresAt);
  const resendLeft = useCountdown(stored.resendAt);
  useEffect(() => {
    if (lockUntil && lockSeconds === 0) {
      passwordLock.clear("withdraw");
      setLockUntil(null);
    }
  }, [lockSeconds, lockUntil]);

  useEffect(() => {
    if (flow.step !== 3) {
      setPassword("");
      setPasswordError(null);
    }
    if (flow.step !== 4) {
      setCode("");
      setCodeError(null);
    }
    setActionError(null);
  }, [flow.step]);

  // ---- Navigation ---------------------------------------------------------------------------------
  const leave = () => {
    removeKey("session", STORE);
    flow.exit(() => (hadOrigin ? router.back() : router.replace("/wallet")));
  };

  const close = () => {
    if (locked) return;
    if (blockedBy || !dirty) leave();
    else setDiscardOpen(true);
  };

  const goReview = () => {
    setAmountShown(true);
    setServerAmountError(null);
    if (problem || typeof amount !== "number") return;
    if (stored.keyFor !== String(amount)) save({ key: newIdempotencyKey(), keyFor: String(amount) });
    flow.next(3);
  };

  const backToAmount = (text: string) => {
    setServerAmountError(text);
    flow.back(2);
  };

  /** Server amount refusals → WD-03 with the field error (§3.9). */
  const amountRefusal = async (codeName: string, d: Record<string, unknown>): Promise<boolean> => {
    if (!["WITHDRAW_BELOW_MIN", "WITHDRAW_LIMIT", "WITHDRAW_NOT_WITHDRAWABLE", "AMOUNT_INVALID"].includes(codeName)) return false;
    const s = (await wallet.refresh()) ?? summary;
    let text: string;
    if (codeName === "AMOUNT_INVALID") text = amountText({ kind: "invalid" });
    else if (codeName === "WITHDRAW_BELOW_MIN") text = amountText({ kind: "belowMin", min: detailNumber(d, "min") ?? s?.withdraw.min ?? 0 });
    else if (codeName === "WITHDRAW_LIMIT")
      text = amountText({
        kind: "limit",
        remaining: detailNumber(d, "remaining") ?? s?.withdraw.remaining ?? 0,
        max: s?.withdraw.daily_max ?? 0,
        next: detailString(d, "next_available_at") ?? s?.withdraw.next_available_at ?? null,
      });
    else text = amountText({ kind: "notMovable", movable: detailNumber(d, "withdrawable") ?? s?.withdrawable ?? 0, bonus: s?.bonus_locked ?? 0 });
    backToAmount(text);
    return true;
  };

  // ---- SMS code request (WD-04 in SMS mode) --------------------------------------------------------
  const requestCode = async () => {
    if (sendingCode || rateSeconds > 0 || !online) return;
    setSendingCode(true);
    setActionError(null);
    try {
      // Re-validate first: the amount must still pass before a code is sent (§3.6 step 4.6).
      const fresh = await wallet.refresh();
      if (fresh) {
        if (fresh.withdraw.confirm === "password") {
          setModeNotice("modeChanged");
          return;
        }
        const p = amountProblem(stored.amount, rulesOf(fresh));
        if (p) {
          backToAmount(amountText(p));
          return;
        }
      }
      const res = await api.wallet.requestWithdrawalCode();
      const now = Date.now();
      const expiresIn = "expires_in" in res ? res.expires_in : 120;
      const resendAfter = "resend_after" in res ? res.resend_after : 60;
      save({ expiresAt: now + expiresIn * 1000, resendAt: now + resendAfter * 1000 });
      setCode("");
      setCodeError(null);
      if (flow.step !== 4) flow.next(4);
    } catch (error) {
      if (handleAuthError(error)) return;
      const e = toApiError(error);
      if (e.code === "AUTH_OTP_RATE_LIMITED") {
        setRateUntil(Date.now() + (retryAfter(e) ?? 60) * 1000);
      } else if (e.code === "SMS_UNAVAILABLE") {
        const fresh = await wallet.refresh();
        if (fresh?.withdraw.confirm === "password") {
          setModeNotice("smsOff");
          if (flow.step === 4) flow.back(3);
        } else {
          setActionError({ message: t("errors.auth.smsUnavailable"), retry: () => void requestCode() });
        }
      } else if (e.code === "NETWORK") {
        setActionError({ message: t("errors.network"), retry: () => void requestCode() });
      } else {
        setActionError(errorText(e));
      }
    } finally {
      setSendingCode(false);
    }
  };

  // ---- Submit ---------------------------------------------------------------------------------------
  const submit = async (codeValue?: string) => {
    if (firing.current || typeof amount !== "number" || !stored.key) return;
    const confirm = mode === "sms" ? { code: codeValue ?? code } : { password };
    if (mode === "password" && !password) {
      setPasswordError(t("withdraw.review.disabled"));
      passwordRef.current?.focus();
      return;
    }
    if (mode === "sms" && (codeValue ?? code).length !== CODE_LENGTH) return;
    if (lockSeconds > 0 || !online) return;
    firing.current = true;
    setInFlight(true);
    setActionError(null);
    setPasswordError(null);
    try {
      const created = await api.wallet.withdraw(amount, confirm, stored.key);
      removeKey("session", STORE);
      passwordLock.clear("withdraw");
      setUncertain(false);
      void wallet.refresh();
      flow.exit(() => router.replace(`/wallet/withdrawals/${created.id}?submitted=1`));
    } catch (error) {
      if (handleAuthError(error)) return;
      const e = toApiError(error);
      const d = e.details;
      if (e.code === "NETWORK") {
        setUncertain(true);
        return;
      }
      setUncertain(false);
      if (await amountRefusal(e.code, d)) return;
      if (isWrongPassword(e.code)) {
        setPassword("");
        setPasswordError(t("wallet.password.wrong"));
        window.setTimeout(() => passwordRef.current?.focus(), 0);
      } else if (isPasswordLocked(e.code)) {
        const seconds = detailNumber(d, "retry_after") ?? 60;
        passwordLock.set("withdraw", seconds);
        setLockUntil(Date.now() + seconds * 1000);
        setPassword("");
      } else if (e.code === "AUTH_OTP_INVALID") {
        const left = detailNumber(d, "attempts_left") ?? 0;
        setCode("");
        setCodeError(left > 0 ? { kind: "invalid", attempts: left } : { kind: "dead" });
      } else if (e.code === "AUTH_OTP_EXPIRED" || e.code === "AUTH_VERIFICATION_INVALID") {
        setCodeError({ kind: "expired" });
      } else if (e.code === "NO_BANK_ACCOUNT") {
        setBankNotice(t("errors.wallet.noBankAccount"));
        bank.reload();
        flow.back(1);
      } else if (e.code === "WITHDRAW_UNDER_REVIEW") {
        setForced("blocked");
      } else if (e.code === "VALIDATION" && d.fields && typeof d.fields === "object" && ("code" in d.fields || "password" in d.fields)) {
        // The confirmation mode changed between GET wallet and submit (§3.6 step 9).
        await wallet.refresh();
        setModeNotice("modeChanged");
        if (flow.step === 4) flow.back(3);
      } else {
        setActionError(errorText(e));
      }
    } finally {
      firing.current = false;
      setInFlight(false);
    }
  };

  const slow = useSlowRequest(inFlight);

  const discard = (
    <ConfirmDialog
      open={discardOpen}
      onCancel={() => setDiscardOpen(false)}
      onConfirm={() => {
        setDiscardOpen(false);
        leave();
      }}
      title={t("withdraw.discard.title")}
      confirmLabel={t("withdraw.discard.confirm")}
      cancelLabel={t("withdraw.discard.keep")}
    >
      {t("withdraw.discard.body")}
    </ConfirmDialog>
  );

  const flowTitle = t("withdraw.title");
  const offlineReason = online ? null : t("net.offlineAction");

  const errorBanner = actionError && (
    <Banner severity="error" action={actionError.retry ? { label: t("common.retry"), onClick: actionError.retry } : undefined}>
      {actionError.message}
      {actionError.code && (
        <Typography variant="caption" component="p">
          <bdi>{t("common.errorCode", { code: actionError.code })}</bdi>
        </Typography>
      )}
    </Banner>
  );

  // ---- Loading, load error, WD-01 -------------------------------------------------------------------
  if (ready && !summary) {
    return (
      <TaskFlow plain flowTitle={flowTitle} title={flowTitle} stepKey="load-error" onClose={close}>
        <ErrorState kind={online ? "error" : "offline"} message={online ? t("wallet.loadError") : t("net.offline")} onRetry={() => void wallet.refresh()} />
      </TaskFlow>
    );
  }
  if (!ready || !summary || !me) {
    return (
      <TaskFlow plain flowTitle={flowTitle} title={flowTitle} stepKey="loading" onClose={close}>
        <LoadingState variant="cards" rows={1} />
      </TaskFlow>
    );
  }

  if (blockedBy) {
    const s = summary;
    const title =
      blockedBy === "bonus"
        ? t("withdraw.unavailable.bonus.title")
        : blockedBy === "belowMin"
          ? t("withdraw.unavailable.belowMin.title")
          : blockedBy === "limit"
            ? t("withdraw.unavailable.limit.title")
            : t("withdraw.unavailable.blockedTitle");
    return (
      <TaskFlow
        plain
        flowTitle={flowTitle}
        title={title}
        stepKey={`unavailable-${blockedBy}`}
        onClose={close}
        footer={
          <Button variant="contained" size="large" fullWidth onClick={() => router.replace("/wallet")}>
            {t("wallet.backToWallet")}
          </Button>
        }
      >
        {blockedBy === "bonus" && (
          <>
            <Typography sx={{ fontWeight: 600 }}>
              {t("withdraw.unavailable.bonus.line", { withdrawable: f.number(s.withdrawable), balance: f.number(s.balance) })}
            </Typography>
            <Typography color="text.secondary">{t("withdraw.unavailable.bonus.body")}</Typography>
          </>
        )}
        {blockedBy === "belowMin" && (
          <>
            <Typography color="text.secondary">
              {t("withdraw.unavailable.belowMin.body", { min: f.number(s.withdraw.min), amount: f.number(s.withdrawable) })}
            </Typography>
            {s.locked > 0 && <InfoLine>{t("withdraw.unavailable.onHoldNote")}</InfoLine>}
          </>
        )}
        {blockedBy === "limit" && (
          <>
            <Typography color="text.secondary">
              {t("withdraw.unavailable.limit.body", {
                time: isolate(s.withdraw.next_available_at ? f.windowTime(s.withdraw.next_available_at) : "—"),
              })}
            </Typography>
            <StandaloneLink href="/wallet/withdrawals">{t("withdrawals.title")}</StandaloneLink>
          </>
        )}
        {blockedBy === "blocked" && <Typography color="text.secondary">{t("withdraw.unavailable.blocked")}</Typography>}
      </TaskFlow>
    );
  }

  const stepper = (current: number) => ({ current, total });

  // ---- WD-02 bank account ----------------------------------------------------------------------------
  if (flow.step === 1) {
    const needsSave = bank.load.kind === "ok" && bank.editing;
    const continueFlow = async () => {
      setBankNotice(null);
      if (bank.load.kind !== "ok") return;
      if (needsSave) {
        if (!online) return;
        if (await bank.save()) flow.next(2);
      } else if (bank.account) flow.next(2);
    };
    return (
      <>
        <TaskFlow
          flowTitle={flowTitle}
          title={t("withdraw.bank.title")}
          step={stepper(1)}
          stepKey="bank"
          onClose={close}
          onSubmit={() => void continueFlow()}
          footer={
            <ActionButton
              type="submit"
              loading={bank.saving}
              loadingLabel={t("bank.saving")}
              disabledReason={bank.load.kind !== "ok" ? t("common.loading") : needsSave && !online ? t("net.offlineAction") : null}
            >
              {needsSave ? t("withdraw.bank.saveContinue") : t("withdraw.bank.cta")}
            </ActionButton>
          }
        >
          {!hintSeen && (
            <Banner
              severity="info"
              title={t("withdraw.hint.title")}
              action={{
                label: t("withdraw.hint.dismiss"),
                onClick: () => {
                  if (hintKey) writeJson("local", hintKey, true);
                  setHintSeen(true);
                },
              }}
            >
              {t("withdraw.hint.body")}
              {mode === "sms" && ` ${t("withdraw.hint.sms")}`}
            </Banner>
          )}
          {bankNotice && <Banner severity="error">{bankNotice}</Banner>}
          {bank.account && !bank.editing && <InfoLine>{t("withdraw.bank.helper")}</InfoLine>}
          <BankAccountBody editor={bank} variant="flow" />
        </TaskFlow>
        {discard}
      </>
    );
  }

  // ---- WD-03 amount ----------------------------------------------------------------------------------
  if (flow.step === 2) {
    const valid = !problem && typeof amount === "number";
    return (
      <>
        <TaskFlow
          flowTitle={flowTitle}
          title={t("withdraw.amount.title")}
          step={stepper(2)}
          stepKey="amount"
          onClose={close}
          onSubmit={goReview}
          footer={
            <ActionButton
              type="submit"
              disabledReason={
                valid && !serverAmountError
                  ? null
                  : stored.amount && (serverAmountError || problem)
                    ? (serverAmountError ?? amountText(problem!))
                    : t("withdraw.amount.disabled")
              }
              onBlockedClick={() => {
                // W-06: the specific rule shows on Continue, not only on blur.
                setAmountShown(true);
                amountRef.current?.focus();
              }}
            >
              {t("withdraw.amount.cta")}
            </ActionButton>
          }
        >
          <AmountField
            label={t("withdraw.amount.label")}
            value={stored.amount}
            onChange={(v) => {
              save({ amount: v });
              setServerAmountError(null);
            }}
            onBlur={() => {
              setAmountShown(Boolean(stored.amount));
              setPreviewAnnounce(typeof amount === "number" ? t("withdraw.amount.preview", { fee: f.number(fee), toman: f.number(payoutToman) }) : "");
            }}
            inputRef={amountRef}
            error={amountError}
            helpers={[
              t("withdraw.amount.helperMin", { min: f.number(summary.withdraw.min) }),
              t("withdraw.amount.helperWindow", { remaining: f.number(summary.withdraw.remaining), max: f.number(summary.withdraw.daily_max) }),
              t("withdraw.amount.helperWithdrawable", { amount: f.number(summary.withdrawable) }),
            ]}
          />
          {maxAmount > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                save({ amount: f.digits(String(maxAmount)) });
                setServerAmountError(null);
                setAmountShown(true);
              }}
              sx={{ alignSelf: "flex-start" }}
            >
              {t("withdraw.amount.max", { amount: f.number(maxAmount) })}
            </Button>
          )}
          {typeof amount === "number" && (
            <Typography>{t("withdraw.amount.preview", { fee: f.number(fee), toman: f.number(payoutToman) })}</Typography>
          )}
          {/* Announced once on blur, not on every keystroke (W-16). */}
          <span role="status" style={visuallyHidden}>
            {previewAnnounce}
          </span>
        </TaskFlow>
        {discard}
      </>
    );
  }

  // ---- WD-04 review (+ password) ----------------------------------------------------------------------
  if (flow.step === 3 || mode === "password") {
    const passwordMode = mode === "password";
    const blockedReason = offlineReason ?? (passwordMode && !password && lockSeconds === 0 ? t("withdraw.review.disabled") : null);
    return (
      <>
        <TaskFlow
          flowTitle={flowTitle}
          title={t("withdraw.review.title")}
          step={stepper(3)}
          stepKey="review"
          footerMode="inline"
          onClose={close}
          closeDisabled={locked}
          onSubmit={() => void (passwordMode ? submit() : requestCode())}
          footer={
            <>
              {passwordMode && (
                <PasswordField
                  inputRef={passwordRef}
                  name="password"
                  autoComplete="current-password"
                  label={t("withdraw.review.password")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  disabled={locked || lockSeconds > 0}
                  error={Boolean(passwordError)}
                  helperText={passwordError ? <FieldError>{passwordError}</FieldError> : t("withdraw.review.passwordHelper")}
                />
              )}
              {errorBanner}
              {rateSeconds > 0 && (
                <div id={rateId}>
                  <Banner severity="error">
                    <CountdownText seconds={rateSeconds} clock={f.clock} render={(time) => t("errors.auth.otpRateLimited", { time })} />
                  </Banner>
                </div>
              )}
              {lockSeconds > 0 && (
                <div id="withdraw-lock">
                  <Banner severity="warning">
                    <CountdownText seconds={lockSeconds} clock={f.clock} render={(time) => t("wallet.password.locked", { time })} />
                  </Banner>
                </div>
              )}
              {uncertain && !inFlight && <SlowNotice message={t("wallet.flow.checking")} onCheckStatus={() => void submit()} />}
              {inFlight && slow && <SlowNotice onCheckStatus={() => void submit()} />}
              <ActionButton
                type="submit"
                loading={inFlight || sendingCode}
                loadingLabel={passwordMode ? t("withdraw.review.submitting") : t("withdraw.review.sendingCode")}
                disabledReason={blockedReason}
                blockedBy={lockSeconds > 0 ? "withdraw-lock" : rateSeconds > 0 ? rateId : null}
              >
                {passwordMode ? t("withdraw.review.ctaPassword", { amount: f.number(amountValue) }) : t("withdraw.review.ctaSms")}
              </ActionButton>
            </>
          }
        >
          {modeNotice && (
            <Banner severity="info">{modeNotice === "smsOff" ? t("withdraw.review.smsOff") : t("withdraw.review.modeChanged")}</Banner>
          )}
          <CostBlock
            cost={amountValue}
            costLabel="amount"
            fee={fee}
            youReceiveToman={payoutToman}
            balance={summary.balance}
            balanceAfter={summary.balance - amountValue}
          />
          <Button variant="text" size="small" onClick={() => !locked && flow.back(2)} disabled={locked} sx={{ alignSelf: "flex-start" }}>
            {t("transfer.review.changeAmount")}
          </Button>
          {bank.account && <BankAccountCard account={bank.account} title={t("withdraw.review.bank")} />}
          <Stack spacing={1}>
            <InfoLine>{t("withdraw.review.rate", { price: f.number(summary.coin_price_toman) })}</InfoLine>
            <InfoLine icon={ClockIcon} tone="primary">
              {t("withdraw.review.timingRule")} {t("withdraw.review.expectedAfter", { date: isolate(f.dayOnly(summary.withdraw.expected_by)) })}
            </InfoLine>
            <InfoLine>{t("withdraw.review.cancelNote")}</InfoLine>
            <InfoLine>{mode === "sms" ? t("withdraw.review.notifySms") : t("withdraw.review.notifyApp")}</InfoLine>
            <InfoLine icon={LockIcon}>{t("withdraw.review.safety")}</InfoLine>
          </Stack>
        </TaskFlow>
        {discard}
      </>
    );
  }

  // ---- WD-05 SMS code ------------------------------------------------------------------------------
  const dead = codeError?.kind === "dead" || codeError?.kind === "expired" || (Boolean(stored.expiresAt) && expiresLeft === 0);
  const fieldError =
    codeError?.kind === "invalid"
      ? t("errors.auth.otpInvalid", { attempts: codeError.attempts })
      : codeError?.kind === "dead"
        ? t("auth.verify.noAttempts")
        : dead
          ? t("auth.verify.expired")
          : undefined;
  return (
    <>
      <TaskFlow
        flowTitle={flowTitle}
        title={t("withdraw.code.title")}
        step={stepper(4)}
        stepKey="code"
        initialFocus={codeRef}
        onClose={close}
        closeDisabled={locked}
        onSubmit={() => void submit()}
        intro={t("withdraw.code.sentTo", { phone: `\u2066${f.maskedPhone(me.phone)}\u2069` })}
        footer={
          <>
            {errorBanner}
            {rateSeconds > 0 && (
              <div id={rateId}>
                <Banner severity="error">
                  <CountdownText seconds={rateSeconds} clock={f.clock} render={(time) => t("errors.auth.otpRateLimited", { time })} />
                </Banner>
              </div>
            )}
            {uncertain && !inFlight && <SlowNotice message={t("wallet.flow.checking")} onCheckStatus={() => void submit()} />}
            {inFlight && slow && <SlowNotice onCheckStatus={() => void submit()} />}
            {dead ? (
              <ActionButton
                onClick={() => void requestCode()}
                loading={sendingCode}
                disabledReason={offlineReason}
                blockedBy={rateSeconds > 0 ? rateId : null}
              >
                {t("auth.verify.newCode")}
              </ActionButton>
            ) : (
              <ActionButton type="submit" loading={inFlight} loadingLabel={t("withdraw.review.submitting")} disabledReason={offlineReason}>
                {t("withdraw.code.cta")}
              </ActionButton>
            )}
            {!dead &&
              (resendLeft > 0 ? (
                <Button variant="text" disabled fullWidth sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {t("auth.verify.resendIn", { time: `⁦${f.clock(resendLeft)}⁩` })}
                </Button>
              ) : (
                <ActionButton
                  variant="text"
                  size="medium"
                  onClick={() => void requestCode()}
                  loading={sendingCode}
                  disabledReason={offlineReason}
                  blockedBy={rateSeconds > 0 ? rateId : null}
                >
                  {t("auth.verify.resend")}
                </ActionButton>
              ))}
            <Button variant="text" onClick={() => !locked && flow.back(3)} disabled={locked}>
              {t("withdraw.code.back")}
            </Button>
          </>
        }
      >
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (codeError?.kind === "invalid") setCodeError(null);
          }}
          onComplete={(v) => void submit(v)}
          length={CODE_LENGTH}
          label={t("auth.verify.codeLabel")}
          error={fieldError}
          helperText={inFlight ? t("auth.verify.verifying") : t("auth.verify.expiresIn", { time: `⁦${f.clock(expiresLeft)}⁩` })}
          disabled={dead || inFlight || uncertain}
          inputRef={codeRef}
          autoFocus
          name="code"
        />
        <InfoLine>{t("withdraw.code.nothingHeld")}</InfoLine>
        <InfoLine icon={LockIcon}>{t("auth.verify.neverShare")}</InfoLine>
      </TaskFlow>
      {discard}
    </>
  );
}
