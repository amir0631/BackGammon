"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { MatchFoundOut } from "@bg/protocol";

// TO-08 state shared by the app-level host and the in-match notice (tournaments.md §3.6 steps 1–2,
// UX review TO-01). A bracket `match.found` is kept here until the player joins, taps "Not now",
// or signs out; the player view registers its match so the host knows to stay quiet there and let
// the in-match notice speak instead.

interface ReadyState {
  found: MatchFoundOut | null;
  /** The match of a running player view (`LiveMatch`), if one is mounted. */
  playerMatch: string | null;
}

let state: ReadyState = { found: null, playerMatch: null };
const listeners = new Set<() => void>();

function set(next: Partial<ReadyState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

export function setTournamentFound(found: MatchFoundOut): void {
  set({ found });
}

export function clearTournamentFound(): void {
  if (state.found) set({ found: null });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot() {
  return state;
}

export function useTournamentReady(): ReadyState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The player view of `matchId` is on screen: TO-08 becomes the in-match notice (§3.6 step 2). */
export function usePlayerMatchMark(matchId: string): void {
  useEffect(() => {
    set({ playerMatch: matchId });
    // Arriving in the tournament match itself answers TO-08.
    if (state.found?.match_id === matchId) set({ found: null });
    return () => {
      if (state.playerMatch === matchId) set({ playerMatch: null });
    };
  }, [matchId]);
}
