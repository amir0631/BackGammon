import { defineConfig } from "@playwright/test";

// Playwright for `m.` (CLAUDE.md §16 Frontend, Responsive). Runs against a running app behind
// Nginx (same-origin /api): set E2E_BASE_URL (default: the local stack). Screen tests mock the API
// per state so screenshots and layout checks are deterministic; flow tests hit the real backend.
// Browsers come from PLAYWRIGHT_BROWSERS_PATH; set PW_CHROMIUM to use a specific binary.

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://m.localhost:8080",
    deviceScaleFactor: 1,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
});
