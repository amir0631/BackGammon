import type { Page, WebSocketRoute } from "@playwright/test";
import type {
  ActiveMatch,
  ClientEnvelope,
  Clock,
  MatchFoundOut,
  MatchStateOut,
  PlayerInfo,
  PublicConfig,
  ServerEnvelope,
  ServerMessageType,
  ServerMessages,
  Tier,
} from "@bg/protocol";
import type { Handlers, MockResponse } from "./mocks";

// API and WebSocket mocks for the play hub (play.md) and the match screen (match.md). Shapes follow
// packages/protocol (generated from backend/realtime/protocol.py). The socket mock answers `auth`
// with `auth.ok`, `queue.join` with `queue.status waiting`, and `match.sync` with a full
// `match.state`; tests push further server events through `ws.push`.

export const tiersFixture = (): Tier[] =>
  [50, 100, 500, 1000].map((entry, i) => ({
    id: entry,
    entry,
    variants: ["standard_cube", "standard_nocube", "traditional"],
    lengths: [1, 3, 5, 7, 11],
    waiting: [3, 1, 0, 0][i]!,
    rake_pct: 10,
    pot: entry * 2,
    payout: entry * 2 - Math.floor((entry * 2 * 10) / 100),
  }));

export const configFixture = (): PublicConfig => ({
  app_name: "Nard",
  sms_enabled: false,
  payments_enabled: false,
  predictions_enabled: true,
  spectating_enabled: true,
  spectator_delay_seconds: 0,
  spectator_reactions_enabled: true,
  reconnect_grace_seconds: 90,
  predict_min_count_for_board: 20,
  coin_price_toman: 1000,
  support_contact: "support@example.ir",
  username_change: { cost: 200, cooldown_days: 30 },
  allowed_lengths: [1, 3, 5, 7, 11],
  tiers: [50, 100, 500, 1000],
  bot_entry: { enabled: false, entry: 0, prize: 0 },
});

export interface PlayMockOptions {
  tiers?: Tier[] | MockResponse;
  active?: ActiveMatch;
  extra?: Handlers;
}

export function playHandlers(o: PlayMockOptions = {}): Handlers {
  return {
    "GET /tiers": Array.isArray(o.tiers) || o.tiers === undefined
      ? { status: 200, body: { results: (o.tiers as Tier[] | undefined) ?? tiersFixture(), next: null } }
      : o.tiers,
    "GET /me/matches/active": { status: 200, body: (o.active ?? { match_id: null }) as unknown as Record<string, unknown> },
    "GET /config": { status: 200, body: configFixture() as unknown as Record<string, unknown> },
    "GET /auth/ws-token": { status: 200, body: { token: "ws-e2e", expires_in: 60 } },
    "GET /leaderboard*": {
      status: 200,
      body: {
        scope: "all",
        results: [
          { rank: 1, username: "shahram", avatar: "avatar_07", level: 22, value: 1904 },
          { rank: 2, username: "negar_b", avatar: "avatar_11", level: 18, value: 1861 },
          { rank: 3, username: "ali_tbz", avatar: "avatar_08", level: 7, value: 1802 },
          { rank: 4, username: "reza.k", avatar: "avatar_01", level: 12, value: 1777 },
          { rank: 5, username: "mina", avatar: "avatar_05", level: 9, value: 1750 },
        ],
        me: { rank: 88, value: 1542 },
        period: null,
      },
    },
    ...o.extra,
  };
}

// ---- Match fixtures -------------------------------------------------------------------------

export const MATCH_ID = "3f2a9c1e-0000-4000-8000-00000000abcd";

export function playerFixture(overrides: Partial<PlayerInfo> = {}): PlayerInfo {
  return {
    username: "ali_tbz",
    avatar: "avatar_08",
    elo: 1618,
    level: 7,
    is_bot: false,
    bot_level: null,
    board_theme: "default",
    checker_theme: "default",
    connected: true,
    ...overrides,
  };
}

export function foundFixture(overrides: Partial<MatchFoundOut> = {}): MatchFoundOut {
  return {
    match_id: MATCH_ID,
    you: 0,
    opponent: playerFixture(),
    seed_commit: "9b1f0c7a52de4e0b8a1c3d5e7f90a1b2c3d4e5f60718293a4b5c6d7e8f901234",
    variant: "standard_cube",
    length: 3,
    entry: 100,
    join_deadline: Date.now() + 90_000,
    tournament: null,
    ...overrides,
  } as MatchFoundOut;
}

export const START_POSITION = "-2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-3,0,-5,0,0,0,0,2,0,0,0,0";

