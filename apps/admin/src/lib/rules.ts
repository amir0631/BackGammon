// Client-side validation, consistency warnings, and impact notes for setting edits
// (docs/ux/screens/admin-settings.md, tables B and C). The server stays authoritative.
import type { AdminSetting } from "@bg/protocol";

export interface Message {
  key: string;
  params?: Record<string, string | number>;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function checkRule(key: string, value: unknown): string | null {
  switch (key) {
    case "game.allowed_lengths":
      return Array.isArray(value) && value.length > 0 && value.every((x) => x % 2 === 1) ? null : "oddLengths";
    case "table.tiers":
      return Array.isArray(value) && value.length > 0 && value.every((x, i) => i === 0 || x > value[i - 1])
        ? null
        : "ascendingUnique";
    case "tournament.default_prize_split": {
      if (!Array.isArray(value) || value.length === 0) return "sum100";
      // Compare in hundredths so 12.5 + 12.5 + 25 + 50 is exact.
      const total = value.reduce((a: number, b: number) => a + Math.round(b * 100), 0);
      return total === 10_000 ? null : "sum100";
    }
    case "game.traditional_points": {
      const v = value as Record<string, unknown> | null;
      const ok =
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).sort().join() === "backgammon,gammon,single" &&
        Object.values(v).every((x) => isInt(x) && x >= 1 && x <= 10);
      return ok ? null : "points";
    }
    case "sms.from_number":
      return typeof value === "string" && /^\+\d{6,18}$/.test(value) ? null : "e164";
    case "sms.pattern_otp":
    case "sms.pattern_withdrawal_paid":
      return typeof value === "string" && /^[A-Za-z0-9]{6,40}$/.test(value) ? null : "patternCode";
    default:
      return null;
  }
}

/** Hard errors that block "Review change". Mirrors settingsapp.registry.validate. */
export function validate(s: AdminSetting, value: unknown): Message | null {
  const typeOk = {
    int: isInt(value),
    bool: typeof value === "boolean",
    str: typeof value === "string",
    int_list: Array.isArray(value) && value.every(isInt),
    number_list: Array.isArray(value) && value.every((x) => typeof x === "number" && Number.isFinite(x)),
    json: typeof value === "object" && value !== null,
  }[s.kind];
  if (!typeOk) return { key: "admin.edit.error.type" };

  const items: number[] = s.kind === "int" ? [value as number] : Array.isArray(value) ? (value as number[]) : [];
  for (const item of items) {
    if (s.min !== null && item < s.min) return { key: "admin.edit.error.min", params: { min: s.min } };
    if (s.max !== null && item > s.max) return { key: "admin.edit.error.max", params: { max: s.max } };
  }
  if (s.choices && !s.choices.includes(value as string)) return { key: "admin.edit.error.choice" };
  const rule = checkRule(s.key, value);
  return rule ? { key: "admin.edit.error.check", params: { rule: `admin.edit.rule.${rule}` } } : null;
}

/** Maps the server's SETTING_INVALID details.reason to the same messages. */
export function serverError(s: AdminSetting, reason: unknown): Message {
  switch (reason) {
    case "min":
      return { key: "admin.edit.error.min", params: { min: s.min ?? 0 } };
    case "max":
      return { key: "admin.edit.error.max", params: { max: s.max ?? 0 } };
    case "choice":
      return { key: "admin.edit.error.choice" };
    case "check":
      return { key: "admin.edit.error.check", params: { rule: `admin.edit.rule.${checkRule(s.key, null) ?? "points"}` } };
    default:
      return { key: "admin.edit.error.type" };
  }
}

type Values = Map<string, AdminSetting>;

function current(all: Values, key: string, key2: string, candidate: unknown): unknown {
  return key === key2 ? candidate : all.get(key2)?.value;
}

