"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { api, isEquippable } from "@bg/api-client";
import type { ShopItem } from "@bg/protocol";
import { useToast } from "@/components/feedback/Toast";
import { BalanceUnknownNote, UnknownValue } from "@/components/money/BalanceUnknown";
import { ValueRows } from "@/components/money/ValueRows";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { useActiveMatch } from "@/lib/activeMatch";
import { toApiError } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";

// Shared shop actions: equip (shop.md §3.4) and the shop variant of the insufficient-coins sheet
// (§3.6).

/** Equip (§3.4): no confirmation, the card keeps its place; snackbar says when themes apply. */
export function useEquip(onChanged: (item: ShopItem) => void) {
  const t = useTranslations("shop");
  const toast = useToast();
  const { reload: reloadMe, handleAuthError } = useSession();
  const { active } = useActiveMatch();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const equip = useCallback(
    async (item: ShopItem): Promise<boolean> => {
      if (busy !== null || !isEquippable(item.kind)) return false;
      setBusy(item.id);
      setError(null);
      try {
        const next = await api.shop.equip(item.id);
        onChanged(next);
        if (item.kind === "avatar") {
          void reloadMe();
          toast.show({ message: t("equip.avatarDone") });
        } else {
          toast.show({ message: active?.match_id ? `${t("equip.themeDone")} ${t("equip.currentMatch")}` : t("equip.themeDone") });
        }
        return true;
      } catch (e) {
        if (handleAuthError(e)) return false;
        const err = toApiError(e);
        const message = err.code === "ITEM_NOT_OWNED" ? t("error.notOwned") : err.code === "ITEM_UNAVAILABLE" ? t("error.unavailable") : t("equip.failed");
        setError(message);
        toast.show({ message });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, onChanged, reloadMe, toast, t, active, handleAuthError],
  );
  return { equip, busy, error };
}

/** PL-05 shop variant (§3.6): cost, balance, shortfall; owned items first, "Get coins" as text. */
export function ShopInsufficientSheet({
  open,
  onClose,
  cost,
  balance,
  ownedHref,
}: {
  open: boolean;
  onClose: () => void;
  cost: number;
  balance: number | null;
  ownedHref: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  // An unread balance is a skeleton with a note, never 0 (SH-01).
  const known = balance !== null;
  return (
    <BottomSheet open={open} onClose={onClose} title={t("coins.insufficient.title")}>
      <Stack spacing={2}>
        <ValueRows
          rows={[
            { label: t("coins.cost"), value: cost, coins: true, emphasis: true },
            { label: t("coins.balance"), value: known ? balance : <UnknownValue />, coins: known, divider: true },
            { label: t("coins.shortfall"), value: known ? Math.max(0, cost - balance) : <UnknownValue />, coins: known, emphasis: true },
          ]}
        />
        {!known && <BalanceUnknownNote />}
        <Button variant="outlined" onClick={() => router.push(ownedHref)}>
          {t("shop.insufficient.owned")}
        </Button>
        <Button variant="text" onClick={() => router.push("/shop/coins")} sx={{ alignSelf: "flex-start" }}>
          {t("coins.getCoins")}
        </Button>
        <Button variant="text" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Stack>
    </BottomSheet>
  );
}
