import { toLatinDigits } from "@bg/i18n";

// Display helpers for the owner's own phone number (patterns.md §18). The API returns `+989…`;
// the UI shows the national form `09…`. Never used for other users (CLAUDE.md §2 rule 11).

/** `+989123456789` → `09123456789` (Latin digits). Other forms are returned digits-only. */
export function nationalPhone(value: string): string {
  const digits = toLatinDigits(value).replace(/[^0-9]/g, "");
  if (digits.startsWith("98") && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

/** `09123456789` → `0912•••••89` (patterns.md §18: first 4 and last 2 digits). */
export function maskPhone(value: string): string {
  const national = nationalPhone(value);
  if (national.length < 7) return "•".repeat(national.length);
  return `${national.slice(0, 4)}${"•".repeat(national.length - 6)}${national.slice(-2)}`;
}
