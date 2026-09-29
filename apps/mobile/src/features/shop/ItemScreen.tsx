"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, itemAction, newIdempotencyKey } from "@bg/api-client";
import { avatarSize } from "@bg/design-tokens";
import type { ItemKind, PhraseText, ShopItem } from "@bg/protocol";
import { useToast } from "@/components/feedback/Toast";
import { StickyActions } from "@/components/flow/StickyActions";
import { CheckIcon, CoinIcon, InfoIcon, LockIcon } from "@/components/icons";
import { CostConfirmation } from "@/components/money/CostConfirmation";
import { Avatar } from "@/components/profile/Avatar";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError } from "@/lib/apiErrors";
import { useRequireUser, useSession } from "@/lib/session";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { gutterStyles } from "@/theme/layout";
import { emojiGlyph, ItemThumb, StateLine } from "./ItemCard";
import { ShopInsufficientSheet, useEquip } from "./shopActions";

import { cachedItem, updateCachedItem, useItemName } from "./useShop";

// SH-03 Item preview `/shop/items/[id]` and SH-04 purchase confirmation (shop.md §3.2–§3.4, §3.8).
// Nothing is bought from a card and nothing is equipped after buying until the user says so. The
// buy sends the confirmed price (`expected_price`), so a changed price is refused, not charged
// (§10 Q1, now implemented as SHOP_PRICE_CHANGED). One Idempotency-Key per opened confirmation.

/** The 3D preview (and the board framing code) loads only for themes. */
const ThemePreview = dynamic(() => import("./ThemePreview").then((m) => m.ThemePreview), { ssr: false });

const SEGMENT_HREF: Record<ItemKind, string> = {
  board_theme: "/shop",
  checker_theme: "/shop",
  avatar: "/shop/avatars",
  emoji_pack: "/shop/packs",
  phrase_pack: "/shop/packs",
};