/** Soft warnings shown in step 2 (table B, "soft"). Names are resolved by the caller. */
export function warnings(key: string, value: unknown, all: Values): Message[] {
  const v = (k: string) => current(all, key, k, value);
  const out: Message[] = [];
  const pair = (minKey: string, maxKey: string, strict: boolean) => {
    if (key !== minKey && key !== maxKey) return;
    const lo = v(minKey) as number;
    const hi = v(maxKey) as number;
    if (strict ? lo >= hi : lo > hi)
      out.push({ key: "admin.edit.warning.minAboveMax", params: { minKey, maxKey, min: lo, max: hi } });
  };
  pair("shop.custom_min_toman", "shop.custom_max_toman", true);
  pair("transfer.min_coins", "transfer.daily_max_coins", false);
  pair("withdraw.min_coins", "withdraw.daily_max_coins", false);
  pair("predict.max_stake_per_user", "predict.max_pool_total", false);

  if (["shop.custom_min_toman", "shop.custom_max_toman", "coin.price_toman"].includes(key)) {
    const price = v("coin.price_toman") as number;
    for (const k of ["shop.custom_min_toman", "shop.custom_max_toman"]) {
      const amount = v(k) as number;
      if (price > 0 && amount % price !== 0)
        out.push({ key: "admin.edit.warning.notMultiple", params: { nameKey: k, value: amount, price } });
    }
  }
  if (key === "predict.min_table_entry" || key === "table.tiers") {
    const min = v("predict.min_table_entry") as number;
    const tiers = (v("table.tiers") as number[]) ?? [];
    if (!tiers.some((tier) => tier >= min)) out.push({ key: "admin.edit.warning.noEligibleTier", params: { min } });
  }
  if (key === "game.traditional_points") {
    const p = value as Record<string, number>;
    if ((p.gammon ?? 0) < (p.single ?? 0) || (p.backgammon ?? 0) < (p.gammon ?? 0))
      out.push({ key: "admin.edit.warning.pointsOrder" });
  }
  return out;
}

export interface Impact {
  notes: Message[];
  /** i18n key of the acknowledgment checkbox, when one is required. */
  ack: string | null;
}

const MONEY_KEYS = ["table.rake_pct", "predict.rake_pct", "tournament.rake_pct", "referral.pct", "transfer.fee_pct", "withdraw.fee_pct"];

/** Impact notes and acknowledgment (table C). SMS pattern acks are added by the dialog after a status lookup. */
export function impact(key: string, before: unknown, after: unknown, all: Values): Impact {
  const notes: Message[] = [];
  let ack: string | null = null;

  if (MONEY_KEYS.includes(key)) {
    notes.push({ key: "admin.impact.money" });
    if (key === "table.rake_pct") {
      const entry = 100;
      const pot = entry * 2;
      const payout = (pct: number) => pot - Math.floor((pot * pct) / 100);
      notes.push({
        key: "admin.impact.rakeExample",
        params: { entry, before: payout(before as number), after: payout(after as number) },
      });
    }
  }
  if (key === "coin.price_toman") {
    notes.push({ key: "admin.impact.coinPrice" });
    notes.push({
      key: "admin.impact.coinPriceExample",
      params: { before: (before as number) * 100, after: (after as number) * 100 },
    });
    ack = "admin.impact.coinPriceAck";
  }
  if (key === "bonus.signup_coins") notes.push({ key: "admin.impact.signupBonus" });
  if (key.startsWith("transfer.") || key.startsWith("withdraw.")) notes.push({ key: "admin.impact.rolling" });
  if (key.startsWith("game.") || key.startsWith("matchmaking.")) notes.push({ key: "admin.impact.gameTimers" });
  if (key === "table.tiers") notes.push({ key: "admin.impact.tiers" });
  if (key === "predict.enabled" && after === false) notes.push({ key: "admin.impact.predictOff" });
  if (key === "replay.retention_days" && (after as number) > 0 && (before === 0 || (after as number) < (before as number))) {
    notes.push({ key: "admin.impact.retention", params: { days: after as number } });
    ack = "admin.impact.retentionAck";
  }
  if (key === "sms.from_number") notes.push({ key: "admin.impact.fromNumber" });
  if (key.startsWith("otp.") || key.startsWith("auth.")) notes.push({ key: "admin.impact.security" });
  if (key === "admin.topup_max_amount" && after === 0) {
    notes.push({ key: "admin.impact.topupNoCap" });
    ack = "admin.impact.topupNoCapAck";
  }
  void all;
  return { notes, ack };
}

export const GROUP_ORDER = [
  "game",
  "table",
  "referral",
  "predict",
  "tournament",
  "bonus",
  "coin",
  "shop",
  "transfer",
  "withdraw",
  "xp",
  "elo",
  "matchmaking",
  "username",
  "bot",
  "live",
  "replay",
  "admin",
  "sms",
  "otp",
  "auth",
];

/** Groups in the fixed order; unknown prefixes go last, never dropped. */
export function groupSettings(rows: AdminSetting[]): [string, AdminSetting[]][] {
  const groups = new Map<string, AdminSetting[]>();
  for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  const known = GROUP_ORDER.filter((g) => groups.has(g));
  const unknown = [...groups.keys()].filter((g) => !GROUP_ORDER.includes(g)).sort();
  return [...known, ...unknown].map((g) => [g, groups.get(g) ?? []]);
}
