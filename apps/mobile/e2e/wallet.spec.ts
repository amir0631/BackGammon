import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, screenshot, setTextScale, smallTargets } from "./checks";
import { err, meFixture, mockApi, type Scenario } from "./mocks";
import { FIXED_NOW, firstTimeSummary, summaryFixture, walletHandlers, withdrawalFixture, withdrawalsFixture, type WalletMockOptions } from "./wallet-mocks";

// Screen catalog for wallet.md (WA-01 … WA-04, TR-00 … TR-05, WD-01 … WD-11) and the wallet entry
// points on AC-01 / AC-05. Same checks as screens.spec.ts: no horizontal scroll, no target under
// 44 px, no overflow at 200% text; screenshots to docs/ui/screenshots/wallet/ with
// UPDATE_SCREENSHOTS=1; the six-viewport matrix with ALL_VIEWPORTS=1.
// Pages are considered ready at `load` + the h1 + no skeleton, not `networkidle`: prefetches of
// routes that do not exist yet (/live, /shop, …) can keep the network busy without a proxy in front.

interface Variant {
  locale: "fa" | "en";
  width: number;
  height: number;
}

const ALL: Variant[] = (["fa", "en"] as const).flatMap((locale) =>
  [
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ].map(([width, height]) => ({ locale, width: width!, height: height! })),
);
const V390_FA: Variant = { locale: "fa", width: 390, height: 844 };
const V390_EN: Variant = { locale: "en", width: 390, height: 844 };
const V360_FA: Variant = { locale: "fa", width: 360, height: 800 };
const V1440_FA: Variant = { locale: "fa", width: 1440, height: 900 };
const LAND_FA: Variant = { locale: "fa", width: 844, height: 390 };
const MAIN = process.env.ALL_VIEWPORTS ? ALL : [V390_FA, V390_EN, V360_FA, V1440_FA];
const STATE = process.env.ALL_VIEWPORTS ? ALL : [V390_FA, V390_EN];
/** W-03: every wallet screen at the six §11.7 viewports in fa and en, plus two phone landscapes. */
const SCREEN: Variant[] = [...ALL, LAND_FA, { locale: "en", width: 932, height: 430 }];


interface Case {
  id: string;
  path: string;
  scenario: () => Scenario;
  act?: (page: Page) => Promise<void>;
  variants: Variant[];
}

const user = (w: WalletMockOptions = {}, extra: Partial<Scenario> = {}): Scenario => ({
  me: meFixture(),
  handlers: walletHandlers(w),
  ...extra,
});

const button = (page: Page, name: RegExp) => page.getByRole("button", { name }).filter({ visible: true }).first();

async function toTransferAmount(page: Page) {
  await page.getByText(/Check the recipient|گیرنده را بررسی کنید/).waitFor();
  await page.press("input[name=recipient]", "Enter");
  await page.locator("input[name=amount]").waitFor();
}

async function toTransferReview(page: Page, amount = "150") {
  await toTransferAmount(page);
  await page.fill("input[name=amount]", amount);
  await page.press("input[name=amount]", "Enter");
  await page.locator("input[name=password]").waitFor();
}

async function toWithdrawAmount(page: Page) {
  await page.getByRole("button", { name: /^(Continue|ادامه)$/ }).filter({ visible: true }).first().waitFor();
  await page.locator("form").first().evaluate((f: HTMLFormElement) => f.requestSubmit());
  await page.locator("input[name=amount]").waitFor();
}

async function toWithdrawReview(page: Page, amount = "500") {
  await toWithdrawAmount(page);
  await page.fill("input[name=amount]", amount);
  await page.press("input[name=amount]", "Enter");
  await page.getByText(/Review your request|بررسی درخواست/).first().waitFor();
}

const hintSeen = { "bg.wallet.withdrawHintSeen.2": true };

