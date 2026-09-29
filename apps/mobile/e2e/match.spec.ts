import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { MatchStateOut } from "@bg/protocol";
import { horizontalOverflow, setTextScale, smallTargets } from "./checks";
import { meFixture, mockApi, type Handlers, type Scenario } from "./mocks";
import { clockFixture, MATCH_ID, mockSocket, playerFixture, playHandlers, stateFixture, type WsMock } from "./play-mocks";

// Screen catalog for match.md (MA-01 … MA-19) with a mocked API and WebSocket: the socket answers
// `match.sync` with a full `match.state`, and tests push further events. Same checks as the other
// suites; screenshots in docs/ui/screenshots/match/ with UPDATE_SCREENSHOTS=1; ALL_VIEWPORTS=1 for
// the full six-viewport matrix. Headless Chromium renders the 3D board through SwiftShader.

interface Variant {
  locale: "fa" | "en";
  width: number;
  height: number;
}
const SIX: [number, number][] = [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1440, 900],
];
const ALL: Variant[] = (["fa", "en"] as const).flatMap((locale) => SIX.map(([width, height]) => ({ locale, width, height })));
const V390_FA: Variant = { locale: "fa", width: 390, height: 844 };
const V390_EN: Variant = { locale: "en", width: 390, height: 844 };
const LAND_FA: Variant = { locale: "fa", width: 844, height: 390 };
const LAND_EN: Variant = { locale: "en", width: 844, height: 390 };
const WIDE: Variant[] = process.env.ALL_VIEWPORTS ? [...ALL, LAND_FA, LAND_EN] : [V390_FA, V390_EN, { locale: "fa", width: 360, height: 800 }, { locale: "fa", width: 430, height: 932 }, { locale: "fa", width: 768, height: 1024 }, { locale: "en", width: 1024, height: 768 }, { locale: "fa", width: 1440, height: 900 }, LAND_FA];
const STATE: Variant[] = process.env.ALL_VIEWPORTS ? [...ALL, LAND_FA] : [V390_FA, V390_EN];

const SHOTS = path.resolve(__dirname, "../../../docs/ui/screenshots/match");

/** Legal plays for 3–1 from the start (player A's numbering). */
const LEGAL_31 = [[[8, 5], [6, 5]], [[24, 21], [24, 23]], [[13, 10], [10, 9]], [[8, 5], [8, 7]]];

const summary = (overrides: Record<string, unknown> = {}) => ({
  id: MATCH_ID,
  variant: "standard_cube",
  length: 3,
  entry: 100,
  status: "active",
  is_bot: false,
  players: [
    { username: "tester1", avatar: "avatar_03", elo: 1542, is_bot: false, bot_level: null },
    { username: "ali_tbz", avatar: "avatar_08", elo: 1618, is_bot: false, bot_level: null },
  ],
  you: 0,
  winner: null,
  score: [1, 0],
  end_reason: null,
  seed_commit: "9b1f0c7a52de4e0b8a1c3d5e7f90a1b2c3d4e5f60718293a4b5c6d7e8f901234",
  created_at: "2026-09-28T10:00:00+00:00",
  ended_at: null,
  ...overrides,
});

function handlers(extra: Handlers = {}): Handlers {
  return {
    ...playHandlers(),
    [`GET /matches/${MATCH_ID}`]: { status: 200, body: summary() },
    "GET /phrases": { status: 200, body: { results: [], next: null } },
    "GET /shop/items*": { status: 200, body: { results: [], next: null } },
    ...extra,
  };
}

interface Case {
  id: string;
  state?: () => MatchStateOut;
  extra?: Handlers;
  me?: Scenario["me"];
  before?: (page: Page) => Promise<void>;
  act?: (page: Page, ws: WsMock) => Promise<void>;
  /** Screens without the 3D board (MA-14, MA-17). */
  noBoard?: boolean;
  variants: Variant[];
}

