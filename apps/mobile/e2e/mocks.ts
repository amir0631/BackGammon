import type { Page, Route } from "@playwright/test";
import type { Me, PublicUser, SessionInfo } from "@bg/protocol";

// API mocks for screen tests. Shapes follow packages/protocol and the backend error format
// (CLAUDE.md §10.1). Each scenario overrides only what its screen needs.

const HOUR = 3_600_000;

export function meFixture(overrides: Partial<Me> = {}): Me {
  return {
    id: 2,
    username: "tester1",
    phone: "+989121234567",
    lang: "fa",
    avatar: "avatar_03",
    prefs: { graphics_lite: false, animations_reduced: false, sound: true, vibration: true },
    status: "active",
    phone_verified: true,
    elo: 1542,
    xp: 120,
    level: 3,
    created_at: "2026-03-21T10:00:00+00:00",
    ...overrides,
  };
}

export function sessionsFixture(): SessionInfo[] {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  return [
    {
      id: "s-2",
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ip: null,
      created_at: iso(now - 72 * HOUR),
      last_used_at: iso(now - 5 * HOUR),
      current: false,
    },
    {
      id: "s-1",
      user_agent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
      ip: null,
      created_at: iso(now - 2 * HOUR),
      last_used_at: iso(now - 60_000),
      current: true,
    },
    {
      id: "s-3",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
      ip: null,
      created_at: iso(now - 20 * 24 * HOUR),
      last_used_at: iso(now - 3 * 24 * HOUR),
      current: false,
    },
  ];
}

export const otherPlayer: PublicUser = {
  username: "ali_tbz",
  avatar: "avatar_08",
  elo: 1618,
  level: 7,
  created_at: "2025-11-02T10:00:00+00:00",
};

type Json = Record<string, unknown> | unknown[];
export interface MockResponse {
  status: number;
  body?: Json;
}

export const err = (status: number, code: string, messageKey: string, details: Record<string, unknown> = {}): MockResponse => ({
  status,
  body: { code, message_key: messageKey, details },
});

/** method + path (after /api/v1) → response. Paths may end with `*` for a prefix match. */
export type Handlers = Record<string, MockResponse | ((route: Route) => MockResponse)>;

export interface Scenario {
  /** Signed-in user, or null for a guest. */
  me?: Me | null;
  handlers?: Handlers;
  /** sessionStorage entries set before any script runs. */
  session?: Record<string, unknown>;
  local?: Record<string, unknown>;
}

function baseHandlers(me: Me | null): Handlers {
  return {
    "GET /me": me ? { status: 200, body: me as unknown as Json } : err(401, "UNAUTHENTICATED", "errors.unauthenticated"),
    "PATCH /me": (route) => ({ status: 200, body: { ...(me ?? meFixture()), ...(route.request().postDataJSON() as object) } }),
    "GET /auth/csrf": { status: 204 },
    "POST /auth/refresh": err(401, "AUTH_SESSION_INVALID", "errors.auth.sessionInvalid"),
    "GET /avatars": { status: 200, body: { results: Array.from({ length: 12 }, (_, i) => ({ key: `avatar_${String(i + 1).padStart(2, "0")}` })), next: null } },
    "GET /auth/username-available*": { status: 200, body: { available: true, reason: null } },
    "GET /me/sessions": { status: 200, body: { results: sessionsFixture(), next: null } },
    "DELETE /me/sessions": { status: 200, body: { revoked: 2 } },
    "GET /users/*": (route) => {
      const name = decodeURIComponent(route.request().url().split("/users/")[1] ?? "").toLowerCase();
      if (me?.username && name === me.username.toLowerCase()) {
        return { status: 200, body: { username: me.username, avatar: me.avatar, elo: me.elo, level: me.level, created_at: me.created_at } };
      }
      if (name === otherPlayer.username) return { status: 200, body: otherPlayer as unknown as Json };
      return err(404, "NOT_FOUND", "errors.notFound");
    },
    "POST /auth/logout": { status: 204 },
    // The balance chip on every signed-in screen reads the wallet summary (wallet.md §3.1).
    "GET /wallet": me
      ? {
          status: 200,
          body: {
            balance: 1250,
            locked: 0,
            bonus_locked: 0,
            withdrawable: 1250,
            transferable: 1250,
            transfer: { daily_max: 5000, used_24h: 0, remaining: 5000, next_available_at: null, min: 10, fee_pct: 0 },
            withdraw: { daily_max: 10000, used_24h: 0, remaining: 10000, next_available_at: null, min: 100, fee_pct: 0, confirm: "password", expected_by: "2026-09-29" },
            coin_price_toman: 1000,
          },
        }
      : err(401, "UNAUTHENTICATED", "errors.unauthenticated"),
  };
}

function match(handlers: Handlers, method: string, path: string) {
  const exact = handlers[`${method} ${path}`];
  if (exact) return exact;
  const prefix = Object.keys(handlers)
    .filter((k) => k.endsWith("*") && `${method} ${path}`.startsWith(k.slice(0, -1)))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? handlers[prefix] : undefined;
}

export async function mockApi(page: Page, scenario: Scenario, baseURL: string): Promise<void> {
  const handlers = { ...baseHandlers(scenario.me ?? null), ...scenario.handlers };
  // The api-client sends X-CSRFToken from this cookie on writes.
  await page.context().addCookies([{ name: "csrftoken", value: "e2e", domain: new URL(baseURL).hostname, path: "/" }]);
  await page.route("**/api/v1/**", async (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    const handler = match(handlers, method, path);
    if (!handler) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "NOT_FOUND", message_key: "errors.notFound", details: {} }) });
      return;
    }
    const res = typeof handler === "function" ? handler(route) : handler;
    await route.fulfill({
      status: res.status,
      contentType: "application/json",
      body: res.body === undefined ? "" : JSON.stringify(res.body),
    });
  });
  const session = scenario.session ?? {};
  const local = scenario.local ?? {};
  await page.addInitScript(
    ([s, l]) => {
      // Seed once: later navigations in the same test keep what the app wrote.
      for (const [k, v] of Object.entries(s)) if (window.sessionStorage.getItem(k) === null) window.sessionStorage.setItem(k, JSON.stringify(v));
      for (const [k, v] of Object.entries(l)) if (window.localStorage.getItem(k) === null) window.localStorage.setItem(k, JSON.stringify(v));
    },
    [session, local] as const,
  );
}
