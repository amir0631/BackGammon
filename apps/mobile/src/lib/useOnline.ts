"use client";

import { useSyncExternalStore } from "react";

// Browser connectivity (patterns.md §6.3). `navigator.onLine` can report true on a captive
// network, so screens still handle network errors from requests; this only drives the banner and
// the disabled-with-reason state of actions that need the server.

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** True while the browser reports a connection; true during SSR. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
