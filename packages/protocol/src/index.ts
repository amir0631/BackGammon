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
  environment: "development" | "staging" | "production";
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
  /** Last audited change, if any. */
  updated_at: string | null;
  updated_by: string | null;
}

export interface SmsStatus {
  provider: string;
  configured: boolean;
  credit_rial: number | null;
  gift_rial: number | null;
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

// ---- Wallet (CLAUDE.md §7.9–§7.13, §10.2 Wallet) ----

export interface RollingWindow {
  daily_max: number;
  used_24h: number;
  remaining: number;
  /** When more of the rolling-24h allowance frees up; null when nothing is used. */
  next_available_at: string | null;
  min: number;
  fee_pct: number;
}

export interface WalletSummary {
  balance: number;
  /** Coins in pending withdrawals (already out of `balance`). */
  locked: number;
  /** Signup-bonus coins that can be neither withdrawn nor transferred until the first top-up. */
  bonus_locked: number;
  withdrawable: number;
  transferable: number;
  transfer: RollingWindow;
  withdraw: RollingWindow;
  coin_price_toman: number;
}

export type LedgerType =
  | "purchase" | "match_entry" | "match_payout" | "match_refund" | "rake" | "referral_commission"
  | "prediction_stake" | "prediction_payout" | "prediction_refund" | "tournament_entry" | "tournament_prize"
  | "tournament_refund" | "signup_bonus" | "level_reward" | "achievement_reward" | "shop_purchase"
  | "username_change" | "admin_adjustment" | "admin_topup" | "withdrawal_hold" | "withdrawal_payout"
  | "withdrawal_refund" | "transfer";

export interface LedgerRow {
  id: number;
  type: LedgerType;
  /** Signed coins for this user. */
  amount: number;
  created_at: string;
  /** Username of the other party of a transfer; never a phone number. */
  counterparty: string | null;
  ref_type: string | null;
  ref_id: string | null;
}

export interface TransferResult {
  tx_id: string;
  balance: number;
  fee: number;
  received: number;
}

export interface BankAccountInfo {
  id: number | null;
  /** Masked, e.g. IR82******************9002. */
  iban: string;
  bank_code: string;
  bank: Record<Lang, string>;
}

export type WithdrawalStatus = "pending" | "paid" | "rejected" | "cancelled";

export interface Withdrawal {
  id: number;
  amount: number;
  fee: number;
  payout_toman: number;
  status: WithdrawalStatus;
  /** Next Iranian working day after the request (YYYY-MM-DD). */
  expected_by: string;
  bank: BankAccountInfo;
  bank_reference: string | null;
  reject_reason: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface AdminUserRow {
  id: number;
  username: string | null;
  phone: string;
  status: UserStatus;
  created_at: string;
  balance: number;
}

export interface AdminUserDetail extends AdminUserRow {
  elo: number;
  level: number;
  lang: Lang;
  wallet: WalletSummary;
  ledger: { id: number; type: LedgerType; amount: number; created_at: string }[];
}

export interface AdminWithdrawal extends Withdrawal {
  /** Full Sheba, needed to make the bank transfer. */
  iban: string;
  user: { id: number; username: string | null; phone: string };
}
