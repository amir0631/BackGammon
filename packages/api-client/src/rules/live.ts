import type { LiveMatchRow } from "@bg/protocol";

// Live list and spectating rules shared by both apps (CLAUDE.md §2 rule 14; live.md §3.1, §3.2).
// Filters live in the URL query so a redirect or a shared link restores them; refreshes update
// values in place and hold back order changes until the user asks (never under the finger).

export type LiveSort = "spectators" | "pool" | "elo";
export const LIVE_SORTS: readonly LiveSort[] = ["spectators", "pool", "elo"];
export const LIVE_VARIANTS = ["standard_cube", "standard_nocube", "traditional"] as const;

export interface LiveFilter {
  tier: number | null;
  variant: string | null;
  tournament: number | null;
  sort: LiveSort;
}

export const DEFAULT_LIVE_FILTER: LiveFilter = { tier: null, variant: null, tournament: null, sort: "spectators" };

interface QueryLike {
  get(name: string): string | null;
}

const positiveInt = (value: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** `?tier=&variant=&tournament=&sort=` → a filter; unknown values fall back to "any" / the default sort. */
export function parseLiveFilter(query: QueryLike): LiveFilter {
  const variant = query.get("variant");
  const sort = query.get("sort");
  return {
    tier: positiveInt(query.get("tier")),
    variant: variant && (LIVE_VARIANTS as readonly string[]).includes(variant) ? variant : null,
    tournament: positiveInt(query.get("tournament")),
    sort: sort && (LIVE_SORTS as readonly string[]).includes(sort) ? (sort as LiveSort) : "spectators",
  };
}

/** The URL query for a filter ("" for no filter and the default sort). */
export function liveFilterQuery(filter: LiveFilter): string {
  const params = new URLSearchParams();
  if (filter.tier !== null) params.set("tier", String(filter.tier));
  if (filter.variant) params.set("variant", filter.variant);
  if (filter.tournament !== null) params.set("tournament", String(filter.tournament));
  if (filter.sort !== "spectators") params.set("sort", filter.sort);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function hasLiveFilters(filter: LiveFilter): boolean {
  return filter.tier !== null || filter.variant !== null || filter.tournament !== null;
}

/** The api-client `matches.live` argument for a filter. */
export function liveRequest(filter: LiveFilter): { tier?: number; variant?: string; tournament?: number; sort: LiveSort } {
  return {
    ...(filter.tier !== null ? { tier: filter.tier } : {}),
    ...(filter.variant ? { variant: filter.variant } : {}),
    ...(filter.tournament !== null ? { tournament: filter.tournament } : {}),
    sort: filter.sort,
  };
}

export interface LiveRefresh {
  /** The rows on screen in their current order, with fresh values where the match is still live. */
  rows: LiveMatchRow[];
  /** Match ids on screen that are no longer live (shown as "Ended" until the user applies the list). */
  ended: string[];
  /** The server order differs, a match was added, or one ended: offer "New list available". */
  pending: boolean;
}

/**
 * Applies a timed refresh (live.md §3.1 step 4): values update in place; order changes, new rows,
 * and ended rows wait for "Show". `incoming` is the server's new list in its order.
 */
export function mergeLiveRefresh(shown: readonly LiveMatchRow[], incoming: readonly LiveMatchRow[]): LiveRefresh {
  const fresh = new Map(incoming.map((r) => [r.match_id, r]));
  const rows = shown.map((r) => fresh.get(r.match_id) ?? r);
  const ended = shown.filter((r) => !fresh.has(r.match_id)).map((r) => r.match_id);
  const shownIds = shown.map((r) => r.match_id);
  const incomingIds = incoming.map((r) => r.match_id);
  const pending = ended.length > 0 || shownIds.length !== incomingIds.length || shownIds.some((id, i) => id !== incomingIds[i]);
  return { rows, ended, pending };
}

/** The match ids of a pool list whose pool is open (live.md §3.1 step 2). */
export function openPoolIds(pools: readonly { match_id: string; open: boolean }[]): Set<string> {
  return new Set(pools.filter((p) => p.open).map((p) => p.match_id));
}

export type SpectateUnavailable = "full" | "disabled" | "notLive" | "notFound";
export type SpectateJoinOutcome = SpectateUnavailable | "player" | "rejoin" | null;

/**
 * A WebSocket error after `spectate.join` or `spectate.react` → what the spectator view shows
 * (live.md §3.2 step 3, §3.8). Null: not a join error.
 */
export function spectateJoinOutcome(error: { code: string; details: Record<string, unknown> }): SpectateJoinOutcome {
  if (error.code === "MATCH_NOT_FOUND") return "notFound";
  if (error.code !== "MATCH_ACTION_INVALID") return null;
  switch (error.details.reason) {
    case "full":
      return "full";
    case "disabled":
      return "disabled";
    case "not_live":
      return "notLive";
    case "player":
      return "player";
    case "not_watching":
      return "rejoin";
    default:
      return null;
  }
}

/** Client-side spectator reaction limit: 1 per 3 s (live.md §3.3 step 3; the server enforces it too). */
export const SPECTATOR_REACTION_COOLDOWN_MS = 3000;
/** Received spectator reactions: at most this many visible, each for this long (live.md §3.3 step 4). */
export const SPECTATOR_LANE = { max: 3, ms: 2000 } as const;
/** Live list refresh while visible and online (live.md §3.1 step 4). */
export const LIVE_REFRESH_MS = 15_000;
