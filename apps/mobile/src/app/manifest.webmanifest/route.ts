import { cookies } from "next/headers";
import { defaultColorMode, palette } from "@bg/design-tokens";
import { defaultLocale, direction, isLocale, LOCALE_COOKIE } from "@bg/i18n";
import en from "@bg/i18n/messages/en.json";
import fa from "@bg/i18n/messages/fa.json";

// Web app manifest for `m.` only (CLAUDE.md §11.5): installable, standalone, portrait-primary,
// icons 192/512 plus maskable, localized per the reader's locale cookie (per-locale manifests).
// `app.` serves no manifest (Phase 2).

const CATALOG = { fa, en } as const;

export async function GET() {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : defaultLocale;
  const messages = CATALOG[locale];
  const name = process.env.APP_NAME || messages.app.name;
  const colors = palette[defaultColorMode];
  const manifest = {
    id: "/",
    name,
    short_name: name,
    description: messages.app.tagline,
    lang: locale,
    dir: direction(locale),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: colors.background,
    theme_color: colors.background,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache",
      Vary: "Cookie",
    },
  });
}