const button = (page: Page, name: RegExp) => page.getByRole("button", { name }).filter({ visible: true }).first();

async function openMenu(page: Page) {
  await button(page, /^(Match menu|منوی مسابقه)$/).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(350);
}

const moving = () => stateFixture({ phase: "move", dice: [3, 1], legal: LEGAL_31, can_double: false });

const cases: Case[] = [
  { id: "ma02-your-roll", state: () => stateFixture(), variants: WIDE },
  { id: "ma02-moving", state: moving, variants: WIDE },
  {
    id: "ma02-moving-selected",
    state: moving,
    act: async (page) => {
      await page.keyboard.press("m");
      await page.getByRole("dialog").waitFor();
      await button(page, /Move entry|ورود حرکت/).click();
      await button(page, /^(Point 13|خانه‌ی ۱۳)/).click();
      await page.waitForTimeout(300);
      await button(page, /To point 10|به خانه‌ی ۱۰/).click();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    },
    variants: STATE,
  },
  { id: "ma02-opponent-turn", state: () => stateFixture({ turn: 1, can_double: false, clock: clockFixture({ actor: 1 }) }), variants: STATE },
  {
    id: "ma02-bot",
    state: () =>
      stateFixture({
        entry: 0,
        turn: 1,
        phase: "move",
        dice: [6, 4],
        can_double: false,
        players: [playerFixture({ username: "tester1", avatar: "avatar_03" }), playerFixture({ username: "bot_medium", avatar: "avatar_07", is_bot: true, bot_level: "medium" })],
        clock: clockFixture({ actor: 1 }),
      }),
    extra: { [`GET /matches/${MATCH_ID}`]: { status: 200, body: summary({ is_bot: true, entry: 0 }) } },
    variants: STATE,
  },
  { id: "ma02-crawford", state: () => stateFixture({ crawford_game: true, can_double: false, score: [2, 1] }), variants: STATE },
  {
    id: "ma02-low-time",
    state: () => stateFixture({ clock: clockFixture({ deadline: Date.now() + 8000, bank: [0, 90] }) }),
    variants: STATE,
  },
  { id: "ma03-menu", state: () => stateFixture(), act: openMenu, variants: STATE },
  {
    id: "ma05-reactions",
    state: () => stateFixture(),
    act: async (page) => {
      await button(page, /^(Reactions|واکنش‌ها)$/).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(350);
    },
    variants: STATE,
  },
  {
    id: "ma06-bubble",
    state: () => stateFixture(),
    act: async (page, ws) => {
      ws.push("react.recv", { key: "good_luck", kind: "phrase", sender: 1 });
      await page.getByText(/Good luck!|موفق باشی!/).first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "ma07-double-offered",
    state: () => stateFixture({ phase: "cube_offered", turn: 1, can_double: false, clock: clockFixture({ actor: 0 }) }),
    act: async (page) => {
      await page.getByText(/offers to double|پیشنهاد دوبل/).waitFor();
      await page.waitForTimeout(350);
    },
    variants: STATE,
  },
  {
    id: "ma08-resign",
    state: () => stateFixture(),
    act: async (page) => {
      await openMenu(page);
      await button(page, /^(Resign|واگذاری)$/).click();
      await page.waitForTimeout(350);
      await page.getByRole("radio").first().click();
    },
    variants: STATE,
  },
  {
    id: "ma09-leave",
    state: () => stateFixture(),
    act: async (page) => {
      await button(page, /^(Leave match screen|خروج از صفحه‌ی مسابقه)$/).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(350);
    },
    variants: STATE,
  },
  {
    id: "ma10-reconnecting",
    state: () => stateFixture(),
    act: async (page, ws) => {
      ws.refuse(true);
      ws.drop();
      await page.getByText(/Reconnecting|در حال اتصال دوباره/).first().waitFor();
      await page.waitForTimeout(400);
    },
    variants: STATE,
  },
  {
    id: "ma11-opponent-disconnected",
    state: () =>
      stateFixture({
        turn: 0,
        players: [playerFixture({ username: "tester1", avatar: "avatar_03" }), playerFixture({ connected: false })],
        grace: [null, Date.now() + 64_000],
      }),
    variants: STATE,
  },
  { id: "ma12-timeout-warning", state: () => stateFixture({ timeouts: [2, 0] }), variants: STATE },
  {
    id: "ma13a-game-ended",
    state: () => stateFixture({ phase: "game_over", turn: null, score: [2, 0], clock: clockFixture({ actor: null, deadline: null }), results: [{ game_no: 1, winner: 0, kind: "single", cube: 1, points: 1, reason: "bear_off" }, { game_no: 2, winner: 0, kind: "single", cube: 1, points: 1, reason: "resign" }] }),
    variants: STATE,
  },
  {
    id: "ma13b-won",
    state: () => stateFixture(),
    act: async (page, ws) => {
      ws.push("game.ended", { game_no: 2, winner: 0, kind: "gammon", cube: 1, points: 2, reason: "bear_off", score: [3, 0] });
      ws.push("match.ended", { winner: 0, score: [3, 0], reason: "points", seed: "c0ffee00".repeat(8), elo: { a: 12, b: -12 }, xp: { a: 25, b: 10 }, settlement: { entry: 100, pot: 200, rake: 20, payout: 180 } });
      await page.getByText(/You won the match|مسابقه را بردید/).first().waitFor();
      await page.waitForTimeout(400);
    },
    variants: WIDE,
  },
  {
    id: "ma13b-lost-unaffordable",
    state: () => stateFixture(),
    extra: {
      "GET /wallet": {
        status: 200,
        body: {
          balance: 60, locked: 0, bonus_locked: 0, withdrawable: 60, transferable: 60,
          transfer: { daily_max: 5000, used_24h: 0, remaining: 5000, next_available_at: null, min: 10, fee_pct: 0 },
          withdraw: { daily_max: 10000, used_24h: 0, remaining: 10000, next_available_at: null, min: 100, fee_pct: 0, confirm: "password", expected_by: "2026-09-29" },
          coin_price_toman: 1000,
        },
      },
    },
    act: async (page, ws) => {
      ws.push("match.ended", { winner: 1, score: [1, 3], reason: "resign", seed: "c0ffee00".repeat(8), elo: { a: -11, b: 11 }, xp: { a: 10, b: 25 }, settlement: { entry: 100, pot: 200, rake: 20, payout: 180 } });
      await page.getByText(/won the match|مسابقه را برد/).first().waitFor();
      await page.waitForTimeout(600);
    },
    variants: STATE,
  },
  {
    id: "ma13b-cancelled",
    state: () => stateFixture({ game_no: 1, phase: "opening", turn: null, score: [0, 0], results: [], clock: clockFixture({ actor: null, deadline: null }) }),
    act: async (page, ws) => {
      ws.push("match.ended", { winner: null, score: [0, 0], reason: "aborted:resign", seed: "c0ffee00".repeat(8), elo: null, xp: null, settlement: { refund: 100 } });
      await page.getByText(/Match cancelled|مسابقه لغو شد/).first().waitFor();
      await page.waitForTimeout(400);
    },
    variants: STATE,
  },
  {
    id: "ma18-move-entry",
    state: moving,
    act: async (page) => {
      await openMenu(page);
      await button(page, /Move entry|ورود حرکت/).click();
      await page.waitForTimeout(350);
    },
    variants: STATE,
  },
  {
    id: "ma19-waiting-join",
    state: () =>
      stateFixture({
        game_no: 1,
        phase: "opening",
        turn: null,
        score: [0, 0],
        results: [],
        clock: clockFixture({ actor: null, deadline: null }),
        players: [playerFixture({ username: "tester1", avatar: "avatar_03" }), playerFixture({ connected: false })],
      }),
    variants: STATE,
  },
  {
    id: "ma14-finished",
    noBoard: true,
    extra: {
      [`GET /matches/${MATCH_ID}`]: {
        status: 200,
        body: summary({ status: "finished", winner: 0, score: [3, 1], end_reason: "points", ended_at: "2026-09-28T10:40:00+00:00", elo_delta: 14, xp: 25, coins: 80, games: [] }),
      },
    },
    variants: STATE,
  },
  {
    id: "ma14-not-found",
    noBoard: true,
    extra: { [`GET /matches/${MATCH_ID}`]: { status: 404, body: { code: "NOT_FOUND", message_key: "errors.notFound", details: {} } } },
    variants: STATE,
  },
  {
    id: "ma17-unsupported",
    noBoard: true,
    before: async (page) => {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
          if (kind === "webgl2") return null;
          return (original as (...a: unknown[]) => unknown).call(this, kind, ...rest);
        } as typeof original;
      });
    },
    variants: STATE,
  },
];

