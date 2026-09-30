import { afterEach, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey } from "./index";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("idempotency key", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a v4 UUID in a secure context", () => {
    expect(newIdempotencyKey()).toMatch(V4);
  });

  it("is a v4 UUID without crypto.randomUUID (plain HTTP)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(V4);
  });
});
