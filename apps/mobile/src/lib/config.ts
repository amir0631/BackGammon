"use client";

import { useEffect, useState } from "react";
import { api } from "@bg/api-client";
import type { PublicConfig } from "@bg/protocol";

// Public switches and prices from `GET config` (SMS mode, username change cost, coin price). Read
// once per page load and shared; screens that need a value render their mode-neutral copy until it
// arrives (auth.md §3.5.1), and never guess a value the server did not send.

let cached: PublicConfig | null = null;
let pending: Promise<PublicConfig | null> | null = null;

function load(): Promise<PublicConfig | null> {
  pending ??= api
    .config()
    .then((config) => {
      cached = config;
      return config;
    })
    .catch(() => {
      // Retry on the next screen that asks; meanwhile the neutral copy stays.
      pending = null;
      return null;
    });
  return pending;
}

/** The public config, or null while loading or when it could not be read. */
export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    void load().then((value) => {
      if (alive && value) setConfig(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

/**
 * How to reach support (GET config `support_contact`), or the localized word for support while the
 * config loads. Never a hardcoded address (CLAUDE.md §1: the domain comes from BASE_DOMAIN).
 */
export function useSupportContact(fallback: string): string {
  return usePublicConfig()?.support_contact ?? fallback;
}
