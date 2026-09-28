"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { duration as fullDuration, reducedDuration } from "@bg/design-tokens";

// Reduced motion = the user's `animations.reduced` setting OR the OS `prefers-reduced-motion`
// (CLAUDE.md §11.6). The setting is passed in by whoever owns the profile store; this module only
// combines the two signals for the UI.

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** OS-level preference; false during SSR, corrected on hydration. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

const MotionContext = createContext<boolean>(false);

interface MotionSetting {
  /** The user's `animations.reduced` setting (not the OS preference). */
  setting: boolean;
  setSetting: (value: boolean) => void;
}

const MotionSettingContext = createContext<MotionSetting>({ setting: false, setSetting: () => undefined });

export function MotionProvider({
  reduced,
  setting,
  setSetting,
  children,
}: { reduced: boolean; children: ReactNode } & MotionSetting) {
  const value = useMemo(() => ({ setting, setSetting }), [setting, setSetting]);
  return (
    <MotionSettingContext.Provider value={value}>
      <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>
    </MotionSettingContext.Provider>
  );
}

/** Read and update the `animations.reduced` setting for the running app (settings screen, profile sync). */
export function useReducedMotionSetting(): MotionSetting {
  return useContext(MotionSettingContext);
}

/** True when UI and checker animations must be shortened and travel removed. */
export function useReducedMotion(): boolean {
  return useContext(MotionContext);
}

/** Motion durations (ms) for the current preference, from the design tokens. */
export function useMotionDurations() {
  const reduced = useReducedMotion();
  return useMemo(() => (reduced ? reducedDuration : fullDuration), [reduced]);
}
