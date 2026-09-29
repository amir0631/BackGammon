import type { ReferralEarningRow, ReferralSummary } from "@bg/protocol";

// Referral display rules shared by both apps (CLAUDE.md §2 rule 14, §7.4; referral.md §3.3, §3.5).
// Built from the server's `pct`, `base`, and `duration_days`, never hardcoded values.

export type ReferralRule =
  | { key: "entry" | "pot"; pct: number }
  | { key: "activation" }
  | { key: "noLimit" }
  | { key: "days"; days: number }
  | { key: "rounding" }
  | { key: "review" };

/** The rules block, in spec order (referral.md §3.3 items 1–5). */
export function referralRules(s: Pick<ReferralSummary, "pct" | "base" | "duration_days">): ReferralRule[] {
  return [
    { key: s.base === "pot" ? "pot" : "entry", pct: s.pct },
    { key: "activation" },
    s.duration_days > 0 ? { key: "days", days: s.duration_days } : { key: "noLimit" },
    { key: "rounding" },
    { key: "review" },
  ];
}

export interface EarningDisplay {
  status: ReferralEarningRow["status"] | null;
  /** «+» only for paid rows; held and cancelled never show a sign (referral.md AC 5). */
  signed: boolean;
  struck: boolean;
  note: "heldNote" | "cancelledNote" | null;
}

export function earningDisplay(row: Pick<ReferralEarningRow, "status">): EarningDisplay {
  switch (row.status) {
    case "paid":
      return { status: "paid", signed: true, struck: false, note: null };
    case "held":
      return { status: "held", signed: false, struck: false, note: "heldNote" };
    case "cancelled":
      return { status: "cancelled", signed: false, struck: true, note: "cancelledNote" };
    default:
      // Older payloads without a status: no chip, no sign (referral.md §3.5 step 2).
      return { status: null, signed: false, struck: false, note: null };
  }
}

/** Groups rows by local calendar day, newest first, keeping server order inside a day. */
export function groupByDay<T extends { created_at: string }>(rows: readonly T[], dayOf: (iso: string) => string = localDay): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const r of rows) {
    const day = dayOf(r.created_at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else out.push({ day, rows: [r] });
  }
  return out;
}

export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
