"use client";

import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { feedbackTiming, iconSize, minTouchTarget } from "@bg/design-tokens";
import { ErrorIcon, HelpIcon, InfoIcon } from "@/components/icons";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { CostBlock, type CostBlockProps } from "./CostBlock";

// Money confirmation sheet (patterns.md §2): title, summary, full cost block, feature facts,
// primary button with the amount in its label, Cancel, and a "?" help link.
//
// In flight: spinner in the button, sheet cannot be dismissed, repeat taps ignored. After 10 s
// without a response, "Still working…" with "Check status" (never a blind retry). The caller owns
// the request and the Idempotency-Key; this component is presentational.

export interface CostConfirmationProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** What is being bought, entered, or moved: "Enter 100-coin table". */
  title: ReactNode;
  /** Variant/length/tier, item preview, recipient card, bank account card… */
  summary?: ReactNode;
  cost: CostBlockProps;
  /** Feature-specific money facts (pot and fee, prize split, cooldown, pool sentence). */
  facts?: ReactNode;
  /** Primary label including the amount: "Pay ۱۰۰ coins and search". */
  confirmLabel: string;
  /** Screen-reader label while in flight: "Paying…". Defaults to `confirmLabel`. */
  inFlightLabel?: string;
  inFlight?: boolean;
  /** Visible reason the button is disabled ("Enter an amount"). Disables the button when set. */
  disabledReason?: string;
  /** Action-level error shown above the button (patterns.md §4.1). */
  error?: ReactNode;
  /** Re-queries the resource after a slow request. */
  onCheckStatus?: () => void;
  /** "/help/<topic>" */
  helpHref?: string;
}

/** Body and footer of the confirmation, for sheets that show it as one step (play.md PL-03). */
export function useCostConfirmationParts({
  onCancel,
  onConfirm,
  summary,
  cost,
  facts,
  confirmLabel,
  inFlightLabel,
  inFlight = false,
  disabledReason,
  error,
  onCheckStatus,
  helpHref,
}: Omit<CostConfirmationProps, "open" | "title">): { body: ReactNode; footer: ReactNode } {
  const t = useTranslations("common");
  const reasonId = useId();
  const [slow, setSlow] = useState(false);
  const firing = useRef(false);

  useEffect(() => {
    if (!inFlight) {
      setSlow(false);
      firing.current = false;
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), feedbackTiming.slowRequestMs);
    return () => window.clearTimeout(timer);
  }, [inFlight]);

  const confirm = () => {
    // Ignore repeat taps until the caller flips `inFlight`.
    if (inFlight || firing.current || disabledReason) return;
    firing.current = true;
    onConfirm();
    window.setTimeout(() => {
      firing.current = false;
    }, 0);
  };
  const footer = (
    <>
      {error && (
        <Stack direction="row" spacing={1} role="alert" sx={{ color: "tokens.error", alignItems: "flex-start" }}>
          <ErrorIcon sx={{ fontSize: iconSize.sm, mt: 0.25, flex: "none" }} />
          <Typography variant="body2" sx={{ color: "inherit" }}>
            {error}
          </Typography>
        </Stack>
      )}
      {inFlight && slow && (
        <Stack direction="row" spacing={1} role="status" sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", color: "tokens.info" }} />
          <Typography variant="body2" sx={{ flex: "1 1 auto" }}>
            {t("stillWorking")}
          </Typography>
          {onCheckStatus && (
            <Button size="small" variant="text" onClick={onCheckStatus}>
              {t("checkStatus")}
            </Button>
          )}
        </Stack>
      )}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={confirm}
        loading={inFlight}
        loadingPosition="start"
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? reasonId : undefined}
        aria-label={inFlight && inFlightLabel ? inFlightLabel : undefined}
      >
        {confirmLabel}
      </Button>
      {disabledReason && (
        <Typography id={reasonId} variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          {disabledReason}
        </Typography>
      )}
      <Button variant="text" fullWidth onClick={onCancel} disabled={inFlight}>
        {t("cancel")}
      </Button>
    </>
  );

  const body = (
    <Stack spacing={2}>
      {summary}
      <CostBlock {...cost} />
      {facts && (
        <Typography variant="body2" color="text.secondary" component="div">
          {facts}
        </Typography>
      )}
      {helpHref && (
        <MuiLink
          component={NextLink}
          href={helpHref}
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, alignSelf: "flex-start", minHeight: minTouchTarget }}
        >
          <HelpIcon sx={{ fontSize: iconSize.sm }} />
          {t("help")}
        </MuiLink>
      )}
    </Stack>
  );
  return { body, footer };
}

export function CostConfirmation(props: CostConfirmationProps) {
  const { open, onCancel, title, inFlight = false } = props;
  const { body, footer } = useCostConfirmationParts(props);
  return (
    <BottomSheet open={open} onClose={onCancel} title={title} footer={footer} dismissible={!inFlight}>
      {body}
    </BottomSheet>
  );
}
