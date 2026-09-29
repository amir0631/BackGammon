"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { feedbackTiming } from "@bg/design-tokens";
import type { ErrorOut, MatchFoundOut, QueueJoinIn } from "@bg/protocol";
import { useGameSocket } from "@/lib/socket";

// Matchmaking flow for PL-03 → PL-06 → PL-07 (play.md §3.3–§3.5), driven by GameSocket
// (`queue.join`, `queue.leave`, `queue.status`, `match.found`). The api-client re-sends the same
// `queue.join` after a reconnect, so a dropped socket only pauses the search here.
// View state only: the server decides pairing, entries, and removals.

export type QueueRequest = QueueJoinIn;

export type QueueState =
  | { kind: "idle" }
  /** PL-03 primary sent; the sheet shows the in-button spinner. `slow` after 10 s. */
  | { kind: "joining"; req: QueueRequest; slow: boolean }
  /** PL-06. `since`: local time of the `waiting` reply. `again`: the "Searching again" line. */
  | { kind: "waiting"; req: QueueRequest; since: number; again: boolean }
  /** Socket lost: the server dropped the queue; the timer is paused at `elapsed` ms. */
  | { kind: "offline"; req: QueueRequest; elapsed: number }
  /** PL-07; `race`: found just after the user cancelled (§3.5 step 3). */
  | { kind: "found"; req: QueueRequest | null; found: MatchFoundOut; race: boolean };

export type QueueError = ErrorOut;

export interface QueueCallbacks {
  /** An `error` envelope answering `queue.join`. */
  onJoinError: (error: QueueError, req: QueueRequest) => void;
  /** `queue.status removed`. */
  onRemoved: (reason: string | null, req: QueueRequest) => void;
  /** `queue.status left` that this tab did not ask for. */
  onLeftElsewhere: () => void;
  /** `match.found` with no search open in this tab (another tab or device). */
  onFoundElsewhere: (found: MatchFoundOut) => void;
  /** `match.found` for this tab's search. */
  onFound: (found: MatchFoundOut, race: boolean) => void;
}

/** How long after Cancel a `match.found` still counts as the found-after-cancel race. */
const RACE_WINDOW_MS = 30_000;
/** "Searching again" stays this long after a re-join (§3.4 step 4). */
const AGAIN_MS = 3000;

export function usePlayQueue(callbacks: QueueCallbacks) {
  const socket = useGameSocket();
  const [state, setState] = useState<QueueState>({ kind: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const cancelled = useRef<{ req: QueueRequest; at: number } | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    socket.connect();
  }, [socket]);

  // Server messages.
  useEffect(
    () =>
      socket.subscribe((env) => {
        const s = stateRef.current;
        switch (env.type) {
          case "queue.status": {
            const p = env.payload;
            if (p.state === "waiting") {
              if (s.kind === "joining") setState({ kind: "waiting", req: s.req, since: Date.now(), again: false });
              else if (s.kind === "offline") setState({ kind: "waiting", req: s.req, since: Date.now(), again: true });
            } else if (p.state === "left") {
              if (leaving.current) {
                leaving.current = false;
                return;
              }
              if (s.kind === "waiting" || s.kind === "offline") {
                setState({ kind: "idle" });
                cb.current.onLeftElsewhere();
              }
            } else if (p.state === "removed") {
              if (s.kind === "waiting" || s.kind === "offline" || s.kind === "joining") {
                setState({ kind: "idle" });
                cb.current.onRemoved(p.reason, s.req);
              }
            }
            return;
          }
          case "match.found": {
            const found = env.payload;
            if (s.kind === "waiting" || s.kind === "offline" || s.kind === "joining") {
              setState({ kind: "found", req: s.req, found, race: false });
              cb.current.onFound(found, false);
            } else if (cancelled.current && Date.now() - cancelled.current.at < RACE_WINDOW_MS) {
              const req = cancelled.current.req;
              cancelled.current = null;
              setState({ kind: "found", req, found, race: true });
              cb.current.onFound(found, true);
            } else if (s.kind !== "found") {
              cb.current.onFoundElsewhere(found);
            }
            return;
          }
          case "error": {
            if (s.kind === "joining") {
              setState({ kind: "idle" });
              cb.current.onJoinError(env.payload, s.req);
            }
            return;
          }
          default:
            return;
        }
      }),
    [socket],
  );

  // Socket lost while searching: the server dropped the queue (§3.4 step 4).
  useEffect(() => {
    const s = stateRef.current;
    if (socket.status === "reconnecting" && s.kind === "waiting") {
      setState({ kind: "offline", req: s.req, elapsed: Date.now() - s.since });
    }
  }, [socket.status]);

  // "Still working…" after 10 s without a reply to `queue.join`.
  useEffect(() => {
    if (state.kind !== "joining" || state.slow) return;
    const timer = window.setTimeout(() => {
      setState((cur) => (cur.kind === "joining" ? { ...cur, slow: true } : cur));
    }, feedbackTiming.slowRequestMs);
    return () => window.clearTimeout(timer);
  }, [state]);

  // "Searching again" fades back to the normal line.
  useEffect(() => {
    if (state.kind !== "waiting" || !state.again) return;
    const timer = window.setTimeout(() => {
      setState((cur) => (cur.kind === "waiting" ? { ...cur, again: false } : cur));
    }, AGAIN_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const join = useCallback(
    (req: QueueRequest) => {
      const s = stateRef.current;
      // Repeat taps are ignored while a join is in flight (acceptance criterion 3).
      if (s.kind === "joining" && !s.slow) return;
      cancelled.current = null;
      setState({ kind: "joining", req, slow: false });
      socket.send("queue.join", req);
    },
    [socket],
  );

  /** Cancel search: no confirmation, never costs anything (§3.4 step 2). */
  const cancel = useCallback(() => {
    const s = stateRef.current;
    if (s.kind === "idle" || s.kind === "found") return;
    cancelled.current = { req: s.req, at: Date.now() };
    leaving.current = true;
    socket.send("queue.leave", {});
    setState({ kind: "idle" });
  }, [socket]);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, join, cancel, reset, socketStatus: socket.status };
}
