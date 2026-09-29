import type { BracketSlotInfo, TournamentInfo } from "@bg/protocol";

// Tournament display rules shared by both apps (CLAUDE.md §2 rule 14; tournaments.md §3, §4). They
// derive what to show from the server's TournamentInfo and bracket; the server decides every
// registration, seeding, result, and prize (backend/tournaments/services.py).

export type TournamentChip = "open" | "full" | "starting" | "round" | "finished" | "cancelled";

/** `starts_at` passed but the start job hasn't run yet (a few seconds). */
export function isStarting(t: TournamentInfo, now: number): boolean {
  return t.status === "scheduled" && Date.parse(t.starts_at) <= now;
}

/** The status chip of a card and heading (tournaments.md §4 TO-01 item 2). */
export function tournamentChip(t: TournamentInfo, now: number): TournamentChip {
  switch (t.status) {
    case "running":
      return "round";
    case "finished":
      return "finished";
    case "cancelled":
      return "cancelled";
    default:
      if (isStarting(t, now)) return "starting";
      return t.entries >= t.capacity ? "full" : "open";
  }
}

export type TournamentPrimary =
  | "register"
  | "full"
  | "registered"
  | "starting"
  | "playing"
  | "watch"
  | "finished"
  | "cancelled";

/** The TO-02 state row (tournaments.md §3.2 step 2 table). `out`: the viewer was knocked out. */
export function tournamentPrimary(t: TournamentInfo, now: number, out = false): TournamentPrimary {
  switch (t.status) {
    case "running":
      return t.joined && !out ? "playing" : "watch";
    case "finished":
      return "finished";
    case "cancelled":
      return "cancelled";
    default:
      if (isStarting(t, now)) return "starting";
      if (t.joined) return "registered";
      return t.entries >= t.capacity ? "full" : "register";
  }
}

/** Detail refresh (tournaments.md §3.2 step 3): 15 s near the start or while running, else 60 s. */
export function detailRefreshMs(t: TournamentInfo, now: number): number {
  if (t.status === "running") return 15_000;
  if (t.status === "scheduled" && Date.parse(t.starts_at) - now < 10 * 60_000) return 15_000;
  return 60_000;
}

export const LIST_REFRESH_MS = 30_000;

export type TournamentSegment = "upcoming" | "mine" | "running" | "finished";
export const TOURNAMENT_SEGMENTS: readonly TournamentSegment[] = ["upcoming", "mine", "running", "finished"];

export function parseSegment(value: string | null): TournamentSegment {
  return value && (TOURNAMENT_SEGMENTS as readonly string[]).includes(value) ? (value as TournamentSegment) : "upcoming";
}

/** Finished and cancelled, newest start first (tournaments.md §3.1 step 1). */
export function finishedOrder(list: readonly TournamentInfo[]): TournamentInfo[] {
  return [...list].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at) || b.id - a.id);
}

/** "Mine": the joined ones grouped Coming up / Playing now / Past. */
export function mineGroups(all: readonly TournamentInfo[]): { comingUp: TournamentInfo[]; playing: TournamentInfo[]; past: TournamentInfo[] } {
  const joined = all.filter((t) => t.joined);
  const seen = new Set<number>();
  const unique = joined.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return {
    comingUp: unique.filter((t) => t.status === "scheduled").sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    playing: unique.filter((t) => t.status === "running"),
    past: finishedOrder(unique.filter((t) => t.status === "finished" || t.status === "cancelled")),
  };
}

export interface PrizeRow {
  /** 1-based place. */
  place: number;
  /** Percent of the pool (e.g. 12.5). */
  share: number;
  amount: number;
}

/** One row per place, from `prize_split` and `prizes` (tournaments.md §4 TO-02 item 4). */
export function prizeRows(t: TournamentInfo): PrizeRow[] {
  return t.prize_split.map((share, i) => ({ place: i + 1, share, amount: t.prizes[i] ?? 0 }));
}

export function prizePool(t: TournamentInfo): { pool: number; entries: number } {
  return { pool: t.prizes.reduce((sum, p) => sum + p, 0), entries: t.entry * t.capacity };
}

/** Places below 2nd with different prizes are decided by seed (tournaments.md §4 TO-02 item 4). */
export function seedOrderMatters(t: TournamentInfo): boolean {
  const lower = t.prizes.slice(2);
  return lower.some((p) => p !== lower[0]);
}

