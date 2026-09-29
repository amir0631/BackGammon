"use client";

import Button from "@mui/material/Button";
import { useTranslations } from "next-intl";
import type { LedgerRow } from "@bg/protocol";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { TxDetail } from "@/components/wallet/Ledger";
import { SupportTopupContent } from "@/components/wallet/SupportTopup";

// WA-02 (transaction detail) and WA-04 (get coins) as sheets; a centered dialog from md. Loaded on
// first open (next/dynamic in WalletHomeScreen) to keep /wallet under the JS budget (§11.4).

export function TxDetailSheet({ row, onClose }: { row: LedgerRow | null; onClose: () => void }) {
  const t = useTranslations();
  return (
    <BottomSheet
      open={Boolean(row)}
      onClose={onClose}
      title={t("wallet.detail.title")}
      footer={
        <Button variant="text" fullWidth onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      {row && <TxDetail row={row} />}
    </BottomSheet>
  );
}

export function GetCoinsSheet({
  open,
  onClose,
  username,
  coinPriceToman,
}: {
  open: boolean;
  onClose: () => void;
  username: string | null;
  coinPriceToman: number | null;
}) {
  const t = useTranslations();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("shop.coins.supportTopup.title")}
      footer={
        <Button variant="outlined" fullWidth onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <SupportTopupContent username={username} coinPriceToman={coinPriceToman} />
    </BottomSheet>
  );
}
