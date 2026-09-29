"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { cardQuickAction, itemState, type ItemState } from "@bg/api-client";
import { boardDefaultTheme, iconSize, radii } from "@bg/design-tokens";
import type { ShopItem } from "@bg/protocol";
import { CheckIcon, CoinIcon, LockIcon, SuccessIcon, type IconProps } from "@/components/icons";
import { Avatar } from "@/components/profile/Avatar";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";
import { EMOJI } from "../match/emoji";
import { useItemName } from "./useShop";

// Item card (shop.md §4): decorative thumbnail, name, exactly one state line (icon + text), and at
// most one quick action. The whole card is one link to SH-03; the quick action is a separate
// target. Cards never buy: the price action also opens SH-03 (acceptance 4).

/** Glyphs for the pack emoji keys beyond the free set; keys without a glyph show their name. */
export const PACK_EMOJI: Record<string, string> = {
  party: "\u{1F389}",
  trophy: "\u{1F3C6}",
  crown: "\u{1F451}",
  rocket: "\u{1F680}",
  star: "\u{2B50}",
  gift: "\u{1F381}",
  tea: "\u{1F375}",
  rose: "\u{1F339}",
  kite: "\u{1FA81}",
};

export function emojiGlyph(key: string): string | null {
  return EMOJI[key] ?? PACK_EMOJI[key] ?? null;
}

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: radii.lg,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "&[data-inuse='true']": { borderColor: t.primary, boxShadow: `inset 0 0 0 1px ${t.primary}` },
    "& .card-link": {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: theme.spacing(1),
      padding: theme.spacing(1.5),
      minHeight: 120,
      textAlign: "start",
      flex: "1 1 auto",
    },
    "@media (hover: hover)": { "& .card-link:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "& .card-action": { paddingInline: theme.spacing(1.5), paddingBlockEnd: theme.spacing(1.5) },
  };
});

const Thumb = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  aspectRatio: "16 / 10",
  borderRadius: radii.md,
  backgroundColor: tokensOf(theme).surfaceSunken,
  overflow: "hidden",
  fontSize: "1.75rem",
  gap: theme.spacing(0.5),
}));

/** A 2D stand-in drawn from the theme tokens until the API serves thumbnails (shop.md §10 Q3). */
export function ItemThumb({ item, large = false }: { item: ShopItem; large?: boolean }) {
  const b = boardDefaultTheme;
  if (item.kind === "board_theme") {
    return (
      <Thumb aria-hidden>
        <svg viewBox="0 0 160 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <rect x="4" y="4" width="152" height="92" rx="6" fill={b.frameWood} />
          <rect x="12" y="12" width="64" height="76" fill={b.fieldWood} />
          <rect x="84" y="12" width="64" height="76" fill={b.fieldWood} />
          <rect x="77" y="12" width="6" height="76" fill={b.inlayTurquoise} />
          {Array.from({ length: 12 }, (_, i) => {
            const x = i < 6 ? 12 + i * 10.6 : 84 + (i - 6) * 10.6;
            const fill = i % 2 === 0 ? b.pointDark : b.pointLight;
            return (
              <g key={i}>
                <polygon points={`${x},12 ${x + 10.6},12 ${x + 5.3},44`} fill={fill} />
                <polygon points={`${x},88 ${x + 10.6},88 ${x + 5.3},56`} fill={i % 2 === 0 ? b.pointLight : b.pointDark} />
              </g>
            );
          })}
        </svg>
      </Thumb>
    );
  }
  if (item.kind === "checker_theme") {
    return (
      <Thumb aria-hidden>
        <svg viewBox="0 0 160 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <circle cx="58" cy="50" r="26" fill={b.checkerLight} stroke={b.checkerLightRim} strokeWidth="5" />
          <circle cx="102" cy="50" r="26" fill={b.checkerDark} stroke={b.checkerDarkRim} strokeWidth="5" />
        </svg>
      </Thumb>
    );
  }
  if (item.kind === "avatar") {
    return (
      <Thumb aria-hidden>
        <Avatar avatarKey={item.key} size={large ? 128 : 56} />
      </Thumb>
    );
  }
  const keys = item.data.keys ?? [];
  if (item.kind === "emoji_pack") {
    return (
      <Thumb aria-hidden>
        {keys
          .map((k) => emojiGlyph(k))
          .filter(Boolean)
          .slice(0, 3)
          .map((g, i) => (
            <span key={i}>{g}</span>
          ))}
      </Thumb>
    );
  }
  return <PhraseThumb first={keys[0] ?? null} />;
}

