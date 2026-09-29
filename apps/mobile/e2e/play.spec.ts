import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, screenshot, setTextScale, smallTargets } from "./checks";
import { err, meFixture, mockApi, type Scenario } from "./mocks";
import { foundFixture, mockSocket, playHandlers, tiersFixture, type PlayMockOptions, type WsMock, type WsMockOptions } from "./play-mocks";

// Screen catalog for play.md (PL-01 … PL-08) with a mocked API and WebSocket. Same checks as the
// other suites: no horizontal scroll, no target under 44 px, no overflow at 200% text; screenshots
// to docs/ui/screenshots/play/ with UPDATE_SCREENSHOTS=1; the six-viewport matrix with
// ALL_VIEWPORTS=1. Behaviour tests at the end cover the acceptance criteria screenshots can't show.

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
const WIDE = process.env.ALL_VIEWPORTS ? [...ALL, LAND_FA] : [V390_FA, V390_EN, { locale: "fa", width: 360, height: 800 } as Variant, { locale: "fa", width: 768, height: 1024 } as Variant, { locale: "en", width: 1024, height: 768 } as Variant, { locale: "fa", width: 1440, height: 900 } as Variant, LAND_FA];
const STATE = process.env.ALL_VIEWPORTS ? [...ALL, LAND_FA] : [V390_FA, V390_EN];


interface Case {
  id: string;
  path?: string;
  scenario: () => Scenario;
  ws?: WsMockOptions;
  /** Before navigation (init scripts). */
  before?: (page: Page) => Promise<void>;
  act?: (page: Page, ws: WsMock) => Promise<void>;
  variants: Variant[];
}

const seen = { "bg.play.feeHintSeen.2": true };
const user = (o: PlayMockOptions = {}, extra: Partial<Scenario> = {}): Scenario => ({
  me: meFixture(),
  handlers: playHandlers(o),
  local: seen,
  ...extra,
});

const visible = (page: Page, name: RegExp) => page.getByRole("button", { name }).filter({ visible: true }).first();

async function openSetup(page: Page) {
  await visible(page, /100-coin table|میز ۱۰۰ سکه‌ای/).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(350);
}

async function chooseVariantAndLength(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/^(Standard with doubling cube|استاندارد با مکعب دوبل)$/).click();
  await dialog.getByText(/^(First to 3|تا ۳ امتیاز)$/).click();
}

async function toConfirm(page: Page) {
  await openSetup(page);
  await chooseVariantAndLength(page);
  await visible(page, /^(Continue|ادامه)$/).click();
  await page.getByRole("button", { name: /Pay 100 coins and search|پرداخت ۱۰۰ سکه و جستجو/ }).waitFor();
  await page.waitForTimeout(300);
}

async function toSearching(page: Page) {
  await toConfirm(page);
  await page.getByRole("button", { name: /Pay 100 coins and search|پرداخت ۱۰۰ سکه و جستجو/ }).click();
  await page.getByText(/Finding an opponent|در جستجوی حریف/).first().waitFor();
  await page.waitForTimeout(400);
}

