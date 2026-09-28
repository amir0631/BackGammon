import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./index";

describe("device id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is created once, kept in storage, and never sent to the admin API", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const sent: (string | undefined)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push((init.headers as Record<string, string>)["X-Device-Id"]);
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await api.me.get();
    await api.me.get();
    await api.admin.me();
    expect(sent[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[1]).toBe(sent[0]);
    expect(sent[2]).toBeUndefined();
    expect(store.get("bg.device")).toBe(sent[0]);
  });
});
