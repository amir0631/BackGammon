"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { feedbackTiming, iconSize } from "@bg/design-tokens";
import { InfoIcon } from "@/components/icons";

// "Still working…" + "Check status" after 10 s without a response (patterns.md §2.2, wallet.md
// §3.4 step 3.9). "Check status" re-sends the same request with the same Idempotency-Key (or
// re-reads the resource); it is never a blind retry. The caller owns that request.

/** True once `inFlight` has lasted `feedbackTiming.slowRequestMs`. */
export function useSlowRequest(inFlight: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!inFlight) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), feedbackTiming.slowRequestMs);
    return () => window.clearTimeout(timer);
  }, [inFlight]);
  return slow;
}

export function SlowNotice({ onCheckStatus, message }: { onCheckStatus?: () => void; message?: string }) {
  const t = useTranslations("common");
  return (
    <Stack direction="row" role="status" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", color: "tokens.info" }} />
      <Typography variant="body2" sx={{ flex: "1 1 10rem", minWidth: 0 }}>
        {message ?? t("stillWorking")}
      </Typography>
      {onCheckStatus && (
        <Button size="small" variant="outlined" onClick={onCheckStatus} sx={{ flex: "none" }}>
          {t("checkStatus")}
        </Button>
      )}
    </Stack>
  );
}
