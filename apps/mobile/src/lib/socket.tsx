"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, GameSocket, type SocketStatus } from "@bg/api-client";
import type { ClientMessageType, ClientMessages, ServerEnvelope } from "@bg/protocol";
import { useToast } from "@/components/feedback/Toast";
import type { MatchSnapshot, MatchStore } from "./match/store";
import { useSession } from "./session";

// One WebSocket per signed-in tab (CLAUDE.md §10.3), shared by the play hub and the match screen,
// so leaving the match screen keeps the socket attached (match.md §3.14: no disconnect grace
// starts) and the queue survives route changes. The api-client does auth, reconnect with backoff,
// re-attach by last seq, and queue re-join; this provider only exposes it to React and keeps the
// attached match's view (MatchStore, game-core `apply`).
//
// Connects lazily: the first screen that needs the socket calls `connect()`.

export type SocketState = SocketStatus | "idle";

type Listener = (env: ServerEnvelope) => void;

interface SocketValue {
  status: SocketState;
  /** Reconnect attempts since the socket was last open (MA-10 "Attempt n"). */
  attempt: number;
  connect: () => void;
  send: <K extends ClientMessageType>(type: K, payload: ClientMessages[K]) => void;
  /** Every server envelope, after the match store applied it. */
  subscribe: (fn: Listener) => () => void;
  /** MA-10 "Retry now": drop the backoff wait and reconnect at once. */
  retryNow: () => void;
  /**
   * Attach as a player (match.sync); resolves to the match's store. The store module loads on the
   * first attach, so routes without a match don't carry it (§11.4 JS budget).
   */
  attach: (matchId: string) => Promise<MatchStore>;
  /** Stop following the attached match (after it ended and the screen closed). */
  detach: () => void;
  /** The attached match's store, if any. */
  match: MatchStore | null;
}

const SocketContext = createContext<SocketValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus, me } = useSession();
  const [status, setStatus] = useState<SocketState>("idle");
  const [attempt, setAttempt] = useState(0);
  const [match, setMatch] = useState<MatchStore | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const matchRef = useRef<MatchStore | null>(null);
  const listeners = useRef(new Set<Listener>());
  const userId = sessionStatus === "user" ? (me?.id ?? null) : null;

  const onMessage = useCallback((env: ServerEnvelope) => {
    const store = matchRef.current;
    const socket = socketRef.current;
    if (store && socket && env.match_id === store.matchId) {
      const { result, seq } = store.handle(env);
      if (result === "sync") socket.attach(store.matchId, seq);
      else if (result === "applied") socket.setLastSeq(seq);
    }
    listeners.current.forEach((fn) => fn(env));
  }, []);

  const ensure = useCallback((): GameSocket => {
    if (socketRef.current) return socketRef.current;
    const socket = new GameSocket({
      onMessage,
      onStatus: (s) => {
        setStatus(s);
        if (s === "open") setAttempt(0);
        else if (s === "reconnecting") setAttempt((n) => n + 1);
      },
      getToken: () => api.auth.wsToken().then((r) => r.token),
    });
    socketRef.current = socket;
    socket.connect();
    return socket;
  }, [onMessage]);

  // A different user (or none): drop the socket and the attached match.
  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
      matchRef.current = null;
      setMatch(null);
      setStatus("idle");
      setAttempt(0);
    };
  }, [userId]);

  const value = useMemo<SocketValue>(
    () => ({
      status,
      attempt,
      connect: () => {
        if (userId !== null) ensure();
      },
      send: (type, payload) => ensure().send(type, payload),
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      retryNow: () => {
        const socket = socketRef.current;
        if (!socket) return;
        socket.close();
        socket.connect();
      },
      attach: async (matchId) => {
        const socket = ensure();
        const { MatchStore } = await import("./match/store");
        let store = matchRef.current;
        if (!store || store.matchId !== matchId) {
          store = new MatchStore(matchId);
          matchRef.current = store;
          setMatch(store);
          socket.attach(matchId, 0);
        } else {
          socket.attach(matchId, store.getSnapshot().view?.seq ?? 0);
        }
        return store;
      },
      detach: () => {
        socketRef.current?.leave();
        matchRef.current = null;
        setMatch(null);
      },
      match,
    }),
    [status, attempt, ensure, userId, match],
  );

  return (
    <SocketContext.Provider value={value}>
      {children}
      <TurnNotice />
    </SocketContext.Provider>
  );
}

export function useGameSocket(): SocketValue {
  const value = useContext(SocketContext);
  if (!value) throw new Error("useGameSocket must be used inside <SocketProvider>");
  return value;
}

const EMPTY: MatchSnapshot = {
  matchId: "",
  view: null,
  clockAt: 0,
  serverOffset: 0,
  rules: null,
  grace: [null, null],
  history: [],
  timeoutLimit: null,
  last: null,
  stateKey: 0,
};

/** The attached match's snapshot (re-renders on every applied event). */
export function useMatchSnapshot(store: MatchStore | null): MatchSnapshot {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? emptySnapshot,
    store?.getSnapshot ?? emptySnapshot,
  );
}

function noopSubscribe(): () => void {
  return () => undefined;
}

function emptySnapshot(): MatchSnapshot {
  return EMPTY;
}

/**
 * "It's your turn in your match" outside the match screen (match.md §3.14 step 4, P§1 exception:
 * turn notices only). Shown when the attached match turns to this player while another screen is
 * open.
 */
function TurnNotice() {
  const { match } = useGameSocket();
  const snap = useMatchSnapshot(match);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations();
  const lastNotified = useRef<string | null>(null);

  const view = snap.view;
  const onMatchScreen = pathname.startsWith("/match/");
  const yourTurn =
    view !== null && view.status === "active" && view.you !== null && view.turn === view.you && (view.phase === "roll" || view.phase === "move" || view.phase === "cube_offered");
  const turnKey = view ? `${view.matchId}:${view.seq}:${view.turn}` : null;

  useEffect(() => {
    if (!yourTurn || onMatchScreen || !view || !turnKey) return;
    const key = `${view.matchId}:${view.gameNo}:${view.turn}:${view.phase}`;
    if (lastNotified.current === key) return;
    lastNotified.current = key;
    toast.show({
      message: t("match.yourTurnElsewhere"),
      action: { label: t("play.resume.return"), onClick: () => router.push(`/match/${view.matchId}`) },
    });
  }, [yourTurn, onMatchScreen, view, turnKey, toast, t, router]);

  return null;
}
