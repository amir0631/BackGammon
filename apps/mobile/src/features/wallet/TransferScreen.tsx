"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { TextInput as TextField } from "@/components/forms/TextInput";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { amountProblem, type AmountProblem, api, cleanUsername, feeFor, newIdempotencyKey, parseAmount } from "@bg/api-client";
import { isolate } from "@bg/i18n";
import type { PublicUser, TransferResult, WalletSummary } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { CountdownText } from "@/components/feedback/CountdownText";
import { SlowNotice, useSlowRequest } from "@/components/feedback/SlowNotice";
import { TaskFlow } from "@/components/flow/TaskFlow";
import { ActionButton } from "@/components/forms/ActionButton";
import { FieldError } from "@/components/forms/FieldText";
import { PasswordField } from "@/components/forms/PasswordField";
import { LockIcon, SuccessIcon } from "@/components/icons";
import { CostBlock } from "@/components/money/CostBlock";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { AmountField } from "@/components/wallet/AmountField";
import { CopyButton } from "@/components/wallet/CopyButton";
import { InfoLine } from "@/components/wallet/InfoLine";
import { RecipientCard } from "@/components/wallet/RecipientCard";
import { toApiError, useErrorText, type ErrorText } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { readJson, removeKey, writeJson } from "@/lib/storage";
import { useCountdown } from "@/lib/useCountdown";
import { useFlowSteps } from "@/lib/useFlowSteps";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { visuallyHidden } from "@/theme/layout";
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

// Transfer `/wallet/transfer` (wallet.md §3.4, TR-00 … TR-05; CLAUDE.md §7.13).
// - TR-00 replaces step 1 when nothing can be sent (suspended, welcome coins only, below the
//   minimum, 24-hour limit). It never suggests buying coins (P§9.1).
// - Steps live in browser history (useFlowSteps): Back moves one step, entries are kept; the
//   password never leaves memory and is cleared when leaving step 3.
// - One Idempotency-Key per (recipient, amount), created when the review is first shown and kept
//   for every retry of that action; "Check status" re-sends the same body with the same key.
// - Server refusals land on the step they concern (§3.9), including TRANSFER_LINKED (§7.13).

const STORE = "bg.wallet.transfer";

interface Stored {
  username: string;
  recipient: PublicUser | null;
  amount: string;
  key: string | null;
  keyFor: string | null;
}

const EMPTY: Stored = { username: "", recipient: null, amount: "", key: null, keyFor: null };

type Lookup =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; user: PublicUser; for: string }
  | { kind: "notFound" }
  | { kind: "self" }
  | { kind: "error" };

type Unavailable = "suspended" | "bonus" | "belowMin" | "limit";

function unavailable(s: WalletSummary, suspended: boolean): Unavailable | null {
  if (suspended) return "suspended";
  if (s.transferable < s.transfer.min && s.bonus_locked > 0) return "bonus";
  if (s.transferable < s.transfer.min) return "belowMin";
  if (s.transfer.remaining < s.transfer.min) return "limit";
  return null;
}

type ActionError = (ErrorText & { changeRecipient?: boolean }) | null;