async function ready(page: Page, noBoard?: boolean) {
  if (noBoard) {
    await page.locator("h1, h2").first().waitFor();
    await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
    return;
  }
  await page.locator("canvas").first().waitFor({ timeout: 60_000 });
  await expect(page.getByText(/Getting the board ready|در حال آماده‌سازی صفحه‌ی بازی/)).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1200);
}

for (const c of cases) {
  for (const v of c.variants) {
    test(`${c.id} ${v.locale} ${v.width}x${v.height}`, async ({ page, baseURL }) => {
      const base = baseURL ?? "http://m.localhost:8080";
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: v.locale, domain: new URL(base).hostname, path: "/" }]);
      await mockApi(page, { me: meFixture({ lang: v.locale }), handlers: handlers(c.extra), local: { "bg.play.feeHintSeen.2": true } }, base);
      const ws = await mockSocket(page, { state: c.state });
      if (c.before) await c.before(page);
      await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
      await ready(page, c.noBoard);
      if (c.act) await c.act(page, ws);
      await page.waitForTimeout(300);

      expect(await horizontalOverflow(page), "horizontal overflow").toBe(0);
      expect(await smallTargets(page), "targets under 44 px").toEqual([]);

      if (process.env.UPDATE_SCREENSHOTS) {
        await page.screenshot({ path: path.join(SHOTS, `${c.id}--${v.locale}-${v.width}x${v.height}.png`), animations: "disabled", caret: "hide" });
      }
      await setTextScale(page, 200);
      expect(await horizontalOverflow(page), "horizontal overflow at 200% text").toBe(0);
    });
  }
}

