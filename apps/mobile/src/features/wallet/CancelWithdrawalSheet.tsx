"use client";

import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Banner } from "@/components/feedback/Banner";
import { SlowNotice, useSlowRequest } from "@/components/feedback/SlowNotice";
import { ActionButton } from "@/components/forms/ActionButton";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { useWalletFormat } from "./shared";

// WD-09 cancel withdrawal (wallet.md §3.7 step 3; review W-09): a bottom sheet (P§3), a centered
// dialog from md. Initial focus on "Keep request"; not dismissible while cancelling; "Still
// working…" re-checks the request instead of retrying blindly.

export interface CancelWithdrawalSheetProps {
  open: boolean;
  cancelling: boolean;
  online: boolean;
  error: string | null;
  amount: number;
  onKeep: () => void;
  onConfirm: () => void;
  onCheckStatus: () => void;
}

export function CancelWithdrawalSheet({ open, cancelling, online, error, amount, onKeep, onConfirm, onCheckStatus }: CancelWithdrawalSheetProps) {
  const t = useTranslations();
  const f = useWalletFormat();
  const keepRef = useRef<HTMLButtonElement>(null);
  const slow = useSlowRequest(cancelling);
  return (
    <BottomSheet
      open={open}
      onClose={onKeep}
      dismissible={!cancelling}
      title={t("withdrawals.cancel.title")}
      initialFocusRef={keepRef}
      footer={
        <>
          {error && <Banner severity="error">{error}</Banner>}
          {cancelling && slow && <SlowNotice onCheckStatus={onCheckStatus} />}
          <ActionButton
            onClick={onConfirm}
            loading={cancelling}
            loadingLabel={t("withdrawals.cancel.cancelling")}
            disabledReason={online ? null : t("net.offlineAction")}
          >
            {t("withdrawals.cancel.confirm")}
          </ActionButton>
          <Button ref={keepRef} variant="outlined" fullWidth disabled={cancelling} onClick={onKeep}>
            {t("withdrawals.cancel.keep")}
          </Button>
        </>
      }
    >
      <Typography color="text.secondary">{t("withdrawals.cancel.body", { amount: f.number(amount) })}</Typography>
    </BottomSheet>
  );
}
