import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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

export default withNextIntl(config);
