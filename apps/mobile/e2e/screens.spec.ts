import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, setTextScale, smallTargets } from "./checks";
import { err, meFixture, mockApi, type Scenario } from "./mocks";

// Screen catalog for auth.md (AU-01 … AU-14) and profile.md (AC-01 … AC-06, ST-01).
// Every case renders one screen state with a mocked API, then:
//   1. asserts no horizontal scroll and no touch target under 44 px,
//   2. writes a screenshot to docs/ui/screenshots/<area>/ when UPDATE_SCREENSHOTS=1,
//   3. asserts no horizontal scroll at 200% text.
// Main screens run at 390 × 844 (fa, en), 360 × 800 (fa), and 1440 × 900 (fa); state variants at
// 390 × 844 in fa and en. The full six-viewport matrix (§11.7) runs with ALL_VIEWPORTS=1.

interface Variant {
  locale: "fa" | "en";
  width: number;
  height: number;
}

const V390_FA: Variant = { locale: "fa", width: 390, height: 844 };
const V390_EN: Variant = { locale: "en", width: 390, height: 844 };
const V360_FA: Variant = { locale: "fa", width: 360, height: 800 };
const V1440_FA: Variant = { locale: "fa", width: 1440, height: 900 };
const ALL: Variant[] = [
  { locale: "fa", width: 360, height: 800 },
  { locale: "fa", width: 390, height: 844 },
  { locale: "fa", width: 430, height: 932 },
  { locale: "fa", width: 768, height: 1024 },
  { locale: "fa", width: 1024, height: 768 },
  { locale: "fa", width: 1440, height: 900 },
  { locale: "en", width: 360, height: 800 },
  { locale: "en", width: 390, height: 844 },
  { locale: "en", width: 430, height: 932 },
  { locale: "en", width: 768, height: 1024 },
  { locale: "en", width: 1024, height: 768 },
  { locale: "en", width: 1440, height: 900 },
];
const MAIN = process.env.ALL_VIEWPORTS ? ALL : [V390_FA, V390_EN, V360_FA, V1440_FA];
const STATE = process.env.ALL_VIEWPORTS ? ALL : [V390_FA, V390_EN];

const SHOTS = path.resolve(__dirname, "../../../docs/ui/screenshots");
const now = () => Date.now();

interface ScreenCase {
  id: string;
  area: "auth" | "profile";
  path: string;
  scenario: () => Scenario;
  act?: (page: Page) => Promise<void>;
  variants: Variant[];
}

const guest = (extra: Partial<Scenario> = {}): Scenario => ({ me: null, ...extra });
const user = (extra: Partial<Scenario> = {}): Scenario => ({ me: meFixture(), ...extra });

const signupSmsOff = () => ({
  "bg.signup": { phone: "09121234567", age: true, terms: true, sms: false, token: "t-off", tokenAt: now() },
});
const signupSmsOn = () => ({
  "bg.signup": { phone: "09121234567", age: true, terms: true, sms: true, expiresAt: now() + 105_000, resendAt: now() + 45_000 },
});

async function fillAccount(page: Page) {
  await page.fill("input[name=username]", "maryam_k");
  await page.fill("input[name=new-password]", "Walnut-brass-77");
  await page.waitForTimeout(700);
}