export type RoundName = "final" | "semi" | "quarter" | "round";

/** Rounds are named from the end (tournaments.md §4 TO-03). */
export function roundName(round: number, rounds: number): RoundName {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "final";
  if (fromEnd === 1) return "semi";
  if (fromEnd === 2) return "quarter";
  return "round";
}

export interface BracketCell {
  round: number;
  position: number;
  slot: BracketSlotInfo | null;
}

/** Every round from `rounds` and `capacity`, with the server's slots where they exist. */
export function bracketGrid(t: Pick<TournamentInfo, "capacity" | "rounds">, slots: readonly BracketSlotInfo[]): BracketCell[][] {
  const byKey = new Map(slots.map((s) => [`${s.round}:${s.position}`, s]));
  const out: BracketCell[][] = [];
  for (let round = 1; round <= t.rounds; round++) {
    const count = Math.max(1, t.capacity >> round);
    out.push(Array.from({ length: count }, (_, position) => ({ round, position, slot: byKey.get(`${round}:${position}`) ?? null })));
  }
  return out;
}

export function isMySlot(slot: BracketSlotInfo | null, username: string | null | undefined): boolean {
  if (!slot || !username) return false;
  const me = username.toLowerCase();
  return slot.players.some((p) => p?.toLowerCase() === me);
}

/** The viewer's current slot (live or waiting), else their last one. */
export function mySlot(slots: readonly BracketSlotInfo[], username: string | null | undefined): BracketSlotInfo | null {
  const mine = slots.filter((s) => isMySlot(s, username)).sort((a, b) => b.round - a.round);
  return mine[0] ?? null;
}

export type PersonalResult =
  | { kind: "none" }
  | { kind: "champion" }
  | { kind: "runnerUp" }
  | { kind: "out"; round: number }
  | { kind: "waiting"; round: number; opponent: string | null; feeder: BracketSlotInfo | null }
  | { kind: "playing"; slot: BracketSlotInfo };

/**
 * Where the viewer stands, derived from the bracket (tournaments.md §3.6, §3.7 step 2) until the
 * server exposes `place` (§10 Q5). Only the champion and runner-up get a place from here.
 */
export function personalResult(t: TournamentInfo, slots: readonly BracketSlotInfo[], username: string | null | undefined): PersonalResult {
  if (!username || !t.joined) return { kind: "none" };
  const me = username.toLowerCase();
  const slot = mySlot(slots, username);
  if (!slot) return { kind: "none" };
  const won = slot.winner !== null && slot.winner.toLowerCase() === me;
  if (slot.winner !== null && !won) {
    return slot.round === t.rounds ? { kind: "runnerUp" } : { kind: "out", round: slot.round };
  }
  if (won && slot.round === t.rounds) return { kind: "champion" };
  if (won) {
    // Waiting for the other feeder of the next slot.
    const nextPos = slot.position >> 1;
    const siblingPos = slot.position % 2 === 0 ? slot.position + 1 : slot.position - 1;
    const feeder = slots.find((s) => s.round === slot.round && s.position === siblingPos) ?? null;
    const next = slots.find((s) => s.round === slot.round + 1 && s.position === nextPos) ?? null;
    const opponent = next?.players.find((p) => p !== null && p.toLowerCase() !== me) ?? feeder?.winner ?? null;
    return { kind: "waiting", round: slot.round, opponent, feeder: opponent ? null : feeder };
  }
  return { kind: "playing", slot };
}

/** Champion and runner-up from the final slot, when decided. */
export function finalists(t: TournamentInfo, slots: readonly BracketSlotInfo[]): { winner: string; runnerUp: string | null } | null {
  const final = slots.find((s) => s.round === t.rounds && s.position === 0);
  if (!final?.winner) return null;
  const runnerUp = final.players.find((p) => p !== null && p !== final.winner) ?? null;
  return { winner: final.winner, runnerUp };
}

/** Pre-start banner window (tournaments.md §3.5): a joined tournament starting within 15 minutes. */
export const PRESTART_WINDOW_MS = 15 * 60_000;

export function prestartTournament(list: readonly TournamentInfo[], now: number): TournamentInfo | null {
  return (
    list
      .filter((t) => t.joined && t.status === "scheduled" && Date.parse(t.starts_at) - now <= PRESTART_WINDOW_MS)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
  );
}
