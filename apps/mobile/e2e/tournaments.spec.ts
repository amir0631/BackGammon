import { expect, test, type Page } from "@playwright/test";
import type { TournamentInfo } from "@bg/protocol";
import { horizontalOverflow, smallTargets } from "./checks";
import { meFixture, mockApi } from "./mocks";
import { playHandlers } from "./play-mocks";

// Smoke test for tournaments.md at 390 × 844 in fa: TO-01 cards, TO-02 with every rule visible, and
// TO-04 with the entry, balance, balance after, and refund rule before any charge; one join per tap.

const DAY = 24 * 3_600_000;
const tour = (over: Partial<TournamentInfo>): TournamentInfo => ({
  id: 11,
  name: { fa: "جام پاییز", en: "Autumn Cup" },
  variant: "standard_cube",
  length: 3,
  entry: 100,
  capacity: 8,
  entries: 5,
  starts_at: new Date(Date.now() + 2 * DAY).toISOString(),
  status: "scheduled",
  round: 0,
  rounds: 3,
  prize_split: [50, 25, 12.5, 12.5],
  prizes: [360, 180, 90, 90],
  joined: false,
  cancel_reason: null,
  rake_pct: 10,
  prize_items: [],
  my_place: null,
  my_prize: null,
  ...over,
});

async function open(page: Page, baseURL: string | undefined, path: string, onJoin?: () => void) {
  const base = baseURL ?? "http://m.localhost:8080";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fa", domain: new URL(base).hostname, path: "/" }]);
  await mockApi(
    page,
    {
      me: meFixture(),
      handlers: {
        ...playHandlers(),
        "GET /tournaments": { status: 200, body: { results: [tour({}), tour({ id: 12, name: { fa: "", en: "Free Friday" }, entry: 0, prizes: [0, 0, 0, 0] })], next: null } },
        "GET /tournaments/11": { status: 200, body: tour({}) as unknown as Record<string, unknown> },
        "GET /tournaments/13": { status: 200, body: tour({ id: 13, status: "finished", joined: true, round: 3, my_place: 3, my_prize: 90 }) as unknown as Record<string, unknown> },
        "GET /tournaments/13/bracket": {
          status: 200,
          body: {
            slots: [
              { round: 1, position: 0, players: ["tester1", "x"], winner: "tester1", match_id: null, score: [3, 1], live: false },
              { round: 2, position: 0, players: ["tester1", "y"], winner: "y", match_id: null, score: [1, 3], live: false },
            ],
          },
        },
        "POST /tournaments/11/join": () => {
          onJoin?.();
          return { status: 201, body: tour({ joined: true, entries: 6 }) as unknown as Record<string, unknown> };
        },
      },
    },
    base,
  );
  await page.goto(path, { waitUntil: "load" });
}

test("TO-01 lists upcoming tournaments and passes layout checks", async ({ page, baseURL }) => {
  await open(page, baseURL, "/tournaments");
  await expect(page.getByText("جام پاییز")).toBeVisible();
  await expect(page.getByText("ثبت‌نام باز است").first()).toBeVisible();
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await smallTargets(page)).toEqual([]);
});

test("TO-02 shows the rules and TO-04 the cost before one join", async ({ page, baseURL }) => {
  let joins = 0;
  await open(page, baseURL, "/tournaments/11", () => {
    joins += 1;
  });
  await expect(page.getByText("ربات‌ها هرگز در تورنمنت بازی نمی‌کنند.")).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  await page.getByRole("button", { name: /ثبت‌نام · ۱۰۰/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("موجودی پس از این کار")).toBeVisible();
  const pay = dialog.getByRole("button", { name: "پرداخت ۱۰۰ سکه و ثبت‌نام" });
  await pay.dblclick();
  await expect(page.getByText("ثبت‌نام کرده‌اید").first()).toBeVisible();
  expect(joins).toBe(1);
});

test("TO-02 finished shows my_place and my_prize for 3rd place (review TO-02)", async ({ page, baseURL }) => {
  await open(page, baseURL, "/tournaments/13");
  await expect(page.getByText("رتبه‌ی شما: سوم").first()).toBeVisible();
  await expect(page.getByText("+۹۰ سکه جایزه").first()).toBeVisible();
  await expect(page.getByText(/حذف در دور/)).toHaveCount(0);
});
