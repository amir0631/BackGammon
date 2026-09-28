import { expect, test, type Page } from "@playwright/test";

// Real flows against the running backend (no mocks): auth.md §3 and profile.md §3.
// Needs `sms.enabled` false (the default), so signup gets a token without a code. Each run
// registers fresh accounts, so the seeded testers are never modified.
// Run: E2E_BASE_URL=http://m.localhost:8080 pnpm --filter @bg/mobile e2e flows

const PASSWORD = "Walnut-brass-77";

function randomPhone(): string {
  return `0935${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

async function signUp(page: Page, phone: string, username: string) {
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.fill("input[name=phone]", phone);
  await page.locator("input[type=checkbox]").nth(0).check();
  await page.locator("input[type=checkbox]").nth(1).check();
  await page.click("button[type=submit]");
  await page.waitForURL("**/signup/account");
  await expect(page.getByText(/2 of 2|۲ از ۲/)).toBeVisible();
  await page.fill("input[name=username]", username);
  await page.fill("input[name=new-password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/signup/avatar");
}

async function logIn(page: Page, phone: string, next = "/me") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.fill("input[name=phone]", phone);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(`**${next}`);
}

test.describe.configure({ mode: "serial" });

const phone = randomPhone();
const username = `e2e${phone.slice(-7)}`;

test("signup without SMS: phone → account → avatar → /play", async ({ page }) => {
  await page.goto("/?ref=tester1", { waitUntil: "networkidle" });
  await signUp(page, phone, username);
  await page.locator("input[type=radio]").nth(4).check({ force: true });
  await page.click("button[type=submit]");
  await page.waitForURL("**/play");
  const me = await page.evaluate(() => fetch("/api/v1/me").then((r) => r.json()));
  expect(me.username).toBe(username);
  expect(me.avatar).toBe("avatar_05");
  expect(me.phone_verified).toBe(false);
});

test("signed-in user opening guest routes lands on /play", async ({ page }) => {
  await logIn(page, phone);
  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForURL("**/play");
  }
});

test("wrong password shows the neutral error and clears only the password", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("input[name=phone]", phone);
  await page.fill("input[name=password]", "not-the-password");
  await page.click("button[type=submit]");
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveValue("");
  await expect(page.locator("input[name=password]")).toBeFocused();
});

test("edit avatar, settings toggles, and language persist on the account", async ({ browser, page, baseURL }) => {
  await logIn(page, phone);
  await page.goto("/me/edit", { waitUntil: "networkidle" });
  await page.locator("input[type=radio]").nth(9).check({ force: true });
  await page.getByRole("button", { name: /Save avatar|ذخیره‌ی چهره/ }).click();
  await expect.poll(() => page.evaluate(() => fetch("/api/v1/me").then((r) => r.json()).then((m) => m.avatar))).toBe("avatar_10");

  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.getByLabel(/^(Sound|صدا)/).uncheck();
  await expect.poll(() => page.evaluate(() => fetch("/api/v1/me").then((r) => r.json()).then((m) => m.prefs.sound))).toBe(false);

  await page.getByRole("radio", { name: "English" }).check();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => fetch("/api/v1/me").then((r) => r.json()).then((m) => m.lang))).toBe("en");
  // A new session elsewhere opens in the account language (profile.md acceptance 9).
  const other = await browser.newContext();
  await other.addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(baseURL ?? "http://m.localhost:8080").hostname, path: "/" }]);
  const otherPage = await other.newPage();
  await logIn(otherPage, phone, "/me");
  await expect(otherPage.locator("html")).toHaveAttribute("lang", "en");
  await expect(otherPage.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await other.close();

  await page.getByRole("radio", { name: "فارسی" }).check();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("language sheet on an auth form switches at once and keeps entries", async ({ page }) => {
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.fill("input[name=phone]", "09121234567");
  await page.locator("input[type=checkbox]").nth(0).check();
  await page.getByRole("button", { name: /Language|زبان/ }).click();
  await page.getByRole("dialog").getByRole("radio", { name: "English" }).check();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1, name: "Create account" })).toBeVisible();
  await expect(page.locator("input[name=phone]")).toHaveValue("0912 123 4567");
  await expect(page.locator("input[type=checkbox]").nth(0)).toBeChecked();
});

test("sign out other devices ends the other session", async ({ browser, page }) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await logIn(otherPage, phone);
  await logIn(page, phone, "/me/sessions");
  await page.getByRole("button", { name: /Sign out other devices|خروج از دستگاه‌های دیگر/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Sign out other devices|خروج از دستگاه‌های دیگر/ }).click();
  await expect(page.getByText(/No other devices|دستگاه دیگری/)).toBeVisible();
  const status = await otherPage.evaluate(() => fetch("/api/v1/me").then((r) => r.status));
  expect(status).toBe(401);
  await other.close();
});

test("log out asks first, then lands on the welcome screen", async ({ page }) => {
  await logIn(page, phone);
  await page.locator("main").getByRole("button", { name: /Log out|خروج از حساب/ }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Cancel|انصراف/ })).toBeFocused();
  await dialog.getByRole("button", { name: /^(Log out|خروج)$/ }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/me", { waitUntil: "networkidle" });
  await page.waitForURL("**/login?next=%2Fme");
});
