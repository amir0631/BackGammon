"use client";

import { lazy, Suspense, useEffect } from "react";
import { useActiveMatch } from "@/lib/activeMatch";
import { useGameSocket } from "@/lib/socket";
import { setTournamentFound, useTournamentReady } from "./readyStore";

// App-level TO-08 host (tournaments.md §3.6, UX review TO-01): the `match.found` subscription runs
// on every route, so a player watching the feeder match (spectator view) or sitting in another
// screen outside the shell still gets "Your tournament match is ready". Inside a running player
// match the dialog stays closed; `LiveMatch` shows the non-blocking notice instead (§3.6 step 2).
// The dialog code loads only when a bracket match is found (§11.4 first-load budget).

const TournamentReadyDialog = lazy(() => import("./TournamentReadyDialog"));

export function TournamentReadyHost() {
  const socket = useGameSocket();
  const { refresh: refreshActive } = useActiveMatch();
  const { found, playerMatch } = useTournamentReady();

  useEffect(
    () =>
      socket.subscribe((env) => {
        if (env.type === "match.found" && env.payload.tournament) {
          setTournamentFound(env.payload);
          void refreshActive();
        }
      }),
    [socket, refreshActive],
  );

  if (!found || playerMatch !== null) return null;
  return (
    <Suspense fallback={null}>
      <TournamentReadyDialog key={found.match_id} found={found} />
    </Suspense>
  );
}
