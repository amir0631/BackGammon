import { expect, test, type Page } from "@playwright/test";
import type { Announcement } from "@bg/protocol";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi } from "./mocks";
import { playHandlers } from "./play-mocks";

// Smoke test for news.md at 390 × 844 in fa: NW-01 on /play with Details; dismissing hides it for
// good; /news still lists it; NW-03 renders plain-text paragraphs and a safe in-app link.

const items: Announcement[] = [
  { id: 1, kind: "banner", title: { fa: "تورنمنت پاییز", en: "Autumn Cup" }, body: { fa: "ثبت‌نام باز است.\n\nجوایز بیشتر.", en: "" }, link: "/tournaments", published_at: "2026-09-20T10:00:00Z", ends_at: null },
  { id: 2, kind: "announcement", title: { fa: "", en: "Maintenance" }, body: { fa: "", en: "Short downtime." }, link: "//evil.example", published_at: "2026-09-21T10:00:00Z", ends_at: null },
];

async function open(page: Page, baseURL: string | undefined, path: string) {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(page, { me: meFixture(), handlers: { ...playHandlers(), "GET /tournaments": { status: 200, body: { results: [], next: null } }, "GET /announcements": { status: 200, body: { results: items, next: null } } } }, base);
  await page.goto(path, { waitUntil: "load" });
}

test("NW-01 banner, NW-02 list, and NW-03 item", async ({ page, baseURL }) => {
  await open(page, baseURL, "/play");
  await expect(page.getByText("تورنمنت پاییز")).toBeVisible();
  await expect(page.getByRole("link", { name: "جزئیات" })).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await page.getByRole("button", { name: "بستن اطلاعیه" }).click();
  await expect(page.getByText("تورنمنت پاییز")).toHaveCount(0);

  await page.goto("/news", { waitUntil: "load" });
  await expect(page.getByRole("link", { name: /تورنمنت پاییز/ })).toBeVisible();
  // Fallback language keeps its own lang.
  await expect(page.locator('[lang="en"]', { hasText: "Maintenance" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  await page.goto("/news/1", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "تورنمنت پاییز" })).toBeVisible();
  await expect(page.getByText("جوایز بیشتر.")).toBeVisible();
  await expect(page.getByRole("link", { name: "باز کردن", exact: true })).toHaveAttribute("href", "/tournaments");
  await page.goto("/news/2", { waitUntil: "load" });
  await expect(page.getByRole("link", { name: "باز کردن", exact: true })).toHaveCount(0);
});
