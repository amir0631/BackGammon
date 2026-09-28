import { describe, expect, it } from "vitest";
import adminFa from "../messages/admin.fa.json";
import adminEn from "../messages/admin.en.json";
import fa from "../messages/fa.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("admin catalogs", () => {
  it("have the same keys in fa and en", () => {
    expect(keys(adminEn).sort()).toEqual(keys(adminFa).sort());
  });

  it("never redefine a shared key", () => {
    const shared = new Set(keys(fa));
    expect(keys(adminFa).filter((k) => shared.has(k))).toEqual([]);
  });
});
