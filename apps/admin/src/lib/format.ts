// Display formatting for admin settings (docs/ux/screens/admin-settings.md, table A).
import type { AdminSetting } from "@bg/protocol";
import { formatDate, formatNumber, type Locale } from "@bg/i18n";

export type T = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

const DIGIT_MAP: Record<string, string> = Object.fromEntries(
  [..."۰۱۲۳۴۵۶۷۸۹"].map((d, i) => [d, String(i)]).concat([..."٠١٢٣٤٥٦٧٨٩"].map((d, i) => [d, String(i)])),
);

/** Persian and Arabic-Indic digits → Latin, for inputs and search. */
export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

export function num(locale: Locale, value: number): string {
  return formatNumber(locale, value);
}

export function percent(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 2,
    numberingSystem: locale === "fa" ? "arabext" : "latn",
  }).format(value / 100);
}

/** m:ss countdown in locale digits. */
export function clock(locale: Locale, seconds: number): string {
  const f = (n: number, digits: number) =>
    new Intl.NumberFormat(locale, {
      minimumIntegerDigits: digits,
      useGrouping: false,
      numberingSystem: locale === "fa" ? "arabext" : "latn",
    }).format(n);
  return `${f(Math.floor(seconds / 60), 1)}:${f(seconds % 60, 2)}`;
}

export function dateTime(locale: Locale, iso: string): string {
  return formatDate(locale, new Date(iso), { dateStyle: "medium", timeStyle: "short" });
}

function humanDuration(locale: Locale, seconds: number): string {
  const unit = (n: number, u: "hour" | "minute" | "day") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: u,
      unitDisplay: "long",
      maximumFractionDigits: 1,
      numberingSystem: locale === "fa" ? "arabext" : "latn",
    }).format(n);
  if (seconds >= 86_400) return unit(seconds / 86_400, "day");
  if (seconds >= 3600) return unit(seconds / 3600, "hour");
  return unit(seconds / 60, "minute");
}

/** What 0 means for keys where it is a special value (table A, "Zero means"). */
const ZERO_LABEL: Record<string, string> = {
  "live.spectator_delay_seconds": "noDelay",
  "live.max_spectators_per_match": "disabled",
  "referral.duration_days": "unlimited",
  "replay.retention_days": "forever",
  "admin.topup_max_amount": "noCap",
  "transfer.fee_pct": "noFee",
  "withdraw.fee_pct": "noFee",
  "username.change_cost": "free",
  "username.change_cooldown_days": "noCooldown",
  "bonus.signup_coins": "noBonus",
  "sms.low_credit_alert_rial": "noAlert",
};

export interface Formatted {
  text: string;
  /** Secondary line, e.g. the toman equivalent of a coin amount. */
  secondary?: string;
  /** List items to show as chips. */
  chips?: string[];
  /** Keys, codes, phone numbers: always LTR with Latin digits. */
  ltr?: boolean;
}

export function formatValue(t: T, locale: Locale, s: AdminSetting, value: unknown, coinPrice: number): Formatted {
  if (s.kind === "bool") return { text: t(value ? "admin.settings.value.on" : "admin.settings.value.off") };

  if (s.kind === "str") {
    const choiceKey = `admin.settings.choice.${s.key}.${String(value)}`;
    if (s.choices && t.has(choiceKey)) return { text: t(choiceKey) };
    return { text: String(value), ltr: true };
  }

  if (s.kind === "int" && typeof value === "number") {
    if (value === 0 && ZERO_LABEL[s.key]) return { text: t(`admin.settings.zero.${ZERO_LABEL[s.key]}`) };
    return formatScalar(t, locale, s, value, coinPrice);
  }

  if (s.kind === "int_list" && Array.isArray(value)) {
    const chips = value.map((v: number) =>
      s.unit === "points"
        ? t("admin.settings.value.points", { n: num(locale, v) })
        : formatScalar(t, locale, s, v, coinPrice).text,
    );
    return { text: chips.join("، "), chips };
  }

  if (s.kind === "number_list" && Array.isArray(value)) {
    const chips = value.map(
      (v: number, i: number) => `${t("admin.settings.value.place", { n: num(locale, i + 1) })} ${percent(locale, v)}`,
    );
    const total = value.reduce((a: number, b: number) => a + b, 0);
    return { text: chips.join("، "), chips, secondary: t("admin.settings.value.total", { total: percent(locale, total) }) };
  }

  if (s.key === "game.traditional_points" && value && typeof value === "object") {
    const v = value as Record<string, number>;
    const parts = (["single", "gammon", "backgammon"] as const).map(
      (k) => `${t(`admin.settings.traditional.${k}`)} ${num(locale, v[k] ?? 0)}`,
    );
    return { text: parts.join(" · ") };
  }

  return { text: JSON.stringify(value), ltr: true };
}

