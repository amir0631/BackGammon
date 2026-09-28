import { toLatinDigits } from "@bg/i18n";

// Client-side checks for instant feedback on the wallet flows (wallet.md §3.4–§3.6). They mirror
// the server rules (backend/wallet/services.py, backend/wallet/iban.py); the server re-validates
// everything and its coded errors are shown the same way. No value here is ever sent as a result:
// balances, fees, and limits come from `GET wallet`.

// ---- Amounts ------------------------------------------------------------------------------------

/**
 * A typed amount → a positive safe integer, or "invalid". Accepts Persian, Arabic-Indic, and Latin
 * digits and grouping separators; the input keeps what the user typed (P§12: digits are never
 * converted under the cursor).
 */
export function parseAmount(raw: string): number | "empty" | "invalid" {
  const value = toLatinDigits(raw).replace(/[\s,٬،']/g, "");
  if (!value) return "empty";
  if (!/^[0-9]+$/.test(value)) return "invalid";
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return "invalid";
  return n;
}

export type AmountProblem =
  | { kind: "required" }
  | { kind: "invalid" }
  | { kind: "belowMin"; min: number }
  | { kind: "aboveBalance"; balance: number }
  | { kind: "notMovable"; movable: number; bonus: number }
  | { kind: "limit"; remaining: number; max: number; next: string | null };

export interface AmountRules {
  min: number;
  balance: number;
  /** `transferable` or `withdrawable`. */
  movable: number;
  bonusLocked: number;
  remaining: number;
  dailyMax: number;
  nextAvailableAt: string | null;
}

/** The checks in spec order (wallet.md §3.4 step 2.3, §3.6 step 3.4): first failure wins. */
export function amountProblem(raw: string, r: AmountRules): AmountProblem | null {
  const n = parseAmount(raw);
  if (n === "empty") return { kind: "required" };
  if (n === "invalid") return { kind: "invalid" };
  if (n < r.min) return { kind: "belowMin", min: r.min };
  if (n > r.balance) return { kind: "aboveBalance", balance: r.balance };
  if (n > r.movable) return { kind: "notMovable", movable: r.movable, bonus: r.bonusLocked };
  if (n > r.remaining) return { kind: "limit", remaining: r.remaining, max: r.dailyMax, next: r.nextAvailableAt };
  return null;
}

/** floor(amount × pct / 100) with integers only (CLAUDE.md §2 rule 4); a preview, the server decides. */
export function feeFor(amount: number, pct: number): number {
  // `pct` may be fractional (e.g. 0.5): scale to integer basis points first.
  const bp = Math.round(pct * 100);
  return Number((BigInt(amount) * BigInt(bp)) / 10000n);
}

// ---- Recipient ------------------------------------------------------------------------------------

/** Trims spaces and one leading "@" (wallet.md §3.4 step 1.2). */
export function cleanUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").trim();
}

// ---- Sheba (IBAN) ---------------------------------------------------------------------------------

/**
 * The 24 digits after "IR" from anything pasted: with or without "IR", spaces, dashes, and
 * Persian or Arabic-Indic digits (P§12). Other characters are kept so the format check fails.
 */
export function ibanDigits(raw: string): string {
  const value = toLatinDigits(raw).replace(/[\s\-‐-―]/g, "").toUpperCase();
  return value.startsWith("IR") ? value.slice(2) : value;
}

export type IbanProblem = "required" | "format" | "checksum" | "bank";

/** Length, ISO 13616 mod-97, then the known bank code (only when the bank list is available). */
export function ibanProblem(digits: string, knownBanks: ReadonlySet<string> | null): IbanProblem | null {
  if (!digits) return "required";
  if (!/^[0-9]{24}$/.test(digits)) return "format";
  // Rearranged: BBAN + "IR" (I=18, R=27) + check digits; valid when ≡ 1 (mod 97).
  const rearranged = `${digits.slice(2)}1827${digits.slice(0, 2)}`;
  if (BigInt(rearranged) % 97n !== 1n) return "checksum";
  if (knownBanks && !knownBanks.has(bankCode(digits))) return "bank";
  return null;
}

/** Bank identifier: positions 5–7 of the IBAN (after "IRkk"). */
export function bankCode(digits: string): string {
  return digits.slice(2, 5);
}

/** "IR82 0540 1026 …" groups of 4 for display (Latin digits, always LTR). */
export function groupIban(value: string): string[] {
  return value.match(/.{1,4}/g) ?? [];
}

/** The API's masked IBAN (`IR82******************9002`) with bullets, grouped in 4s (wallet.md §3.5). */
export function maskedIbanGroups(masked: string): string[] {
  return groupIban(masked.replace(/\*/g, "•"));
}

export function ibanLast4(masked: string): string {
  return masked.slice(-4);
}

// ---- Phone ------------------------------------------------------------------------------------------

/** `0912•••••89` from the account's own phone (P§18); never another user's. */
export function maskPhone(phone: string): string {
  let d = toLatinDigits(phone).replace(/[^0-9]/g, "");
  if (d.startsWith("98")) d = `0${d.slice(2)}`;
  if (d.length < 7) return d;
  return `${d.slice(0, 4)}${"•".repeat(d.length - 6)}${d.slice(-2)}`;
}
