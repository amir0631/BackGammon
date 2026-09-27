// Shared REST and WebSocket types (CLAUDE.md §10). The Python side mirrors these
// with pydantic models; a contract test keeps both in sync.

/** REST error body (CLAUDE.md §10.1). */
export interface ApiError {
  code: string;
  message_key: string;
  details: Record<string, unknown>;
}

export interface Paginated<T> {
  results: T[];
  next: string | null;
}

export type ClientMessageType =
  | "auth"
  | "queue.join"
  | "queue.leave"
  | "match.sync"
  | "turn.roll"
  | "turn.move"
  | "cube.offer"
  | "cube.take"
  | "cube.drop"
  | "react.send"
  | "match.resign"
  | "spectate.join"
  | "spectate.leave"
  | "spectate.react";

export type ServerMessageType =
  | "error"
  | "match.found"
  | "match.state"
  | "turn.rolled"
  | "react.recv"
  | "opponent.disconnected"
  | "opponent.back"
  | "match.ended"
  | "pool.update"
  | "spectate.state"
  | "spectators.count";

/** WebSocket envelope, both directions (CLAUDE.md §10.3). */
export interface Envelope<T extends string = string, P = unknown> {
  type: T;
  match_id?: string;
  seq: number;
  payload: P;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  checks: Record<string, boolean>;
}

// ---- Accounts (CLAUDE.md §10.2 Auth, Profile) ----

export type Lang = "fa" | "en";
export type OtpPurpose = "register" | "password_reset";
export type UserStatus = "active" | "suspended" | "banned";

export interface UserPrefs {
  graphics_lite: boolean;
  animations_reduced: boolean;
  sound: boolean;
  vibration: boolean;
}

/** The signed-in user's own profile. Only the owner ever receives `phone`. */
export interface Me {
  id: number;
  username: string | null;
  phone: string;
  lang: Lang;
  avatar: string;
  prefs: UserPrefs;
  status: UserStatus;
  elo: number;
  xp: number;
  level: number;
  created_at: string;
}

export interface PublicUser {
  username: string;
  avatar: string;
  elo: number;
  level: number;
  created_at: string;
}

export interface SessionInfo {
  id: string;
  user_agent: string;
  ip: string | null;
  created_at: string;
  last_used_at: string;
  current: boolean;
}

export interface OtpRequestResponse {
  /** Seconds the code stays valid. */
  expires_in: number;
  /** Seconds before another code can be requested. */
  resend_after: number;
}

export interface OtpVerifyResponse {
  verification_token: string;
}

export interface RegisterRequest {
  verification_token: string;
  username: string;
  password: string;
  age_confirmed: boolean;
  referrer?: string;
  lang?: Lang;
}

export interface UsernameAvailability {
  available: boolean;
  reason: "taken" | "format" | "reserved" | "profanity" | null;
}

export interface MeUpdate {
  lang?: Lang;
  avatar?: string;
  prefs?: Partial<UserPrefs>;
}

// ---- Admin (CLAUDE.md §13) ----

export type AdminRole = "support" | "finance" | "superadmin";

export interface AdminMe {
  username: string;
  role: AdminRole;
}

export type SettingKind = "int" | "bool" | "str" | "int_list" | "number_list" | "json";

export interface AdminSetting {
  key: string;
  group: string;
  kind: SettingKind;
  value: unknown;
  default: unknown;
  is_default: boolean;
  min: number | null;
  max: number | null;
  choices: string[] | null;
  description: Record<Lang, string>;
  unit: "seconds" | "days" | "percent" | "coins" | "toman" | "rial" | "points" | "xp" | null;
}

export interface SmsStatus {
  provider: string;
  configured: boolean;
  credit_rial: number | null;
  low_credit: boolean | null;
  patterns: Record<string, { code: string; status: string }>;
  error: string | null;
  checked_at: string;
}

export interface AdminAuditEntry {
  id: number;
  admin: string;
  action: string;
  target_type: string;
  target_id: string;
  before: unknown;
  after: unknown;
  reason: string;
  created_at: string;
}
