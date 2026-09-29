"use client";

import { readJson, removeKey, storageKeys, writeJson } from "./storage";

// Per-tab state of the multi-step auth flows (auth.md §3). Kept in sessionStorage so back, reload,
// and a network drop never make the user re-type (auth.md §1). Passwords and codes are never
// stored (patterns.md §2.6).

/** Verification tokens are valid for 10 minutes on the server (auth.md §3.1 step 4). */
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;

interface CodeState {
  /** Latin digits, `09…`. */
  phone: string;
  /** Last known SMS mode from `POST auth/otp` (`sms.enabled`); undefined until the first call. */
  sms?: boolean;
  /** Epoch ms when the current code stops being valid. */
  expiresAt?: number;
  /** Epoch ms when another code may be requested. */
  resendAt?: number;
  /** Verification token and when it was issued (epoch ms). */
  token?: string;
  tokenAt?: number;
}

export interface SignupFlow extends CodeState {
  age: boolean;
  terms: boolean;
  /** Set when the server rejected registration with AGE_NOT_CONFIRMED. */
  ageError?: boolean;
  username?: string;
  referrer?: string;
}

export interface ResetFlow extends CodeState {
  /** Where to land after the reset (e.g. `/settings` when a signed-in user changes the password). */
  next?: string;
}

export const signupFlow = {
  read: (): SignupFlow | null => readJson<SignupFlow>("session", storageKeys.signup),
  write: (value: SignupFlow) => writeJson("session", storageKeys.signup, value),
  patch: (value: Partial<SignupFlow>) => {
    const current = signupFlow.read() ?? { phone: "", age: false, terms: false };
    const next = { ...current, ...value };
    signupFlow.write(next);
    return next;
  },
  clear: () => removeKey("session", storageKeys.signup),
};

export const resetFlow = {
  read: (): ResetFlow | null => readJson<ResetFlow>("session", storageKeys.reset),
  write: (value: ResetFlow) => writeJson("session", storageKeys.reset, value),
  patch: (value: Partial<ResetFlow>) => {
    const next = { phone: "", ...resetFlow.read(), ...value };
    resetFlow.write(next);
    return next;
  },
  clear: () => removeKey("session", storageKeys.reset),
};

/** True while a code sent in this tab is still valid (for "I already have a code"). */
export function hasLiveCode(flow: CodeState | null, now = Date.now()): boolean {
  return Boolean(flow?.sms && flow.expiresAt && flow.expiresAt > now);
}

/** Token present; the server remains the judge of expiry. */
export function hasToken(flow: CodeState | null): flow is CodeState & { token: string } {
  return Boolean(flow?.token);
}

// ---- Referral (`?ref=<username>`, auth.md §3.1 step 1) ------------------------------------------

interface StoredReferral {
  value: string;
  at: number;
}

export const referral = {
  capture(value: string | null) {
    const clean = value?.trim();
    if (!clean || clean.length > 40) return;
    writeJson("local", storageKeys.referral, { value: clean, at: Date.now() } satisfies StoredReferral);
  },
  read: (): string => readJson<StoredReferral>("local", storageKeys.referral)?.value ?? "",
  clear: () => removeKey("local", storageKeys.referral),
};
