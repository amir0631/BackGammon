"use client";

import { useEffect, useState } from "react";

// Countdowns for code validity, resend waits, rate limits, and the login lock (auth.md §5 timing
// rules). The deadline comes from a server value plus the local clock. The hook only re-renders
// once a second; it never auto-submits anything.

/** Whole seconds left until `deadline` (epoch ms); 0 when passed or unset. */
export function useCountdown(deadline: number | null | undefined): number {
  // Derived from the deadline on every render (never one render behind a new deadline); the
  // interval only triggers re-renders while the countdown runs.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadline || deadline <= Date.now()) return;
    const id = window.setInterval(() => {
      setTick((n) => n + 1);
      if (Date.now() >= deadline) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  return deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
}

/** mm:ss with Latin digits; localize with `useFormat().digits` and isolate LTR. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
