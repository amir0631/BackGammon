"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@bg/api-client";
import type { ActiveMatch } from "@bg/protocol";
import { useSession } from "./session";

// The player's running match for the resume banner (play.md PL-08, §3.8): `GET me/matches/active`,
// checked on app open, when the tab regains focus, and after `match.found` or a finished match
// (callers call `refresh`). No polling timer.

interface ActiveMatchValue {
  active: ActiveMatch | null;
  /** True until the first read finished (the lobby keeps play buttons neutral meanwhile). */
  loading: boolean;
  refresh: () => Promise<ActiveMatch | null>;
  /** The match just ended on this device: hide the banner without waiting for a read. */
  clear: () => void;
}

const ActiveMatchContext = createContext<ActiveMatchValue | null>(null);

export function ActiveMatchProvider({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  const userId = status === "user" ? (me?.id ?? null) : null;
  const [active, setActive] = useState<ActiveMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef<Promise<ActiveMatch | null> | null>(null);

  const refresh = useCallback(() => {
    inFlight.current ??= api.matches
      .active()
      .then((value) => {
        setActive(value);
        return value;
      })
      .catch(() => null)
      .finally(() => {
        inFlight.current = null;
        setLoading(false);
      });
    return inFlight.current;
  }, []);

  useEffect(() => {
    if (userId === null) {
      setActive(null);
      setLoading(true);
      return;
    }
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [userId, refresh]);

  const value = useMemo(
    () => ({ active, loading, refresh, clear: () => setActive({ match_id: null }) }),
    [active, loading, refresh],
  );
  return <ActiveMatchContext.Provider value={value}>{children}</ActiveMatchContext.Provider>;
}

export function useActiveMatch(): ActiveMatchValue {
  const value = useContext(ActiveMatchContext);
  if (!value) throw new Error("useActiveMatch must be used inside <ActiveMatchProvider>");
  return value;
}
