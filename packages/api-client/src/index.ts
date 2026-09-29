// Typed REST client (CLAUDE.md §10.1). Frontends call same-origin `/api/v1` paths; Nginx
// proxies them to the backend, so no CORS. Auth lives in HttpOnly cookies.
import type {
  AccountLinkGraph,
  AdminAccount,
  AdminAnnouncement,
  AdminCoinPackage,
  AdminCredentials,
  AdminDashboard,
  AdminItem,
  AdminMatchSearchRow,
  AdminPhrase,
  AdminPool,
  AdminRole,
  AdminTextOverride,
  AdminTournamentCreate,
  Announcement,
  DiceTestResult,
  FinancialReport,
  GameReport,
  ReportRange,
  TextOverrides,
  UserReport,
  AdminAuditEntry,
  FraudDecision,
  FraudFlag,
  FraudFlagFilter,
  MatchAnalysis,
  AdminMe,
  AdminSetting,
  ApiError,
  HealthResponse,
  Me,
  MeUpdate,
  OtpPurpose,
  OtpRequestResponse,
  OtpVerifyResponse,
  Paginated,
  PublicUser,
  RegisterRequest,
  SessionInfo,
  SmsStatus,
  UsernameAvailability,
  AdminUserDetail,
  AdminUserRow,
  AdminWithdrawal,
  PublicConfig,
  TournamentInfo,
  BracketSlotInfo,
  OpenPool,
  PredictionRow,
  ReferralSummary,
  ReferralEarningRow,
  ItemKind,
  ShopItem,
  PhraseText,
  CoinPackages,
  PaymentInfo,
  Leaderboard,
  Tier,
  LiveMatchRow,
  MatchSummary,
  MyMatchSummary,
  ActiveMatch,
  Replay,
  AdminWithdrawalFilter,
  AdminLedgerRow,
  AdminBalanceChange,
  UserStatus,
  BankAccountInfo,
  BankInfo,
  LedgerRow,
  TransferResult,
  WalletSummary,
  Withdrawal,
} from "@bg/protocol";

/** A fresh Idempotency-Key for one user action; reuse it when retrying that same action. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export const API_PREFIX = "/api/v1";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.code);
    this.name = "ApiRequestError";
  }
}

const NETWORK_ERROR: ApiError = { code: "NETWORK", message_key: "errors.network", details: {} };

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Absolute origin for server-side calls; browsers use same-origin paths. */
  baseUrl?: string;
  /** Internal: set on the retry after a token refresh, so it never loops. */
  retried?: boolean;
}

let csrfReady: Promise<void> | null = null;

/** Writes need the `csrftoken` cookie; fetch it once per page load when missing. */
function ensureCsrf(baseUrl = ""): Promise<void> {
  if (csrfToken()) return Promise.resolve();
  csrfReady ??= fetch(`${baseUrl}${API_PREFIX}/auth/csrf`, { credentials: "include" })
    .then(() => undefined)
    .catch(() => {
      csrfReady = null;
    });
  return csrfReady;
}

/** Resolves to null when the session was refreshed, else the refresh's error (e.g. AUTH_BANNED). */
let refreshing: Promise<ApiError | null> | null = null;