// Behaviour from match.md §9 that screenshots can't show.
test.describe("match behaviour", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", domain: new URL(baseURL!).hostname, path: "/" }]);
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers: handlers(), local: { "bg.play.feeHintSeen.2": true } }, baseURL!);
  });

  test("Roll sends one turn.roll and sits in the bottom 40%", async ({ page }) => {
    const ws = await mockSocket(page, { state: () => stateFixture() });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    const roll = button(page, /^Roll$/);
    const box = await roll.boundingBox();
    expect(box!.y).toBeGreaterThan(844 * 0.6);
    expect(box!.height).toBeGreaterThanOrEqual(56);
    const dbl = button(page, /^Double to ×2$/);
    expect((await dbl.boundingBox())!.y).toBeGreaterThan(844 * 0.6);
    await roll.dblclick();
    await page.waitForTimeout(400);
    expect(ws.sent.filter((m) => m.type === "turn.roll")).toHaveLength(1);
    expect(ws.sent.find((m) => m.type === "match.sync")?.payload).toEqual({ last_seq: 0 });
  });

  test("a full turn by keyboard sends exactly the built move list", async ({ page }) => {
    const ws = await mockSocket(page, { state: moving });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    await expect(button(page, /^Confirm move$/)).toBeDisabled();
    await page.keyboard.press("m");
    await button(page, /Move entry/).click();
    await button(page, /^Point 13/).click();
    await button(page, /To point 10, uses 3/).click();
    // Only point 10 can move now: it is selected automatically (§3.5 step 4.5).
    await expect(page.getByRole("button", { name: /^Point 10/ })).toHaveAttribute("aria-pressed", "true");
    await button(page, /To point 9, uses 1/).click();
    await button(page, /^Confirm move$/).click();
    await page.waitForTimeout(400);
    const moves = ws.sent.filter((m) => m.type === "turn.move");
    expect(moves).toHaveLength(1);
    expect(moves[0]!.payload).toEqual({ moves: [[13, 10], [10, 9]] });
  });

  test("Undo reverts one step; Confirm stays disabled until complete", async ({ page }) => {
    await mockSocket(page, { state: moving });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    await page.keyboard.press("m");
    await button(page, /Move entry/).click();
    await button(page, /^Point 13/).click();
    await button(page, /To point 10, uses 3/).click();
    await page.keyboard.press("Escape");
    await expect(button(page, /^Confirm move$/)).toBeDisabled();
    await button(page, /^Undo$/).click();
    await expect(button(page, /^Undo$/)).toBeDisabled();
  });

  test("an error and a full state reset the board with the mapped message", async ({ page }) => {
    const ws = await mockSocket(page, { state: moving });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    ws.push("error", { code: "MATCH_ACTION_INVALID", message_key: "errors.match.actionInvalid", details: { reason: "not_legal" } }, 0, MATCH_ID);
    await expect(page.getByText("That move wasn't accepted. The board has been updated.")).toBeVisible();
  });

  test("a double offer opens MA-07 and Take sends cube.take", async ({ page }) => {
    const ws = await mockSocket(page, { state: () => stateFixture({ phase: "cube_offered", turn: 1, can_double: false, clock: clockFixture({ actor: 0 }) }) });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    await expect(page.getByText("If time runs out, the double is taken automatically and counts as a timeout.")).toBeVisible();
    await button(page, /^Take \(×2\)$/).click();
    await page.waitForTimeout(300);
    expect(ws.sent.some((m) => m.type === "cube.take")).toBe(true);
  });

  test("reactions have a visible 3 s cooldown", async ({ page }) => {
    const ws = await mockSocket(page, { state: () => stateFixture() });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    await button(page, /^Reactions$/).click();
    await page.getByRole("dialog").getByRole("button", { name: "Smile" }).click();
    await page.waitForTimeout(300);
    expect(ws.sent.filter((m) => m.type === "react.send")).toEqual([expect.objectContaining({ payload: { emoji_key: "smile" } })]);
    await expect(page.getByRole("button", { name: /until the next reaction/ })).toBeVisible();
  });

  test("the opponent's move and match end are announced; the seed is shown", async ({ page }) => {
    const ws = await mockSocket(page, { state: () => stateFixture({ turn: 1, clock: clockFixture({ actor: 1 }), can_double: false }) });
    await page.goto(`/match/${MATCH_ID}`, { waitUntil: "load" });
    await ready(page);
    ws.push("turn.rolled", { player: 1, opening: false, dice: [6, 5], throw_seed: 99, legal: [[[24, 18], [18, 13]]], clock: clockFixture({ actor: 1 }) });
    await expect(page.getByText(/ali_tbz\u2069? rolled 6–5/).first()).toBeVisible();
    ws.push("match.ended", { winner: 0, score: [3, 0], reason: "forfeit:disconnect", seed: "ab".repeat(32), elo: { a: 9, b: -9 }, xp: { a: 25, b: 10 }, settlement: { entry: 100, pot: 200, rake: 20, payout: 180 } });
    await expect(page.getByText(/ali_tbz\u2069? didn't reconnect in time/).first()).toBeVisible();
    await expect(page.getByText("ab".repeat(32))).toBeVisible();
    await expect(page.getByRole("link", { name: "Verify dice" })).toBeVisible();
  });
});
