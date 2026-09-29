"use client";

import { useSyncExternalStore } from "react";
import { installPlatform, type InstallPlatform } from "@bg/api-client";
import { standaloneViewPrefCookie } from "@bg/device-routing";

// PWA runtime for `m.` (CLAUDE.md §11.5):
// - registers the service worker built by Serwist (production builds only; /sw.js),
// - captures `beforeinstallprompt` for the custom install banner and the "Install app" item,
// - pins `view_pref=mobile` when running installed (§11.0 rule 5).
// `startPwa()` runs once from the app providers; components read the state with `usePwa()`.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  platform: InstallPlatform;
  /** Set once the client has checked (the server render knows nothing). */
  ready: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: PwaState = { platform: "manual", ready: false };
const listeners = new Set<() => void>();
let started = false;
let registration: Promise<ServiceWorkerRegistration | null> | null = null;

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function update() {
  state = {
    ready: true,
    platform: installPlatform({ standalone: isStandalone(), hasPrompt: deferred !== null, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
  };
  for (const l of listeners) l();
}

export function startPwa(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const early = (window as Window & { __bgInstallPrompt?: Event }).__bgInstallPrompt;
  if (early) deferred = early as BeforeInstallPromptEvent;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    update();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    update();
  });
  if (isStandalone()) {
    try {
      document.cookie = standaloneViewPrefCookie(window.location.hostname, window.location.protocol);
    } catch {
      // Cookies blocked: routing falls back to detection, which already sends phones to `m.`.
    }
  }
  if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
    registration = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  }
  update();
}

/** The active registration, for Web Push; null when there is no service worker. */
export async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = registration ? await registration : null;
  if (!reg) return null;
  return navigator.serviceWorker.ready.catch(() => reg);
}

/** Shows the browser's install dialog (Android/Chromium). Resolves with whether it was accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  update();
  return choice.outcome === "accepted";
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const serverState: PwaState = { platform: "manual", ready: false };

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => serverState);
}
