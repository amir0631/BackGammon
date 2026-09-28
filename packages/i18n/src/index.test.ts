import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  direction,
  formatDate,
  formatNumber,
  formatPercent,
  groupMobileNumber,
  isLocale,
  isolate,
  localizeDigits,
  normalizeMobileNumber,
  toLatinDigits,
} from "./index";
import fa from "../messages/fa.json";
import en from "../messages/en.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("i18n", () => {
  it("marks fa as RTL and en as LTR", () => {
    expect(direction("fa")).toBe("rtl");
    expect(direction("en")).toBe("ltr");
  });

  it("formats digits per locale", () => {
    expect(formatNumber("fa", 120)).toBe("۱۲۰");
    expect(formatNumber("en", 120)).toBe("120");
  });

  it("formats percents per locale", () => {
    expect(formatPercent("fa", 0.45)).toContain("۴۵");
    expect(formatPercent("en", 0.45)).toBe("45%");
  });

  it("uses the Jalali calendar for fa", () => {
    // 2025-03-21 is 1 Farvardin 1404.
    const out = formatDate("fa", new Date(Date.UTC(2025, 2, 21, 12)), { year: "numeric", timeZone: "UTC" });
    expect(out).toContain("۱۴۰۴");
  });

  it("validates locales", () => {
    expect(isLocale("fa")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("has the same keys in fa and en", () => {
    const faKeys = keys(fa).sort();
    expect(keys(en).sort()).toEqual(faKeys);
  });
});

describe("digit normalization", () => {
  it("converts Persian and Arabic-Indic digits to Latin", () => {
    expect(toLatinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toLatinDigits("کد ۱۲a")).toBe("کد 12a");
  });

  it("keeps only digits", () => {
    expect(digitsOnly("۱۲-۳ ۴a5")).toBe("12345");
  });

  it("localizes digit strings without grouping", () => {
    expect(localizeDigits("fa", "01234")).toBe("۰۱۲۳۴");
    expect(localizeDigits("en", "01234")).toBe("01234");
  });

  it("normalizes Iranian mobile numbers", () => {
    expect(normalizeMobileNumber("۰۹۱۲ ۳۴۵ ۶۷۸۹")).toBe("09123456789");
    expect(normalizeMobileNumber("+98 912 345 6789")).toBe("09123456789");
    expect(normalizeMobileNumber("00989123456789")).toBe("09123456789");
    expect(normalizeMobileNumber("9123456789")).toBe("09123456789");
    expect(normalizeMobileNumber("0212345678")).toBeNull();
    expect(normalizeMobileNumber("0912345")).toBeNull();
  });

  it("groups mobile numbers for display", () => {
    expect(groupMobileNumber("09123456789")).toBe("0912 345 6789");
    expect(groupMobileNumber("0912")).toBe("0912");
    expect(groupMobileNumber("091234")).toBe("0912 34");
  });
});

describe("bidi isolation", () => {
  it("wraps values in first-strong isolate marks", () => {
    expect(isolate("ali_tbz")).toBe("\u2068ali_tbz\u2069");
  });
});
