import type { ItemKind, ShopItem } from "@bg/protocol";
import { toLatinDigits } from "@bg/i18n";

// Shop item states and the custom coin amount rule, shared by both apps (CLAUDE.md §2 rule 14;
// shop.md §3.1–§3.5, §4 item card). They mirror backend/shop/services.py and
// backend/payments/services.py; the server re-checks every buy, equip, and checkout.

export type ItemState = "inUse" | "owned" | "freeOwned" | "levelLocked" | "price";

/** Exactly one state line per card (shop.md §4 item card, acceptance 2). */
export function itemState(item: ShopItem): ItemState {
  if (item.equipped) return "inUse";
  if (item.owned) return item.unlock === "free" ? "freeOwned" : "owned";
  if (item.unlock === "level_locked") return "levelLocked";
  return "price";
}

/** Themes and avatars are equipped; packs are usable as soon as they are owned. */
export function isEquippable(kind: ItemKind): boolean {
  return kind === "board_theme" || kind === "checker_theme" || kind === "avatar";
}

export type ItemAction = "use" | "inUse" | "buy" | "ownedPack" | "locked";

/** The SH-03 primary for an item (shop.md §3.2 step 5). Suspension only disables "buy". */
export function itemAction(item: ShopItem): ItemAction {
  if (item.owned || item.equipped) {
    if (!isEquippable(item.kind)) return "ownedPack";
    return item.equipped ? "inUse" : "use";
  }
  if (item.unlock === "purchasable") return "buy";
  return "locked";
}

/** The one quick action a card may carry (shop.md §3.1 step 5): "Use" or the price (opens SH-03). */
export function cardQuickAction(item: ShopItem): "use" | "price" | null {
  const action = itemAction(item);
  if (action === "use") return "use";
  if (action === "buy") return "price";
  return null;
}

export type CustomAmountProblem =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "range"; min: number; max: number }
  | { kind: "multiple"; price: number; lower: number | null; higher: number | null };

export interface CustomAmountRules {
  min: number;
  max: number;
  /** `price_toman` of one coin. */
  price: number;
}

/** A typed toman amount → a positive safe integer, or null. Persian and Latin digits, any grouping. */
export function parseToman(raw: string): number | null {
  const value = toLatinDigits(raw).replace(/[\s,٬،']/g, "");
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The custom amount rule (CLAUDE.md §7.11, shop.md §3.5 step 2): within [min, max] and a whole
 * multiple of the coin price. For a non-multiple, the nearest valid amounts below and above (within
 * the range) are offered as user-initiated choices.
 */
export function customAmountProblem(raw: string, rules: CustomAmountRules): CustomAmountProblem | null {
  if (!raw.trim()) return { kind: "empty" };
  const amount = parseToman(raw);
  if (amount === null) return { kind: "invalid" };
  if (amount < rules.min || amount > rules.max) return { kind: "range", min: rules.min, max: rules.max };
  if (rules.price > 0 && amount % rules.price !== 0) {
    const lower = Math.floor(amount / rules.price) * rules.price;
    const higher = lower + rules.price;
    return {
      kind: "multiple",
      price: rules.price,
      lower: lower >= rules.min ? lower : null,
      higher: higher <= rules.max ? higher : null,
    };
  }
  return null;
}

/** Coins for a toman amount (integer division; only called for valid multiples). */
export function coinsForToman(toman: number, price: number): number {
  return price > 0 ? Math.floor(toman / price) : 0;
}

/** Payment polling on the result page (shop.md §3.5 step 4): every 3 s for up to 60 s while unsettled. */
export const PAYMENT_POLL = { everyMs: 3000, forMs: 60_000 } as const;

export function paymentSettled(status: string): boolean {
  return status === "verified" || status === "failed" || status === "expired";
}
