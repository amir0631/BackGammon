import { expect, test, type Page } from "@playwright/test";
import type { ClientEnvelope, PredictionRow } from "@bg/protocol";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi, type Handlers } from "./mocks";
import { MATCH_ID, playerFixture, playHandlers, stateFixture } from "./play-mocks";

// Smoke tests for predictions.md at 390 × 844 in fa: PR-01 → PR-02 shows the stake, balance, and
// balance after before paying, sends one POST with an Idempotency-Key, and lands on "Your
// prediction"; PR-04 groups stakes by match with an outcome from the winner and the side.

async function open(page: Page, baseURL: string | undefined, path: string, extra: Handlers = {}) {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(page, { me: meFixture(), handlers: { ...playHandlers(), "GET /tournaments": { status: 200, body: { results: [], next: null } }, ...extra } }, base);
  await page.goto(path, { waitUntil: "load" });
}

test("PR-01/PR-02 places a prediction with the cost shown first", async ({ page, baseURL }) => {
  const mine: { side: 0 | 1; amount: number; payout: null }[] = [];
  const posts: { key: string | null; body: unknown }[] = [];
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.onMessage((raw) => {
      const env = JSON.parse(String(raw)) as ClientEnvelope;
      if (env.type === "auth") ws.send(JSON.stringify({ type: "auth.ok", match_id: null, seq: 0, payload: { username: "tester1" } }));
      else if (env.type === "spectate.join") {
        const state = stateFixture({ you: null, players: [playerFixture({ username: "ali_tbz" }), playerFixture({ username: "mina", avatar: "avatar_05" })] });
        ws.send(JSON.stringify({ type: "spectate.state", match_id: MATCH_ID, seq: 10, payload: state }));
      }
    });
  });
  await open(page, baseURL, `/match/${MATCH_ID}`, {
    [`GET /matches/${MATCH_ID}`]: {
      status: 200,
      body: {
        id: MATCH_ID, variant: "standard_nocube", length: 3, entry: 100, status: "active", is_bot: false,
        players: [
          { username: "ali_tbz", avatar: "avatar_08", elo: 1618, is_bot: false, bot_level: null },
          { username: "mina", avatar: "avatar_05", elo: 1750, is_bot: false, bot_level: null },
        ],
        you: null, winner: null, score: [0, 0], end_reason: null, seed_commit: "9b1f", created_at: "2026-09-28T10:00:00+00:00", ended_at: null,
      },
    },
    [`GET /predictions/pool/${MATCH_ID}`]: () => ({
      status: 200,
      body: { match_id: MATCH_ID, total_a: 800, total_b: 400 + mine.reduce((s, m) => s + m.amount, 0), open: true, rake_pct: 10, max_stake_per_user: 1000, max_pool_total: 50000, blocked: null, mine },
    }),
    "POST /predictions": (route) => {
      posts.push({ key: route.request().headers()["idempotency-key"] ?? null, body: route.request().postDataJSON() });
      mine.push({ side: 1, amount: 100, payout: null });
      return { status: 201, body: { id: 1, match_id: MATCH_ID, side: 1, amount: 100, payout: null, pool_status: "open", winner_side: null, players: ["ali_tbz", "mina"], created_at: new Date().toISOString() } };
    },
  });
  const predict = page.getByRole("button", { name: "پیش‌بینی", exact: true });
  await expect(predict).toBeVisible({ timeout: 60_000 });
  const box = await predict.boundingBox();
  expect(box && box.y >= 844 * 0.6).toBe(true);
  await predict.click();
  const sheet = page.getByRole("dialog");
  await sheet.locator("label").filter({ hasText: "mina" }).click();
  await sheet.getByLabel("مبلغ پیش‌بینی (سکه)").fill("100");
  // Estimate from the pool's fee: pool 1,300, fee 130 → floor(100 × 1,170 / 500) = 234.
  await expect(sheet.getByText(/حدود ۲۳۴ سکه/)).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await sheet.getByRole("button", { name: "ادامه" }).click();
  const confirm = page.getByRole("dialog").filter({ hasText: "پرداخت ۱۰۰ سکه" });
  await expect(confirm.getByText("موجودی شما").first()).toBeVisible();
  await expect(confirm.getByText(/۱٬۱۵۰/)).toBeVisible();
  await confirm.getByRole("button", { name: /پرداخت ۱۰۰ سکه/ }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]!.key).toBeTruthy();
  expect(posts[0]!.body).toEqual({ match_id: MATCH_ID, side: 1, amount: 100 });
  await expect(page.getByText(/پیش‌بینی شما: ۱۰۰ سکه روی/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});

test("PR-04 groups stakes per match and links to the accuracy board", async ({ page, baseURL }) => {
  const row = (o: Partial<PredictionRow>): PredictionRow => ({
    id: 1, match_id: "m-1", side: 0, amount: 100, payout: null, pool_status: "settled", winner_side: 0, players: ["ali_tbz", "mina"], created_at: "2026-09-20T10:00:00Z", ...o,
  });
  await open(page, baseURL, "/me/predictions", {
    "GET /me/predictions": {
      status: 200,
      body: {
        results: [
          row({ id: 3, match_id: "m-2", side: 1, pool_status: "open", winner_side: null, players: ["shahram", "negar_b"] }),
          row({ id: 2, amount: 50, payout: 45 }),
          row({ id: 1, amount: 100, payout: 90 }),
        ],
        next: null,
      },
    },
  });
  await expect(page.getByRole("link", { name: "جدول دقت پیش‌بینی" })).toBeVisible();
  const cards = page.locator("li").filter({ has: page.getByRole("link", { name: /انتخاب شما/ }) });
  await expect(cards).toHaveCount(2);
  // 150 staked, 135 paid on the winning side → "Won, less than stake", net −15.
  await expect(cards.nth(1).getByText("برد، کمتر از مبلغ پیش‌بینی")).toBeVisible();
  await expect(cards.nth(1).getByText(/−۱۵/)).toBeVisible();
  await cards.nth(1).getByRole("button", { name: /۲ پیش‌بینی روی این مسابقه/ }).click();
  await expect(cards.nth(1).locator("ul li")).toHaveCount(2);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await smallTargets(page)).toEqual([]);
});
