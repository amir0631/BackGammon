"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Steps of a single-route task flow (transfer, withdraw) in the browser history (ia.md §3.5):
// - The route's own entry becomes a sentinel (step 0) and every step gets a pushed entry, so the
//   Android back gesture and the browser Back button move to the previous step.
// - Back from step 1 lands on the sentinel: with entries typed, the flow asks "Discard?" and stays
//   (`onLeaveAttempt` returns true); without, it leaves.
// - While a request is in flight (`locked`), Back is swallowed and the step entry restored.
// - `exit(fn)` unwinds to the sentinel first, then runs `fn` (show the receipt, or replace the
//   route with the created request), so Back after a completed flow never re-enters a step. After
//   that the hook ignores history: Back from a receipt is an ordinary navigation to the origin.
// - A reload restores the step from the entry's state; entries are kept by the caller.
// Entries copy the current `history.state` so Next.js treats them as the same route.

const KEY = "__bgFlowStep";

function currentStep(): number | null {
  const value = (window.history.state as Record<string, unknown> | null)?.[KEY];
  return typeof value === "number" ? value : null;
}

function push(step: number) {
  window.history.pushState({ ...(window.history.state as object), [KEY]: step }, "");
}

export interface FlowSteps {
  step: number;
  /** Forward (or to a later step): pushes history entries. */
  next: (to: number) => void;
  /** Back to an earlier step ("Change recipient", on-screen Back). */
  back: (to: number) => void;
  /** Leave the flow: unwind to the sentinel entry, then run `then`. */
  exit: (then: () => void) => void;
}

export function useFlowSteps({
  locked,
  onLeaveAttempt,
  canRestore,
}: {
  locked: boolean;
  /** Back from step 1. Return true to stay (e.g. to open a discard dialog). */
  onLeaveAttempt: () => boolean;
  /** Whether a restored step (after a reload) still has the entries it needs. */
  canRestore: (step: number) => boolean;
}): FlowSteps {
  const [step, setStep] = useState(1);
  const stepRef = useRef(1);
  const lockedRef = useRef(locked);
  const leaveRef = useRef(onLeaveAttempt);
  const exiting = useRef<(() => void) | null>(null);
  /** Set once the flow has exited: later history moves (e.g. Back from a receipt) are not steps. */
  const finished = useRef(false);
  lockedRef.current = locked;
  leaveRef.current = onLeaveAttempt;

  const apply = (to: number) => {
    stepRef.current = to;
    setStep(to);
  };

  useEffect(() => {
    const restored = currentStep();
    if (restored !== null && restored >= 1) {
      // Reload (or a remount) on a step entry: keep it if its entries survived.
      apply(canRestore(restored) ? restored : 1);
    } else {
      window.history.replaceState({ ...(window.history.state as object), [KEY]: 0 }, "");
      push(1);
    }

    const onPop = () => {
      if (finished.current) return;
      const to = currentStep() ?? 0;
      if (exiting.current) {
        if (to === 0) {
          const then = exiting.current;
          exiting.current = null;
          finished.current = true;
          then();
        }
        return;
      }
      if (lockedRef.current) {
        push(stepRef.current);
        return;
      }
      if (to === 0) {
        if (leaveRef.current()) push(1);
        else window.history.back();
        return;
      }
      apply(to);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = useCallback((to: number) => {
    for (let s = stepRef.current + 1; s <= to; s += 1) push(s);
    apply(to);
  }, []);

  const back = useCallback((to: number) => {
    const delta = to - stepRef.current;
    if (delta < 0) window.history.go(delta);
  }, []);

  const exit = useCallback((then: () => void) => {
    const depth = currentStep() ?? 0;
    if (depth <= 0) {
      finished.current = true;
      then();
      return;
    }
    exiting.current = then;
    window.history.go(-depth);
  }, []);

  return { step, next, back, exit };
}
