// Typed REST client (CLAUDE.md §10.1). Frontends call same-origin `/api/v1` paths; Nginx
// proxies them to the backend, so no CORS. Auth lives in HttpOnly cookies.
import type {
  AdminAuditEntry,
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
  ItemKind,
  ShopItem,
  PhraseText,
  CoinPackages,
  PaymentInfo,
  Leaderboard,
  Tier,
  LiveMatchRow,
  MatchSummary,
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

let refreshing: Promise<boolean> | null = null;

/** One shared refresh for all requests that hit an expired access token at the same time. */
function refreshSession(baseUrl = ""): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      await ensureCsrf(baseUrl);
      const token = csrfToken();
      const res = await fetch(`${baseUrl}${API_PREFIX}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: token ? { "X-CSRFToken": token } : {},
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

const NO_REFRESH_PATHS = ["/auth/refresh", "/auth/login", "/auth/logout"];

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
      !NO_REFRESH_PATHS.includes(path) &&
      (await refreshSession(options.baseUrl))
    ) {
      return apiRequest<T>(path, { ...options, retried: true });
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

export const api = {
  health: (o?: Opts) => apiRequest<HealthResponse>("/health", o),

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
    buy: (id: number, idempotencyKey: string) =>
      apiRequest<ShopItem>(`/shop/items/${id}/buy`, { method: "POST", idempotencyKey }),
    equip: (id: number) => apiRequest<ShopItem>(`/me/items/${id}/equip`, { method: "POST" }),
    themes: (o?: Opts) =>
      apiRequest<Paginated<ShopItem> & { equipped: { board_theme: string; checker_theme: string } | null }>("/themes", o),
    phrases: (o?: Opts) => apiRequest<Paginated<PhraseText>>("/phrases", o),
    /** Costs `username.change_cost` coins, once per cooldown (§12.1). */
    changeUsername: (username: string, idempotencyKey: string) =>
      apiRequest<Me>("/me/username", { method: "POST", body: { username }, idempotencyKey }),
  },

  leaderboard: (scope: "all" | "weekly" | "monthly", o?: Opts) =>
    apiRequest<Leaderboard>(`/leaderboard${query({ scope })}`, o),

  matches: {
    tiers: (o?: Opts) => apiRequest<Paginated<Tier>>("/tiers", o),
    live: (filter: { tier?: number; variant?: string; sort?: "spectators" | "pool" | "elo" } = {}, o?: Opts) =>
      apiRequest<Paginated<LiveMatchRow>>(`/matches/live${query(filter)}`, o),
    mine: (cursor?: string, o?: Opts) => apiRequest<Paginated<MatchSummary>>(`/me/matches${query({ cursor })}`, o),
    get: (id: string, o?: Opts) => apiRequest<MatchSummary>(`/matches/${encodeURIComponent(id)}`, o),
    /** Players of the match only (403 for anyone else). */
    replay: (id: string, o?: Opts) => apiRequest<Replay>(`/matches/${encodeURIComponent(id)}/replay`, o),
    startBot: (level: "easy" | "medium" | "hard", variant: string, length: number) =>
      apiRequest<{ match_id: string; seed_commit: string }>("/matches/bot", {
        method: "POST",
        body: { level, variant, length },
      }),
    active: (o?: Opts) => apiRequest<{ match_id: string | null }>("/me/matches/active", o),
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

  content: {
    avatars: (o?: Opts) => apiRequest<Paginated<{ key: string }>>("/avatars", o),
  },

  admin: {
    login: (username: string, password: string, totp: string) =>
      apiRequest<AdminMe>("/admin/auth/login", { method: "POST", body: { username, password, totp } }),
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
    audit: (filter: { target_type?: string; target_id?: string } = {}, o?: Opts) =>
      apiRequest<Paginated<AdminAuditEntry>>(`/admin/audit?${new URLSearchParams(filter).toString()}`, o),
  },
};

export * from "./socket";
