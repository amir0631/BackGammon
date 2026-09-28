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
  BankAccountInfo,
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
    bankAccounts: (o?: Opts) => apiRequest<Paginated<BankAccountInfo>>("/me/bank-accounts", o),
    setBankAccount: (iban: string) => apiRequest<BankAccountInfo>("/me/bank-accounts", { method: "POST", body: { iban } }),
    deleteBankAccount: (id: number) => apiRequest<void>(`/me/bank-accounts/${id}`, { method: "DELETE" }),
    requestWithdrawalCode: () => apiRequest<OtpRequestResponse>("/wallet/withdrawals/otp", { method: "POST" }),
    withdraw: (amount: number, code: string, idempotencyKey: string) =>
      apiRequest<Withdrawal>("/wallet/withdrawals", { method: "POST", body: { amount, code }, idempotencyKey }),
    withdrawals: (o?: Opts) => apiRequest<Paginated<Withdrawal>>("/wallet/withdrawals", o),
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
    users: (q: string, o?: Opts) => apiRequest<Paginated<AdminUserRow>>(`/admin/users?q=${encodeURIComponent(q)}`, o),
    user: (id: number, o?: Opts) => apiRequest<AdminUserDetail>(`/admin/users/${id}`, o),
    topup: (id: number, amount: number, reason: string, idempotencyKey: string) =>
      apiRequest<{ balance_before: number; balance_after: number; created: boolean }>(`/admin/users/${id}/wallet/topup`, {
        method: "POST",
        body: { amount, reason },
        idempotencyKey,
      }),
    withdrawals: (status?: string, o?: Opts) =>
      apiRequest<Paginated<AdminWithdrawal>>(`/admin/withdrawals${status ? `?status=${status}` : ""}`, o),
    approveWithdrawal: (id: number, bank_reference: string) =>
      apiRequest<Withdrawal>(`/admin/withdrawals/${id}/approve`, { method: "POST", body: { bank_reference } }),
    rejectWithdrawal: (id: number, reason: string) =>
      apiRequest<Withdrawal>(`/admin/withdrawals/${id}/reject`, { method: "POST", body: { reason } }),
    smsPattern: (code: string, o?: Opts) =>
      apiRequest<{ code: string; status: string }>(`/admin/sms/patterns/${encodeURIComponent(code)}`, o),
    audit: (filter: { target_type?: string; target_id?: string } = {}, o?: Opts) =>
      apiRequest<Paginated<AdminAuditEntry>>(`/admin/audit?${new URLSearchParams(filter).toString()}`, o),
  },
};