/** One shared refresh for all requests that hit an expired access token at the same time. */
function refreshSession(baseUrl = ""): Promise<ApiError | null> {
  refreshing ??= (async () => {
    try {
      await ensureCsrf(baseUrl);
      const token = csrfToken();
      const res = await fetch(`${baseUrl}${API_PREFIX}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: token ? { "X-CSRFToken": token } : {},
      });
      if (res.ok) return null;
      const data: unknown = await res.json().catch(() => null);
      return isApiError(data) ? data : { code: "AUTH_SESSION_INVALID", message_key: "errors.auth.sessionInvalid", details: {} };
    } catch {
      return NETWORK_ERROR;
    } finally {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

const NO_REFRESH_PATHS = ["/auth/refresh", "/auth/login", "/auth/logout"];

const DEVICE_KEY = "bg.device";
let deviceId: string | null | undefined;

/** The override for tests and non-browser callers; browsers get one automatically. */
export function setDeviceId(id: string | null): void {
  deviceId = id;
}

/**
 * A random id kept in this browser, sent as X-Device-Id on player requests so anti-fraud can link
 * accounts that share a device (CLAUDE.md §12.2). Null where there is no storage.
 */
function currentDeviceId(): string | null {
  if (deviceId !== undefined) return deviceId;
  deviceId = null;
  try {
    const stored = globalThis.localStorage?.getItem(DEVICE_KEY);
    if (stored) {
      deviceId = stored;
    } else if (globalThis.localStorage && globalThis.crypto?.randomUUID) {
      deviceId = globalThis.crypto.randomUUID();
      globalThis.localStorage.setItem(DEVICE_KEY, deviceId);
    }
  } catch {
    // Storage blocked (private mode, settings): no device id.
  }
  return deviceId;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    if (typeof document !== "undefined") await ensureCsrf(options.baseUrl);
    const token = csrfToken();
    if (token) headers["X-CSRFToken"] = token;
  }
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const device = path.startsWith("/admin/") ? null : currentDeviceId();
  if (device) headers["X-Device-Id"] = device;

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl ?? ""}${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiRequestError(0, NETWORK_ERROR);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = isApiError(data)
      ? data
      : { code: "HTTP_ERROR", message_key: "errors.generic", details: { status: response.status } };
    // Expired access token: refresh once, then replay the request (player API only).
    if (
      response.status === 401 &&
      body.code === "AUTH_SESSION_INVALID" &&
      !options.retried &&
      !path.startsWith("/admin/") &&
      !NO_REFRESH_PATHS.includes(path)
    ) {
      const refreshError = await refreshSession(options.baseUrl);
      if (refreshError === null) return apiRequest<T>(path, { ...options, retried: true });
      // A ban found while refreshing is what the app must show, not the stale-token error.
      if (refreshError.code === "AUTH_BANNED") throw new ApiRequestError(403, refreshError);
    }
    throw new ApiRequestError(response.status, body);
  }
  return data as T;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "code" in value && "message_key" in value;
}

type Opts = Pick<RequestOptions, "signal" | "baseUrl">;

/** `?a=1&b=x` from the defined, non-empty values; "" when none. */
export function query(params: object): string {
  const entries = Object.entries(params as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : "";
}

/** The audit log filters (§13 Access); dates are ISO Tehran days. */
export interface AuditFilter {
  target_type?: string;
  target_id?: string;
  admin?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

/** List, create, read, update, and delete for an admin catalog (writes are audited server-side). */
function crud<T extends { id: number }>(base: string) {
  return {
    list: (o?: Opts) => apiRequest<Paginated<T>>(base, o),
    get: (id: number, o?: Opts) => apiRequest<T>(`${base}/${id}`, o),
    create: (row: Omit<T, "id" | "updated_at">) => apiRequest<T>(base, { method: "POST", body: row }),
    update: (id: number, change: Partial<Omit<T, "id">>) => apiRequest<T>(`${base}/${id}`, { method: "PATCH", body: change }),
    /** Deletes announcements and text overrides; deactivates packages, items, and phrases. */
    remove: (id: number) => apiRequest<void>(`${base}/${id}`, { method: "DELETE" }),
  };
}

export const api = {
  health: (o?: Opts) => apiRequest<HealthResponse>("/health", o),
  config: (o?: Opts) => apiRequest<PublicConfig>("/config", o),

  auth: {
    requestOtp: (phone: string, purpose: OtpPurpose) =>
      apiRequest<OtpRequestResponse>("/auth/otp", { method: "POST", body: { phone, purpose } }),
    verifyOtp: (phone: string, purpose: OtpPurpose, code: string) =>
      apiRequest<OtpVerifyResponse>("/auth/otp/verify", { method: "POST", body: { phone, purpose, code } }),
    register: (body: RegisterRequest) => apiRequest<Me>("/auth/register", { method: "POST", body }),
    login: (phone: string, password: string) =>
      apiRequest<Me>("/auth/login", { method: "POST", body: { phone, password } }),
    resetPassword: (verification_token: string, new_password: string) =>
      apiRequest<Me>("/auth/password/reset", { method: "POST", body: { verification_token, new_password } }),
    logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
    usernameAvailable: (username: string, o?: Opts) =>
      apiRequest<UsernameAvailability>(`/auth/username-available?username=${encodeURIComponent(username)}`, o),
    /** A 60 s token for the WebSocket `auth` message. */
    wsToken: (o?: Opts) => apiRequest<{ token: string; expires_in: number }>("/auth/ws-token", o),
  },

  shop: {
    packages: (o?: Opts) => apiRequest<CoinPackages>("/shop/packages", o),
    /** Returns the gateway page to send the user to (`redirect_url`). */
    checkout: (
      pick: { package_id: number } | { custom_toman: number },
      surface: "m" | "app",
      idempotencyKey: string,
    ) =>
      apiRequest<PaymentInfo & { redirect_url: string | null }>("/shop/checkout", {
        method: "POST",
        body: { ...pick, surface },
        idempotencyKey,
      }),
    payment: (id: string, o?: Opts) => apiRequest<PaymentInfo>(`/payments/${encodeURIComponent(id)}`, o),
    items: (kind?: ItemKind, o?: Opts) => apiRequest<Paginated<ShopItem>>(`/shop/items${query({ kind })}`, o),
    /** `expectedPrice`: the price the player confirmed; a changed price is refused with SHOP_PRICE_CHANGED. */
    buy: (id: number, idempotencyKey: string, expectedPrice?: number) =>
      apiRequest<ShopItem>(`/shop/items/${id}/buy`, {
        method: "POST",
        idempotencyKey,
        body: expectedPrice === undefined ? undefined : { expected_price: expectedPrice },
      }),
    equip: (id: number) => apiRequest<ShopItem>(`/me/items/${id}/equip`, { method: "POST" }),
    themes: (o?: Opts) =>
      apiRequest<Paginated<ShopItem> & { equipped: { board_theme: string; checker_theme: string } | null }>("/themes", o),
    phrases: (o?: Opts) => apiRequest<Paginated<PhraseText>>("/phrases", o),
    /** Costs `username.change_cost` coins, once per cooldown (§12.1). */
    changeUsername: (username: string, idempotencyKey: string) =>
      apiRequest<Me>("/me/username", { method: "POST", body: { username }, idempotencyKey }),
  },

  predictions: {
    open: (o?: Opts) => apiRequest<Paginated<OpenPool>>("/predictions/open", o),
    place: (matchId: string, side: 0 | 1, amount: number, idempotencyKey: string) =>
      apiRequest<PredictionRow>("/predictions", { method: "POST", body: { match_id: matchId, side, amount }, idempotencyKey }),
    mine: (cursor?: string, o?: Opts) => apiRequest<Paginated<PredictionRow>>(`/me/predictions${query({ cursor })}`, o),
  },

  tournaments: {
    list: (status?: TournamentInfo["status"], o?: Opts) =>
      apiRequest<Paginated<TournamentInfo>>(`/tournaments${query({ status })}`, o),
    get: (id: number, o?: Opts) => apiRequest<TournamentInfo>(`/tournaments/${id}`, o),
    join: (id: number, idempotencyKey: string) =>
      apiRequest<TournamentInfo>(`/tournaments/${id}/join`, { method: "POST", idempotencyKey }),
    leave: (id: number) => apiRequest<TournamentInfo>(`/tournaments/${id}/join`, { method: "DELETE" }),
    bracket: (id: number, o?: Opts) =>
      apiRequest<{ tournament: TournamentInfo; slots: BracketSlotInfo[] }>(`/tournaments/${id}/bracket`, o),
  },

  referral: {
    get: (o?: Opts) => apiRequest<ReferralSummary>("/me/referral", o),
    earnings: (cursor?: string, o?: Opts) =>
      apiRequest<Paginated<ReferralEarningRow>>(`/me/referral/earnings${query({ cursor })}`, o),
  },

  leaderboard: (scope: "all" | "weekly" | "monthly" | "predict", o?: Opts) =>
    apiRequest<Leaderboard>(`/leaderboard${query({ scope })}`, o),

  matches: {
    tiers: (o?: Opts) => apiRequest<Paginated<Tier>>("/tiers", o),
    live: (filter: { tier?: number; variant?: string; tournament?: number; sort?: "spectators" | "pool" | "elo" } = {}, o?: Opts) =>
      apiRequest<Paginated<LiveMatchRow>>(`/matches/live${query(filter)}`, o),
    mine: (cursor?: string, o?: Opts) => apiRequest<Paginated<MyMatchSummary>>(`/me/matches${query({ cursor })}`, o),
    /** The personal fields (elo_delta, xp, coins, games) are present only for the match's players. */
    get: (id: string, o?: Opts) => apiRequest<MatchSummary & Partial<MyMatchSummary>>(`/matches/${encodeURIComponent(id)}`, o),
    /** Players of the match only (403 for anyone else). */
    replay: (id: string, o?: Opts) => apiRequest<Replay>(`/matches/${encodeURIComponent(id)}/replay`, o),
    /** `entry`: the cost the player confirmed (config.bot_entry.entry, 0 when free); a different
     * current entry is refused with BOT_ENTRY_CHANGED so nobody is charged unseen (§9). */
    startBot: (level: "easy" | "medium" | "hard", variant: string, length: number, entry = 0) =>
      apiRequest<{ match_id: string; seed_commit: string; entry: number }>("/matches/bot", {
        method: "POST",
        body: { level, variant, length, entry },
      }),
    active: (o?: Opts) => apiRequest<ActiveMatch>("/me/matches/active", o),
  },

  me: {
    get: (o?: Opts) => apiRequest<Me>("/me", o),
    update: (body: MeUpdate) => apiRequest<Me>("/me", { method: "PATCH", body }),
    sessions: (o?: Opts) => apiRequest<Paginated<SessionInfo>>("/me/sessions", o),
    signOutOthers: () => apiRequest<{ revoked: number }>("/me/sessions", { method: "DELETE" }),
  },

  users: {
    get: (username: string, o?: Opts) => apiRequest<PublicUser>(`/users/${encodeURIComponent(username)}`, o),
  },

  wallet: {
    get: (o?: Opts) => apiRequest<WalletSummary>("/wallet", o),
    ledger: (cursor?: string, o?: Opts) =>
      apiRequest<Paginated<LedgerRow>>(`/wallet/ledger${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, o),
    transfer: (username: string, amount: number, password: string, idempotencyKey: string) =>
      apiRequest<TransferResult>("/wallet/transfer", {
        method: "POST",
        body: { username, amount, password },
        idempotencyKey,
      }),
    banks: (o?: Opts) => apiRequest<Paginated<BankInfo>>("/wallet/banks", o),
    bankAccounts: (o?: Opts) => apiRequest<Paginated<BankAccountInfo>>("/me/bank-accounts", o),
    setBankAccount: (iban: string) => apiRequest<BankAccountInfo>("/me/bank-accounts", { method: "POST", body: { iban } }),
    deleteBankAccount: (id: number) => apiRequest<void>(`/me/bank-accounts/${id}`, { method: "DELETE" }),
    requestWithdrawalCode: () => apiRequest<OtpRequestResponse>("/wallet/withdrawals/otp", { method: "POST" }),
    /** `confirm` is an SMS code or, while SMS is off, the password (`WalletSummary.withdraw.confirm`). */
    withdraw: (amount: number, confirm: { code: string } | { password: string }, idempotencyKey: string) =>
      apiRequest<Withdrawal>("/wallet/withdrawals", { method: "POST", body: { amount, ...confirm }, idempotencyKey }),
    withdrawals: (cursor?: string, o?: Opts) =>
      apiRequest<Paginated<Withdrawal>>(`/wallet/withdrawals${query({ cursor })}`, o),
    withdrawal: (id: number, o?: Opts) => apiRequest<Withdrawal>(`/wallet/withdrawals/${id}`, o),
    cancelWithdrawal: (id: number) => apiRequest<Withdrawal>(`/wallet/withdrawals/${id}`, { method: "DELETE" }),
  },

  push: {
    key: (o?: Opts) => apiRequest<{ enabled: boolean; key: string | null }>("/push/key", o),
    subscribe: (sub: { endpoint: string; p256dh: string; auth: string }) =>
      apiRequest<void>("/me/push-subscriptions", { method: "POST", body: sub }),
    unsubscribe: (endpoint: string) =>
      apiRequest<void>("/me/push-subscriptions", { method: "DELETE", body: { endpoint } }),
  },

  content: {
    avatars: (o?: Opts) => apiRequest<Paginated<{ key: string }>>("/avatars", o),
    announcements: (o?: Opts) => apiRequest<Paginated<Announcement>>("/announcements", o),
    texts: (o?: Opts) => apiRequest<TextOverrides>("/content/texts", o),
  },

  admin: {
    login: (username: string, password: string, totp: string) =>
      apiRequest<AdminMe>("/admin/auth/login", { method: "POST", body: { username, password, totp } }),
    /** Whether sign-in asks for the two-step code (§12.1; off only on local or staging review). */
    loginConfig: (o?: Opts) => apiRequest<{ totp_required: boolean }>("/admin/auth/config", o),
    logout: () => apiRequest<void>("/admin/auth/logout", { method: "POST" }),
    me: (o?: Opts) => apiRequest<AdminMe>("/admin/me", o),
    settings: (o?: Opts) => apiRequest<Paginated<AdminSetting>>("/admin/settings", o),
    /** `expected` is the value the admin saw; the server answers 409 SETTING_CONFLICT if it changed. */
    updateSetting: (key: string, value: unknown, reason: string, expected?: unknown) =>
      apiRequest<AdminSetting>(`/admin/settings/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: expected === undefined ? { value, reason } : { value, reason, expected },
      }),
    resetSetting: (key: string, reason: string, expected?: unknown) =>
      apiRequest<AdminSetting>(`/admin/settings/${encodeURIComponent(key)}`, {
        method: "DELETE",
        body: expected === undefined ? { reason } : { reason, expected },
      }),
    smsStatus: (refresh = false, o?: Opts) =>
      apiRequest<SmsStatus>(`/admin/sms/status${refresh ? "?refresh=1" : ""}`, o),
    /** Username, phone in any form (Persian digits too), or `#id`. */
    users: (q: string, cursor?: string, o?: Opts) =>
      apiRequest<Paginated<AdminUserRow>>(`/admin/users${query({ q, cursor })}`, o),
    user: (id: number, o?: Opts) => apiRequest<AdminUserDetail>(`/admin/users/${id}`, o),
    userLedger: (id: number, filter: { cursor?: string; from?: string; to?: string } = {}, o?: Opts) =>
      apiRequest<Paginated<AdminLedgerRow>>(`/admin/users/${id}/ledger${query(filter)}`, o),
    setUserStatus: (id: number, status: UserStatus, reason: string) =>
      apiRequest<AdminUserRow>(`/admin/users/${id}/status`, { method: "POST", body: { status, reason } }),
    /** Returns a one-time password (shown once) and signs the player out everywhere. */
    resetUserPassword: (id: number, reason: string) =>
      apiRequest<{ password: string; sessions_revoked: number }>(`/admin/users/${id}/password`, {
        method: "POST",
        body: { reason },
      }),
    topup: (id: number, amount: number, reason: string, idempotencyKey: string) =>
      apiRequest<AdminBalanceChange>(`/admin/users/${id}/wallet/topup`, {
        method: "POST",
        body: { amount, reason },
        idempotencyKey,
      }),
    /** Signed amount: positive credits, negative debits. */
    adjust: (id: number, amount: number, reason: string, idempotencyKey: string) =>
      apiRequest<AdminBalanceChange>(`/admin/users/${id}/wallet/adjust`, {
        method: "POST",
        body: { amount, reason },
        idempotencyKey,
      }),
    withdrawals: (filter: AdminWithdrawalFilter = {}, o?: Opts) =>
      apiRequest<Paginated<AdminWithdrawal> & { count: number }>(`/admin/withdrawals${query(filter)}`, o),
    /** Same filters as `withdrawals`; use as a download link. */
    withdrawalsCsvUrl: (filter: AdminWithdrawalFilter = {}) =>
      `${API_PREFIX}/admin/withdrawals${query({ ...filter, cursor: undefined, export: "csv" })}`,
    withdrawal: (id: number, o?: Opts) => apiRequest<AdminWithdrawal>(`/admin/withdrawals/${id}`, o),
    claimWithdrawal: (id: number) => apiRequest<AdminWithdrawal>(`/admin/withdrawals/${id}/claim`, { method: "POST" }),
    approveWithdrawal: (id: number, bank_reference: string) =>
      apiRequest<AdminWithdrawal>(`/admin/withdrawals/${id}/approve`, { method: "POST", body: { bank_reference } }),
    rejectWithdrawal: (id: number, reason: string) =>
      apiRequest<AdminWithdrawal>(`/admin/withdrawals/${id}/reject`, { method: "POST", body: { reason } }),
    smsPattern: (code: string, o?: Opts) =>
      apiRequest<{ code: string; status: string }>(`/admin/sms/patterns/${encodeURIComponent(code)}`, o),
    audit: (filter: AuditFilter = {}, o?: Opts) => apiRequest<Paginated<AdminAuditEntry>>(`/admin/audit${query(filter)}`, o),
    auditCsvUrl: (filter: AuditFilter = {}) => `${API_PREFIX}/admin/audit${query({ ...filter, cursor: undefined, export: "csv" })}`,
    fraudFlags: (filter: FraudFlagFilter = {}, o?: Opts) =>
      apiRequest<Paginated<FraudFlag>>(`/admin/fraud/flags${query(filter)}`, o),
    decideFlag: (id: number, decision: FraudDecision) =>
      apiRequest<FraudFlag>(`/admin/fraud/flags/${id}/decide`, { method: "POST", body: decision }),
    userLinks: (id: number, o?: Opts) => apiRequest<AccountLinkGraph>(`/admin/users/${id}/links`, o),

    dashboard: (o?: Opts) => apiRequest<AdminDashboard>("/admin/dashboard", o),
    financialReport: (range: ReportRange = {}, o?: Opts) =>
      apiRequest<FinancialReport>(`/admin/reports/financial${query(range)}`, o),
    gameReport: (range: ReportRange = {}, o?: Opts) => apiRequest<GameReport>(`/admin/reports/games${query(range)}`, o),
    userReport: (range: ReportRange = {}, o?: Opts) => apiRequest<UserReport>(`/admin/reports/users${query(range)}`, o),
    /** A download link for a report as CSV. */
    reportCsvUrl: (report: "financial" | "games" | "users", range: ReportRange = {}) =>
      `${API_PREFIX}/admin/reports/${report}${query({ ...range, export: "csv" })}`,
    runDiceTest: () => apiRequest<DiceTestResult>("/admin/reports/dice/run", { method: "POST" }),
    matches: (filter: { q?: string; user_id?: number; status?: string; from?: string; to?: string; cursor?: string } = {}, o?: Opts) =>
      apiRequest<Paginated<AdminMatchSearchRow>>(`/admin/matches${query(filter)}`, o),
    liveMatches: (o?: Opts) => apiRequest<Paginated<LiveMatchRow>>("/admin/matches/live", o),
    /** For a GameSocket that may only spectate, hidden from players and the count (§13). */
    wsToken: () => apiRequest<{ token: string; expires_in: number }>("/admin/ws-token"),

    packages: crud<AdminCoinPackage>("/admin/shop/packages"),
    items: crud<AdminItem>("/admin/shop/items"),
    phrases: crud<AdminPhrase>("/admin/content/phrases"),
    announcements: crud<AdminAnnouncement>("/admin/content/announcements"),
    texts: crud<AdminTextOverride>("/admin/content/texts"),

    pools: (status: AdminPool["status"] = "held", o?: Opts) =>
      apiRequest<Paginated<AdminPool>>(`/admin/predictions/pools${query({ status })}`, o),
    decidePool: (id: number, approve: boolean, reason: string) =>
      apiRequest<AdminPool>(`/admin/predictions/pools/${id}/decide`, { method: "POST", body: { approve, reason } }),

    tournaments: (o?: Opts) => apiRequest<Paginated<TournamentInfo>>("/admin/tournaments", o),
    createTournament: (t: AdminTournamentCreate) =>
      apiRequest<TournamentInfo>("/admin/tournaments", { method: "POST", body: t }),
    cancelTournament: (id: number, reason: string) =>
      apiRequest<TournamentInfo>(`/admin/tournaments/${id}/cancel`, { method: "POST", body: { reason } }),
    bracket: (id: number, o?: Opts) =>
      apiRequest<{ tournament: TournamentInfo; slots: BracketSlotInfo[] }>(`/admin/tournaments/${id}/bracket`, o),
    replay: (matchId: string, o?: Opts) => apiRequest<Replay>(`/admin/matches/${encodeURIComponent(matchId)}/replay`, o),
    matchAnalysis: (matchId: string, o?: Opts) =>
      apiRequest<MatchAnalysis>(`/admin/matches/${encodeURIComponent(matchId)}/analysis`, o),

    admins: (o?: Opts) => apiRequest<Paginated<AdminAccount>>("/admin/admins", o),
    createAdmin: (username: string, role: AdminRole) =>
      apiRequest<AdminAccount & { credentials: AdminCredentials }>("/admin/admins", {
        method: "POST",
        body: { username, role },
      }),
    updateAdmin: (id: number, change: { role?: AdminRole; is_active?: boolean; reason: string }) =>
      apiRequest<AdminAccount>(`/admin/admins/${id}`, { method: "PATCH", body: change }),
    resetAdmin: (id: number, reason: string) =>
      apiRequest<AdminAccount & { credentials: AdminCredentials }>(`/admin/admins/${id}/reset`, {
        method: "POST",
        body: { reason },
      }),
  },
};

export * from "./socket";
export * from "./push";
export * from "./rules";
export * from "./queue";
