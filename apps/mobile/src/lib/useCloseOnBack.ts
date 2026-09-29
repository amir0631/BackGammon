"use client";

import { useEffect, useRef } from "react";

// Sheets and dialogs push a history entry so the Android back gesture closes them (ia.md §3.5).
// While `dismissible` is false (a coin request is in flight), back is swallowed and the entry is
// restored. Callers that move a sheet to its next step must keep one sheet instance open and swap
// its content (patterns.md §1: never stack sheets), so exactly one entry exists at a time.

const KEY = "__bgSheet";

let counter = 0;

/**
 * Backs issued by a closing sheet to drop its own entry. Their popstate can arrive after another
 * sheet or overlay has opened (PL-03 closing as PL-06 opens), which must not read it as the user's
 * Back. A capture listener registered first marks those events; every handler checks the mark.
 */
let ownBacks = 0;
let ignoring = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "popstate",
    () => {
      ignoring = ownBacks > 0;
      if (ignoring) ownBacks -= 1;
      // Reset after every listener of this event ran.
      window.setTimeout(() => {
        ignoring = false;
      }, 0);
    },
    { capture: true },
  );
}

/** True while the current popstate was caused by a sheet dropping its own entry (not the user). */
export function isOwnBack(): boolean {
  return ignoring;
}

export function useCloseOnBack(open: boolean, onClose: () => void, dismissible: boolean, enabled = true): void {
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open || !enabled) return;
    const token = `sheet-${++counter}`;
    let pushed = false;
    let poppedByUser = false;

    const onPop = () => {
      if (!pushed || ignoring) return;
      if (!dismissibleRef.current) {
        window.history.pushState({ ...window.history.state, [KEY]: token }, "");
        return;
      }
      poppedByUser = true;
      onCloseRef.current();
    };

    // Deferred so React Strict Mode's mount/unmount/mount in development pushes only once.
    const timer = window.setTimeout(() => {
      window.history.pushState({ ...window.history.state, [KEY]: token }, "");
      pushed = true;
      window.addEventListener("popstate", onPop);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      // Closed from the UI: drop our entry, but never undo a navigation that happened meanwhile.
      if (pushed && !poppedByUser && window.history.state?.[KEY] === token) {
        ownBacks += 1;
        window.history.back();
      }
    };
  }, [open, enabled]);
}
