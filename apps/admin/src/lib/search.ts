import { toLatinDigits } from "@bg/i18n";

const PHONE_LIKE = /^[+\d\s()\-]+$/;

/** admin-users-wallet.md §3.1: normalize digits; phone queries lose the country prefix and stay out of the URL. */
export function normalizeQuery(raw: string): { q: string; phone: boolean } {
  const text = toLatinDigits(raw.trim()).replace(/^@/, "");
  if (!text || !PHONE_LIKE.test(text)) return { q: text, phone: false };
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (text.startsWith("+98")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return { q: digits, phone: true };
}
