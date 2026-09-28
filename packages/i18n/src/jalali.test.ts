import { describe, expect, it } from "vitest";
import { formatDateInput, isJalaliLeap, parseDateInput, toGregorian, toJalali } from "./jalali";

describe("jalali", () => {
  it("converts known dates both ways", () => {
    expect(toGregorian(1403, 1, 1)).toEqual({ gy: 2024, gm: 3, gd: 20 });
    expect(toGregorian(1405, 7, 6)).toEqual({ gy: 2026, gm: 9, gd: 28 });
    expect(toJalali(2021, 3, 20)).toEqual({ jy: 1399, jm: 12, jd: 30 });
    expect(isJalaliLeap(1399)).toBe(true);
    expect(isJalaliLeap(1400)).toBe(false);
  });

  it("agrees with the ICU persian calendar for every day of 20 years", () => {
    const fmt = new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
    for (let t = Date.UTC(2010, 0, 1); t < Date.UTC(2030, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
      const j = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      expect([j.jy, j.jm, j.jd]).toEqual([Number.parseInt(parts.year!, 10), Number(parts.month), Number(parts.day)]);
      expect(toGregorian(j.jy, j.jm, j.jd)).toEqual({ gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() });
    }
  });

  it("parses typed dates in either calendar and any digits", () => {
    expect(parseDateInput("۱۴۰۳/۰۱/۰۱")).toBe("2024-03-20");
    expect(parseDateInput("1403-1-1")).toBe("2024-03-20");
    expect(parseDateInput("2024-03-20")).toBe("2024-03-20");
    expect(parseDateInput("1400/12/30")).toBeNull(); // 1400 is not a leap year
    expect(parseDateInput("2023-02-29")).toBeNull();
    expect(parseDateInput("hello")).toBeNull();
    expect(formatDateInput("fa", "2024-03-20")).toBe("1403/01/01");
    expect(formatDateInput("en", "2024-03-20")).toBe("2024-03-20");
  });
});
