import { expect, test, type Page } from "@playwright/test";
import type { ClientEnvelope, LiveMatchRow } from "@bg/protocol";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi } from "./mocks";
import { MATCH_ID, playHandlers, playerFixture, stateFixture } from "./play-mocks";

// Smoke test for live.md: LV-01 list and LV-03 spectator view at 390 × 844 in fa. The socket mock
// answers `spectate.join` with a `spectate.state` for a non-player (`you: null`).

const rows: LiveMatchRow[] = [
  {
    match_id: "c0ffee00-0000-4000-8000-000000000001",
    variant: "standard_cube",
    length: 5,
    entry: 0,
    tier_id: 0,
    players: [
      { username: "shahram", avatar: "avatar_07", elo: 1904, level: 22 },
      { username: "negar_b", avatar: "avatar_11", elo: 1861, level: 18 },
    ],
    score: [2, 1],
    game_no: 4,
    spectators: 31,
    pool: 0,
    avg_elo: 1882,
    tournament_id: 7,
    pool_open: false,
    tournament: { id: 7, name: { fa: "جام پاییز", en: "Autumn Cup" }, round: 2, rounds: 3 },
  },
  {
    match_id: MATCH_ID,
    variant: "standard_nocube",
    length: 3,
    entry: 100,
    tier_id: 100,
    players: [
      { username: "ali_tbz", avatar: "avatar_08", elo: 1618, level: 7 },
      { username: "mina", avatar: "avatar_05", elo: 1750, level: 9 },
    ],
    score: [0, 0],
    game_no: 1,
    spectators: 4,
    pool: 120,
    avg_elo: 1684,
    tournament_id: null,
    pool_open: true,
    tournament: null,
  },
];

async function open(page: Page, baseURL: string | undefined, path: string, extra: Record<string, unknown> = {}) {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(
    page,
    {
      me: meFixture(),
      handlers: {
        ...playHandlers(),
        "GET /matches/live": { status: 200, body: { results: rows, next: null } },
        "GET /predictions/open": { status: 200, body: { results: [{ match_id: MATCH_ID, players: ["ali_tbz", "mina"], entry: 100, total_a: 80, total_b: 40, open: true, max_stake_per_user: 1000, max_pool_total: 50000, rake_pct: 10, blocked: null }], next: null } },
        [`GET /predictions/pool/${MATCH_ID}`]: { status: 200, body: { match_id: MATCH_ID, total_a: 80, total_b: 40, open: true, rake_pct: 10, max_stake_per_user: 1000, max_pool_total: 50000, blocked: null, mine: [] } },
        "GET /tournaments": { status: 200, body: { results: [], next: null } },
        ...extra,
      },
    },
    base,
  );
  await page.goto(path, { waitUntil: "load" });
}

test("LV-01 lists live matches with chips and no layout faults", async ({ page, baseURL }) => {
  await open(page, baseURL, "/live");
  await expect(page.locator("main ul > li a, main ul > li button").first()).toBeVisible();
  await expect(page.getByText("پیش‌بینی باز است").first()).toBeVisible();
  // Rows carry their tournament, so the chip names it.
  await expect(page.locator("main").getByText(/جام پاییز/).first()).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await smallTargets(page)).toEqual([]);
});

test("LV-03 spectator view joins read-only with actions in the bottom 40%", async ({ page, baseURL }) => {
  const sent: ClientEnvelope[] = [];
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.onMessage((raw) => {
      const env = JSON.parse(String(raw)) as ClientEnvelope;
      if (env.type === "auth") {
        ws.send(JSON.stringify({ type: "auth.ok", match_id: null, seq: 0, payload: { username: "tester1" } }));
        return;
      }
      sent.push(env);
      if (env.type === "spectate.join") {
        const state = stateFixture({ you: null, players: [playerFixture({ username: "ali_tbz" }), playerFixture({ username: "mina", avatar: "avatar_05" })] });
        ws.send(JSON.stringify({ type: "spectate.state", match_id: MATCH_ID, seq: 10, payload: state }));
      }
    });
  });
  await open(page, baseURL, `/match/${MATCH_ID}`, {
    [`GET /matches/${MATCH_ID}`]: {
      status: 200,
      body: {
        id: MATCH_ID,
        variant: "standard_nocube",
        length: 3,
        entry: 100,
        status: "active",
        is_bot: false,
        players: [
          { username: "ali_tbz", avatar: "avatar_08", elo: 1618, is_bot: false, bot_level: null },
          { username: "mina", avatar: "avatar_05", elo: 1750, is_bot: false, bot_level: null },
        ],
        you: null,
        winner: null,
        score: [0, 0],
        end_reason: null,
        seed_commit: "9b1f",
        created_at: "2026-09-28T10:00:00+00:00",
        ended_at: null,
      },
    },
  });
  await expect.poll(() => sent.some((e) => e.type === "spectate.join"), { timeout: 30_000 }).toBe(true);
  const react = page.getByRole("button", { name: "واکنش تماشاگر" });
  await expect(react).toBeVisible({ timeout: 60_000 });
  // No game controls for spectators (acceptance 5).
  await expect(page.getByRole("button", { name: /^(انداختن تاس|تأیید حرکت|برگشت حرکت)$/ })).toHaveCount(0);
  const box = await react.boundingBox();
  expect(box && box.y >= 844 * 0.6).toBe(true);
  expect(await horizontalOverflow(page)).toBe(0);
});
