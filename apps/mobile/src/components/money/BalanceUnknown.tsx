"use client";

import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import { InfoIcon, WarningIcon } from "@/components/icons";
import { InfoLine } from "@/components/wallet/InfoLine";
import { useWallet } from "@/lib/wallet";
import { visuallyHidden } from "@/theme/layout";

// The balance is not known yet (P§2.1, play review P-01, shop review SH-01): a cost confirmation
// never shows "0" for an unread wallet. Value rows show a skeleton; a note says why the primary is
// disabled and, after a failed read, offers Retry (`wallet.refresh()`).

/** Skeleton for a value row whose number depends on the unread balance. */
export function UnknownValue() {
  const t = useTranslations("common");
  return (
    <>
      <Skeleton variant="text" width="5rem" sx={{ display: "inline-block" }} aria-hidden />
      <span style={visuallyHidden}>{t("loading")}</span>
    </>
  );
}

export function BalanceUnknownNote({ id }: { id?: string }) {
  const t = useTranslations();
  const wallet = useWallet();
  return (
    <Stack direction="row" role="status" id={id} sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <InfoLine icon={wallet.failed ? WarningIcon : InfoIcon} tone="primary">
        {wallet.failed ? t("coins.balanceError") : t("coins.balanceUnknown")}
      </InfoLine>
      {wallet.failed && (
        <Button size="small" variant="text" onClick={() => void wallet.refresh()} sx={{ minHeight: 44 }}>
          {t("common.retry")}
        </Button>
      )}
    </Stack>
  );
}