function formatScalar(t: T, locale: Locale, s: AdminSetting, value: number, coinPrice: number): Formatted {
  const n = num(locale, value);
  switch (s.unit) {
    case "seconds":
      return {
        text:
          t("admin.settings.value.seconds", { n }) +
          (value >= 60 ? ` ${t("admin.settings.value.humanized", { duration: humanDuration(locale, value) })}` : ""),
      };
    case "percent":
      return { text: percent(locale, value) };
    case "coins":
      return {
        text: t("admin.settings.value.coins", { n }),
        secondary: t("admin.settings.value.toman", { n: num(locale, value * coinPrice) }),
      };
    case "toman":
      return { text: t("admin.settings.value.toman", { n }) };
    case "rial":
      // Toman is the primary unit everywhere in the UI (CLAUDE.md §11.3); rial as stored.
      return {
        text: t("admin.settings.value.toman", { n: num(locale, Math.floor(value / 10)) }),
        secondary: t("admin.sms.creditRial", { rial: n }),
      };
    case "days":
      return { text: t("admin.settings.value.days", { n }) };
    case "xp":
      return { text: t("admin.settings.value.xp", { n }) };
    default:
      return { text: n };
  }
}

/** Rule text for keys whose server check goes beyond min/max (table B). */
export const RULE_KEY: Record<string, string> = {
  "game.allowed_lengths": "oddLengths",
  "table.tiers": "ascendingUnique",
  "tournament.default_prize_split": "sum100",
  "game.traditional_points": "points",
  "sms.from_number": "e164",
  "sms.pattern_otp": "patternCode",
  "sms.pattern_withdrawal_paid": "patternCode",
};

export function rangeText(t: T, locale: Locale, s: AdminSetting): string {
  if (RULE_KEY[s.key]) return t(`admin.edit.rule.${RULE_KEY[s.key]}`);
  if (s.choices) {
    return s.choices
      .map((c) => {
        const k = `admin.settings.choice.${s.key}.${c}`;
        return t.has(k) ? t(k) : c;
      })
      .join(" / ");
  }
  if (s.kind === "bool") return `${t("admin.settings.value.on")} / ${t("admin.settings.value.off")}`;
  const min = s.min === null ? null : num(locale, s.min);
  const max = s.max === null ? null : num(locale, s.max);
  if (min !== null && max !== null) return t("admin.settings.range.between", { min, max });
  if (min !== null) return t("admin.settings.range.atLeast", { min });
  if (max !== null) return t("admin.settings.range.atMost", { max });
  return t("admin.settings.range.any");
}

/** Case- and digit-insensitive haystack for search (spec §3.2). */
export function searchHaystack(s: AdminSetting): string {
  return normalizeDigits(`${s.key} ${s.description.fa} ${s.description.en}`).toLowerCase();
}

export function matchesSearch(s: AdminSetting, query: string): boolean {
  const q = normalizeDigits(query.trim()).toLowerCase();
  if (!q) return true;
  if (searchHaystack(s).includes(q)) return true;
  // Values too, so "10" finds every setting currently set to 10.
  return normalizeDigits(JSON.stringify(s.value)).includes(q);
}
