"use client";

// Wallet top-up (CLAUDE.md §7.9; admin-users-wallet.md §3.3, AD-12) and manual adjustment (§13 Users).
// Both are two steps: enter amount and reason, then confirm the balance before → after. One
// Idempotency-Key is made when the confirm step opens and kept across retries, so "Check status"
// after a lost answer can never add the coins twice.

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { ApiRequestError, api, newIdempotencyKey, parseAmount } from "@bg/api-client";
import type { AdminBalanceChange, AdminUserDetail } from "@bg/protocol";
import { Kv, Ltr, StatusChip, errorText, useFmt, useT } from "@/components/common";
import { InfoIcon, WarningIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";

type Mode = "topup" | "adjust";

export function BalanceDialog({
  mode,
  user,
  cap,
  open,
  onClose,
  onDone,
}: {
  mode: Mode;
  user: AdminUserDetail;
  /** admin.topup_max_amount (0: no cap); top-ups only. */
  cap: number | null;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const f = useFmt();
  const { handleError } = useAdmin();
  const [step, setStep] = useState<1 | 2>(1);
  const [amountText, setAmountText] = useState("");
  const [sign, setSign] = useState<1 | -1>(1);
  const [reason, setReason] = useState("");
  const [fresh, setFresh] = useState<AdminUserDetail | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAmountText("");
    setSign(1);
    setReason("");
    setError(null);
    setUnknown(false);
  }, [open]);

  const parsed = parseAmount(amountText);
  const amount = typeof parsed === "number" ? parsed : 0;
  const signed = mode === "adjust" ? amount * sign : amount;
  const overCap = mode === "topup" && cap !== null && cap > 0 && amount > cap;
  const problem =
    typeof parsed !== "number"
      ? t("admin.topup.disabled.amount")
      : overCap
        ? t("admin.topup.disabled.cap", { cap: f.n(cap ?? 0) })
        : reason.trim().length < 3
          ? t("admin.topup.disabled.reason")
          : null;

  const review = async () => {
    setBusy(true);
    setError(null);
    try {
      setFresh(await api.admin.user(user.id)); // the balance may have changed since the page loaded
      setKey(newIdempotencyKey());
      setStep(2);
    } catch (e) {
      if (!handleError(e)) setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setUnknown(false);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000));
    try {
      const call = mode === "topup" ? api.admin.topup(user.id, amount, reason.trim(), key) : api.admin.adjust(user.id, signed, reason.trim(), key);
      const res: AdminBalanceChange = await Promise.race([call, timeout]);
      onDone(
        res.created
          ? t(mode === "topup" ? "admin.topup.done" : "admin.adjust.done", {
              amount: f.n(Math.abs(signed)),
              username: user.username ?? `#${user.id}`,
              before: f.n(res.balance_before),
              after: f.n(res.balance_after),
            })
          : t("admin.topup.already"),
      );
      onClose();
    } catch (e) {
      if (handleError(e)) return;
      if (e instanceof ApiRequestError) {
        if (e.body.code === "TOPUP_ABOVE_CAP") {
          setStep(1);
          setError(t("admin.topup.error.cap", { cap: f.n(Number(e.body.details.cap ?? cap ?? 0)) }));
        } else if (e.status === 404) {
          setError(t("admin.topup.userGone"));
        } else {
          setError(errorText(t, e));
        }
      } else {
        setUnknown(true); // same key on retry: applied at most once
      }
    } finally {
      setBusy(false);
    }
  };

  const before = fresh?.wallet.balance ?? user.wallet.balance;
  const title = t(mode === "topup" ? "admin.topup.title" : "admin.adjust.title", { username: user.username ?? `#${user.id}` });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="balance-title">
      <DialogTitle id="balance-title">{title}</DialogTitle>
      <DialogContent>
        {step === 1 ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Ltr>@{user.username}</Ltr>
              <Ltr>#{user.id}</Ltr>
              <StatusChip status={user.status} />
              <Typography variant="body2">{t("admin.common.coins", { amount: f.n(user.wallet.balance) })}</Typography>
            </Stack>
            {mode === "adjust" && (
              <ToggleButtonGroup exclusive value={sign} onChange={(_, v: 1 | -1 | null) => v && setSign(v)} aria-label={t("admin.adjust.direction")}>
                <ToggleButton value={1}>{t("admin.adjust.credit")}</ToggleButton>
                <ToggleButton value={-1}>{t("admin.adjust.debit")}</ToggleButton>
              </ToggleButtonGroup>
            )}
            <TextField
              label={t("admin.topup.amount")}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric", dir: "ltr" } }}
              helperText={
                mode === "topup"
                  ? cap
                    ? t("admin.topup.capHelper", { cap: f.n(cap) })
                    : t("admin.topup.noCap")
                  : t("admin.adjust.helper")
              }
              error={overCap}
            />
            {amount > 0 && (
              <Typography variant="body2" color="text.secondary">
                {t("admin.topup.toman", { toman: f.n(amount * user.wallet.coin_price_toman) })}
              </Typography>
            )}
            <TextField
              label={t("admin.topup.reason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              multiline
              minRows={2}
              helperText={t("admin.topup.reasonCounter", { count: reason.length })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            {problem && (
              <Typography variant="caption" color="text.secondary">
                {problem}
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        ) : (
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Kv label={t("admin.topup.player")}>
              <Ltr>@{user.username}</Ltr> · <Ltr>#{user.id}</Ltr>
            </Kv>
            <Kv label={t("admin.topup.amount")}>
              <Ltr>{mode === "adjust" && sign < 0 ? "−" : "+"}</Ltr>
              {f.n(amount)}
            </Kv>
            <Kv label={t("admin.topup.balance")}>
              {f.n(before)} → {f.n(before + signed)} {t("admin.topup.expected")}
            </Kv>
            <Alert severity="info" icon={<InfoIcon />}>
              {mode === "topup" ? t("admin.topup.source") : t(sign > 0 ? "admin.adjust.sourceCredit" : "admin.adjust.sourceDebit")}
            </Alert>
            {mode === "topup" && (fresh?.wallet.bonus_locked ?? 0) > 0 && (
              <Alert severity="info">{t("admin.topup.unlocksBonus", { bonus: f.n(fresh?.wallet.bonus_locked ?? 0) })}</Alert>
            )}
            {(fresh ?? user).status !== "active" && (
              <Alert severity="warning" icon={<WarningIcon />}>
                {t((fresh ?? user).status === "banned" ? "admin.topup.banned" : "admin.topup.suspended")}
              </Alert>
            )}
            {mode === "adjust" && sign < 0 && amount > before && <Alert severity="error">{t("admin.adjust.overdraw")}</Alert>}
            {unknown && <Alert severity="warning">{t("admin.topup.unknown")}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {step === 1 ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              {t("admin.common.cancel")}
            </Button>
            <Button variant="contained" disabled={Boolean(problem) || busy} onClick={() => void review()}>
              {busy ? t("admin.topup.checking") : t("admin.topup.review")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep(1)} disabled={busy}>
              {t("admin.topup.back")}
            </Button>
            <Button
              variant="contained"
              color={mode === "adjust" && sign < 0 ? "error" : "primary"}
              disabled={busy || (mode === "adjust" && sign < 0 && amount > before)}
              onClick={() => void submit()}
            >
              {busy
                ? t("admin.topup.adding")
                : unknown
                  ? t("admin.decision.checkStatus")
                  : mode === "topup"
                    ? t("admin.topup.cta", { amount: f.n(amount) })
                    : t(sign > 0 ? "admin.adjust.ctaCredit" : "admin.adjust.ctaDebit", { amount: f.n(amount) })}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
