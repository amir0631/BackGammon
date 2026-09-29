// The store module only (not the package index): keeps the move generator and replay verifier out
// of the root layout, which every route loads (§11.4 JS budget).
import { historyFromState, historyItem, type HistoryItem } from "@bg/game-core/src/history";
import { apply } from "@bg/game-core/src/store";
import type { MatchRulesOut, MatchStateOut, ServerEnvelope } from "@bg/protocol";
import type { MatchView } from "@bg/game-core/src/store";

// View state of the match this client is attached to (match.md §3.3). Server events are applied
// with game-core `apply` in seq order; this adds only what the screen needs around it: when the
// clock was received (for `timeLeft`), the rules and grace deadlines from the last full state, the
// move history (the current game's turns from the full state, then every event seen), and the last
// timeout limit. Nothing here decides moves,
// dice, timers, or results (CLAUDE.md §2 rule 1).

export type { HistoryItem };

export interface MatchSnapshot {
  matchId: string;
  view: MatchView | null;
  /** Local time (ms) when `view.clock` arrived. */
  clockAt: number;
  /** Server clock minus local clock at the last clock-bearing event (ms). */
  serverOffset: number;
  rules: MatchRulesOut | null;
  /** Reconnect-grace deadline per player, in local epoch ms; null when connected. */
  grace: (number | null)[];
  /** Newest last. A full state rebuilds it from `history` (the current game's turns, M-24). */
  history: HistoryItem[];
  /** Consecutive-timeout limit from the last `turn.timeout` (or the rules). */
  timeoutLimit: number | null;
  /** The last event applied (drives transient captions and toasts). */
  last: ServerEnvelope | null;
  /** Bumped on every full state, so the scene snaps instead of animating. */
  stateKey: number;
}

type Listener = () => void;

function emptySnapshot(matchId: string): MatchSnapshot {
  return {
    matchId,
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
}

export class MatchStore {
  private snap: MatchSnapshot;
  private listeners = new Set<Listener>();

  constructor(readonly matchId: string) {
    this.snap = emptySnapshot(matchId);
  }

  getSnapshot = (): MatchSnapshot => this.snap;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(next: MatchSnapshot) {
    this.snap = next;
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Applies one envelope for this match. Returns `sync` when a seq gap needs `match.sync` with the
   * returned seq, `applied` when the view changed, or `ignored`.
   */
  handle(env: ServerEnvelope, now = Date.now()): { result: "applied" | "ignored" | "sync"; seq: number } {
    const prev = this.snap;
    const { view, needsSync, ignored } = apply(prev.view, env);
    if (needsSync) return { result: "sync", seq: prev.view?.seq ?? 0 };
    if (ignored || !view) return { result: "ignored", seq: prev.view?.seq ?? 0 };

    let next: MatchSnapshot = { ...prev, view, last: env };
    const clock = view.clock !== prev.view?.clock ? view.clock : null;
    if (clock) next = { ...next, clockAt: now, serverOffset: clock.server_now - now };

    switch (env.type) {
      case "match.state":
      case "spectate.state": {
        const s: MatchStateOut = env.payload;
        const offset = s.clock.server_now - now;
        next = {
          ...next,
          rules: s.rules,
          grace: [0, 1].map((i) => {
            const g = s.grace[i];
            return g === null || g === undefined ? null : g - offset;
          }),
          history: s.history ? historyFromState(s) : [],
          timeoutLimit: s.rules.max_consecutive_timeouts,
          stateKey: prev.stateKey + 1,
        };
        break;
      }
      case "opponent.disconnected": {
        const grace = [...next.grace];
        grace[env.payload.player] = now + env.payload.grace_seconds * 1000;
        next = { ...next, grace };
        break;
      }
      case "opponent.back": {
        const grace = [...next.grace];
        grace[env.payload.player] = null;
        next = { ...next, grace };
        break;
      }
      case "turn.timeout":
        next = { ...next, timeoutLimit: env.payload.limit };
        break;
      default:
        break;
    }
    const item = historyItem(env, prev.view);
    if (item) next = { ...next, history: [...next.history, item] };
    this.set(next);
    return { result: "applied", seq: view.seq };
  }
}
