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
  withdraw: RollingWindow & {
    confirm: "sms" | "password";
    /** ISO date: next Iranian working day. */
    expected_by: string;
    /** An open anti-fraud flag blocks withdrawals (§7.12); say so before the form. */
    blocked: boolean;
  };
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

// ---- Admin: anti-fraud review (CLAUDE.md §12.2, §13 Anti-fraud) ----

export type FraudRule =
  | "chip_dumping" | "multi_account" | "referral_farm" | "prediction_collusion" | "engine_assist"
  | "linked_transfer";
export type FraudFlagStatus = "open" | "dismissed" | "confirmed";

export interface FraudFlagUser {
  id: number;
  username: string | null;
  status: UserStatus;
}

export interface FraudFlag {
  id: number;
  rule: FraudRule;
  user: FraudFlagUser;
  /** The linked account, for pair rules. */
  other: FraudFlagUser | null;
  /** Opens the admin replay (§20.3). */
  match_id: string | null;
  evidence: Record<string, unknown>;
  status: FraudFlagStatus;
  created_at: string;
  decided_by: string | null;
  decision_reason: string | null;
  decided_at: string | null;
}

export interface FraudFlagFilter {
  status?: FraudFlagStatus;
  rule?: FraudRule;
  user_id?: number;
  cursor?: string;
}

/** dismiss: no fraud, held money is released; confirm: held pool stakes refunded, held commission cancelled. */
export interface FraudDecision {
  decision: "dismiss" | "confirm";
  reason: string;
  action?: "none" | "suspend" | "ban";
}

export interface AccountLinkGraph {
  nodes: { id: number; username: string | null }[];
  edges: { from: number; to: number; reason: "device" | "ip" | "referrer" | "referee" }[];
}

// ---- Admin: dashboard and reports (CLAUDE.md §13, §6.5) ----

export type Variant = "standard_cube" | "standard_nocube" | "traditional";

export interface DiceTestResult {
  period_start: string;
  period_end: string;
  dice: number;
  /** Faces 1..6. */
  counts: number[];
  chi_square: number;
  p_value: number;
  created_at: string;
}

export interface AdminDashboard {
  online_users: number;
  live_matches: number;
  today: { sales_rial: number; payments: number; topup_coins: number; rake_coins: number; signups: number };
  open_fraud_flags: number;
  pending_withdrawals: number;
  dice_test: DiceTestResult | null;
}

/** ISO dates (Tehran days), inclusive; the panel converts Jalali input. At most 366 days. */
export interface ReportRange {
  from?: string;
  to?: string;
}

export interface FinancialRow {
  day: string;
  sales_rial: number;
  payments: number;
  purchased_coins: number;
  topup_coins: number;
  rewards_coins: number;
  sinks_coins: number;
  rake_table: number;
  rake_prediction: number;
  rake_tournament: number;
  /** Transfer and withdrawal fees. */
  rake_fees: number;
  referral_paid: number;
  withdrawn_coins: number;
  adjustments_coins: number;
}

export interface FinancialReport {
  from: string;
  to: string;
  rows: FinancialRow[];
  totals: Omit<FinancialRow, "day">;
  by_package: { coins: number; payments: number; rial: number }[];
  balances: { users: number; escrow: number };
  reconciliation: { day: string; gateway: string; verified: number; verified_rial: number; problems: string[] }[];
}

export interface GameReport {
  from: string;
  to: string;
  rows: { day: string; matches: number; bot_matches: number }[];
  by_table: { variant: Variant; entry: number; bot: boolean; matches: number; aborted: number }[];
  human_matches: number;
  avg_duration_seconds: number | null;
  resign_rate_pct: number;
  timeout_forfeit_rate_pct: number;
  disconnect_rate_pct: number;
  disconnect_forfeit_rate_pct: number;
  end_reasons: Record<string, number>;
  queue_wait: { avg_seconds: number; samples: number };
  dice_tests: DiceTestResult[];
}

export interface UserReport {
  from: string;
  to: string;
  rows: { day: string; signups: number; dau: number; mau: number }[];
  signups: number;
  /** Null until day N of the period's signups has happened. */
  retention_pct: { d1: number | null; d7: number | null; d30: number | null };
  purchase_conversion_pct: number;
  paying_users: number;
  revenue_rial: number;
  arppu_rial: number;
}

