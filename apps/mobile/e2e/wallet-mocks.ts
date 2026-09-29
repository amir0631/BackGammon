import type { BankAccountInfo, LedgerRow, WalletSummary, Withdrawal } from "@bg/protocol";
import { err, type Handlers, type MockResponse } from "./mocks";

// Wallet fixtures for wallet.md screen tests. Values follow the server rules in
// backend/wallet/services.py (bonus lock, rolling windows, fee floor) so screens look real.

const HOUR = 3_600_000;
/**
 * Screenshots are visual-regression baselines, so fixtures use a fixed "now" (the browser clock is
 * pinned to the same instant in wallet.spec.ts) instead of the real clock.
 */
export const FIXED_NOW = Date.parse("2026-09-28T08:30:00Z");
const iso = (msAgo: number) => new Date(FIXED_NOW - msAgo).toISOString();
const ymd = (daysAhead: number) => new Date(FIXED_NOW + daysAhead * 24 * HOUR).toISOString().slice(0, 10);

export function summaryFixture(overrides: Partial<WalletSummary> = {}): WalletSummary {
  const base: WalletSummary = {
    balance: 1250,
    locked: 300,
    bonus_locked: 0,
    withdrawable: 1250,
    transferable: 1250,
    transfer: { daily_max: 5000, used_24h: 200, remaining: 4800, next_available_at: iso(-20 * HOUR), min: 10, fee_pct: 0 },
    withdraw: {
      daily_max: 10000,
      used_24h: 300,
      remaining: 9700,
      next_available_at: iso(-22 * HOUR),
      min: 100,
      fee_pct: 0,
      confirm: "password",
      expected_by: ymd(1),
    },
    coin_price_toman: 1000,
  };
  return { ...base, ...overrides };
}

/** A new account: only the signup bonus, locked until a first purchase or top-up. */
export function firstTimeSummary(): WalletSummary {
  return summaryFixture({
    balance: 100,
    locked: 0,
    bonus_locked: 100,
    withdrawable: 0,
    transferable: 0,
    transfer: { daily_max: 5000, used_24h: 0, remaining: 5000, next_available_at: null, min: 10, fee_pct: 0 },
  });
}

export const bankAccount: BankAccountInfo = {
  id: 7,
  iban: "IR82******************9002",
  bank_code: "054",
  bank: { fa: "بانک پارسیان", en: "Parsian Bank" },
};

export const banks = {
  results: [
    { code: "054", name: { fa: "بانک پارسیان", en: "Parsian Bank" } },
    { code: "017", name: { fa: "بانک ملی ایران", en: "Bank Melli Iran" } },
    { code: "012", name: { fa: "بانک ملت", en: "Bank Mellat" } },
  ],
  next: null,
};

export function ledgerFixture(): LedgerRow[] {
  const row = (id: number, type: LedgerRow["type"], amount: number, msAgo: number, extra: Partial<LedgerRow> = {}): LedgerRow => ({
    id,
    tx_id: `6f1c2a9e-4b7d-4c1e-9a0b-${String(id).padStart(12, "0")}`,
    type,
    amount,
    created_at: iso(msAgo),
    counterparty: null,
    ref_type: null,
    ref_id: null,
    ...extra,
  });
  return [
    row(58, "transfer", 200, 0.5 * HOUR, { counterparty: "ali_tbz", ref_type: "user" }),
    row(57, "withdrawal_hold", -300, 2 * HOUR, { ref_type: "withdrawal", ref_id: "31" }),
    row(55, "transfer", -150, 26 * HOUR, { counterparty: "sara_m", ref_type: "user" }),
    row(52, "admin_topup", 1000, 30 * HOUR),
    row(49, "match_payout", 180, 50 * HOUR, { ref_type: "match", ref_id: "a1" }),
    row(48, "match_entry", -100, 51 * HOUR, { ref_type: "match", ref_id: "a1" }),
    row(40, "signup_bonus", 100, 20 * 24 * HOUR),
  ];
}

export function withdrawalFixture(overrides: Partial<Withdrawal> = {}): Withdrawal {
  return {
    id: 31,
    amount: 300,
    fee: 0,
    payout_toman: 300000,
    status: "pending",
    expected_by: ymd(1),
    bank: bankAccount,
    bank_reference: null,
    reject_reason: null,
    created_at: iso(2 * HOUR),
    decided_at: null,
    ...overrides,
  };
}

export function withdrawalsFixture(): Withdrawal[] {
  return [
    withdrawalFixture(),
    withdrawalFixture({ id: 24, amount: 500, payout_toman: 500000, status: "paid", bank_reference: "140507081234", created_at: iso(6 * 24 * HOUR), decided_at: iso(5 * 24 * HOUR), expected_by: ymd(-5) }),
    withdrawalFixture({ id: 19, amount: 200, payout_toman: 200000, status: "rejected", reject_reason: "شماره شبا با نام صاحب حساب مطابقت ندارد.", created_at: iso(12 * 24 * HOUR), decided_at: iso(11 * 24 * HOUR), expected_by: ymd(-11) }),
    withdrawalFixture({ id: 12, amount: 150, payout_toman: 150000, status: "cancelled", created_at: iso(30 * 24 * HOUR), decided_at: iso(30 * 24 * HOUR), expected_by: ymd(-29) }),
  ];
}

const ok = (body: unknown): MockResponse => ({ status: 200, body: body as Record<string, unknown> });

export interface WalletMockOptions {
  summary?: WalletSummary;
  ledger?: LedgerRow[];
  withdrawals?: Withdrawal[];
  bank?: BankAccountInfo | null;
  extra?: Handlers;
}

/** Handlers for every wallet endpoint the screens read; writes are overridden per case. */
export function walletHandlers(o: WalletMockOptions = {}): Handlers {
  const withdrawals = o.withdrawals ?? withdrawalsFixture();
  const bank = o.bank === undefined ? bankAccount : o.bank;
  return {
    "GET /wallet": ok(o.summary ?? summaryFixture()),
    "GET /wallet/ledger": ok({ results: o.ledger ?? ledgerFixture(), next: null }),
    "GET /wallet/withdrawals": ok({ results: withdrawals, next: null }),
    "GET /wallet/withdrawals/*": (route) => {
      const id = Number(new URL(route.request().url()).pathname.split("/").pop());
      const w = withdrawals.find((x) => x.id === id);
      return w ? ok(w) : err(404, "NOT_FOUND", "errors.notFound");
    },
    "GET /me/bank-accounts": ok({ results: bank ? [bank] : [], next: null }),
    "GET /wallet/banks": ok(banks),
    "POST /wallet/transfer": (route) => {
      const body = route.request().postDataJSON() as { amount: number; username: string };
      return ok({ tx_id: "9b2e7c41-58d3-4f0a-8e6b-2d9a0c7f1e35", balance: 1250 - body.amount, fee: 0, received: body.amount, created_at: new Date(FIXED_NOW).toISOString() });
    },
    "POST /wallet/withdrawals/otp": { status: 202, body: { sms: true, expires_in: 120, resend_after: 60 } },
    "POST /wallet/withdrawals": (route) => {
      const body = route.request().postDataJSON() as { amount: number };
      return { status: 201, body: withdrawalFixture({ id: 32, amount: body.amount, payout_toman: body.amount * 1000, created_at: new Date(FIXED_NOW).toISOString() }) as unknown as Record<string, unknown> };
    },
    ...o.extra,
  };
}
