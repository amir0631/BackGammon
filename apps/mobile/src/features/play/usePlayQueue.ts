"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// The module itself, not the package index: only the play route carries the matchmaking flow
// (§11.4 JS budget for the other routes).
import { QueueFlow, type QueueCallbacks, type QueueRequest, type QueueState } from "@bg/api-client/src/queue";
import { feedbackTiming } from "@bg/design-tokens";
import { useGameSocket } from "@/lib/socket";
import { useOnline } from "@/lib/useOnline";

// PL-03 → PL-06 → PL-07 (play.md §3.3–§3.5): React state around the shared QueueFlow, which owns
// the matchmaking protocol handling (CLAUDE.md §2 rule 14).

export type { QueueCallbacks, QueueRequest, QueueState };

export function usePlayQueue(callbacks: QueueCallbacks) {
  const socket = useGameSocket();
  const online = useOnline();
  const [state, setState] = useState<QueueState>({ kind: "idle" });
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const flowRef = useRef<QueueFlow | null>(null);
  if (flowRef.current === null) {
    flowRef.current = new QueueFlow({
      send: (type, payload) => socketRef.current.send(type, payload as never),
      onState: setState,
      callbacks: () => cb.current,
      slowMs: feedbackTiming.slowRequestMs,
    });
  }
  const flow = flowRef.current;

  useEffect(() => {
    socket.connect();
  }, [socket]);
  useEffect(() => socket.subscribe((env) => flow.handle(env)), [socket, flow]);
  useEffect(() => {
    if (socket.status !== "idle") flow.socketStatus(socket.status);
  }, [socket.status, flow]);
  // The browser can report offline before the socket notices (play.md §3.4 step 4, P-10).
  useEffect(() => {
    flow.network(online, socket.status);
  }, [online, socket.status, flow]);
  useEffect(() => () => flow.dispose(), [flow]);

  const join = useCallback((req: QueueRequest) => flow.join(req), [flow]);
  const cancel = useCallback(() => flow.cancel(), [flow]);
  const reset = useCallback(() => flow.reset(), [flow]);

  return { state, join, cancel, reset, socketStatus: socket.status };
}