export interface AdminMatchSearchRow {
  id: string;
  variant: Variant;
  length: number;
  entry: number;
  status: "active" | "finished" | "aborted" | "voided";
  players: { id: number | null; username: string | null }[];
  is_bot: boolean;
  bot_level: string | null;
  score: number[];
  winner_side: number | null;
  end_reason: string | null;
  tournament_id: number | null;
  started_at: string | null;
  ended_at: string | null;
}

/** §20.3: each move against the strong bot's choice (null where there was only one choice). */
export interface MatchAnalysis {
  match_id: string;
  moves: {
    game: number;
    seq: number;
    player: 0 | 1;
    dice: number[];
    played: number[][];
    choices: number;
    best: number[][] | null;
    agrees: boolean | null;
    ts: string;
  }[];
  summary: Record<"0" | "1", { moves: number; agree: number }>;
}

// ---- Admin: shop, content, predictions, access (CLAUDE.md §13) ----

/** Translatable admin content: both languages are required. */
export type Bilingual = Record<Lang, string>;

export interface AdminCoinPackage {
  id: number;
  coins: number;
  name_i18n: Bilingual;
  active: boolean;
  sort: number;
}

export interface AdminItem {
  id: number;
  kind: ItemKind;
  key: string;
  name_i18n: Bilingual;
  unlock: "free" | "level_locked" | "purchasable";
  price_coins: number;
  unlock_level: number;
  data: Record<string, unknown>;
  active: boolean;
  sort: number;
  is_default: boolean;
}

export interface AdminPhrase {
  id: number;
  key: string;
  text_i18n: Bilingual;
  active: boolean;
}

export interface Announcement {
  id: number;
  kind: "banner" | "announcement";
  title: Bilingual;
  body: Bilingual;
  /** An in-app path, or "". */
  link: string;
  published_at: string;
  ends_at: string | null;
}

export interface AdminAnnouncement {
  id: number;
  kind: "banner" | "announcement";
  title_i18n: Bilingual;
  body_i18n: Bilingual;
  link: string;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort: number;
}

export interface AdminTextOverride {
  id: number;
  /** A catalog key, e.g. "home.title". */
  key: string;
  text_i18n: Bilingual;
  updated_at: string;
}

/** GET content/texts: admin overrides applied over the bundled catalogs. */
export type TextOverrides = Record<Lang, Record<string, string>>;

export interface AdminPool {
  id: number;
  match_id: string;
  players: (string | null)[];
  status: "open" | "closed" | "held" | "settled" | "refunded";
  total_a: number;
  total_b: number;
  rake_pct: number;
  winner_side: number | null;
  hold_reason: string | null;
  opened_at: string;
  settled_at: string | null;
}

