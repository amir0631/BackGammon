"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { isolate } from "@bg/i18n";
import { readJson, removeKey, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import type { AmountProblem } from "./validation";

// Formatting and small state helpers shared by the wallet screens (wallet.md §5 timing rules, §7).

const DAY_MS = 86_400_000;

/** Formatting for wallet dates: rolling-window times and `expected_by` dates. */
export function useWalletFormat() {
  const f = useFormat();
  return {
    ...f,
    /**
     * `next_available_at`: Jalali date + 24-hour time in fa («۷ مهر، ۱۴:۳۰»); within 24 hours the
     * relative time is added in parentheses (wallet.md §5 timing rules).
     */
    windowTime: (iso: string) => {
      const at = new Date(iso);
      const text = f.date(at, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const ahead = at.getTime() - Date.now();
      return ahead > 0 && ahead < DAY_MS ? `${text} (${f.relative(at)})` : text;
    },
    /** A date-only value (`YYYY-MM-DD`, e.g. `expected_by`): «۷ مهر ۱۴۰۵» / "29 September 2026". */
    dayOnly: (ymd: string) => f.date(`${ymd}T00:00:00Z`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

/** Today's date in Asia/Tehran as `YYYY-MM-DD` (withdrawal "late" note, wallet.md §3.7). */
export function tehranToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Field text for an amount problem (wallet.md §3.4 step 2.3, §3.6 step 3.4). No message links to
 * the shop (P§9.1).
 */
export function useAmountErrorText(flow: "transfer" | "withdraw") {
  const t = useTranslations(flow === "transfer" ? "transfer.amount.error" : "withdraw.amount.error");
  const f = useWalletFormat();
  return useCallback(
    (p: AmountProblem): string => {
      switch (p.kind) {
        case "required":
          return t("required");
        case "invalid":
          return t("invalid");
        case "belowMin":
          return t("belowMin", { min: f.number(p.min) });
        case "aboveBalance":
          return t("aboveBalance", { balance: f.number(p.balance) });
        case "notMovable":
          if (flow === "transfer") return t("notTransferable", { transferable: f.number(p.movable), bonus: f.number(p.bonus) });
          return p.bonus > 0
            ? t("notWithdrawableBonus", { withdrawable: f.number(p.movable) })
            : t("notWithdrawable", { withdrawable: f.number(p.movable) });
        case "limit": {
          const line = t("limit", { remaining: f.number(p.remaining), max: f.number(p.max) });
          return p.next ? `${line} ${t("limitNext", { time: isolate(f.windowTime(p.next)) })}` : line;
        }
      }
    },
    [t, f, flow],
  );
}

// ---- Password lock (AUTH_LOCKED / WALLET_PASSWORD_LOCKED), kept per action for reloads -------------

const lockKey = (scope: "transfer" | "withdraw") => `bg.wallet.pwLock.${scope}`;

export const passwordLock = {
  read: (scope: "transfer" | "withdraw"): number | null => {
    const until = readJson<number>("session", lockKey(scope));
    return until && until > Date.now() ? until : null;
  },
  set: (scope: "transfer" | "withdraw", seconds: number) => writeJson("session", lockKey(scope), Date.now() + seconds * 1000),
  clear: (scope: "transfer" | "withdraw") => removeKey("session", lockKey(scope)),
};

/** Wrong-password codes from the wallet endpoints (current and the pre-change auth codes). */
export function isWrongPassword(code: string): boolean {
  return code === "WALLET_PASSWORD_INVALID" || code === "AUTH_INVALID_CREDENTIALS";
}

export function isPasswordLocked(code: string): boolean {
  return code === "WALLET_PASSWORD_LOCKED" || code === "AUTH_LOCKED";
}

/** Numbers from error `details`. */
export function detailNumber(details: Record<string, unknown>, key: string): number | null {
  const v = details[key];
  return typeof v === "number" ? v : null;
}

export function detailString(details: Record<string, unknown>, key: string): string | null {
  const v = details[key];
  return typeof v === "string" ? v : null;
}
