import path from "node:path";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Service worker (CLAUDE.md §11.5): precaches the build (3D engine chunks and the Rapier WASM
// included) and the offline screen. Off in `next dev` so hot reload is never served from a cache.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/offline", revision: process.env.BUILD_ID ?? `${Date.now()}` }],
  // The worker is registered by the app (lib/pwa.ts) so it can be skipped where it must not run.
  register: false,
});

const config: NextConfig = {
  // Standalone output is for the Docker image; Windows dev builds cannot create its symlinks.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@bg/api-client",
    "@bg/design-tokens",
    "@bg/device-routing",
    "@bg/game-core",
    "@bg/game3d",
    "@bg/i18n",
    "@bg/protocol",
  ],
  poweredByHeader: false,
  reactStrictMode: true,
};

const withPwa = withSerwist(withNextIntl(config));

/**
 * @serwist/next always prepends its window-side registration helper (@serwist/window, ~1.5 kB gz)
 * to every page's entry. The app registers /sw.js itself (lib/pwa.ts, loaded after first paint), so
 * the helper is dropped here to keep non-game routes inside the §11.4 JS budget.
 */
const dropSerwistWindowEntry: NonNullable<NextConfig["webpack"]> = (webpackConfig, options) => {
  const out = withPwa.webpack ? withPwa.webpack(webpackConfig, options) : webpackConfig;
  const entry = out.entry as () => Promise<Record<string, unknown>>;
  if (typeof entry !== "function") return out;
  out.entry = async () => {
    const entries = await entry();
    for (const name of ["main.js", "main-app"]) {
      const value = entries[name];
      if (Array.isArray(value)) entries[name] = value.filter((file) => !/[\\/]@serwist[\\/]next[\\/]dist[\\/]sw-entry\.mjs$/.test(String(file)));
    }
    return entries;
  };
  return out;
};

export default { ...withPwa, webpack: dropSerwistWindowEntry } satisfies NextConfig;
