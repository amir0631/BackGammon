import { expect, test, type Page } from "@playwright/test";
import type { ShopItem } from "@bg/protocol";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi, type Handlers } from "./mocks";
import { playHandlers } from "./play-mocks";

// Smoke test for shop.md at 390 × 844 in fa: SH-01 cards with one state line each, SH-03 → SH-04
// with the full cost block before any charge, and CO-02 support content while purchase is off.

const item = (over: Partial<ShopItem>): ShopItem => ({
  id: 1,
  kind: "board_theme",
  key: "walnut",
  name: { fa: "گردو", en: "Walnut" },
  unlock: "free",
  price: 0,
  unlock_level: null,
  owned: true,
  locked: false,
  equipped: true,
  data: { asset: "/themes/board_theme/walnut/" },
  ...over,
});

const themes: ShopItem[] = [
  item({}),
  item({ id: 2, key: "ebony", name: { fa: "آبنوس", en: "Ebony" }, unlock: "level_locked", unlock_level: 5, owned: false, locked: true, equipped: false }),
  item({ id: 3, key: "khatam", name: { fa: "خاتم", en: "Khatam" }, unlock: "purchasable", price: 300, owned: false, equipped: false }),
  item({ id: 4, kind: "checker_theme", key: "classic", name: { fa: "کلاسیک", en: "Classic" } }),
  item({ id: 5, kind: "checker_theme", key: "brass", name: { fa: "برنج", en: "Brass" }, unlock: "purchasable", price: 200, owned: false, equipped: false }),
];

async function open(page: Page, baseURL: string | undefined, path: string, extra: Handlers = {}) {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(
    page,
    {
      me: meFixture(),
      handlers: {
        ...playHandlers(),
        "GET /themes": { status: 200, body: { results: themes, next: null, equipped: { board_theme: "walnut", checker_theme: "classic" } } },
        "GET /shop/items": { status: 200, body: { results: themes, next: null } },
        "GET /shop/packages": { status: 200, body: { enabled: false, price_toman: 1000, custom_min_toman: 10000, custom_max_toman: 10000000, results: [], next: null } },
        "GET /tournaments": { status: 200, body: { results: [], next: null } },
        ...extra,
      },
    },
    base,
  );
  await page.goto(path, { waitUntil: "load" });
}

test("SH-01 shows one state line per card and passes layout checks", async ({ page, baseURL }) => {
  await open(page, baseURL, "/shop");
  await expect(page.getByText("در حال استفاده").first()).toBeVisible();
  await expect(page.getByText("در سطح ۵ باز می‌شود")).toBeVisible();
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await smallTargets(page)).toEqual([]);
});

test("SH-03 buy opens SH-04 with the cost block and sends nothing before confirming", async ({ page, baseURL }) => {
  let buys = 0;
  await open(page, baseURL, "/shop/items/3", {
    "POST /shop/items/3/buy": () => {
      buys += 1;
      return { status: 200, body: { ...themes[2], owned: true } as unknown as Record<string, unknown> };
    },
  });
  await page.getByRole("button", { name: /خرید/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("موجودی پس از")).toBeVisible();
  await expect(dialog.getByText("خرید قابل بازگشت نیست.")).toBeVisible();
  expect(buys).toBe(0);
  await dialog.getByRole("button", { name: "پرداخت ۳۰۰ سکه" }).click();
  await expect(page.getByText("خاتم مال شما شد")).toBeVisible();
  expect(buys).toBe(1);
});

test("CO-02 shows support top-up with no packages while purchase is off", async ({ page, baseURL }) => {
  await open(page, baseURL, "/shop/coins");
  await expect(page.getByText("هر سکه = ۱٬۰۰۰ تومان")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("CO-03 never shows balance 0 while the wallet can't be read (review SH-01)", async ({ page, baseURL }) => {
  let checkouts = 0;
  await open(page, baseURL, "/shop/coins", {
    "GET /shop/packages": {
      status: 200,
      body: { enabled: true, price_toman: 1000, custom_min_toman: 10000, custom_max_toman: 10000000, results: [{ id: 1, coins: 100, price_toman: 100000, name: { fa: "", en: "" } }], next: null },
    },
    "GET /wallet": { status: 500, body: { code: "SERVER_ERROR", message_key: "errors.generic", details: {} } },
    "POST /shop/checkout": () => {
      checkouts += 1;
      return { status: 500, body: {} };
    },
  });
  await page.getByRole("radio").first().check({ force: true });
  await page.getByRole("button", { name: "ادامه" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("موجودی شما دریافت نشد.")).toBeVisible();
  const pay = dialog.getByRole("button", { name: /پرداخت .* تومان با کارت بانکی/ });
  await expect(pay).toBeDisabled();
  // No "0" balance: the balance and balance-after values are skeletons, not numbers.
  await expect(dialog.locator("dd").filter({ hasText: /^\s*۰\s*$/ })).toHaveCount(0);
  expect(checkouts).toBe(0);
});
