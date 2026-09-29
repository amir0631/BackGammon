"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { api } from "@bg/api-client";
import type { ItemKind, ShopItem } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { useRequireUser } from "@/lib/session";
import { readJson, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { ItemCard, ItemCardSkeleton, ItemThumb } from "./ItemCard";
import { ShopFrame, type ShopSegment } from "./ShopFrame";
import { useEquip } from "./shopActions";
import { useItemName, useShopItems } from "./useShop";

// SH-01 Themes `/shop`, SH-05 Avatars `/shop/avatars`, SH-02 Packs `/shop/packs` (shop.md §3.1,
// §4). Server order within each group; equipped and owned items are not moved. Filter "All" /
// "Owned" in the URL (`?filter=owned`). Preset avatars (AC-02) are chosen in Edit profile, not here.

const GROUPS: Record<Exclude<ShopSegment, "coins">, { kind: ItemKind; title: string; anchor: string }[]> = {
  themes: [
    { kind: "board_theme", title: "group.boards", anchor: "boards" },
    { kind: "checker_theme", title: "group.checkers", anchor: "checkers" },
  ],
  avatars: [{ kind: "avatar", title: "group.avatars", anchor: "avatars" }],
  packs: [
    { kind: "emoji_pack", title: "group.emoji", anchor: "emoji" },
    { kind: "phrase_pack", title: "group.phrase", anchor: "phrases" },
  ],
};

const Grid = styled("ul")(({ theme }) => ({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: theme.spacing(1.5),
  // 2 columns on phones (avatars 3), 3 at md, 4 in the lg shell; one column at 200% text.
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr))",
  "&[data-kind='avatar']": { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 6.5rem), 1fr))" },
}));

const hintKey = (userId: number) => `bg.shop.hintSeen.${userId}`;

