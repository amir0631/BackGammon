/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";
import en from "@bg/i18n/messages/en.json";
import fa from "@bg/i18n/messages/fa.json";

// Service worker for `m.` (CLAUDE.md §11.5), built by @serwist/next into /sw.js.
// - Precache: every build asset (`_next/static`), which includes the lazy 3D engine chunks and the
//   Rapier WASM (embedded in its chunk), plus the offline screen.
// - Runtime: pages network-first (the offline screen when both fail), fonts/images cache-first.
//   `/api/` and `/ws` are never cached or intercepted: money and game state are always live.
// - Web Push: the payload carries i18n keys; the text comes from the catalogs in the reader's
//   language (the NEXT_LOCALE cookie when the browser exposes it to workers, else fa).

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & { cookieStore?: { get(name: string): Promise<{ value: string } | null> } };

const OFFLINE_URL = "/offline";
const PUSH = { fa: fa.push, en: en.push } as const;

// No rule matches `/api/` or `/ws`, so the worker never answers them: the browser fetches directly.
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === "font",
    handler: new CacheFirst({ cacheName: "bg-fonts", plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 365 * 24 * 3600 })] }),
  },
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
    handler: new StaleWhileRevalidate({ cacheName: "bg-images", plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 3600 })] }),
  },
  {
    matcher: ({ request, url, sameOrigin }) => sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/"),
    handler: new NetworkFirst({ cacheName: "bg-pages", networkTimeoutSeconds: 8, plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 3600 })] }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [{ url: OFFLINE_URL, matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

type PushKey = "yourTurn" | "tournamentStarted";

async function pushText(titleKey: string, bodyKey: string): Promise<{ title: string; body: string }> {
  let lang: "fa" | "en" = "fa";
  try {
    const c = await self.cookieStore?.get("NEXT_LOCALE");
    if (c?.value === "en") lang = "en";
  } catch {
    // No cookie access in this browser's workers: fa, the default locale.
  }
  const pick = (key: string) => {
    const [, group, field] = key.split(".") as [string, PushKey, "title" | "body"];
    return PUSH[lang][group]?.[field] ?? "";
  };
  return { title: pick(titleKey), body: pick(bodyKey) };
}

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string; type?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    return;
  }
  event.waitUntil(
    pushText(data.title ?? "", data.body ?? "").then(({ title, body }) =>
      self.registration.showNotification(title || "·", {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.type,
        data: { url: typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/" },
      }),
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          void (client as WindowClient).navigate(url);
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
