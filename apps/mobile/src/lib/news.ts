"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, pruneIds } from "@bg/api-client";
import type { Announcement } from "@bg/protocol";
import { useSession } from "./session";
import { readJson, writeJson } from "./storage";

// Announcements (news.md §3.1): read after the shell renders, again when the app returns after
// 10 minutes, and when /news opens; no polling. The last response is cached for offline reading.
// Dismissed banners and seen items live on this device per account (`guest` without one); ids the
// API no longer returns are pruned.

const CACHE_KEY = "bg.news.cache";
const REFRESH_AFTER_MS = 10 * 60_000;
const dismissedKey = (owner: string) => `bg.news.dismissed.${owner}`;
const seenKey = (owner: string) => `bg.news.seen.${owner}`;

interface State {
  items: Announcement[] | null;
  /** Epoch ms of the data shown (from the server or the cache). */
  at: number | null;
  fromCache: boolean;
  error: boolean;
  loading: boolean;
}

let state: State = { items: null, at: null, fromCache: false, error: false, loading: false };
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function fromCache() {
  if (state.items !== null) return;
  const cache = readJson<{ items: Announcement[]; at: number }>("local", CACHE_KEY);
  if (cache) set({ items: cache.items, at: cache.at, fromCache: true });
}

export function fetchNews(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastFetch < REFRESH_AFTER_MS && state.items !== null && !state.fromCache) return Promise.resolve();
  set({ loading: true });
  inflight = api.content
    .announcements()
    .then((page) => {
      lastFetch = Date.now();
      writeJson("local", CACHE_KEY, { items: page.results, at: lastFetch });
      set({ items: page.results, at: lastFetch, fromCache: false, error: false });
    })
    .catch(() => {
      fromCache();
      set({ error: true });
    })
    .finally(() => {
      inflight = null;
      set({ loading: false });
    });
  return inflight;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const serverState: State = { items: null, at: null, fromCache: false, error: false, loading: false };

export interface NewsValue extends State {
  dismissed: Set<number>;
  seen: Set<number>;
  unseen: number;
  reload: () => Promise<void>;
  dismiss: (id: number) => void;
  markSeen: (ids: number[]) => void;
}

export function useNews(): NewsValue {
  const snap = useSyncExternalStore(subscribe, () => state, () => serverState);
  const { me } = useSession();
  const owner = me ? String(me.id) : "guest";

  useEffect(() => {
    fromCache();
    void fetchNews();
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchNews();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const read = (key: string) => new Set(readJson<number[]>("local", key) ?? []);
  const dismissed = read(dismissedKey(owner));
  const seen = read(seenKey(owner));

  // Prune ids the API no longer returns (fresh data only).
  useEffect(() => {
    if (!snap.items || snap.fromCache) return;
    for (const key of [dismissedKey(owner), seenKey(owner)]) {
      const ids = readJson<number[]>("local", key);
      if (ids) writeJson("local", key, pruneIds(ids, snap.items));
    }
  }, [snap.items, snap.fromCache, owner]);

  const dismiss = useCallback(
    (id: number) => {
      const ids = new Set(readJson<number[]>("local", dismissedKey(owner)) ?? []);
      ids.add(id);
      writeJson("local", dismissedKey(owner), [...ids]);
      set({});
    },
    [owner],
  );
  const markSeen = useCallback(
    (ids: number[]) => {
      const current = new Set(readJson<number[]>("local", seenKey(owner)) ?? []);
      if (ids.every((id) => current.has(id))) return;
      for (const id of ids) current.add(id);
      writeJson("local", seenKey(owner), [...current]);
      set({});
    },
    [owner],
  );

  const unseen = (snap.items ?? []).filter((a) => !seen.has(a.id)).length;
  return { ...snap, dismissed, seen, unseen, reload: () => fetchNews(true), dismiss, markSeen };
}
