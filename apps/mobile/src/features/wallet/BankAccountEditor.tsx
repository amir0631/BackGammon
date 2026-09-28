"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, bankCode, groupIban, ibanProblem, type IbanProblem, maskedIbanGroups } from "@bg/api-client";
import { isolate } from "@bg/i18n";
import type { BankAccountInfo, BankInfo, Withdrawal } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/Toast";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { EditIcon, LockIcon } from "@/components/icons";
import { ErrorState } from "@/components/states/ErrorState";
import { BankAccountCard, BankAccountCardSkeleton, IbanField, bankName } from "@/components/wallet/BankAccount";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError, useErrorText } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { detailString } from "./shared";

// Bank account (Sheba) management shared by WD-08 `/wallet/bank-accounts` and withdrawal step 1
// (wallet.md §3.5). One account per user; saving when one exists replaces it after a confirmation
// that shows the old masked Sheba. Change and Remove are locked while a withdrawal is pending
// (known from `GET wallet/withdrawals` before trying, or from BANK_ACCOUNT_LOCKED after a race).
// Suspended accounts may add, change, and remove (§12.1).

let banksCache: Map<string, BankInfo> | null = null;

async function loadBanks(): Promise<Map<string, BankInfo> | null> {
  if (banksCache) return banksCache;
  try {
    const res = await api.wallet.banks();
    banksCache = new Map(res.results.map((b) => [b.code, b]));
    return banksCache;
  } catch {
    // Without the list the bank name appears after saving and `bank` errors come from the server.
    return null;
  }
}

type Load = { kind: "loading" } | { kind: "error"; offline: boolean; code?: string } | { kind: "ok" };

export interface BankAccountEditor {
  load: Load;
  reload: () => void;
  account: BankAccountInfo | null;
  /** The oldest pending withdrawal: its presence locks Change and Remove. */
  pending: Withdrawal | null;
  locked: boolean;
  editing: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  digits: string;
  setDigits: (d: string) => void;
  problem: IbanProblem | null;
  showProblem: () => void;
  /** Bank name of the typed Sheba once valid (when the list is known). */
  typedBank: string | null;
  saving: boolean;
  actionError: { message: string; code?: string; retry?: boolean } | null;
  /** Validates, asks to replace when needed, then saves. Resolves true once saved. */
  save: () => Promise<boolean>;
  confirmReplace: { open: boolean; onConfirm: () => void; onCancel: () => void };
  removeDialog: { open: boolean; show: () => void; onConfirm: () => void; onCancel: () => void; inFlight: boolean };
}