export function ShopListScreen({ segment }: { segment: Exclude<ShopSegment, "coins"> }) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnline();
  const { me } = useRequireUser();
  const nameOf = useItemName();
  const groups = GROUPS[segment];
  const kinds = useMemo(() => groups.map((g) => g.kind), [groups]);
  const data = useShopItems(kinds);
  const { equip, busy } = useEquip(data.replace);
  const ownedOnly = params.get("filter") === "owned";
  const [presets, setPresets] = useState<Set<string> | null>(segment === "avatars" ? null : new Set());
  const [hintSeen, setHintSeen] = useState(true);

  useEffect(() => {
    if (segment !== "avatars") return;
    api.content
      .avatars()
      .then((p) => setPresets(new Set(p.results.map((a) => a.key))))
      .catch(() => setPresets(new Set()));
  }, [segment]);

  useEffect(() => {
    if (me) setHintSeen(Boolean(readJson<boolean>("local", hintKey(me.id))));
  }, [me]);

  const setFilter = (owned: boolean) => router.replace(owned ? `${pathname}?filter=owned` : pathname, { scroll: false });

  const visible = (kind: ItemKind): ShopItem[] | undefined => {
    const list = data.items[kind];
    if (!list) return undefined;
    return list.filter((i) => (kind !== "avatar" || !presets?.has(i.key)) && (!ownedOnly || i.owned || i.equipped));
  };

  const level = me?.level ?? null;
  const useDisabled = online ? null : t("net.offlineAction");
  const loading = data.loading || (segment === "avatars" && presets === null);
  const all = groups.map((g) => visible(g.kind) ?? []);
  const nothing = !loading && all.every((l) => l.length === 0);

  const equippedBoard = data.items.board_theme?.find((i) => i.equipped) ?? null;
  const equippedCheckers = data.items.checker_theme?.find((i) => i.equipped) ?? null;

  let content: React.ReactNode;
  if (data.error && !data.at) {
    content = <ErrorState kind={online ? "error" : "offline"} message={online ? t("shop.loadError") : t("net.offline")} code={data.error.code !== "NETWORK" ? data.error.code : undefined} onRetry={() => void data.reload()} />;
  } else if (nothing) {
    content = ownedOnly ? (
      <EmptyState message={t("shop.empty.owned")} action={{ label: t("shop.empty.showAll"), onClick: () => setFilter(false) }} />
    ) : (
      <EmptyState message={t("shop.empty.none")} />
    );
  } else {
    content = (
      <Stack spacing={3}>
        {groups.map((g, gi) => {
          const list = visible(g.kind);
          if (list && list.length === 0) return null;
          return (
            <section key={g.kind} aria-labelledby={`shop-${g.anchor}`} id={g.anchor}>
              {groups.length > 1 && (
                <Typography id={`shop-${g.anchor}`} variant="h4" component="h2" sx={{ mb: 1.5 }}>
                  {t(`shop.${g.title}`)}
                </Typography>
              )}
              {groups.length === 1 && (
                <Typography id={`shop-${g.anchor}`} component="h2" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                  {t(`shop.${g.title}`)}
                </Typography>
              )}
              {loading || !list ? (
                <div aria-busy="true">
                  <Grid aria-hidden data-kind={g.kind}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <li key={i}>
                        <ItemCardSkeleton />
                      </li>
                    ))}
                  </Grid>
                </div>
              ) : (
                <Grid data-kind={g.kind}>
                  {list.map((item) => (
                    <li key={item.id}>
                      <ItemCard item={item} level={level} onUse={(i) => void equip(i)} useBusy={busy === item.id} disabledReason={useDisabled} />
                    </li>
                  ))}
                </Grid>
              )}
              {gi === groups.length - 1 && (!online || data.error) && data.at !== null && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                  {t("common.lastUpdated", { time: f.relative(new Date(data.at)) })}
                </Typography>
              )}
            </section>
          );
        })}
      </Stack>
    );
  }

  return (
    <ShopFrame segment={segment}>
      <Stack spacing={2}>
        <ChoiceGroup
          legend={t("shop.filter.label")}
          layout="chips"
          value={ownedOnly ? "owned" : "all"}
          onChange={(v) => setFilter(v === "owned")}
          options={[
            { value: "all", label: t("shop.filter.all") },
            { value: "owned", label: t("shop.filter.owned") },
          ]}
        />
        {!hintSeen && (
          <Banner
            severity="info"
            onClose={() => {
              if (me) writeJson("local", hintKey(me.id), true);
              setHintSeen(true);
            }}
          >
            {t("shop.hint.firstVisit")}
          </Banner>
        )}
        {segment === "avatars" && (
          <Typography variant="body2" color="text.secondary">
            {t("shop.avatars.presetNote")}{" "}
            <Link component={NextLink} href="/me/edit">
              {t("shop.avatars.editProfile")}
            </Link>
          </Typography>
        )}
        {segment === "packs" && (
          <Typography variant="body2" color="text.secondary">
            {t("shop.packs.intro")}
          </Typography>
        )}
        {segment === "themes" && equippedBoard && equippedCheckers && !ownedOnly && (
          <Stack
            component="section"
            aria-labelledby="shop-current"
            direction="row"
            sx={{ alignItems: "center", gap: 1.5, p: 1.5, borderRadius: 2, border: 1, borderColor: "tokens.outlineSubtle", bgcolor: "tokens.surface", flexWrap: "wrap" }}
          >
            <Box sx={{ width: 72, flex: "none" }}>
              <ItemThumb item={equippedBoard} />
            </Box>
            <Box sx={{ width: 72, flex: "none" }}>
              <ItemThumb item={equippedCheckers} />
            </Box>
            <Box sx={{ flex: "1 1 10rem", minWidth: 0 }}>
              <Typography id="shop-current" variant="label" component="h2">
                {t("shop.current.title")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("shop.current.summary", { board: nameOf(equippedBoard), checkers: nameOf(equippedCheckers) })}
              </Typography>
            </Box>
            <Button variant="text" href="#boards" sx={{ minHeight: 44 }}>
              {t("shop.current.change")}
            </Button>
          </Stack>
        )}
        {content}
      </Stack>
    </ShopFrame>
  );
}
