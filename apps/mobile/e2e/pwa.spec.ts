import { expect, test } from "@playwright/test";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi } from "./mocks";
import { playHandlers } from "./play-mocks";

// Smoke test for the §11.5 PWA pieces at 390 × 844 in fa: a localized manifest with 192/512 and
// maskable icons, the offline screen, and the permanent "Install app" item with its guide.

test("manifest, offline screen, and Install app item", async ({ page, baseURL }) => {
  const base = baseURL ?? "http://m.localhost:8080";
  const host = new URL(base).hostname;
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", domain: host, path: "/" }]);
  const res = await page.goto("/manifest.webmanifest");
  expect(res?.ok()).toBe(true);
  const manifest = JSON.parse((await res!.text()) || "{}") as { lang: string; display: string; start_url: string; icons: { sizes: string; purpose: string }[] };
  expect(manifest).toMatchObject({ lang: "en", display: "standalone", start_url: "/" });
  expect(manifest.icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  expect((await page.goto("/icons/icon-512.png"))?.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(page, { me: meFixture(), handlers: { ...playHandlers(), "GET /announcements": { status: 200, body: { results: [], next: null } } } }, base);
  await page.goto("/offline", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "اتصال برقرار نیست" })).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);

  await page.goto("/me", { waitUntil: "load" });
  await page.getByRole("button", { name: "نصب برنامه" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});