export function clockFixture(overrides: Partial<Clock> = {}): Clock {
  const now = Date.now();
  return { actor: 0, deadline: now + 25_000 + 90_000, bank: [90, 90], turn_seconds: 30, server_now: now, ...overrides };
}

export function stateFixture(overrides: Partial<MatchStateOut> = {}): MatchStateOut {
  return {
    match_id: MATCH_ID,
    status: "active",
    you: 0,
    players: [
      playerFixture({ username: "tester1", avatar: "avatar_03", elo: 1542, level: 3 }),
      playerFixture(),
    ],
    variant: "standard_cube",
    length: 3,
    entry: 100,
    seed_commit: "9b1f0c7a52de4e0b8a1c3d5e7f90a1b2c3d4e5f60718293a4b5c6d7e8f901234",
    score: [1, 0],
    game_no: 2,
    crawford_game: false,
    phase: "roll",
    position: START_POSITION,
    turn: 0,
    dice: null,
    cube_value: 1,
    cube_owner: null,
    can_double: true,
    legal: [],
    clock: clockFixture(),
    timeouts: [0, 0],
    results: [{ game_no: 1, winner: 0, kind: "single", cube: 1, points: 1, reason: "bear_off" }],
    winner: null,
    end_reason: null,
    spectators: 4,
    rules: {
      turn_seconds: 30,
      timebank_seconds: 90,
      max_consecutive_timeouts: 3,
      reconnect_grace_seconds: 90,
      points: { single: 1, gammon: 2, backgammon: 3 },
      rake_pct: 10,
      payout: 180,
    },
    grace: [null, null],
    history: [],
    ...overrides,
  } as MatchStateOut;
}

// ---- WebSocket mock -------------------------------------------------------------------------

export interface WsMock {
  /** Messages the client sent (after auth). */
  sent: ClientEnvelope[];
  /** Pushes a server event; `seq` defaults to the next match seq. */
  push: <K extends ServerMessageType>(type: K, payload: ServerMessages[K], seq?: number, matchId?: string | null) => void;
  /** Closes the socket from the server side (the client reconnects). */
  drop: () => void;
  /** Stops answering new connections (stays "reconnecting"). */
  refuse: (value: boolean) => void;
  seq: number;
}

export interface WsMockOptions {
  /** `match.sync` → this state (seq 10); omit to answer nothing. */
  state?: () => MatchStateOut;
  /** `queue.join` → waiting (default true). */
  waiting?: boolean;
  /** Answer `queue.join` with this error instead. */
  joinError?: { code: string; message_key: string; details?: Record<string, unknown> };
}

export async function mockSocket(page: Page, o: WsMockOptions = {}): Promise<WsMock> {
  let current: WebSocketRoute | null = null;
  let refusing = false;
  const mock: WsMock = {
    sent: [],
    seq: 10,
    push: (type, payload, seq, matchId) => {
      const s = seq ?? ++mock.seq;
      if (seq !== undefined) mock.seq = Math.max(mock.seq, seq);
      const env = { type, match_id: matchId === undefined ? (type.startsWith("queue") || type === "error" ? null : MATCH_ID) : matchId, seq: s, payload } as ServerEnvelope;
      current?.send(JSON.stringify(env));
    },
    drop: () => {
      void current?.close({ code: 1006 });
      current = null;
    },
    refuse: (value) => {
      refusing = value;
    },
  };
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (refusing) {
      void ws.close({ code: 1011 });
      return;
    }
    current = ws;
    ws.onMessage((raw) => {
      const env = JSON.parse(String(raw)) as ClientEnvelope;
      if (env.type === "auth") {
        ws.send(JSON.stringify({ type: "auth.ok", match_id: null, seq: 0, payload: { username: "tester1" } }));
        return;
      }
      mock.sent.push(env);
      if (env.type === "queue.join") {
        const p = env.payload as { tier_id: number; variant: string; length: number };
        if (o.joinError) {
          ws.send(JSON.stringify({ type: "error", match_id: null, seq: 0, payload: { details: {}, ...o.joinError } }));
        } else if (o.waiting !== false) {
          ws.send(JSON.stringify({ type: "queue.status", match_id: null, seq: 0, payload: { state: "waiting", reason: null, ...p } }));
        }
      } else if (env.type === "queue.leave") {
        ws.send(JSON.stringify({ type: "queue.status", match_id: null, seq: 0, payload: { state: "left", tier_id: 100, variant: "standard_cube", length: 3, reason: null } }));
      } else if (env.type === "match.sync" && o.state) {
        ws.send(JSON.stringify({ type: "match.state", match_id: MATCH_ID, seq: mock.seq, payload: o.state() }));
      }
    });
  });
  return mock;
}
