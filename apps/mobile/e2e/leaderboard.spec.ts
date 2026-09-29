import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi } from "./mocks";
import { playHandlers } from "./play-mocks";

// Smoke test for leaderboard.md at 390 × 844 in fa: rows link to profiles, the sticky my-rank row
// shows rank and value when outside the top rows, and switching scope rewrites `?scope=`.

async function open(page: Page, baseURL: string | undefined, path: string) {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(page, { me: meFixture(), handlers: { ...playHandlers(), "GET /tournaments": { status: 200, body: { results: [], next: null } } } }, base);
  await page.goto(path, { waitUntil: "load" });
}

test("PL-09 lists rows, the my-rank row, and switches scope", async ({ page, baseURL }) => {
  await open(page, baseURL, "/leaderboard");
  await expect(page.getByRole("link", { name: /shahram/ })).toBeVisible();
  await expect(page.getByText("شما · رتبه‌ی ۸۸ · ۱٬۵۴۲")).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByRole("tab", { name: "این هفته" }).click();
  await expect(page).toHaveURL(/scope=weekly/);
});
