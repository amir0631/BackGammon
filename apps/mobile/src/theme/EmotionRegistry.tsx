"use client";

import createCache, { type EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { useServerInsertedHTML } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { prefixer } from "stylis";

// Emotion caches for the App Router, one per direction (docs/ui/design-system.md §8).
//
// MUI's AppRouterCacheProvider creates its cache once per mount, so switching the language at
// runtime (router.refresh(), which keeps client state) would keep the old direction's stylis
// plugins: LTR pages would render with RTL-flipped styles. Here both caches live for the whole
// session and the provider swaps between them, so the React tree (and form entries) survive a
// language switch (auth.md AU-10, profile.md §3.3).

interface Registry {
  cache: EmotionCache;
  flush: () => { name: string; isGlobal: boolean }[];
}

function createRegistry(direction: "rtl" | "ltr"): Registry {
  const cache =
    direction === "rtl"
      ? createCache({ key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] })
      : createCache({ key: "mui" });
  cache.compat = true;
  const insert = cache.insert;
  let inserted: { name: string; isGlobal: boolean }[] = [];
  cache.insert = (...args) => {
    const [selector, serialized] = args;
    if (cache.inserted[serialized.name] === undefined) inserted.push({ name: serialized.name, isGlobal: !selector });
    return insert(...args);
  };
  return {
    cache,
    flush: () => {
      const out = inserted;
      inserted = [];
      return out;
    },
  };
}

function ServerStyles({ registry }: { registry: Registry }) {
  const inserted = registry.flush();
  if (inserted.length === 0) return null;
  let styles = "";
  let names = registry.cache.key;
  const globals: { name: string; style: string }[] = [];
  for (const { name, isGlobal } of inserted) {
    const style = registry.cache.inserted[name];
    if (typeof style !== "string") continue;
    if (isGlobal) globals.push({ name, style });
    else {
      styles += style;
      names += ` ${name}`;
    }
  }
  return (
    <Fragment>
      {globals.map(({ name, style }) => (
        <style key={name} data-emotion={`${registry.cache.key}-global ${name}`} dangerouslySetInnerHTML={{ __html: style }} />
      ))}
      {styles && <style data-emotion={names} dangerouslySetInnerHTML={{ __html: styles }} />}
    </Fragment>
  );
}

export function EmotionRegistry({ direction, children }: { direction: "rtl" | "ltr"; children: ReactNode }) {
  const [registries] = useState(() => ({ rtl: createRegistry("rtl"), ltr: createRegistry("ltr") }));

  useServerInsertedHTML(() => (
    <>
      <ServerStyles registry={registries.rtl} />
      <ServerStyles registry={registries.ltr} />
    </>
  ));

  return <CacheProvider value={registries[direction].cache}>{children}</CacheProvider>;
}