export function useBankAccountEditor(): BankAccountEditor {
  const t = useTranslations();
  const locale = useLocale();
  const toast = useToast();
  const errorText = useErrorText();
  const { handleAuthError } = useSession();
  const { noteWithdrawals } = useWallet();

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [account, setAccount] = useState<BankAccountInfo | null>(null);
  const [pending, setPending] = useState<Withdrawal | null>(null);
  const [raceLocked, setRaceLocked] = useState(false);
  const [banks, setBanks] = useState<Map<string, BankInfo> | null>(banksCache);
  const [editing, setEditing] = useState(false);
  const [digits, setDigitsState] = useState("");
  const [problemShown, setProblemShown] = useState(false);
  const [serverProblem, setServerProblem] = useState<IbanProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<BankAccountEditor["actionError"]>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceResolve, setReplaceResolve] = useState<((ok: boolean) => void) | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const reload = useCallback(() => {
    setLoad({ kind: "loading" });
    void loadBanks().then(setBanks);
    Promise.all([api.wallet.bankAccounts(), api.wallet.withdrawals()])
      .then(([accounts, withdrawals]) => {
        setAccount(accounts.results[0] ?? null);
        noteWithdrawals(withdrawals.results);
        const open = withdrawals.results.filter((w) => w.status === "pending");
        setPending(open.at(-1) ?? null);
        setRaceLocked(false);
        setLoad({ kind: "ok" });
      })
      .catch((error) => {
        if (handleAuthError(error)) return;
        const e = toApiError(error);
        setLoad({ kind: "error", offline: e.code === "NETWORK", code: e.code === "NETWORK" ? undefined : e.code });
      });
  }, [handleAuthError, noteWithdrawals]);

  useEffect(reload, [reload]);

  const knownCodes = useMemo(() => (banks ? new Set(banks.keys()) : null), [banks]);
  const clientProblem = ibanProblem(digits, knownCodes);
  const problem = serverProblem ?? (problemShown ? clientProblem : null);
  const typed = !clientProblem && banks ? banks.get(bankCode(digits)) : undefined;

  const setDigits = (d: string) => {
    setDigitsState(d);
    setServerProblem(null);
    setActionError(null);
    // Once shown, errors update live so the user sees when the value becomes valid.
  };

  const post = async (): Promise<boolean> => {
    setSaving(true);
    setActionError(null);
    try {
      const saved = await api.wallet.setBankAccount(`IR${digits}`);
      setAccount(saved);
      setEditing(false);
      setDigitsState("");
      setProblemShown(false);
      toast.show({ message: t("bank.saved") });
      return true;
    } catch (error) {
      if (handleAuthError(error)) return false;
      const e = toApiError(error);
      if (e.code === "IBAN_INVALID") {
        const reason = detailString(e.details, "reason");
        setServerProblem(reason === "checksum" || reason === "bank" ? reason : "format");
      } else if (e.code === "VALIDATION") {
        setServerProblem("format");
      } else if (e.code === "BANK_ACCOUNT_LOCKED") {
        setRaceLocked(true);
        reload();
      } else if (e.code === "NETWORK") {
        setActionError({ message: t("errors.network"), retry: true });
      } else {
        setActionError(errorText(e));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (saving) return false;
    setProblemShown(true);
    if (clientProblem) return false;
    if (actionError?.retry) {
      // Retry after a network error: the first request may have landed (wallet.md §3.5 step 3).
      try {
        const current = (await api.wallet.bankAccounts()).results[0] ?? null;
        const iban = `IR${digits}`;
        if (current && current.iban.slice(0, 4) === iban.slice(0, 4) && current.iban.slice(-4) === iban.slice(-4)) {
          setAccount(current);
          setEditing(false);
          setDigitsState("");
          setActionError(null);
          toast.show({ message: t("bank.saved") });
          return true;
        }
      } catch {
        // Fall through to the save itself.
      }
    }
    if (account) {
      const ok = await new Promise<boolean>((resolve) => {
        setReplaceResolve(() => resolve);
        setReplaceOpen(true);
      });
      if (!ok) return false;
    }
    return post();
  };

  const closeReplace = (ok: boolean) => {
    setReplaceOpen(false);
    replaceResolve?.(ok);
    setReplaceResolve(null);
  };

  const remove = async () => {
    if (!account?.id) return;
    setRemoving(true);
    try {
      await api.wallet.deleteBankAccount(account.id);
      setAccount(null);
      setRemoveOpen(false);
      toast.show({ message: t("bank.removed") });
    } catch (error) {
      if (handleAuthError(error)) return;
      const e = toApiError(error);
      setRemoveOpen(false);
      if (e.code === "BANK_ACCOUNT_LOCKED") {
        setRaceLocked(true);
        reload();
      } else if (e.code === "NOT_FOUND") {
        reload(); // Already removed elsewhere.
      } else {
        setActionError(e.code === "NETWORK" ? { message: t("errors.network") } : errorText(e));
      }
    } finally {
      setRemoving(false);
    }
  };

  return {
    load,
    reload,
    account,
    pending,
    locked: Boolean(pending) || raceLocked,
    editing: editing || !account,
    startEdit: () => {
      setEditing(true);
      setActionError(null);
    },
    cancelEdit: () => {
      setEditing(false);
      setDigitsState("");
      setProblemShown(false);
      setServerProblem(null);
      setActionError(null);
    },
    digits,
    setDigits,
    problem,
    showProblem: () => {
      if (digits) setProblemShown(true);
    },
    typedBank: typed ? bankName(typed.name, locale) : null,
    saving,
    actionError,
    save,
    confirmReplace: { open: replaceOpen, onConfirm: () => closeReplace(true), onCancel: () => closeReplace(false) },
    removeDialog: {
      open: removeOpen,
      show: () => setRemoveOpen(true),
      onConfirm: () => void remove(),
      onCancel: () => setRemoveOpen(false),
      inFlight: removing,
    },
  };
}

export interface BankAccountBodyProps {
  editor: BankAccountEditor;
  /** "page" (WD-08) shows Remove and its own Save button; "flow" (WD-02) leaves the primary to the footer. */
  variant: "page" | "flow";
}

/** Card, locked note, add/change form, and the replace/remove dialogs. */
export function BankAccountBody({ editor: e, variant }: BankAccountBodyProps) {
  const t = useTranslations();
  const online = useOnline();
  const offlineReason = online ? null : t("net.offlineAction");

  if (e.load.kind === "loading") return <BankAccountCardSkeleton />;
  if (e.load.kind === "error") {
    return (
      <ErrorState
        kind={e.load.offline ? "offline" : "error"}
        message={e.load.offline ? t("net.offline") : t("errors.generic")}
        code={e.load.code}
        onRetry={e.reload}
      />
    );
  }

  const lockedNote = e.account && e.locked && (
    <Stack spacing={0.5}>
      <InfoLine icon={LockIcon} id="bank-locked">
        {t("bank.locked.body")}
      </InfoLine>
      {e.pending && <StandaloneLink href={`/wallet/withdrawals/${e.pending.id}`}>{t("bank.locked.view")}</StandaloneLink>}
    </Stack>
  );

  const showForm = e.editing;

  return (
    <Stack spacing={2.5}>
      {e.account && !showForm && (
        <BankAccountCard
          account={e.account}
          title={t("bank.card.title")}
          actions={
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => {
                  if (!e.locked) e.startEdit();
                }}
                aria-disabled={e.locked || undefined}
                aria-describedby={e.locked ? "bank-locked" : undefined}
                sx={e.locked ? { color: "text.disabled", borderColor: "tokens.outlineSubtle", cursor: "not-allowed" } : undefined}
              >
                {t("bank.actions.change")}
              </Button>
              {variant === "page" && (
                <Button
                  variant="text"
                  onClick={() => {
                    if (!e.locked && online) e.removeDialog.show();
                  }}
                  aria-disabled={e.locked || !online || undefined}
                  aria-describedby={e.locked ? "bank-locked" : undefined}
                  sx={e.locked || !online ? { color: "text.disabled", cursor: "not-allowed" } : undefined}
                >
                  {t("bank.actions.remove")}
                </Button>
              )}
            </>
          }
        />
      )}
      {lockedNote}
      {!e.account && variant === "page" && (
        <Typography color="text.secondary">{t("bank.empty")}</Typography>
      )}

      {showForm && (
        <Stack
          spacing={2}
          component="form"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void e.save();
          }}
          aria-label={e.account ? t("bank.formTitle") : t("bank.add")}
        >
          {e.account && (
            <Typography variant="h5" component="h2">
              {t("bank.formTitle")}
            </Typography>
          )}
          <IbanField
            digits={e.digits}
            onChange={e.setDigits}
            onBlur={e.showProblem}
            problem={e.problem}
            bank={e.typedBank}
            disabled={e.saving}
            autoFocus={Boolean(e.account)}
          />
          {e.actionError && (
            <Banner severity="error" action={e.actionError.retry ? { label: t("common.retry"), onClick: () => void e.save() } : undefined}>
              {e.actionError.message}
              {e.actionError.code && (
                <Typography variant="caption" component="p">
                  <bdi>{t("common.errorCode", { code: e.actionError.code })}</bdi>
                </Typography>
              )}
            </Banner>
          )}
          {variant === "page" && (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                loading={e.saving}
                aria-disabled={Boolean(offlineReason) || undefined}
                onClick={(ev) => {
                  if (offlineReason) ev.preventDefault();
                }}
                sx={{ flex: "1 1 12rem" }}
              >
                {e.saving ? t("bank.saving") : t("bank.save")}
              </Button>
              {e.account && (
                <Button variant="text" size="large" onClick={e.cancelEdit} disabled={e.saving}>
                  {t("bank.cancelEdit")}
                </Button>
              )}
            </Stack>
          )}
          {variant === "flow" && e.account && (
            <Button variant="text" onClick={e.cancelEdit} disabled={e.saving} sx={{ alignSelf: "flex-start" }}>
              {t("bank.cancelEdit")}
            </Button>
          )}
          {offlineReason && variant === "page" && <InfoLine>{offlineReason}</InfoLine>}
        </Stack>
      )}

      <ConfirmDialog
        open={e.confirmReplace.open}
        onCancel={e.confirmReplace.onCancel}
        onConfirm={e.confirmReplace.onConfirm}
        title={t("bank.change.title")}
        confirmLabel={t("bank.change.confirm")}
      >
        {t("bank.change.body", {
          old: isolate(e.account ? maskedIbanGroups(e.account.iban).join(" ") : ""),
        })}
        {e.digits && (
          <Typography component="p" sx={{ mt: 1.5, color: "text.primary" }}>
            <bdi dir="ltr">
              {t("bank.field.prefix")}
              {groupIban(e.digits).join(" ")}
            </bdi>
          </Typography>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={e.removeDialog.open}
        onCancel={e.removeDialog.onCancel}
        onConfirm={e.removeDialog.onConfirm}
        title={t("bank.remove.title")}
        confirmLabel={t("bank.remove.confirm")}
        inFlight={e.removeDialog.inFlight}
        disabledReason={offlineReason}
      >
        {t("bank.remove.body")}
      </ConfirmDialog>
    </Stack>
  );
}
