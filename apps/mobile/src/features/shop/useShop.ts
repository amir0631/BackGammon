"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@bg/api-client";
import type { ApiError, ItemKind, ShopItem } from "@bg/protocol";
import { toApiError } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { useFormat } from "@/lib/useFormat";

// Shop catalog reads (shop.md §3.1): one cached list per kind for the page's lifetime, so segment
// switches and "Back" from an item keep the list without a spinner; each visit refreshes it.

const cache = new Map<ItemKind, { items: ShopItem[]; at: number }>();
let equippedCache: { board_theme: string; checker_theme: string } | null = null;

export function cachedItem(id: number): ShopItem | null {
  for (const { items } of cache.values()) {
    const hit = items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}

/** Replace one item in the cache after a buy or equip (equip also clears the previous one of its kind). */
export function updateCachedItem(next: ShopItem): void {
  const entry = cache.get(next.kind);
  if (!entry) return;
  entry.items = entry.items.map((i) => (i.id === next.id ? next : next.equipped && i.equipped ? { ...i, equipped: false } : i));
  if (next.equipped && (next.kind === "board_theme" || next.kind === "checker_theme") && equippedCache) {
    equippedCache = { ...equippedCache, [next.kind]: next.key };
  }
}

export interface ShopData {
  items: Partial<Record<ItemKind, ShopItem[]>>;
  equipped: { board_theme: string; checker_theme: string } | null;
  loading: boolean;
  error: ApiError | null;
  at: number | null;
  reload: () => Promise<void>;
  /** Apply a changed item locally (buy, equip). */
  replace: (item: ShopItem) => void;
}

export function useShopItems(kinds: readonly ItemKind[]): ShopData {
  const { handleAuthError } = useSession();
  const key = kinds.join(",");
  const initial = () => Object.fromEntries(kinds.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)!.items])) as Partial<Record<ItemKind, ShopItem[]>>;
  const [items, setItems] = useState<Partial<Record<ItemKind, ShopItem[]>>>(initial);
  const [equipped, setEquipped] = useState(equippedCache);
  const [loading, setLoading] = useState(() => !kinds.every((k) => cache.has(k)));
  const [error, setError] = useState<ApiError | null>(null);
  const [at, setAt] = useState<number | null>(() => (kinds.every((k) => cache.has(k)) ? Math.min(...kinds.map((k) => cache.get(k)!.at)) : null));

  const reload = useCallback(async () => {
    try {
      const themes = kinds.includes("board_theme") || kinds.includes("checker_theme");
      const [themeList, ...rest] = await Promise.all([
        themes ? api.shop.themes() : Promise.resolve(null),
        ...kinds.filter((k) => !themes || (k !== "board_theme" && k !== "checker_theme")).map((k) => api.shop.items(k).then((p) => [k, p.results] as const)),
      ]);
      const now = Date.now();
      const next: Partial<Record<ItemKind, ShopItem[]>> = {};
      if (themeList) {
        for (const kind of ["board_theme", "checker_theme"] as const) {
          next[kind] = themeList.results.filter((i) => i.kind === kind);
          cache.set(kind, { items: next[kind]!, at: now });
        }
        equippedCache = themeList.equipped;
        setEquipped(themeList.equipped);
      }
      for (const entry of rest) {
        const [kind, list] = entry as readonly [ItemKind, ShopItem[]];
        next[kind] = list;
        cache.set(kind, { items: list, at: now });
      }
      setItems(next);
      setAt(now);
      setError(null);
    } catch (e) {
      if (!handleAuthError(e)) setError(toApiError(e));
    } finally {
      setLoading(false);
    }
    // `kinds` is keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handleAuthError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = useCallback((item: ShopItem) => {
    updateCachedItem(item);
    setItems((prev) => {
      const list = prev[item.kind];
      if (!list) return prev;
      return { ...prev, [item.kind]: list.map((i) => (i.id === item.id ? item : item.equipped && i.equipped ? { ...i, equipped: false } : i)) };
    });
    if (item.equipped && (item.kind === "board_theme" || item.kind === "checker_theme")) {
      setEquipped((e) => (e ? { ...e, [item.kind]: item.key } : e));
    }
  }, []);

  return { items, equipped, loading, error, at, reload, replace };
}

/** Item names (tournaments.md §7 fallback): the current locale, else the other one; avatar keys use the preset names. */
export function useItemName() {
  const f = useFormat();
  const t = useTranslations();
  return useCallback(
    (item: Pick<ShopItem, "name" | "key" | "kind">): string => {
      const own = item.name[f.locale]?.trim();
      const other = item.name[f.locale === "fa" ? "en" : "fa"]?.trim();
      const text = own || other || item.key;
      if (item.kind === "avatar" && (text === item.key || !own) && t.has(`avatars.${item.key}`)) return t(`avatars.${item.key}`);
      return text;
    },
    [f, t],
  );
}
