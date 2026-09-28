import { describe, expect, it } from "vitest";
import { amountProblem, bankCode, cleanUsername, feeFor, ibanDigits, ibanProblem, parseAmount, passwordRules, usernameProblem } from "./index";

// A checksum-valid Iranian IBAN (the same construction as backend/wallet/tests/helpers.make_iban).
const VALID = "IR820540102680020817909002";

describe("wallet rules", () => {
  it("parses amounts in any digits and rejects fractions", () => {
    expect(parseAmount("۱٬۲۰۰")).toBe(1200);
    expect(parseAmount("")).toBe("empty");
    expect(parseAmount("1.5")).toBe("invalid");
    expect(parseAmount("0")).toBe("invalid");
  });

  it("reports the first failing rule in spec order", () => {
    const r = { min: 10, balance: 500, movable: 400, bonusLocked: 100, remaining: 300, dailyMax: 5000, nextAvailableAt: null };
    expect(amountProblem("5", r)).toEqual({ kind: "belowMin", min: 10 });
    expect(amountProblem("600", r)).toEqual({ kind: "aboveBalance", balance: 500 });
    expect(amountProblem("450", r)).toEqual({ kind: "notMovable", movable: 400, bonus: 100 });
    expect(amountProblem("350", r)).toEqual({ kind: "limit", remaining: 300, max: 5000, next: null });
    expect(amountProblem("300", r)).toBeNull();
  });

  it("computes fees with integers only", () => {
    expect(feeFor(1000, 1)).toBe(10);
    expect(feeFor(999, 0.5)).toBe(4);
    expect(feeFor(1000, 0)).toBe(0);
  });

  it("validates Sheba format, checksum, and bank", () => {
    const d = ibanDigits(" ir82 0540 1026 8002 0817 9090 02 ");
    expect(d).toBe(VALID.slice(2));
    expect(ibanProblem(d, new Set(["054"]))).toBeNull();
    expect(bankCode(d)).toBe("054");
    expect(ibanProblem(d, new Set(["017"]))).toBe("bank");
    expect(ibanProblem(`${d.slice(0, 23)}3`, null)).toBe("checksum");
    expect(ibanProblem("123", null)).toBe("format");
    expect(ibanProblem("", null)).toBe("required");
  });
});

describe("account rules", () => {
  it("mirrors the server username rule", () => {
    expect(usernameProblem("ab")).toBe("length");
    expect(usernameProblem("1abc")).toBe("start");
    expect(usernameProblem("ab-c")).toBe("chars");
    expect(usernameProblem("Reza_90")).toBeNull();
    expect(cleanUsername(" @reza ")).toBe("reza");
  });

  it("checks password length and all-digits", () => {
    expect(passwordRules("12345678", false).map((r) => r.met)).toEqual([true, false, null]);
    expect(passwordRules("S3cure-pass", true).map((r) => r.met)).toEqual([true, true, false]);
  });
});