const cases: ScreenCase[] = [
  // ---- auth ----
  { id: "au01-welcome", area: "auth", path: "/", scenario: () => guest(), variants: MAIN },
  { id: "au02-signup", area: "auth", path: "/signup", scenario: () => guest(), variants: MAIN },
  {
    id: "au02-signup-errors",
    area: "auth",
    path: "/signup",
    scenario: () => guest(),
    act: async (page) => {
      await page.fill("input[name=phone]", "0212345678");
      // The button is aria-disabled with its reason; Enter submits the form and reveals the errors.
      await page.press("input[name=phone]", "Enter");
    },
    variants: STATE,
  },
  {
    id: "au02-signup-taken",
    area: "auth",
    path: "/signup",
    scenario: () => guest({ handlers: { "POST /auth/otp": err(409, "AUTH_PHONE_TAKEN", "errors.auth.phoneTaken") } }),
    act: async (page) => {
      await page.fill("input[name=phone]", "09121234567");
      await page.locator("input[type=checkbox]").nth(0).check();
      await page.locator("input[type=checkbox]").nth(1).check();
      await page.click("button[type=submit]");
      await page.getByRole("link", { name: /Log in with this number|ورود با این شماره/ }).waitFor();
    },
    variants: STATE,
  },
  {
    id: "au02-signup-rate-limited",
    area: "auth",
    path: "/signup",
    scenario: () => guest({ handlers: { "POST /auth/otp": err(429, "AUTH_OTP_RATE_LIMITED", "errors.auth.otpRateLimited", { retry_after: 125 }) } }),
    act: async (page) => {
      await page.fill("input[name=phone]", "09121234567");
      await page.locator("input[type=checkbox]").nth(0).check();
      await page.locator("input[type=checkbox]").nth(1).check();
      await page.click("button[type=submit]");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  { id: "au03-verify", area: "auth", path: "/signup/verify", scenario: () => guest({ session: signupSmsOn() }), variants: MAIN },
  {
    id: "au03-verify-wrong-code",
    area: "auth",
    path: "/signup/verify",
    scenario: () =>
      guest({
        session: signupSmsOn(),
        handlers: { "POST /auth/otp/verify": err(400, "AUTH_OTP_INVALID", "errors.auth.otpInvalid", { attempts_left: 3 }) },
      }),
    act: async (page) => {
      await page.fill("input[name=code]", "48213");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "au03-verify-expired",
    area: "auth",
    path: "/signup/verify",
    scenario: () => guest({ session: { "bg.signup": { phone: "09121234567", age: true, terms: true, sms: true, expiresAt: now() - 1000, resendAt: now() - 1000 } } }),
    variants: STATE,
  },
  { id: "au04-account-sms-off", area: "auth", path: "/signup/account", scenario: () => guest({ session: signupSmsOff() }), act: fillAccount, variants: MAIN },
  {
    id: "au04-account-sms-on",
    area: "auth",
    path: "/signup/account",
    scenario: () => guest({ session: { "bg.signup": { phone: "09121234567", age: true, terms: true, sms: true, token: "t-on", tokenAt: now() } } }),
    variants: STATE,
  },
  {
    id: "au04-account-errors",
    area: "auth",
    path: "/signup/account",
    scenario: () =>
      guest({
        session: signupSmsOff(),
        local: { "bg.ref": { value: "no_such_friend", at: now() } },
        handlers: {
          "GET /auth/username-available*": { status: 200, body: { available: false, reason: "taken" } },
        },
      }),
    act: async (page) => {
      await page.fill("input[name=username]", "علی");
      await page.fill("input[name=new-password]", "12345678");
      await page.locator("input[name=username]").blur();
      await page.waitForTimeout(300);
    },
    variants: STATE,
  },
  {
    id: "au04-account-expired",
    area: "auth",
    path: "/signup/account",
    scenario: () =>
      guest({
        session: signupSmsOff(),
        handlers: { "POST /auth/register": err(400, "AUTH_VERIFICATION_INVALID", "errors.auth.verificationInvalid", { reason: "expired" }) },
      }),
    act: async (page) => {
      await fillAccount(page);
      await page.click("button[type=submit]");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  { id: "au05-avatar", area: "auth", path: "/signup/avatar", scenario: () => user({ me: meFixture({ avatar: "avatar_01" }) }), variants: MAIN },
  {
    id: "au05-avatar-picked",
    area: "auth",
    path: "/signup/avatar",
    scenario: () => user(),
    act: async (page) => {
      await page.locator("input[type=radio]").nth(6).check({ force: true });
    },
    variants: STATE,
  },
  { id: "au06-login", area: "auth", path: "/login", scenario: () => guest(), variants: MAIN },
  {
    id: "au06-login-invalid",
    area: "auth",
    path: "/login",
    scenario: () => guest({ handlers: { "POST /auth/login": err(401, "AUTH_INVALID_CREDENTIALS", "errors.auth.invalidCredentials") } }),
    act: async (page) => {
      await page.fill("input[name=phone]", "09121234567");
      await page.fill("input[name=password]", "wrong-pass");
      await page.click("button[type=submit]");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "au06-login-locked",
    area: "auth",
    path: "/login",
    scenario: () => guest({ handlers: { "POST /auth/login": err(429, "AUTH_LOCKED", "errors.auth.locked", { retry_after: 892 }) } }),
    act: async (page) => {
      await page.fill("input[name=phone]", "09121234567");
      await page.fill("input[name=password]", "wrong-pass");
      await page.click("button[type=submit]");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "au14-banned",
    area: "auth",
    path: "/login",
    scenario: () => guest({ handlers: { "POST /auth/login": err(403, "AUTH_BANNED", "errors.auth.banned") } }),
    act: async (page) => {
      await page.fill("input[name=phone]", "09121234567");
      await page.fill("input[name=password]", "right-pass-1");
      await page.click("button[type=submit]");
      await page.locator("main [role=alert]").first().waitFor();
    },
    variants: STATE,
  },
  {
    id: "au10-language-sheet",
    area: "auth",
    path: "/login",
    scenario: () => guest(),
    act: async (page) => {
      await page.getByRole("button", { name: /Language|زبان/ }).click();
      await page.getByRole("dialog").waitFor();
    },
    variants: [...STATE, V1440_FA],
  },
  { id: "au07-reset", area: "auth", path: "/password/reset", scenario: () => guest(), variants: MAIN },
  {
    id: "au07u-reset-unavailable",
    area: "auth",
    path: "/password/reset",
    scenario: () => guest({ handlers: { "POST /auth/otp": err(503, "SMS_UNAVAILABLE", "errors.auth.smsUnavailable") } }),
    act: async (page) => {
      await page.fill("input[name=phone]", "09121234567");
      await page.click("button[type=submit]");
      await page.getByRole("region").first().waitFor();
    },
    variants: MAIN,
  },
  {
    id: "au08-reset-verify",
    area: "auth",
    path: "/password/reset/verify",
    scenario: () => guest({ session: { "bg.reset": { phone: "09121234567", sms: true, expiresAt: now() + 110_000, resendAt: now() + 50_000 } } }),
    variants: STATE,
  },
  {
    id: "au09-reset-new",
    area: "auth",
    path: "/password/reset/new",
    scenario: () => guest({ session: { "bg.reset": { phone: "09121234567", sms: true, token: "t-reset", tokenAt: now() } } }),
    variants: STATE,
  },
  {
    id: "au12-logout-dialog",
    area: "auth",
    path: "/me",
    scenario: () => user(),
    act: async (page) => {
      await page.locator("main").getByRole("button", { name: /Log out|خروج از حساب/ }).filter({ visible: true }).first().click();
      await page.getByRole("dialog").waitFor();
    },
    variants: STATE,
  },
  {
    id: "au13-suspended",
    area: "auth",
    path: "/account/status",
    scenario: () => user({ me: meFixture({ status: "suspended" }) }),
    variants: MAIN,
  },
  // ---- profile ----
  { id: "ac01-hub", area: "profile", path: "/me", scenario: () => user(), variants: [...MAIN, { locale: "fa", width: 1024, height: 768 }] },
  {
    id: "ac01-hub-suspended",
    area: "profile",
    path: "/me",
    scenario: () => user({ me: meFixture({ status: "suspended" }), session: { "bg.suspendedSeen": true } }),
    variants: STATE,
  },
  { id: "ac02-edit", area: "profile", path: "/me/edit", scenario: () => user(), variants: MAIN },
  {
    id: "ac02-edit-unsaved",
    area: "profile",
    path: "/me/edit",
    scenario: () => user(),
    act: async (page) => {
      await page.locator("input[type=radio]").nth(9).check({ force: true });
    },
    variants: STATE,
  },
  { id: "ac04-sessions", area: "profile", path: "/me/sessions", scenario: () => user(), variants: MAIN },
  {
    id: "ac06-signout-dialog",
    area: "profile",
    path: "/me/sessions",
    scenario: () => user(),
    act: async (page) => {
      await page.getByRole("button", { name: /Sign out other devices|خروج از دستگاه‌های دیگر/ }).first().click();
      await page.getByRole("dialog").waitFor();
    },
    variants: STATE,
  },
  { id: "st01-settings", area: "profile", path: "/settings", scenario: () => user(), variants: MAIN },
  { id: "ac05-profile-own", area: "profile", path: "/profile/TESTER1", scenario: () => user(), variants: MAIN },
  { id: "ac05-profile-other", area: "profile", path: "/profile/ali_tbz", scenario: () => user(), variants: STATE },
  { id: "ac05-profile-not-found", area: "profile", path: "/profile/nobody_here", scenario: () => user(), variants: STATE },
];

for (const c of cases) {
  for (const v of c.variants) {
    test(`${c.id} ${v.locale} ${v.width}x${v.height}`, async ({ page, baseURL }) => {
      const base = baseURL ?? "http://m.localhost:8080";
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: v.locale, domain: new URL(base).hostname, path: "/" }]);
      const scenario = c.scenario();
      // The account language wins on load (auth.md §3.2), so the mocked account matches the variant.
      if (scenario.me) scenario.me = { ...scenario.me, lang: v.locale };
      await mockApi(page, scenario, base);
      await page.goto(c.path, { waitUntil: "networkidle" });
      await page.locator("h1").first().waitFor();
      if (c.act) await c.act(page);
      await page.waitForTimeout(400);

      expect(await horizontalOverflow(page), "horizontal overflow").toBe(0);
      expect(await smallTargets(page), "targets under 44 px").toEqual([]);

      if (process.env.UPDATE_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(SHOTS, c.area, `${c.id}--${v.locale}-${v.width}x${v.height}.png`),
          animations: "disabled",
          caret: "hide",
        });
      }

      await setTextScale(page, 200);
      expect(await horizontalOverflow(page), "horizontal overflow at 200% text").toBe(0);
    });
  }
}