const cases: Case[] = [
  { id: "pl01-lobby", path: "/play", scenario: () => user(), variants: WIDE },
  {
    id: "pl01-lobby-first-time",
    path: "/play",
    scenario: () => user({}, { local: {} }),
    variants: STATE,
  },
  {
    id: "pl01-lobby-play-again",
    path: "/play",
    scenario: () => user({}, { local: { ...seen, "bg.play.last.2": { tier_id: 100, variant: "standard_cube", length: 3 } } }),
    variants: STATE,
  },
  {
    id: "pl01-lobby-low-balance",
    path: "/play",
    scenario: () => ({
      ...user(),
      handlers: {
        ...playHandlers(),
        "GET /wallet": {
          status: 200,
          body: {
            balance: 80, locked: 0, bonus_locked: 0, withdrawable: 80, transferable: 80,
            transfer: { daily_max: 5000, used_24h: 0, remaining: 5000, next_available_at: null, min: 10, fee_pct: 0 },
            withdraw: { daily_max: 10000, used_24h: 0, remaining: 10000, next_available_at: null, min: 100, fee_pct: 0, confirm: "password", expected_by: "2026-09-29" },
            coin_price_toman: 1000,
          },
        },
      },
    }),
    variants: STATE,
  },
  {
    id: "pl01-lobby-in-match",
    path: "/play",
    scenario: () => user({ active: { match_id: "3f2a9c1e-0000-4000-8000-00000000abcd", is_bot: false, opponent: "ali_tbz", score: [1, 0], your_turn: true } }),
    variants: STATE,
  },
  {
    id: "pl01-lobby-suspended",
    path: "/play",
    scenario: () => user({}, { me: meFixture({ status: "suspended" }), session: { "bg.suspendedSeen": true } }),
    variants: STATE,
  },
  {
    id: "pl01-lobby-unsupported",
    path: "/play",
    scenario: () => user(),
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
  { id: "pl01-lobby-empty", path: "/play", scenario: () => user({ tiers: [] }), variants: STATE },
  {
    id: "pl01-lobby-error",
    path: "/play",
    scenario: () => user({ tiers: err(500, "HTTP_ERROR", "errors.generic", { status: 500 }) }),
    variants: STATE,
  },
  { id: "pl02-setup", path: "/play", scenario: () => user(), act: (page) => openSetup(page), variants: WIDE },
  {
    id: "pl02-setup-chosen",
    path: "/play",
    scenario: () => user(),
    act: async (page) => {
      await openSetup(page);
      await chooseVariantAndLength(page);
    },
    variants: STATE,
  },
  { id: "pl03-confirm", path: "/play", scenario: () => user(), act: (page) => toConfirm(page), variants: WIDE },
  {
    id: "pl04-bot",
    path: "/play",
    scenario: () => user(),
    act: async (page) => {
      await visible(page, /^(Play vs bot|بازی با ربات)$/).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(350);
    },
    variants: WIDE,
  },
  {
    id: "pl05-insufficient",
    path: "/play",
    scenario: () => user(),
    ws: { joinError: { code: "WALLET_INSUFFICIENT", message_key: "errors.wallet.insufficient", details: { balance: 60, needed: 100 } } },
    act: async (page) => {
      await toConfirm(page);
      await page.getByRole("button", { name: /Pay 100 coins and search|پرداخت ۱۰۰ سکه و جستجو/ }).click();
      await page.getByText(/Not enough coins|سکه کافی نیست/).first().waitFor();
      await page.waitForTimeout(300);
    },
    variants: STATE,
  },
  { id: "pl06-searching", path: "/play", scenario: () => user(), act: (page) => toSearching(page), variants: WIDE },
  {
    id: "pl06-long-wait",
    path: "/play",
    scenario: () => user(),
    before: async (page) => {
      await page.clock.install();
    },
    act: async (page) => {
      await toSearching(page);
      await page.clock.fastForward(125_000);
      await page.getByText(/Few players are searching|بازیکنان کمی/).first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "pl06-offline",
    path: "/play",
    scenario: () => user(),
    act: async (page, ws) => {
      await toSearching(page);
      ws.refuse(true);
      ws.drop();
      await page.getByText(/You're not in the queue while offline|تا وقتی آفلاین هستید/).first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "pl07-found",
    path: "/play",
    scenario: () => user(),
    before: async (page) => {
      await page.clock.install();
    },
    act: async (page, ws) => {
      await toSearching(page);
      ws.push("match.found", foundFixture(), 0, null);
      await page.getByText(/Opponent found|حریف پیدا شد/).first().waitFor();
      await page.waitForTimeout(300);
    },
    variants: STATE,
  },
  {
    id: "pl07-found-race",
    path: "/play",
    scenario: () => user(),
    act: async (page, ws) => {
      await toSearching(page);
      await visible(page, /^(Cancel search|لغو جستجو)$/).click();
      ws.push("match.found", foundFixture(), 0, null);
      await page.getByText(/just before you cancelled|درست پیش از لغو شما/).waitFor();
    },
    variants: STATE,
  },
];

for (const c of cases) {
  for (const v of c.variants) {
    test(`${c.id} ${v.locale} ${v.width}x${v.height}`, async ({ page, baseURL }) => {
      const base = baseURL ?? "http://m.localhost:8080";
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: v.locale, domain: new URL(base).hostname, path: "/" }]);
      const scenario = c.scenario();
      if (scenario.me) scenario.me = { ...scenario.me, lang: v.locale };
      await mockApi(page, scenario, base);
      const ws = await mockSocket(page, c.ws);
      if (c.before) await c.before(page);
      await page.goto(c.path ?? "/play", { waitUntil: "load" });
      await page.locator("h1").first().waitFor();
      await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
      if (c.act) await c.act(page, ws);
      await page.waitForTimeout(400);

      expect(await horizontalOverflow(page), "horizontal overflow").toBe(0);
      expect(await smallTargets(page), "targets under 44 px").toEqual([]);

      await screenshot(page, "play", `${c.id}--${v.locale}-${v.width}x${v.height}`);

      await setTextScale(page, 200);
      expect(await horizontalOverflow(page), "horizontal overflow at 200% text").toBe(0);
    });
  }
}

// Behaviour checks from play.md §9.
test.describe("play behaviour", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", domain: new URL(baseURL!).hostname, path: "/" }]);
    await mockApi(page, user({}, { me: meFixture({ lang: "en" }) }), baseURL!);
  });

  test("PL-02 opens with only the tier chosen and explains the disabled Continue", async ({ page }) => {
    await mockSocket(page);
    await page.goto("/play", { waitUntil: "load" });
    await openSetup(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(dialog.getByText("Choose a variant")).toBeVisible();
  });

  test("PL-03 shows every cost row from the tier, and a double tap sends one queue.join", async ({ page }) => {
    const ws = await mockSocket(page, { waiting: false });
    await page.goto("/play", { waitUntil: "load" });
    await toConfirm(page);
    const dialog = page.getByRole("dialog");
    for (const text of ["Equals 100,000 toman", "Platform fee (10% of the pot of 200)", "Winner receives", "180 coins", "Balance after the match starts", "1,150 coins"]) {
      await expect(dialog.getByText(text, { exact: false }).first()).toBeVisible();
    }
    const pay = page.getByRole("button", { name: /Pay 100 coins and search/ });
    await pay.dblclick();
    await page.waitForTimeout(500);
    expect(ws.sent.filter((m) => m.type === "queue.join")).toHaveLength(1);
    expect(ws.sent.find((m) => m.type === "queue.join")?.payload).toEqual({ tier_id: 100, variant: "standard_cube", length: 3 });
  });

  test("Cancel search and Esc send queue.leave with no confirmation; Cancel sits in the bottom 40%", async ({ page }) => {
    const ws = await mockSocket(page);
    await page.goto("/play", { waitUntil: "load" });
    await toSearching(page);
    const cancel = visible(page, /^Cancel search$/);
    const box = await cancel.boundingBox();
    expect(box!.y).toBeGreaterThan(844 * 0.6);
    await cancel.click();
    await expect(page.getByText("Finding an opponent")).toHaveCount(0);
    expect(ws.sent.filter((m) => m.type === "queue.leave")).toHaveLength(1);
  });

  test("queue.status removed/balance opens PL-05 removed", async ({ page }) => {
    const ws = await mockSocket(page);
    await page.goto("/play", { waitUntil: "load" });
    await toSearching(page);
    ws.push("queue.status", { state: "removed", tier_id: 100, variant: "standard_cube", length: 3, reason: "balance" }, 0, null);
    await expect(page.getByText("Nothing was charged").first()).toBeVisible();
    await expect(page.getByText("Practice vs bot (free)")).toBeVisible();
  });

  test("match.found opens the match within 1.5 s", async ({ page }) => {
    const ws = await mockSocket(page);
    await page.goto("/play", { waitUntil: "load" });
    await toSearching(page);
    ws.push("match.found", foundFixture(), 0, null);
    await page.waitForURL(/\/match\//, { timeout: 5000 });
  });

  test("PL-04 starts a bot match with nothing pre-selected", async ({ page, baseURL }) => {
    let body: unknown = null;
    await mockApi(
      page,
      user(
        {
          extra: {
            "POST /matches/bot": (route) => {
              body = route.request().postDataJSON();
              return { status: 201, body: { match_id: "3f2a9c1e-0000-4000-8000-00000000abcd", seed_commit: "ab", entry: 0 } };
            },
          },
        },
        { me: meFixture({ lang: "en" }) },
      ),
      baseURL!,
    );
    await mockSocket(page);
    await page.goto("/play", { waitUntil: "load" });
    await visible(page, /^Play vs bot$/).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(0);
    await dialog.getByText("Bot · Easy").click();
    await dialog.getByText("Standard, no cube").click();
    await dialog.getByText("First to 1", { exact: true }).click();
    await visible(page, /^Start practice match$/).click();
    await page.waitForURL(/\/match\//, { timeout: 5000 });
    expect(body).toEqual({ level: "easy", variant: "standard_nocube", length: 1, entry: 0 });
  });

  test("tier list shows server payouts", async ({ page }) => {
    await mockSocket(page);
    await page.goto("/play", { waitUntil: "load" });
    for (const tier of tiersFixture()) await expect(page.getByText(`Winner receives ${tier.payout.toLocaleString("en")}`).first()).toBeVisible();
  });
});
