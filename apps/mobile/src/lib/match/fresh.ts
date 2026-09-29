import type { MatchFoundOut } from "@bg/protocol";
import { readJson, removeKey, writeJson } from "../storage";

// A match this tab just created or was paired into (play.md PL-07, PL-04). match.md §3.1 step 4:
// on the first entry to a new match, the socket attaches only once the scene is ready, so the
// opening roll never happens while this player can't see the board. The `match.found` payload also
// keeps the opponent card in the MA-01 loader header.

const KEY = "bg.match.fresh";

interface Fresh {
  id: string;
  found: MatchFoundOut | null;
}

export function markFreshMatch(id: string, found: MatchFoundOut | null): void {
  writeJson("session", KEY, { id, found } satisfies Fresh);
}

/** The fresh-match record for `id` (not consumed: a reload before attaching still waits). */
export function readFreshMatch(id: string): Fresh | null {
  const value = readJson<Fresh>("session", KEY);
  return value && value.id === id ? value : null;
}

export function clearFreshMatch(id: string): void {
  if (readFreshMatch(id)) removeKey("session", KEY);
}
