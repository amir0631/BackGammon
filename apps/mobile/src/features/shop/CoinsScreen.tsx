"use client";

import Stack from "@mui/material/Stack";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@bg/api-client";
import type { CoinPackages } from "@bg/protocol";
import { Banner } from "@/components/feedback/Banner";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { SupportTopupContent } from "@/components/wallet/SupportTopup";
import { toApiError } from "@/lib/apiErrors";
import { usePublicConfig } from "@/lib/config";
import { useRequireUser, useSession } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { ShopFrame } from "./ShopFrame";

// CO-01 / CO-02 Coins `/shop/coins` (shop.md §3.5). With online purchase off (today) the page is
// the support top-up content only: no packages, no amounts, no disabled buy buttons (P§2.3). The
// purchase form (CO-01, CO-03) loads only when purchase is on, keeping this page's first load small.

const CoinsPurchase = dynamic(() => import("./CoinsPurchase").then((m) => m.CoinsPurchase), {
  ssr: false,
  loading: () => <LoadingState variant="cards" rows={4} />,
});

export function CoinsScreen() {
  const t = useTranslations();
  const online = useOnline();
  const config = usePublicConfig();
  const wallet = useWallet();
  const { me } = useRequireUser();
  const { handleAuthError } = useSession();
  const [packages, setPackages] = useState<CoinPackages | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api.shop
      .packages()
      .then(setPackages)
      .catch((e: unknown) => {
        if (!handleAuthError(e)) setLoadError(toApiError(e).code);
      });
  }, [handleAuthError]);
  useEffect(load, [load]);

  const enabled = packages?.enabled ?? config?.payments_enabled ?? false;
  const priceToman = packages?.price_toman ?? config?.coin_price_toman ?? wallet.summary?.coin_price_toman ?? null;

  return (
    <ShopFrame segment="coins">
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        {notice && <Banner severity="info">{notice}</Banner>}
        {!enabled ? (
          <SupportTopupContent username={me?.username ?? null} coinPriceToman={priceToman} />
        ) : !packages ? (
          loadError ? (
            <ErrorState kind={online ? "error" : "offline"} message={online ? t("shop.loadError") : t("net.offline")} code={loadError !== "NETWORK" ? loadError : undefined} onRetry={load} />
          ) : (
            <LoadingState variant="cards" rows={4} />
          )
        ) : (
          <CoinsPurchase
            packages={packages}
            onDisabled={(text) => {
              setNotice(text);
              setPackages((p) => (p ? { ...p, enabled: false } : p));
            }}
            onPackageGone={(text) => {
              setNotice(text);
              load();
            }}
          />
        )}
      </Stack>
    </ShopFrame>
  );
}
