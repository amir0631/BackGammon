import { expect, test } from "@playwright/test";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi } from "./mocks";
import { playHandlers } from "./play-mocks";

// Smoke test for referral.md at 390 × 844 in fa: the invite link and code from the API, the rules
// built from `pct`/`base`/`duration_days`, and earnings rows with a status chip (no «+» on held).

test("RF-01 shows the link, the rules, and earnings with statuses", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(
    page,
    {
      me: meFixture(),
      handlers: {
        ...playHandlers(),
        "GET /me/referral": {
          status: 200,
          body: { code: "K7Q2ZP", link: "http://m.localhost/signup?ref=K7Q2ZP", held: 3, referees: 2, active_referees: 1, earned: 12, commissions: 9, pct: 1, base: "referee_entry", duration_days: 0 },
        },
        "GET /me/referral/earnings": {
          status: 200,
          body: {
            results: [
              { id: 2, referee: "mina", amount: 3, status: "held", match_id: "m-2", created_at: new Date().toISOString() },
              { id: 1, referee: "mina", amount: 1, status: "paid", match_id: "m-1", created_at: new Date().toISOString() },
            ],
            next: null,
          },
        },
      },
    },
    base,
  );
  await page.goto("/me/referral", { waitUntil: "load" });
  await expect(page.getByText("http://m.localhost/signup?ref=K7Q2ZP").first()).toBeAttached();
  await expect(page.getByRole("button", { name: "اشتراک‌گذاری لینک دعوت" })).toBeVisible();
  await expect(page.getByText(/۱٪ از ورودی او/)).toBeVisible();
  await expect(page.getByText("در انتظار بررسی", { exact: true })).toBeVisible();
  await expect(page.getByText("+۱", { exact: true })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await smallTargets(page)).toEqual([]);
});
