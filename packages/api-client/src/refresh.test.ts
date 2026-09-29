import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, api } from "./index";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("token refresh", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("replays the request after a successful refresh", async () => {
    const calls: string[] = [];
    let me = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url.endsWith("/auth/refresh")) return json(200, {});
      if (url.endsWith("/auth/csrf")) return new Response(null, { status: 204 });
      me += 1;
      return me === 1
        ? json(401, { code: "AUTH_SESSION_INVALID", message_key: "errors.auth.sessionInvalid", details: {} })
        : json(200, { id: 1 });
    });
    await expect(api.me.get()).resolves.toEqual({ id: 1 });
    expect(calls.filter((u) => u.endsWith("/me"))).toHaveLength(2);
  });

  it("surfaces a ban found while refreshing", async () => {
    await new Promise((r) => setTimeout(r, 5)); // let the previous test's shared refresh settle
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/auth/refresh")) return json(403, { code: "AUTH_BANNED", message_key: "errors.auth.banned", details: {} });
      if (url.endsWith("/auth/csrf")) return new Response(null, { status: 204 });
      return json(401, { code: "AUTH_SESSION_INVALID", message_key: "errors.auth.sessionInvalid", details: {} });
    });
    const err = await api.me.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).body.code).toBe("AUTH_BANNED");
  });
});
