// WebSocket client for /ws (CLAUDE.md §10.3): token auth, reconnect with backoff, and re-sync by
// last applied seq. The caller applies events (game-core `apply`) and reports the seq it reached.
import type { ClientEnvelope, ClientMessageType, ClientMessages, ServerEnvelope } from "@bg/protocol";

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface GameSocketOptions {
  onMessage: (env: ServerEnvelope) => void;
  onStatus?: (status: SocketStatus) => void;
  /** Returns a fresh token for the `auth` message (GET /api/v1/auth/ws-token). */
  getToken: () => Promise<string>;
  /** Default: same-origin `/ws`. */
  url?: string;
  /** For tests. */
  createSocket?: (url: string) => WebSocketLike;
  maxBackoffMs?: number;
}

const OPEN = 1;
/** Closed by the server for a missing or bad token: get a new one before retrying. */
const CLOSE_UNAUTHENTICATED = 4001;

function defaultUrl(): string {
  const loc = globalThis.location;
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/ws`;
}

function jitter(ms: number): number {
  const r = new Uint32Array(1);
  globalThis.crypto.getRandomValues(r);
  return ms / 2 + ((r[0]! / 2 ** 32) * ms) / 2;
}

export class GameSocket {
  private ws: WebSocketLike | null = null;
  private authed = false;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: string[] = [];
  private match: { id: string; spectator: boolean } | null = null;
  private lastSeq = 0;

  constructor(private readonly opts: GameSocketOptions) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close(1000);
    this.ws = null;
    this.status("closed");
  }

  /** Attach to a match as a player; missed events or a full state follow. */
  attach(matchId: string, lastSeq = 0): void {
    this.match = { id: matchId, spectator: false };
    this.lastSeq = lastSeq;
    this.sendRaw({ type: "match.sync", match_id: matchId, seq: 0, payload: { last_seq: lastSeq } });
  }

  spectate(matchId: string): void {
    this.match = { id: matchId, spectator: true };
    this.lastSeq = 0;
    this.sendRaw({ type: "spectate.join", match_id: matchId, seq: 0, payload: {} });
  }

  leave(): void {
    if (this.match?.spectator) this.sendRaw({ type: "spectate.leave", match_id: this.match.id, seq: 0, payload: {} });
    this.match = null;
    this.lastSeq = 0;
  }

  /** The seq of the last event the caller applied; game actions are sent against it. */
  setLastSeq(seq: number): void {
    this.lastSeq = seq;
  }

  send<K extends ClientMessageType>(type: K, payload: ClientMessages[K]): void {
    this.sendRaw({ type, match_id: this.match?.id ?? null, seq: this.lastSeq, payload } as ClientEnvelope<K>);
  }

  private sendRaw(env: ClientEnvelope): void {
    const text = JSON.stringify(env);
    if (this.ws && this.ws.readyState === OPEN && this.authed) this.ws.send(text);
    else this.queue.push(text);
  }

  private status(s: SocketStatus): void {
    this.opts.onStatus?.(s);
  }

  private open(): void {
    this.status(this.attempt ? "reconnecting" : "connecting");
    const ws = (this.opts.createSocket ?? ((u) => new WebSocket(u) as unknown as WebSocketLike))(
      this.opts.url ?? defaultUrl(),
    );
    this.ws = ws;
    this.authed = false;
    ws.onopen = () => {
      this.opts
        .getToken()
        .then((token) => ws.send(JSON.stringify({ type: "auth", seq: 0, payload: { token } })))
        .catch(() => ws.close(4001));
    };
    ws.onmessage = (ev) => {
      let env: ServerEnvelope;
      try {
        env = JSON.parse(String(ev.data)) as ServerEnvelope;
      } catch {
        return;
      }
      if (env.type === "auth.ok") {
        this.authed = true;
        this.attempt = 0;
        this.status("open");
        this.resync();
        return;
      }
      this.opts.onMessage(env);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      if (this.stopped) return;
      this.status("reconnecting");
      const base = Math.min(this.opts.maxBackoffMs ?? 15_000, 1000 * 2 ** this.attempt);
      this.attempt += 1;
      this.timer = setTimeout(() => this.open(), ev.code === CLOSE_UNAUTHENTICATED ? base : jitter(base));
    };
    ws.onerror = () => undefined;
  }

  /** After (re)authenticating: re-attach to the match first, then flush queued messages. */
  private resync(): void {
    const pending = this.queue;
    this.queue = [];
    if (this.match) {
      const env: ClientEnvelope = this.match.spectator
        ? { type: "spectate.join", match_id: this.match.id, seq: 0, payload: {} }
        : { type: "match.sync", match_id: this.match.id, seq: 0, payload: { last_seq: this.lastSeq } };
      this.ws?.send(JSON.stringify(env));
    }
    for (const text of pending) {
      const env = JSON.parse(text) as ClientEnvelope;
      if (env.type === "match.sync" || env.type === "spectate.join") continue; // just re-sent above
      this.ws?.send(text);
    }
  }
}