export function ItemScreen({ itemId }: { itemId: number }) {
  const t = useTranslations();
  const f = useFormat();
  const toast = useToast();
  const online = useOnline();
  const wallet = useWallet();
  const { me } = useRequireUser();
  const { reload: reloadMe, handleAuthError } = useSession();
  const nameOf = useItemName();
  const [item, setItem] = useState<ShopItem | null>(() => cachedItem(itemId));
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipped, setEquipped] = useState<{ board_theme: string; checker_theme: string } | null>(null);
  const [phrases, setPhrases] = useState<PhraseText[] | null>(null);
  const [sheet, setSheet] = useState<"buy" | "done" | "insufficient" | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [buyError, setBuyError] = useState<ReactNode | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState<number | null>(null);
  const keyRef = useRef<string | null>(null);

  const apply = useCallback((next: ShopItem) => {
    updateCachedItem(next);
    setItem(next);
  }, []);
  const { equip, busy } = useEquip(apply);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [all, themes] = await Promise.all([api.shop.items(), api.shop.themes().catch(() => null)]);
      const found = all.results.find((i) => i.id === itemId) ?? null;
      if (themes) setEquipped(themes.equipped);
      if (found) setItem(found);
      else setMissing(true);
    } catch (e) {
      if (!handleAuthError(e)) setError(toApiError(e).code);
    }
  }, [itemId, handleAuthError]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (item?.kind !== "phrase_pack" || phrases) return;
    api.shop
      .phrases()
      .then((p) => setPhrases(p.results))
      .catch(() => setPhrases([]));
  }, [item?.kind, phrases]);

  const back = item ? SEGMENT_HREF[item.kind] : "/shop";
  const frame = (children: ReactNode) => (
    <SignedInShell topBar={{ title: t("shop.title"), leading: "back", href: back, titleComponent: "p" }}>
      <Box sx={{ ...gutterStyles, py: 2, maxWidth: 720, width: "100%", mx: "auto", display: "flex", flexDirection: "column", flex: "1 1 auto" }}>{children}</Box>
    </SignedInShell>
  );

  if (missing) {
    return frame(
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h3" component="h1">
          {t("shop.item.unavailable")}
        </Typography>
        <Button variant="contained" component={NextLink} href="/shop">
          {t("shop.item.backToShop")}
        </Button>
      </Stack>,
    );
  }
  if (!item) {
    return frame(error ? <ErrorState kind={online ? "error" : "offline"} message={online ? t("shop.loadError") : t("net.offline")} code={error !== "NETWORK" ? error : undefined} onRetry={() => void load()} /> : <LoadingState variant="cards" rows={2} />);
  }

  const name = nameOf(item);
  const action = itemAction(item);
  const suspended = me?.status === "suspended";
  const balance = wallet.summary?.balance ?? null;
  const price = item.price;
  const coinPrice = wallet.summary?.coin_price_toman ?? null;

  const openBuy = () => {
    if (balance !== null && balance < price) {
      setInsufficientBalance(balance);
      setSheet("insufficient");
      return;
    }
    keyRef.current = newIdempotencyKey();
    setBuyError(null);
    setSheet("buy");
  };

  const buy = async () => {
    if (inFlight) return;
    keyRef.current ??= newIdempotencyKey();
    setInFlight(true);
    setBuyError(null);
    try {
      const next = await api.shop.buy(item.id, keyRef.current, price);
      apply(next);
      void wallet.refresh();
      setSheet("done");
    } catch (e) {
      if (handleAuthError(e)) return;
      const err = toApiError(e);
      switch (err.code) {
        case "WALLET_INSUFFICIENT":
          setInsufficientBalance(typeof err.details.balance === "number" ? err.details.balance : balance);
          setSheet("insufficient");
          void wallet.refresh();
          break;
        case "ACCOUNT_SUSPENDED":
          setBuyError(t("account.suspended.actionBlocked"));
          void reloadMe();
          break;
        case "ITEM_UNAVAILABLE":
          setBuyError(t("shop.error.unavailable"));
          break;
        case "ITEM_NOT_FOR_SALE":
          setBuyError(t("shop.error.notForSale"));
          void load();
          break;
        case "SHOP_PRICE_CHANGED": {
          const now = typeof err.details.price === "number" ? err.details.price : null;
          if (now !== null) apply({ ...item, price: now });
          setBuyError(t("shop.error.priceChanged", { price: f.number(now ?? price) }));
          break;
        }
        case "NETWORK":
          setBuyError(t("errors.network"));
          break;
        default:
          setBuyError(`${t("errors.generic")} (${t("common.errorCode", { code: err.code })})`);
      }
    } finally {
      setInFlight(false);
    }
  };

  /** "Check status" after 10 s: owned now → done; else the same key again (the server charges once). */
  const checkStatus = async () => {
    try {
      const page = await api.shop.items(item.kind);
      const now = page.results.find((i) => i.id === item.id);
      if (now?.owned) {
        apply(now);
        setInFlight(false);
        void wallet.refresh();
        setSheet("done");
      }
    } catch {
      // Keep waiting for the original request.
    }
  };

  const disabledReason = !online ? t("net.offlineAction") : null;
  let primary: ReactNode;
  switch (action) {
    case "buy":
      primary = (
        <>
          <Button variant="contained" size="large" startIcon={<CoinIcon />} onClick={openBuy} disabled={suspended || Boolean(disabledReason)} aria-describedby={suspended || disabledReason ? "item-reason" : undefined}>
            {t("shop.action.buy", { count: price })}
          </Button>
          {(suspended || disabledReason) && (
            <Typography id="item-reason" variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {suspended ? t("account.suspended.actionBlocked") : disabledReason}{" "}
              {suspended && (
                <Link component={NextLink} href="/account/status">
                  {t("account.suspended.details")}
                </Link>
              )}
            </Typography>
          )}
        </>
      );
      break;
    case "use":
      primary = (
        <>
          <Button variant="contained" size="large" onClick={() => void equip(item)} loading={busy === item.id} disabled={Boolean(disabledReason)}>
            {t("shop.action.use")}
          </Button>
          {disabledReason && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {disabledReason}
            </Typography>
          )}
        </>
      );
      break;
    case "inUse":
      primary = (
        <Button variant="contained" size="large" disabled startIcon={<CheckIcon />}>
          {t("shop.action.inUse")}
        </Button>
      );
      break;
    case "ownedPack":
      primary = <InfoLine icon={CheckIcon} tone="primary">{t("shop.preview.ownedPack")}</InfoLine>;
      break;
    default:
      primary = (
        <InfoLine icon={LockIcon} tone="primary">
          {t("shop.preview.locked", { level: f.number(item.unlock_level ?? 0), current: f.number(me?.level ?? 0) })}
        </InfoLine>
      );
  }

  const keys = item.data.keys ?? [];
  const preview =
    item.kind === "board_theme" || item.kind === "checker_theme" ? (
      <ThemePreview item={item} name={name} equipped={equipped} />
    ) : item.kind === "avatar" ? (
      <Stack spacing={2} sx={{ alignItems: "center" }}>
        <Avatar avatarKey={item.key} size={128} label={name} />
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1.5, borderRadius: 2, border: 1, borderColor: "tokens.outlineSubtle", bgcolor: "tokens.surface" }}>
          <Avatar avatarKey={item.key} size={avatarSize.sm} />
          <Box>
            <Typography variant="label" component="p">
              <bdi dir="ltr">{me?.username ?? ""}</bdi>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("shop.preview.inBar")}
            </Typography>
          </Box>
        </Stack>
      </Stack>
    ) : item.kind === "emoji_pack" ? (
      <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 6rem), 1fr))" }}>
        {keys.map((k) => {
          const glyph = emojiGlyph(k);
          const label = t.has(`reactions.emoji.${k}`) ? t(`reactions.emoji.${k}`) : k;
          return (
            <Box component="li" key={k} sx={{ display: "grid", justifyItems: "center", gap: 0.5, p: 1, borderRadius: 2, border: 1, borderColor: "tokens.outlineSubtle", minHeight: 72 }}>
              {glyph && (
                <Box component="span" aria-hidden sx={{ fontSize: "1.75rem" }}>
                  {glyph}
                </Box>
              )}
              <Typography variant="caption">{label}</Typography>
            </Box>
          );
        })}
      </Box>
    ) : (
      <Stack spacing={1}>
        {phrases === null ? (
          <LoadingState variant="list" rows={3} />
        ) : (
          <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {keys.map((k) => (
              <Typography component="li" key={k} variant="body1" sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: "tokens.outlineSubtle" }}>
                {phrases.find((p) => p.key === k)?.text[f.locale] ?? (t.has(`reactions.phrase.${k}`) ? t(`reactions.phrase.${k}`) : k)}
              </Typography>
            ))}
          </Stack>
        )}
        <InfoLine icon={InfoIcon}>{t("shop.preview.phrasesLocale")}</InfoLine>
      </Stack>
    );

  const isTheme = item.kind === "board_theme" || item.kind === "checker_theme";
  const isPack = item.kind === "emoji_pack" || item.kind === "phrase_pack";

  return frame(
    <>
      <Stack spacing={2.5} sx={{ flex: "1 1 auto" }}>
        <div>
          <Typography variant="h3" component="h1" sx={{ overflowWrap: "anywhere" }}>
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(`shop.kind.${item.kind}`)}
          </Typography>
        </div>
        {preview}
        <StateLine item={item} level={me?.level ?? null} />
        {isTheme && <InfoLine>{t("shop.preview.appliesNext")}</InfoLine>}
        {isPack && <InfoLine>{t("shop.preview.packUsage")}</InfoLine>}
      </Stack>
      <StickyActions>{primary}</StickyActions>

      <CostConfirmation
        open={sheet === "buy"}
        onCancel={() => setSheet(null)}
        onConfirm={() => void buy()}
        title={t("shop.buy.title", { name })}
        summary={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 96, flex: "none" }}>
              <ItemThumb item={item} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {t(`shop.kind.${item.kind}`)}
            </Typography>
          </Stack>
        }
        cost={{
          cost: price,
          tomanEquivalent: coinPrice !== null ? price * coinPrice : undefined,
          balance,
          balanceAfter: balance === null ? null : balance - price,
        }}
        facts={
          <Stack spacing={0.5} component="span">
            <span>{isPack ? t("shop.buy.packUse") : t("shop.buy.keep")}</span>
            <span>{t("shop.buy.noRefund")}</span>
          </Stack>
        }
        confirmLabel={t("shop.buy.cta", { price: f.number(price) })}
        inFlightLabel={t("shop.buy.paying")}
        inFlight={inFlight}
        disabledReason={balance === null ? t("common.loading") : !online ? t("net.offlineAction") : undefined}
        error={buyError}
        onCheckStatus={() => void checkStatus()}
      />

      <BottomSheet
        open={sheet === "done"}
        onClose={() => {
          setSheet(null);
          toast.show({ message: t("shop.buy.added", { name }) });
        }}
        title={t("shop.buy.done", { name })}
        footer={
          action === "use" ? (
            <>
              <Button
                variant="contained"
                size="large"
                loading={busy === item.id}
                onClick={() => void equip(item).then((ok) => ok && setSheet(null))}
              >
                {t("shop.buy.useNow")}
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setSheet(null);
                  toast.show({ message: t("shop.buy.added", { name }) });
                }}
              >
                {t("shop.buy.notNow")}
              </Button>
            </>
          ) : (
            <Button variant="contained" size="large" onClick={() => setSheet(null)}>
              {t("common.done")}
            </Button>
          )
        }
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 96, flex: "none" }}>
            <ItemThumb item={item} />
          </Box>
          <StateLine item={item} level={me?.level ?? null} />
        </Stack>
      </BottomSheet>

      <ShopInsufficientSheet
        open={sheet === "insufficient"}
        onClose={() => setSheet(null)}
        cost={price}
        balance={insufficientBalance}
        ownedHref={`${back}?filter=owned`}
      />
    </>,
  );
}
