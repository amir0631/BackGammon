import { describe, expect, it } from "vitest";
import { direction, formatDate, formatNumber, isLocale } from "./index";
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
