// Typed REST client (CLAUDE.md §10.1). Frontends call same-origin `/api/v1` paths; Nginx
// proxies them to the backend, so no CORS. Auth lives in HttpOnly cookies.
import type { ApiError, HealthResponse } from "@bg/protocol";

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
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
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
    throw new ApiRequestError(response.status, body);
  }
  return data as T;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "code" in value && "message_key" in value;
}

export const api = {
  health: (options?: RequestOptions) => apiRequest<HealthResponse>("/health", options),
};