export interface AdminAccount {
  id: number;
  username: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

/** Shown once after creating an admin or resetting their credentials. */
export interface AdminCredentials {
  password: string;
  totp_secret: string;
  totp_uri: string;
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

/** One finished game of a match. */
export interface GameResultSummary {
  game_no: number;
  winner: number;
  kind: "single" | "gammon" | "backgammon";
  cube: number;
  points: number;
  reason: "bear_off" | "drop" | "resign";
  crawford: boolean;
}

/** GET me/matches rows and GET matches/{id} for a player of that match: what it meant for them. */
export interface MyMatchSummary extends MatchSummary {
  /** Null for unrated (bot, aborted) matches. */
  elo_delta: number | null;
  xp: number | null;
  /** Net coins (entry, payout, refund); null when there was no entry fee. */
  coins: number | null;
  games: GameResultSummary[];
}

export interface ActiveMatch {
  match_id: string | null;
  is_bot?: boolean;
  opponent?: string | null;
  score?: number[];
  /** Null when the live state is gone (the match is being closed). */
  your_turn?: boolean | null;
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
  /** Set when replay.retention_days removed the event log (players then get 410 REPLAY_PURGED). */
  purged_at: string | null;
  events: ReplayEvent[];
}

export interface Tier {
  id: number;
  entry: number;
  variants: string[];
  lengths: number[];
  waiting: number;
  /** Shown before joining (§7.3): winner receives `payout` of the `pot`. */
  rake_pct: number;
  pot: number;
  payout: number;
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
  scope: "all" | "weekly" | "monthly" | "predict";
  results: LeaderboardRow[];
  /**
   * The caller's place. On the predict board, `rank` and `value` are null until the player has
   * `needed` settled predictions (`count` so far).
   */
  me: { rank: number | null; value: number | null; count?: number; needed?: number } | null;
  /** weekly: Saturday to Saturday; monthly: the Jalali month; both in Tehran time. Null otherwise. */
  period: { start: string; end: string } | null;
}

// ---- Shop items and content (CLAUDE.md §10.2 Shop, Content, §11.2) ----

export type ItemKind = "board_theme" | "checker_theme" | "avatar" | "emoji_pack" | "phrase_pack";

export interface ShopItem {
  id: number;
  kind: ItemKind;
  key: string;
  name: Record<Lang, string>;
  unlock: "free" | "level_locked" | "purchasable";
  price: number;
  unlock_level: number | null;
  owned: boolean;
  locked: boolean;
  equipped: boolean;
  /** Themes: { asset }; packs: { keys }. */
  data: { asset?: string; keys?: string[] };
}

export interface PhraseText {
  key: string;
  text: Record<Lang, string>;
}

// ---- Referrals (CLAUDE.md §7.4) ----

export interface ReferralSummary {
  /** Stable invite code; survives username changes. */
  code: string;
  /** The signup link carrying the code (`/signup?ref=`). */
  link: string;
  /** Commissions held for anti-fraud review, not yet in `earned`. */
  held: number;
  referees: number;
  active_referees: number;
  earned: number;
  commissions: number;
  pct: number;
  base: "referee_entry" | "pot";
  duration_days: number;
}

export interface ReferralEarningRow {
  id: number;
  referee: string | null;
  amount: number;
  /** held: waiting for anti-fraud review; cancelled: review found fraud (§12.2 referral_farm). */
  status: "paid" | "held" | "cancelled";
  match_id: string;
  created_at: string;
}

// ---- Predictions (CLAUDE.md §7.5) ----

export interface OpenPool {
  match_id: string;
  players: [string | null, string | null];
  entry: number;
  total_a: number;
  total_b: number;
  open: boolean;
  max_stake_per_user: number;
  /** Why the caller may not predict here, or null. */
  /** review: the account is under anti-fraud review (§12.2 chip_dumping). */
  blocked: "player" | "linked" | "referral" | "review" | null;
}

export interface PredictionRow {
  id: number;
  match_id: string;
  side: 0 | 1;
  amount: number;
  payout: number | null;
  pool_status: "open" | "closed" | "held" | "settled" | "refunded";
  /** The side that won, once the match is over. */
  winner_side: 0 | 1 | null;
  /** Usernames of side 0 and side 1. */
  players: (string | null)[];
  created_at: string;
}

// ---- Tournaments (CLAUDE.md §7.6) ----

export interface TournamentInfo {
  id: number;
  name: Record<Lang, string>;
  variant: string;
  length: number;
  entry: number;
  capacity: number;
  entries: number;
  starts_at: string;
  status: "scheduled" | "running" | "finished" | "cancelled";
  round: number;
  rounds: number;
  prize_split: number[];
  /** Coins per place when full (it only starts full). */
  prizes: number[];
  joined: boolean;
  cancel_reason: string | null;
}

export interface AdminTournamentCreate {
  name: Bilingual;
  variant: Variant;
  length: number;
  entry: number;
  /** A power of two: single elimination. */
  capacity: number;
  starts_at: string;
  /** Percent per place; defaults to tournament.default_prize_split. */
  prize_split?: number[];
  prize_items?: (number | null)[];
}

export interface BracketSlotInfo {
  round: number;
  position: number;
  players: [string | null, string | null];
  winner: string | null;
  match_id: string | null;
  score: [number, number] | null;
  live: boolean;
}

/** GET config: public switches and prices, readable before sign-in. */
export interface PublicConfig {
  app_name: string;
  sms_enabled: boolean;
  payments_enabled: boolean;
  predictions_enabled: boolean;
  spectating_enabled: boolean;
  /** Spectators see the match this many seconds late (§20.4); show "Delayed by n s" when > 0. */
  spectator_delay_seconds: number;
  spectator_reactions_enabled: boolean;
  /** A player who hasn't joined a found match forfeits after this many seconds. */
  reconnect_grace_seconds: number;
  predict_min_count_for_board: number;
  coin_price_toman: number;
  /** Email, phone number, or URL for support (setting support.contact; defaults to support@ the domain). */
  support_contact: string;
  username_change: { cost: number; cooldown_days: number };
  allowed_lengths: number[];
  tiers: number[];
  /** §9: bot matches are free unless enabled; show the cost and pass `entry` to startBot. */
  bot_entry: { enabled: boolean; entry: number; prize: number };
}