function PhraseThumb({ first }: { first: string | null }) {
  const t = useTranslations();
  return (
    <Thumb aria-hidden>
      <Typography variant="body2" sx={{ px: 1.5, textAlign: "center" }}>
        {first && t.has(`reactions.phrase.${first}`) ? `«${t(`reactions.phrase.${first}`)}»` : "…"}
      </Typography>
    </Thumb>
  );
}

const STATE_ICON: Record<ItemState, ComponentType<IconProps>> = {
  inUse: CheckIcon,
  owned: SuccessIcon,
  freeOwned: SuccessIcon,
  levelLocked: LockIcon,
  price: CoinIcon,
};

/** The one state line (icon + text) and its words for the card's accessible name. */
export function useStateText() {
  const t = useTranslations("shop.state");
  const f = useFormat();
  return (item: ShopItem, level: number | null) => {
    const state = itemState(item);
    const main =
      state === "levelLocked"
        ? t("levelLocked", { level: f.number(item.unlock_level ?? 0) })
        : state === "price"
          ? t("price", { count: item.price })
          : t(state);
    const secondary = state === "levelLocked" && level !== null ? t("yourLevel", { level: f.number(level) }) : null;
    return { state, main, secondary, Icon: STATE_ICON[state] };
  };
}

export function StateLine({ item, level }: { item: ShopItem; level: number | null }) {
  const stateText = useStateText();
  const { state, main, secondary, Icon } = stateText(item, level);
  return (
    <Box>
      <Typography
        variant="body2"
        component="p"
        sx={{ display: "flex", alignItems: "center", gap: 0.5, m: 0, color: state === "inUse" ? "tokens.primary" : "text.primary", fontWeight: state === "inUse" ? 600 : undefined }}
      >
        <Icon sx={{ fontSize: iconSize.sm, flex: "none" }} />
        {main}
      </Typography>
      {secondary && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
          {secondary}
        </Typography>
      )}
    </Box>
  );
}

export function ItemCard({ item, level, onUse, useBusy, disabledReason }: { item: ShopItem; level: number | null; onUse: (item: ShopItem) => void; useBusy: boolean; disabledReason: string | null }) {
  const t = useTranslations("shop");
  const f = useFormat();
  const nameOf = useItemName();
  const stateText = useStateText();
  const name = nameOf(item);
  const { main } = stateText(item, level);
  const quick = cardQuickAction(item);
  const href = `/shop/items/${item.id}`;

  return (
    <Card data-inuse={item.equipped ? "true" : undefined}>
      <ButtonBase className="card-link" component={NextLink} href={href} aria-label={t("card.label", { name, kind: t(`kind.${item.kind}`), state: main })}>
        <Box aria-hidden sx={{ display: "grid", gap: 1 }}>
          <ItemThumb item={item} />
          <Typography variant="label" component="p" sx={{ m: 0, overflowWrap: "anywhere" }}>
            {name}
          </Typography>
          <StateLine item={item} level={level} />
        </Box>
      </ButtonBase>
      {quick && (
        <div className="card-action">
          {quick === "use" ? (
            <Button fullWidth variant="outlined" onClick={() => onUse(item)} loading={useBusy} disabled={Boolean(disabledReason)} aria-label={t("action.useLabel", { name })} sx={{ minHeight: 44 }}>
              {t("action.use")}
            </Button>
          ) : (
            <Button
              fullWidth
              variant="outlined"
              component={NextLink}
              href={href}
              startIcon={<CoinIcon />}
              aria-label={t("action.priceLabel", { name, price: f.coins(item.price) })}
              sx={{ minHeight: 44 }}
            >
              {f.number(item.price)}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function ItemCardSkeleton() {
  return <Skeleton variant="rectangular" height="13rem" sx={{ borderRadius: `${radii.lg}px` }} />;
}
