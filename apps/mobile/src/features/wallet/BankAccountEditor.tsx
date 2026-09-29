"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, bankCode, ibanProblem, type IbanProblem } from "@bg/api-client";
import type { BankAccountInfo, BankInfo, Withdrawal } from "@bg/protocol";
import { useToast } from "@/components/feedback/Toast";
import { bankName } from "@/components/wallet/BankAccount";
import { toApiError, useErrorText } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
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
