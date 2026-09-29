// Matchmaking flow for play.md PL-03 → PL-06 → PL-07 (§3.3–§3.5), driven by GameSocket envelopes
// (`queue.join`, `queue.leave`, `queue.status`, `match.found`). Framework-free, so every surface
// shares it (CLAUDE.md §2 rule 14); each app wraps it in a thin hook. View state only: the server
// decides pairing, entries, and removals. The socket re-sends the same `queue.join` after a
// reconnect, so a dropped socket only pauses the search here.
import type { ErrorOut, MatchFoundOut, QueueJoinIn, ServerEnvelope } from "@bg/protocol";
import type { SocketStatus } from "./socket";

export type QueueRequest = QueueJoinIn;

export type QueueState =
  | { kind: "idle" }
  /** PL-03 primary sent; the sheet shows the in-button spinner. `slow` after `slowMs`. */
  | { kind: "joining"; req: QueueRequest; slow: boolean }
  /** PL-06. `since`: local time of the `waiting` reply. `again`: the "Searching again" line. */
  | { kind: "waiting"; req: QueueRequest; since: number; again: boolean }
  /** Socket lost: the server dropped the queue; the timer is paused at `elapsed` ms. */
  | { kind: "offline"; req: QueueRequest; elapsed: number }
  /** PL-07; `race`: found just after the user cancelled (§3.5 step 3). */
  | { kind: "found"; req: QueueRequest | null; found: MatchFoundOut; race: boolean };

export interface QueueCallbacks {
  /** An `error` envelope answering `queue.join`. */
  onJoinError: (error: ErrorOut, req: QueueRequest) => void;
  /** `queue.status removed`. */
  onRemoved: (reason: string | null, req: QueueRequest) => void;
  /** `queue.status left` that this client did not ask for. */
  onLeftElsewhere: () => void;
  /** `match.found` with no search open here (another tab or device). */
  onFoundElsewhere: (found: MatchFoundOut) => void;
  /** `match.found` for this client's search. */
  onFound: (found: MatchFoundOut, race: boolean) => void;
}

export interface QueueFlowOptions {
  send: (type: "queue.join" | "queue.leave", payload: QueueRequest | Record<string, never>) => void;
  onState: (state: QueueState) => void;
  callbacks: () => QueueCallbacks;
  /** "Still working…" after this long without a reply to `queue.join`. */
  slowMs: number;
  /** How long after Cancel a `match.found` still counts as the found-after-cancel race. */
  raceMs?: number;
  /** "Searching again" stays this long after a re-join (§3.4 step 4). */
  againMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class QueueFlow {
  private current: QueueState = { kind: "idle" };
  private cancelled: { req: QueueRequest; at: number } | null = null;
  private leaving = false;
  private timer: unknown = null;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly o: QueueFlowOptions) {
    this.now = o.now ?? Date.now;
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get state(): QueueState {
    return this.current;
  }

  private set(next: QueueState): void {
    this.current = next;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (next.kind === "joining" && !next.slow) {
      this.timer = this.setTimer(() => {
        this.timer = null;
        if (this.current.kind === "joining") this.set({ ...this.current, slow: true });
      }, this.o.slowMs);
    } else if (next.kind === "waiting" && next.again) {
      this.timer = this.setTimer(() => {
        this.timer = null;
        if (this.current.kind === "waiting") this.set({ ...this.current, again: false });
      }, this.o.againMs ?? 3000);
    }
    this.o.onState(next);
  }

  join(req: QueueRequest): void {
    // Repeat taps are ignored while a join is in flight (play.md acceptance criterion 3).
    if (this.current.kind === "joining" && !this.current.slow) return;
    this.cancelled = null;
    this.set({ kind: "joining", req, slow: false });
    this.o.send("queue.join", req);
  }

  /** Cancel search: no confirmation, never costs anything (§3.4 step 2). */
  cancel(): void {
    const s = this.current;
    if (s.kind === "idle" || s.kind === "found") return;
    this.cancelled = { req: s.req, at: this.now() };
    this.leaving = true;
    this.o.send("queue.leave", {});
    this.set({ kind: "idle" });
  }

  reset(): void {
    this.set({ kind: "idle" });
  }

  /** Socket lost while searching: the server dropped the queue (§3.4 step 4). */
  socketStatus(status: SocketStatus): void {
    const s = this.current;
    if (status === "reconnecting" && s.kind === "waiting") {
      this.set({ kind: "offline", req: s.req, elapsed: this.now() - s.since });
    }
  }

  handle(env: ServerEnvelope): void {
    const s = this.current;
    const cb = this.o.callbacks();
    if (env.type === "queue.status") {
      const p = env.payload;
      if (p.state === "waiting") {
        if (s.kind === "joining") this.set({ kind: "waiting", req: s.req, since: this.now(), again: false });
        else if (s.kind === "offline") this.set({ kind: "waiting", req: s.req, since: this.now(), again: true });
      } else if (p.state === "left") {
        if (this.leaving) {
          this.leaving = false;
          return;
        }
        if (s.kind === "waiting" || s.kind === "offline") {
          this.set({ kind: "idle" });
          cb.onLeftElsewhere();
        }
      } else if (p.state === "removed") {
        if (s.kind === "waiting" || s.kind === "offline" || s.kind === "joining") {
          this.set({ kind: "idle" });
          cb.onRemoved(p.reason, s.req);
        }
      }
    } else if (env.type === "match.found") {
      const found = env.payload;
      if (s.kind === "waiting" || s.kind === "offline" || s.kind === "joining") {
        this.set({ kind: "found", req: s.req, found, race: false });
        cb.onFound(found, false);
      } else if (this.cancelled && this.now() - this.cancelled.at < (this.o.raceMs ?? 30_000)) {
        const req = this.cancelled.req;
        this.cancelled = null;
        this.set({ kind: "found", req, found, race: true });
        cb.onFound(found, true);
      } else if (s.kind !== "found") {
        cb.onFoundElsewhere(found);
      }
    } else if (env.type === "error") {
      if (s.kind === "joining") {
        this.set({ kind: "idle" });
        cb.onJoinError(env.payload, s.req);
      }
    }
  }

  dispose(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
}