const cases: Case[] = [
  // ---- WA-01 / WA-02 / WA-04 ----
  { id: "wa01-wallet", path: "/wallet", scenario: () => user(), variants: SCREEN },
  {
    id: "wa01-wallet-first-time",
    path: "/wallet",
    scenario: () =>
      user({
        summary: firstTimeSummary(),
        withdrawals: [],
        bank: null,
        ledger: [{ id: 40, tx_id: "6f1c2a9e-0000-0000-0000-000000000040", type: "signup_bonus", amount: 100, created_at: new Date(FIXED_NOW).toISOString(), counterparty: null, ref_type: null, ref_id: null }],
      }),
    act: async (page) => {
      await button(page, /^(Why\?|چرا؟)$/).click();
    },
    variants: MAIN,
  },
  {
    id: "wa01-wallet-suspended",
    path: "/wallet",
    scenario: () => user({}, { me: meFixture({ status: "suspended" }), session: { "bg.suspendedSeen": true } }),
    variants: STATE,
  },
  {
    id: "wa01-wallet-history-error",
    path: "/wallet",
    scenario: () => user({ extra: { "GET /wallet/ledger": err(500, "HTTP_ERROR", "errors.generic", { status: 500 }) } }),
    variants: STATE,
  },
  {
    id: "wa02-detail",
    path: "/wallet",
    scenario: () => user(),
    act: async (page) => {
      await page.locator("[data-ledger-id='57']").filter({ visible: true }).first().click();
      await page.waitForTimeout(500);
    },
    variants: SCREEN,
  },
  {
    id: "wa04-get-coins",
    path: "/wallet",
    scenario: () => user(),
    act: async (page) => {
      await button(page, /^(Get coins|دریافت سکه)$/).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(400);
    },
    variants: SCREEN,
  },
  // ---- Transfer ----
  { id: "tr00-bonus", path: "/wallet/transfer", scenario: () => user({ summary: firstTimeSummary() }), variants: SCREEN },
  {
    id: "tr00-suspended",
    path: "/wallet/transfer",
    scenario: () => user({}, { me: meFixture({ status: "suspended" }), session: { "bg.suspendedSeen": true } }),
    variants: STATE,
  },
  {
    id: "tr01-recipient",
    path: "/wallet/transfer?to=Ali_Tbz",
    scenario: () => user(),
    act: async (page) => {
      await page.getByText(/Check the recipient|گیرنده را بررسی کنید/).waitFor();
    },
    variants: SCREEN,
  },
  {
    id: "tr01-self",
    path: "/wallet/transfer",
    scenario: () => user(),
    act: async (page) => {
      await page.fill("input[name=recipient]", "@Tester1");
      await page.waitForTimeout(600);
    },
    variants: STATE,
  },
  {
    id: "tr02-amount",
    path: "/wallet/transfer?to=ali_tbz",
    scenario: () => user(),
    act: async (page) => {
      await toTransferAmount(page);
      await page.fill("input[name=amount]", "۱۵۰");
    },
    variants: SCREEN,
  },
  {
    id: "tr02-amount-limit",
    path: "/wallet/transfer?to=ali_tbz",
    scenario: () => user({ summary: summaryFixture({ transfer: { daily_max: 5000, used_24h: 4900, remaining: 100, next_available_at: new Date(FIXED_NOW + 3 * 3_600_000).toISOString(), min: 10, fee_pct: 2 } }) }),
    act: async (page) => {
      await toTransferAmount(page);
      await page.fill("input[name=amount]", "400");
      await page.press("input[name=amount]", "Enter");
    },
    variants: STATE,
  },
  { id: "tr03-review", path: "/wallet/transfer?to=ali_tbz", scenario: () => user(), act: (page) => toTransferReview(page), variants: SCREEN },
  {
    id: "tr03-wrong-password",
    path: "/wallet/transfer?to=ali_tbz",
    scenario: () => user({ extra: { "POST /wallet/transfer": err(400, "WALLET_PASSWORD_INVALID", "errors.wallet.passwordInvalid") } }),
    act: async (page) => {
      await toTransferReview(page);
      await page.fill("input[name=password]", "not-my-pass");
      await page.press("input[name=password]", "Enter");
      await page.getByText(/That password isn't right|رمز عبور درست نیست/).first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "tr03-linked",
    path: "/wallet/transfer?to=ali_tbz",
    scenario: () => user({ extra: { "POST /wallet/transfer": err(403, "TRANSFER_LINKED", "errors.wallet.transferLinked") } }),
    act: async (page) => {
      await toTransferReview(page);
      await page.fill("input[name=password]", "Walnut-brass-77");
      await page.press("input[name=password]", "Enter");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "tr04-receipt",
    path: "/wallet/transfer?to=ali_tbz",
    scenario: () => user(),
    act: async (page) => {
      await toTransferReview(page);
      await page.fill("input[name=password]", "Walnut-brass-77");
      await page.press("input[name=password]", "Enter");
      await page.getByRole("heading", { name: /^(Sent|ارسال شد)$/ }).waitFor();
    },
    variants: SCREEN,
  },
  {
    id: "tr05-discard",
    path: "/wallet/transfer?to=ali_tbz",
    scenario: () => user(),
    act: async (page) => {
      await toTransferAmount(page);
      await page.fill("input[name=amount]", "50");
      await page.getByRole("button", { name: /^(Close|بستن)$/ }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(300);
    },
    variants: SCREEN,
  },
  // ---- Withdraw ----
  { id: "wd01-bonus", path: "/wallet/withdraw", scenario: () => user({ summary: firstTimeSummary() }), variants: SCREEN },
  { id: "wd02-bank-empty", path: "/wallet/withdraw", scenario: () => user({ bank: null, withdrawals: [] }), variants: SCREEN },
  {
    id: "wd02-bank-card",
    path: "/wallet/withdraw",
    scenario: () => user({ withdrawals: [] }, { local: hintSeen }),
    variants: STATE,
  },
  {
    id: "wd03-amount",
    path: "/wallet/withdraw",
    scenario: () => user({}, { local: hintSeen }),
    act: async (page) => {
      await toWithdrawAmount(page);
      await page.fill("input[name=amount]", "500");
    },
    variants: SCREEN,
  },
  { id: "wd04-review-password", path: "/wallet/withdraw", scenario: () => user({}, { local: hintSeen }), act: (page) => toWithdrawReview(page), variants: SCREEN },
  {
    id: "wd04-review-sms",
    path: "/wallet/withdraw",
    scenario: () => user({ summary: summaryFixture({ withdraw: { ...summaryFixture().withdraw, confirm: "sms", fee_pct: 1 } }) }, { local: hintSeen }),
    act: (page) => toWithdrawReview(page),
    variants: STATE,
  },
  {
    id: "wd05-code",
    path: "/wallet/withdraw",
    scenario: () => user({ summary: summaryFixture({ withdraw: { ...summaryFixture().withdraw, confirm: "sms" } }) }, { local: hintSeen }),
    act: async (page) => {
      await toWithdrawReview(page);
      await page.locator("form").first().evaluate((f: HTMLFormElement) => f.requestSubmit());
      await page.locator("input[name=code]").waitFor();
    },
    variants: SCREEN,
  },
  // ---- Requests, detail, cancel, bank ----
  { id: "wd06-list", path: "/wallet/withdrawals", scenario: () => user(), variants: SCREEN },
  { id: "wd06-empty", path: "/wallet/withdrawals", scenario: () => user({ withdrawals: [] }), variants: STATE },
  { id: "wd07-pending", path: "/wallet/withdrawals/31?submitted=1", scenario: () => user(), variants: SCREEN },
  { id: "wd07-paid", path: "/wallet/withdrawals/24", scenario: () => user(), variants: STATE },
  { id: "wd07-rejected", path: "/wallet/withdrawals/19", scenario: () => user(), variants: STATE },
  {
    id: "wd07-late",
    path: "/wallet/withdrawals/31",
    scenario: () => user({ withdrawals: [withdrawalFixture({ expected_by: "2026-01-04" })] }),
    variants: STATE,
  },
  { id: "wd07-not-found", path: "/wallet/withdrawals/999", scenario: () => user(), variants: STATE },
  {
    id: "wd09-cancel",
    path: "/wallet/withdrawals/31",
    scenario: () => user(),
    act: async (page) => {
      await button(page, /^(Cancel request|لغو درخواست)$/).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(300);
    },
    variants: SCREEN,
  },
  { id: "wd08-bank-locked", path: "/wallet/bank-accounts", scenario: () => user(), variants: SCREEN },
  {
    id: "wd08-bank-errors",
    path: "/wallet/bank-accounts",
    scenario: () => user({ bank: null, withdrawals: [] }),
    act: async (page) => {
      await page.fill("input[name=iban]", "IR82 0540 1026 8002 0817 9090 03");
      await page.locator("input[name=iban]").blur();
    },
    variants: STATE,
  },
  {
    id: "wd08-bank-valid",
    path: "/wallet/bank-accounts",
    scenario: () => user({ bank: null, withdrawals: [] }),
    act: async (page) => {
      await page.fill("input[name=iban]", "۸۲۰۵۴۰۱۰۲۶۸۰۰۲۰۸۱۷۹۰۹۰۰۲");
      await page.locator("input[name=iban]").blur();
    },
    variants: STATE,
  },
  // ---- Entry points ----
  { id: "ac01-hub-wallet", path: "/me", scenario: () => user(), variants: STATE },
  { id: "ac05-profile-send", path: "/profile/ali_tbz", scenario: () => user(), variants: STATE },
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
      // The same instant as the fixtures, so dates and "Today" match the baselines.
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto(c.path, { waitUntil: "load" });
      await page.locator("h1").first().waitFor();
      await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
      if (c.act) await c.act(page);
      await page.waitForTimeout(400);

      expect(await horizontalOverflow(page), "horizontal overflow").toBe(0);
      expect(await smallTargets(page), "targets under 44 px").toEqual([]);

      await screenshot(page, "wallet", `${c.id}--${v.locale}-${v.width}x${v.height}`);

      await setTextScale(page, 200);
      expect(await horizontalOverflow(page), "horizontal overflow at 200% text").toBe(0);
    });
  }
}

// Behaviour checks from wallet.md §9 that screenshots cannot show.
test.describe("wallet behaviour", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", domain: new URL(baseURL!).hostname, path: "/" }]);
  });

  // W-01: on the review steps nothing sticky or fixed covers the cost block or the notes.
  for (const [w, h] of [
    [360, 800],
    [390, 844],
  ] as const) {
    test(`TR-03 and WD-04 keep the cost block and notes uncovered at ${w}x${h}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: w, height: h });
      await mockApi(page, { me: meFixture({ lang: "en" }), handlers: walletHandlers(), local: hintSeen }, baseURL!);
      const covered = async () =>
        page.evaluate(() => {
          const targets = [...document.querySelectorAll("main dl, main p")].map((el) => el.getBoundingClientRect());
          const overlays = [...document.querySelectorAll<HTMLElement>("main *")].filter((el) => {
            const pos = getComputedStyle(el).position;
            return pos === "sticky" || pos === "fixed";
          });
          return overlays.some((o) => {
            const r = o.getBoundingClientRect();
            return targets.some((t) => t.bottom > r.top && t.top < r.bottom && t.right > r.left && t.left < r.right && !o.contains(document.elementFromPoint(t.left + 1, t.top + 1)));
          });
        });
      await page.goto("/wallet/transfer?to=ali_tbz", { waitUntil: "load" });
      await toTransferReview(page);
      expect(await covered()).toBe(false);
      await page.goto("/wallet/withdraw", { waitUntil: "load" });
      await toWithdrawReview(page);
      expect(await covered()).toBe(false);
    });
  }

  // W-06: Continue with an amount over the 24-hour limit shows that rule, not a generic message.
  test("TR-02 shows the specific limit error on Continue", async ({ page, baseURL }) => {
    const summary = summaryFixture({ transfer: { daily_max: 5000, used_24h: 4900, remaining: 100, next_available_at: new Date(FIXED_NOW + 3_600_000).toISOString(), min: 10, fee_pct: 0 } });
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers: walletHandlers({ summary }) }, baseURL!);
    await page.goto("/wallet/transfer?to=ali_tbz", { waitUntil: "load" });
    await toTransferAmount(page);
    await page.fill("input[name=amount]", "400");
    await page.press("input[name=amount]", "Enter");
    await expect(page.getByText("You can send up to 100 more coins right now", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("More becomes available from", { exact: false }).first()).toBeVisible();
    await expect(page.locator("input[name=amount]")).toBeFocused();
  });

  test("transfer sends exactly one request and reuses the Idempotency-Key", async ({ page, baseURL }) => {
    const keys: string[] = [];
    const handlers = walletHandlers({
      extra: {
        "POST /wallet/transfer": (route) => {
          keys.push(route.request().headers()["idempotency-key"] ?? "");
          return err(400, "WALLET_PASSWORD_INVALID", "errors.wallet.passwordInvalid");
        },
      },
    });
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers }, baseURL!);
    await page.goto("/wallet/transfer?to=ali_tbz", { waitUntil: "load" });
    await toTransferReview(page);
    await page.fill("input[name=password]", "one");
    await page.press("input[name=password]", "Enter");
    await page.getByText("That password isn't right.").first().waitFor();
    await page.fill("input[name=password]", "two");
    await page.press("input[name=password]", "Enter");
    await page.waitForTimeout(500);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    // A wrong wallet password is not a session problem: no session-expired dialog.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("own username is refused without a lookup", async ({ page, baseURL }) => {
    let lookups = 0;
    const handlers = walletHandlers({ extra: { "GET /users/*": () => (lookups++, err(404, "NOT_FOUND", "errors.notFound")) } });
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers }, baseURL!);
    await page.goto("/wallet/transfer", { waitUntil: "load" });
    await page.fill("input[name=recipient]", "tester1");
    await page.getByText("You can't send coins to yourself.").waitFor();
    expect(lookups).toBe(0);
  });

  test("Sheba input accepts Persian digits and spaces as the same value", async ({ page, baseURL }) => {
    let sent = "";
    const handlers = walletHandlers({
      bank: null,
      withdrawals: [],
      extra: {
        "POST /me/bank-accounts": (route) => {
          sent = (route.request().postDataJSON() as { iban: string }).iban;
          return { status: 201, body: { id: 9, iban: "IR82******************9002", bank_code: "054", bank: { fa: "بانک پارسیان", en: "Parsian Bank" } } };
        },
      },
    });
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers }, baseURL!);
    await page.goto("/wallet/bank-accounts", { waitUntil: "load" });
    await page.fill("input[name=iban]", "۸۲۰۵۴۰۱۰۲۶۸۰۰۲۰۸۱۷۹۰۹۰۰۲");
    await expect(page.getByText("Bank: Parsian Bank")).toBeVisible();
    await page.press("input[name=iban]", "Enter");
    await page.getByText("Bank account saved.").waitFor();
    expect(sent).toBe("IR820540102680020817909002");
  });

  test("history shows Show more until next is null", async ({ page, baseURL }) => {
    const cursors: (string | null)[] = [];
    const handlers = walletHandlers({
      extra: {
        "GET /wallet/ledger": (route) => {
          const cursor = new URL(route.request().url()).searchParams.get("cursor");
          cursors.push(cursor);
          const base = cursor ? 100 : 200;
          const rows = Array.from({ length: cursor ? 3 : 30 }, (_, i) => ({
            id: base - i,
            tx_id: `tx-${base - i}`,
            type: "match_entry",
            amount: -10,
            created_at: new Date(FIXED_NOW - (base - i) * 60_000).toISOString(),
            counterparty: null,
            ref_type: null,
            ref_id: null,
          }));
          return { status: 200, body: { results: rows, next: cursor ? null : "171" } };
        },
      },
    });
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers }, baseURL!);
    await page.goto("/wallet", { waitUntil: "load" });
    await page.getByRole("button", { name: "Show more" }).click();
    await page.getByText("That's all your transactions.").waitFor();
    // First pages (the screen, plus the provider recording the last-seen id for notices), then
    // exactly one request with the cursor, and none after `next` is null.
    expect(cursors.filter((c) => c !== null)).toEqual(["171"]);
    expect(cursors.at(-1)).toBe("171");
  });

  test("withdrawal list rows use icon + text status", async ({ page, baseURL }) => {
    await mockApi(page, { me: meFixture({ lang: "en" }), handlers: walletHandlers({ withdrawals: withdrawalsFixture() }) }, baseURL!);
    await page.goto("/wallet/withdrawals", { waitUntil: "load" });
    for (const label of ["Pending", "Paid", "Rejected", "Cancelled"]) {
      await expect(page.locator(".MuiChip-root", { hasText: label }).first()).toBeVisible();
    }
  });
});