export function TransferScreen({ to }: { to: string | null }) {
  const t = useTranslations();
  const f = useWalletFormat();
  const router = useRouter();
  const online = useOnline();
  const { me, reload: reloadMe, handleAuthError } = useSession();
  const wallet = useWallet();
  const errorText = useErrorText();
  const amountText = useAmountErrorText("transfer");

  const [stored, setStored] = useState<Stored>(() => readJson<Stored>("session", STORE) ?? EMPTY);
  const [hadOrigin] = useState(() => canGoBackInApp());
  const [ready, setReady] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [amountShown, setAmountShown] = useState(false);
  const [serverAmountError, setServerAmountError] = useState<string | null>(null);
  const [previewAnnounce, setPreviewAnnounce] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [inFlight, setInFlight] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [lockUntil, setLockUntil] = useState<number | null>(() => passwordLock.read("transfer"));
  const [receipt, setReceipt] = useState<{ result: TransferResult; username: string; amount: number } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [forcedUnavailable, setForcedUnavailable] = useState<Unavailable | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const firing = useRef(false);

  const save = useCallback((patch: Partial<Stored>) => {
    setStored((prev) => {
      const next = { ...prev, ...patch };
      writeJson("session", STORE, next);
      return next;
    });
  }, []);

  const dirty = Boolean(stored.username.trim() || stored.amount.trim());
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
    canRestore: (step) => (step >= 2 ? Boolean(stored.recipient) : true) && (step >= 3 ? parseAmount(stored.amount) !== "empty" : true),
  });

  // Entry: fresh summary and session for the eligibility check (§3.4 step 0).
  useEffect(() => {
    void Promise.all([wallet.refresh(), reloadMe()]).finally(() => setReady(true));
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `?to=` prefills the username (never the amount) and looks it up at once (§3.4 step 1.1).
  useEffect(() => {
    if (to && !stored.username) save({ username: to, recipient: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  const summary = wallet.summary;
  const suspended = me?.status === "suspended";
  const blockedBy = forcedUnavailable ?? (summary && !receipt ? unavailable(summary, suspended) : null);

  // ---- Step 1: recipient lookup (debounced 400 ms) -------------------------------------------------
  const clean = cleanUsername(stored.username);
  const runLookup = useCallback(
    (name: string) => {
      if (!name) {
        setLookup({ kind: "idle" });
        return;
      }
      if (me?.username && name.toLowerCase() === me.username.toLowerCase()) {
        setLookup({ kind: "self" });
        return;
      }
      if (name.length < 3 || name.length > 20) {
        setLookup({ kind: "idle" });
        return;
      }
      setLookup({ kind: "searching" });
      api.users
        .get(name)
        .then((user) => {
          setLookup({ kind: "found", user, for: name });
          save({ recipient: user });
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          const e = toApiError(error);
          setLookup(e.code === "NOT_FOUND" || e.code === "TRANSFER_RECIPIENT_NOT_FOUND" ? { kind: "notFound" } : { kind: "error" });
        });
    },
    [me?.username, handleAuthError, save],
  );

  useEffect(() => {
    if (flow.step !== 1 || blockedBy) return;
    if (stored.recipient && stored.recipient.username.toLowerCase() === clean.toLowerCase()) {
      setLookup({ kind: "found", user: stored.recipient, for: clean });
      return;
    }
    const timer = window.setTimeout(() => runLookup(clean), to && clean === cleanUsername(to) ? 0 : 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, flow.step, blockedBy]);

  const found = lookup.kind === "found" && lookup.for.toLowerCase() === clean.toLowerCase() ? lookup.user : null;

  const usernameError =
    lookup.kind === "self"
      ? t("transfer.recipient.self")
      : lookup.kind === "notFound"
        ? t("transfer.recipient.notFound")
        : lookup.kind === "error"
          ? t("transfer.recipient.lookupError")
          : null;

  // ---- Step 2: amount -------------------------------------------------------------------------------
  const rules = summary && {
    min: summary.transfer.min,
    balance: summary.balance,
    movable: summary.transferable,
    bonusLocked: summary.bonus_locked,
    remaining: summary.transfer.remaining,
    dailyMax: summary.transfer.daily_max,
    nextAvailableAt: summary.transfer.next_available_at,
  };
  const problem: AmountProblem | null = rules ? amountProblem(stored.amount, rules) : { kind: "required" };
  const amount = parseAmount(stored.amount);
  const amountValue = typeof amount === "number" ? amount : 0;
  const fee = summary ? feeFor(amountValue, summary.transfer.fee_pct) : 0;
  const amountError = serverAmountError ?? (amountShown && problem ? amountText(problem) : null);

  // ---- Navigation -------------------------------------------------------------------------------
  const leave = () => {
    removeKey("session", STORE);
    flow.exit(() => {
      if (hadOrigin) router.back();
      else router.replace(to ? `/profile/${encodeURIComponent(to)}` : "/wallet");
    });
  };

  const close = () => {
    if (locked) return;
    if (receipt) {
      router.replace("/wallet");
      return;
    }
    if (blockedBy || !dirty) leave();
    else setDiscardOpen(true);
  };

  const goReview = () => {
    setAmountShown(true);
    setServerAmountError(null);
    if (problem || typeof amount !== "number" || !stored.recipient) return;
    const keyFor = `${stored.recipient.username}:${amount}`;
    if (stored.keyFor !== keyFor) save({ key: newIdempotencyKey(), keyFor });
    setActionError(null);
    flow.next(3);
  };

  // Leaving step 3 clears the password (ia.md §3.5).
  useEffect(() => {
    if (flow.step !== 3) {
      setPassword("");
      setPasswordError(null);
    }
  }, [flow.step]);

  const lockSeconds = useCountdown(lockUntil);
  useEffect(() => {
    if (lockUntil && lockSeconds === 0) {
      passwordLock.clear("transfer");
      setLockUntil(null);
    }
  }, [lockSeconds, lockUntil]);

  // ---- Submit -------------------------------------------------------------------------------------
  const submit = async () => {
    if (firing.current || !stored.recipient || typeof amount !== "number" || !stored.key) return;
    if (!password) {
      setPasswordError(t("transfer.review.disabled"));
      passwordRef.current?.focus();
      return;
    }
    if (lockSeconds > 0 || !online) return;
    firing.current = true;
    setInFlight(true);
    setActionError(null);
    setPasswordError(null);
    const recipient = stored.recipient;
    try {
      const result = await api.wallet.transfer(recipient.username, amount, password, stored.key);
      wallet.setBalance(result.balance);
      removeKey("session", STORE);
      passwordLock.clear("transfer");
      setPassword("");
      setUncertain(false);
      flow.exit(() => {
        setReceipt({ result, username: recipient.username, amount });
        setStored(EMPTY);
        void wallet.refresh();
      });
    } catch (error) {
      if (handleAuthError(error)) return;
      const e = toApiError(error);
      const d = e.details;
      if (e.code === "NETWORK") {
        // Maybe posted, maybe not: only "Check status" (same key) can tell (§3.4 step 3.9).
        setUncertain(true);
        return;
      }
      setUncertain(false);
      if (isWrongPassword(e.code)) {
        setPassword("");
        setPasswordError(t("wallet.password.wrong"));
        window.setTimeout(() => passwordRef.current?.focus(), 0);
      } else if (isPasswordLocked(e.code)) {
        const seconds = detailNumber(d, "retry_after") ?? 60;
        passwordLock.set("transfer", seconds);
        setLockUntil(Date.now() + seconds * 1000);
        setPassword("");
      } else if (e.code === "ACCOUNT_SUSPENDED") {
        void reloadMe();
        setForcedUnavailable("suspended");
      } else if (e.code === "TRANSFER_RECIPIENT_NOT_FOUND") {
        setActionError({ message: t("transfer.review.recipientGone"), changeRecipient: true });
      } else if (e.code === "TRANSFER_LINKED") {
        setActionError({ message: t("transfer.review.linked"), changeRecipient: true });
      } else if (e.code === "TRANSFER_SELF") {
        save({ recipient: null });
        setLookup({ kind: "self" });
        flow.back(1);
      } else if (
        e.code === "AMOUNT_INVALID" ||
        e.code === "TRANSFER_BELOW_MIN" ||
        e.code === "TRANSFER_NOT_TRANSFERABLE" ||
        e.code === "TRANSFER_LIMIT" ||
        e.code === "WALLET_INSUFFICIENT"
      ) {
        const fresh = await wallet.refresh();
        const s = fresh ?? summary;
        let text: string;
        if (e.code === "AMOUNT_INVALID") text = amountText({ kind: "invalid" });
        else if (e.code === "TRANSFER_BELOW_MIN") text = amountText({ kind: "belowMin", min: detailNumber(d, "min") ?? s?.transfer.min ?? 0 });
        else if (e.code === "TRANSFER_NOT_TRANSFERABLE")
          text = amountText({
            kind: "notMovable",
            movable: detailNumber(d, "transferable") ?? s?.transferable ?? 0,
            bonus: detailNumber(d, "bonus_locked") ?? s?.bonus_locked ?? 0,
          });
        else if (e.code === "TRANSFER_LIMIT")
          text = amountText({
            kind: "limit",
            remaining: detailNumber(d, "remaining") ?? s?.transfer.remaining ?? 0,
            max: s?.transfer.daily_max ?? 0,
            next: detailString(d, "next_available_at") ?? s?.transfer.next_available_at ?? null,
          });
        else text = amountText({ kind: "aboveBalance", balance: detailNumber(d, "balance") ?? s?.balance ?? 0 });
        setServerAmountError(text);
        flow.back(2);
      } else if (e.code === "VALIDATION") {
        setActionError({ message: t("errors.validation") });
      } else {
        setActionError(errorText(e));
      }
    } finally {
      firing.current = false;
      setInFlight(false);
    }
  };

  const slow = useSlowRequest(inFlight);

  // TR-04: the flow has unwound to its own history entry, so Back returns to where the flow was
  // opened (WA-01 in the normal path) and never re-enters a step (§3.4 step 4).

  const discard = (
    <ConfirmDialog
      open={discardOpen}
      onCancel={() => setDiscardOpen(false)}
      onConfirm={() => {
        setDiscardOpen(false);
        leave();
      }}
      title={t("transfer.discard.title")}
      confirmLabel={t("transfer.discard.confirm")}
      cancelLabel={t("transfer.discard.keep")}
    >
      {t("transfer.discard.body")}
    </ConfirmDialog>
  );

  const flowTitle = t("transfer.title");

  // ---- TR-04 receipt ------------------------------------------------------------------------------
  if (receipt) {
    const r = receipt.result;
    return (
      <TaskFlow
        plain
        flowTitle={flowTitle}
        title={t("transfer.receipt.title")}
        stepKey="receipt"
        onClose={close}
        footer={
          <Button variant="contained" size="large" fullWidth onClick={() => router.replace("/wallet")}>
            {t("common.done")}
          </Button>
        }
      >
        <InfoLine icon={SuccessIcon} tone="primary">
          {t("transfer.receipt.body", { amount: f.number(receipt.amount), username: isolate(`@${receipt.username}`) })}
        </InfoLine>
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          <Typography component="li">{`${t("coins.fee")}: ${f.coins(r.fee)}`}</Typography>
          <Typography component="li">{t("transfer.receipt.received", { amount: f.number(r.received) })}</Typography>
          <Typography component="li" sx={{ fontWeight: 600 }}>
            {t("transfer.receipt.newBalance", { amount: f.number(r.balance) })}
          </Typography>
          <Typography component="li" color="text.secondary">
            {t("transfer.receipt.time", { time: f.dateTime(r.created_at ?? new Date()) })}
          </Typography>
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            {t("transfer.receipt.txId")}
          </Typography>
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2" dir="ltr" sx={{ fontFamily: "monospace", overflowWrap: "anywhere", flex: "1 1 auto", minWidth: 0 }}>
              {r.tx_id}
            </Typography>
            <CopyButton value={r.tx_id} label={t("transfer.receipt.copyTx")} />
          </Stack>
        </Stack>
      </TaskFlow>
    );
  }

  // ---- Eligibility (loading, TR-00) ----------------------------------------------------------------
  if (ready && !summary) {
    return (
      <TaskFlow plain flowTitle={flowTitle} title={flowTitle} stepKey="load-error" onClose={close}>
        <ErrorState
          kind={online ? "error" : "offline"}
          message={online ? t("wallet.loadError") : t("net.offline")}
          onRetry={() => void wallet.refresh()}
        />
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
    const content: Record<Unavailable, { title: string; body: string }> = {
      suspended: { title: t("transfer.unavailable.suspended.title"), body: t("transfer.unavailable.suspended.body") },
      bonus: { title: t("transfer.unavailable.bonus.title"), body: t("transfer.unavailable.bonus.body") },
      belowMin: {
        title: t("transfer.unavailable.belowMin.title"),
        body: t("transfer.unavailable.belowMin.body", { min: f.number(s.transfer.min), amount: f.number(s.transferable) }),
      },
      limit: {
        title: t("transfer.unavailable.limit.title"),
        body: s.transfer.next_available_at
          ? t("transfer.unavailable.limit.body", { time: isolate(f.windowTime(s.transfer.next_available_at)) })
          : "",
      },
    };
    const c = content[blockedBy];
    return (
      <TaskFlow
        plain
        flowTitle={flowTitle}
        title={c.title}
        stepKey={`unavailable-${blockedBy}`}
        onClose={close}
        footer={
          <Button variant="contained" size="large" fullWidth onClick={() => router.replace("/wallet")}>
            {t("wallet.backToWallet")}
          </Button>
        }
      >
        {c.body && <Typography color="text.secondary">{c.body}</Typography>}
      </TaskFlow>
    );
  }

  const offlineReason = online ? null : t("net.offlineAction");

  // ---- TR-01 recipient ------------------------------------------------------------------------------
  if (flow.step === 1) {
    return (
      <>
        <TaskFlow
          flowTitle={flowTitle}
          title={t("transfer.recipient.title")}
          step={{ current: 1, total: 3 }}
          stepKey="recipient"
          onClose={close}
          onSubmit={() => {
            if (found) flow.next(2);
          }}
          footer={
            <ActionButton type="submit" disabledReason={found ? null : t("transfer.recipient.disabled")}>
              {t("transfer.recipient.confirm")}
            </ActionButton>
          }
        >
          <TextField
            name="recipient"
            label={t("transfer.recipient.label")}
            value={stored.username}
            onChange={(e) => {
              save({ username: e.target.value, recipient: null });
            }}
            error={Boolean(usernameError)}
            helperText={
              usernameError ? (
                <FieldError>{usernameError}</FieldError>
              ) : lookup.kind === "searching" ? (
                t("transfer.recipient.searching")
              ) : (
                t("transfer.recipient.helper")
              )
            }
            slotProps={{
              formHelperText: { role: "status", component: "div" } as object,
              htmlInput: {
                dir: "ltr",
                autoCapitalize: "off",
                autoCorrect: "off",
                spellCheck: false,
                autoComplete: "off",
                enterKeyHint: "next",
              },
            }}
          />
          {lookup.kind === "error" && (
            <Button variant="outlined" onClick={() => runLookup(clean)} disabled={!online} sx={{ alignSelf: "flex-start" }}>
              {t("common.retry")}
            </Button>
          )}
          {offlineReason && <InfoLine>{offlineReason}</InfoLine>}
          {found && <RecipientCard user={found} />}
        </TaskFlow>
        {discard}
      </>
    );
  }

  const recipient = stored.recipient!;

  // ---- TR-02 amount ---------------------------------------------------------------------------------
  if (flow.step === 2) {
    const valid = !problem && typeof amount === "number";
    return (
      <>
        <TaskFlow
          flowTitle={flowTitle}
          title={t("transfer.amount.title")}
          step={{ current: 2, total: 3 }}
          stepKey="amount"
          onClose={close}
          onSubmit={goReview}
          footer={
            <ActionButton
              type="submit"
              disabledReason={
                valid && !serverAmountError
                  ? null
                  : amountError
                    ? // The rule is already under the field: a short pointer here (W-24).
                      t("transfer.amount.disabledFix")
                    : stored.amount && problem
                      ? amountText(problem)
                      : t("transfer.amount.disabled")
              }
              onBlockedClick={() => {
                // W-06: the specific rule shows on Continue, not only on blur.
                setAmountShown(true);
                amountRef.current?.focus();
              }}
            >
              {t("transfer.amount.cta")}
            </ActionButton>
          }
        >
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1 }}>
            <Typography sx={{ overflowWrap: "anywhere" }}>{t("transfer.amount.to", { username: isolate(`@${recipient.username}`) })}</Typography>
            <Button variant="text" size="small" onClick={() => flow.back(1)}>
              {t("transfer.amount.change")}
            </Button>
          </Stack>
          <AmountField
            label={t("transfer.amount.label")}
            value={stored.amount}
            onChange={(v) => {
              save({ amount: v });
              setServerAmountError(null);
            }}
            onBlur={() => {
              setAmountShown(Boolean(stored.amount));
              setPreviewAnnounce(typeof amount === "number" ? `${t("transfer.amount.preview", { fee: f.number(fee), received: f.number(amount - fee) })}` : "");
            }}
            inputRef={amountRef}
            error={amountError}
            helpers={[
              t("transfer.amount.helperMin", { min: f.number(summary.transfer.min) }),
              t("transfer.amount.helperWindow", { remaining: f.number(summary.transfer.remaining), max: f.number(summary.transfer.daily_max) }),
              t("transfer.amount.helperSendable", { amount: f.number(summary.transferable) }),
            ]}
          />
          {typeof amount === "number" && (
            <Stack spacing={0.5}>
              <Typography variant="body1">{t("transfer.amount.preview", { fee: f.number(fee), received: f.number(amount - fee) })}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("transfer.amount.tomanPreview", { amount: f.number(amount * summary.coin_price_toman) })}
              </Typography>
            </Stack>
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

  // ---- TR-03 review and password ---------------------------------------------------------------------
  const blockedReason = offlineReason ?? (lockSeconds > 0 ? null : password ? null : t("transfer.review.disabled"));
  return (
    <>
      <TaskFlow
        flowTitle={flowTitle}
        title={t("transfer.review.title")}
        step={{ current: 3, total: 3 }}
        stepKey="review"
        footerMode="inline"
        onClose={close}
        closeDisabled={locked}
        onSubmit={() => void submit()}
        footer={
          <>
            <PasswordField
              inputRef={passwordRef}
              name="password"
              autoComplete="current-password"
              label={t("transfer.review.password")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              disabled={locked || lockSeconds > 0}
              error={Boolean(passwordError)}
              helperText={passwordError ? <FieldError>{passwordError}</FieldError> : t("transfer.review.passwordHelper")}
            />
            {actionError && (
              <div id="transfer-action-error">
              <Banner
                severity="error"
                action={
                  actionError.changeRecipient
                    ? {
                        label: t("transfer.review.changeRecipient"),
                        onClick: () => {
                          save({ recipient: null, username: "" });
                          setActionError(null);
                          flow.back(1);
                        },
                      }
                    : undefined
                }
              >
                {actionError.message}
                {actionError.code && (
                  <Typography variant="caption" component="p">
                    <bdi>{t("common.errorCode", { code: actionError.code })}</bdi>
                  </Typography>
                )}
              </Banner>
              </div>
            )}
            {lockSeconds > 0 && (
              <div id="transfer-lock">
                <Banner severity="warning">
                  <CountdownText seconds={lockSeconds} clock={f.clock} render={(time) => t("wallet.password.locked", { time })} />
                </Banner>
              </div>
            )}
            {uncertain && !inFlight && <SlowNotice message={t("wallet.flow.checking")} onCheckStatus={() => void submit()} />}
            {inFlight && slow && <SlowNotice onCheckStatus={() => void submit()} />}
            <ActionButton
              type="submit"
              loading={inFlight}
              loadingLabel={t("transfer.review.sending")}
              disabledReason={blockedReason}
              blockedBy={lockSeconds > 0 ? "transfer-lock" : actionError?.changeRecipient ? "transfer-action-error" : null}
            >
              {t("transfer.review.cta", { amount: f.number(amountValue) })}
            </ActionButton>
          </>
        }
      >
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            {t("transfer.review.recipient")}
          </Typography>
          <RecipientCard user={recipient} compact />
          <Button variant="text" size="small" onClick={() => !locked && flow.back(1)} disabled={locked} sx={{ alignSelf: "flex-start" }}>
            {t("transfer.review.changeRecipient")}
          </Button>
        </Stack>
        <Stack spacing={1}>
          <CostBlock
            cost={amountValue}
            costLabel="amount"
            tomanEquivalent={amountValue * summary.coin_price_toman}
            fee={fee}
            recipientReceives={amountValue - fee}
            balance={summary.balance}
            balanceAfter={summary.balance - amountValue}
          />
          <Button variant="text" size="small" onClick={() => !locked && flow.back(2)} disabled={locked} sx={{ alignSelf: "flex-start" }}>
            {t("transfer.review.changeAmount")}
          </Button>
        </Stack>
        <InfoLine>{t("transfer.review.irreversible")}</InfoLine>
        <InfoLine icon={LockIcon}>{t("transfer.review.safety")}</InfoLine>
      </TaskFlow>
      {discard}
    </>
  );
}
