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

// WebSocket message payloads are generated from the backend's pydantic models (§10.3 contract).
export * from "./ws";

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
  /** Proven by an SMS code; false for signups while SMS is off (no signup bonus then). */
  phone_verified: boolean;
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

/** POST auth/otp. With SMS off (`sms.enabled` false) signup gets a token at once and skips the code step. */
export type OtpRequestResponse =
  | {
      sms: true;
      /** Seconds the code stays valid. */
      expires_in: number;
      /** Seconds before another code can be requested. */
      resend_after: number;
    }
  | { sms: false; verification_token: string };

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
  /** `confirm`: an SMS code, or the account password while SMS is off. */
  withdraw: RollingWindow & { confirm: "sms" | "password"; /** ISO date: next Iranian working day. */ expected_by: string };
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
  tx_id: string;
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
  created_at: string;
}

export interface BankInfo {
  code: string;
  name: Record<Lang, string>;
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
  phone_verified: boolean;
  created_at: string;
  balance: number;
}

export interface AdminLedgerRow {
  id: number;
  tx_id: string;
  type: LedgerType;
  amount: number;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}

export interface AdminMatchRow {
  id: string;
  opponent: string | null;
  variant: string;
  length: number;
  entry: number;
  status: string;
  won: boolean | null;
  /** This user's score first. */
  score: [number, number];
  end_reason: string | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUserRow {
  elo: number;
  level: number;
  xp: number;
  lang: Lang;
  referrer: string | null;
  wallet: WalletSummary;
  /** Newest 50; more through admin.userLedger. */
  ledger: AdminLedgerRow[];
  bank_account: { iban: string; bank_code: string; bank: Record<Lang, string> } | null;
  withdrawals: AdminWithdrawal[];
  sessions: { active: number; last_used_at: string | null };
  matches: AdminMatchRow[];
}

export interface AdminWithdrawal extends Withdrawal {
  /** Full Sheba for finance and superadmin (needed for the bank transfer); masked for support. */
  iban: string;
  payout_rial: number;
  user: { id: number; username: string | null; phone: string; status: UserStatus };
  decided_by: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
}

export interface AdminWithdrawalFilter {
  status?: WithdrawalStatus;
  user_id?: number;
  /** ISO dates, inclusive. */
  from?: string;
  to?: string;
  order?: "asc" | "desc";
  cursor?: string;
}

export interface AdminBalanceChange {
  balance_before: number;
  balance_after: number;
  created: boolean;
}

// ---- Shop: coin purchase (CLAUDE.md §7.7, §7.11) ----

export interface CoinPackageInfo {
  id: number;
  coins: number;
  price_toman: number;
  name: Record<Lang, string>;
}

export interface CoinPackages extends Paginated<CoinPackageInfo> {
  /** False until a payment provider is connected; coins are then topped up by support. */
  enabled: boolean;
  price_toman: number;
  custom_min_toman: number;
  custom_max_toman: number;
}

export type PaymentStatus = "pending" | "callback_received" | "verified" | "failed" | "expired";

export interface PaymentInfo {
  id: string;
  coins: number;
  amount_toman: number;
  status: PaymentStatus;
  reference: string | null;
  card_mask: string | null;
  failure: string | null;
  created_at: string;
  verified_at: string | null;
}

// ---- Matches (CLAUDE.md §10.2 Matches, §20) ----

export interface MatchPlayerSummary {
  username: string | null;
  avatar: string;
  elo: number;
  is_bot: boolean;
  bot_level: string | null;
}

export interface MatchSummary {
  id: string;
  variant: string;
  length: number;
  entry: number;
  status: "active" | "finished" | "aborted" | "voided";
  is_bot: boolean;
  players: MatchPlayerSummary[];
  you: number | null;
  winner: number | null;
  score: [number, number];
  end_reason: string | null;
  seed_commit: string;
  created_at: string;
  ended_at: string | null;
}

export interface ReplayEvent {
  seq: number;
  type: string;
  actor: "player_a" | "player_b" | "system";
  payload: Record<string, unknown>;
  server_ts: string;
}

export interface Replay extends MatchSummary {
  /** Published once the match is over (§6.3). */
  seed: string | null;
  events: ReplayEvent[];
}

export interface Tier {
  id: number;
  entry: number;
  variants: string[];
  lengths: number[];
  waiting: number;
}

export interface LiveMatchRow {
  match_id: string;
  variant: string;
  length: number;
  entry: number;
  tier_id: number;
  players: { username: string; avatar: string; elo: number; level: number }[];
  score: [number, number];
  game_no: number;
  spectators: number;
  pool: number;
  avg_elo: number;
  tournament_id: number | null;
}

export interface LeaderboardRow {
  rank: number;
  username: string | null;
  avatar: string;
  level: number;
  value: number;
}

export interface Leaderboard {
  scope: "all" | "weekly" | "monthly";
  results: LeaderboardRow[];
  me: { rank: number; value: number } | null;
}
