// First-load JS budget for non-game routes (CLAUDE.md §11.4: under 250 kB gzipped; wallet review
// W-22). Runs after `next build`: sums the gzipped JS each app route loads first (the files Next
// lists for the page in app-build-manifest.json) and fails when a route is over the budget.
// Game routes (the 3D match and replay screens) and dev-only pages are exempt.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = 250_000;
const EXEMPT = [/^\/match\//, /^\/replay\//, /^\/dev(\/|$)/];
const dir = join(import.meta.dirname, "..", ".next");
const manifest = JSON.parse(readFileSync(join(dir, "app-build-manifest.json"), "utf8")).pages;

const sizes = new Map();
const gz = (file) => {
  if (!sizes.has(file)) {
    const path = join(dir, file);
    sizes.set(file, existsSync(path) ? gzipSync(readFileSync(path), { level: 9 }).length : 0);
  }
  return sizes.get(file);
};

let failed = 0;
const rows = [];
for (const [entry, files] of Object.entries(manifest)) {
  if (!entry.endsWith("/page")) continue;
  const route = entry.replace(/\/page$/, "").replace(/\/\([^)]+\)/g, "") || "/";
  const total = files.filter((f) => f.endsWith(".js")).reduce((sum, f) => sum + gz(f), 0);
  const exempt = EXEMPT.some((re) => re.test(route));
  const over = !exempt && total > BUDGET;
  if (over) failed += 1;
  rows.push({ route, kB: (total / 1000).toFixed(1), status: exempt ? "exempt" : over ? "OVER" : "ok" });
}
rows.sort((a, b) => a.route.localeCompare(b.route));
console.table(rows);
if (failed) {
  console.error(`${failed} route(s) over the ${BUDGET / 1000} kB first-load JS budget (§11.4).`);
  process.exit(1);
}
