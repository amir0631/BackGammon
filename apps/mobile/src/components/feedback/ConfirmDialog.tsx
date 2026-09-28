"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode } from "react";
import { useCloseOnBack } from "@/lib/useCloseOnBack";
import { visuallyHidden } from "@/theme/layout";
import { Banner } from "./Banner";

// Confirmation dialog for non-coin actions that deserve one (patterns.md §3): log out (AU-12) and
// sign out other devices (AC-06). Neutral styling (these are not destructive). Initial focus on
// Cancel; focus trapped; Esc = Cancel; focus returns to the trigger. While the request is in flight
// nothing dismisses it, and a failure stays inside the dialog.

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  inFlight?: boolean;
  inFlightLabel?: string;
  error?: string | null;
  /** Reason the confirm button is blocked (e.g. offline); shown as text. */
  disabledReason?: string | null;
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  children,
  confirmLabel,
  inFlight = false,
  inFlightLabel,
  error,
  disabledReason,
}: ConfirmDialogProps) {
  const t = useTranslations("common");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const reasonId = useId();
  const cancel = () => {
    if (!inFlight) onCancel();
  };
  useCloseOnBack(open, cancel, !inFlight);

  return (
    <Dialog
      open={open}
      onClose={cancel}
      disableEscapeKeyDown={inFlight}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      // Initial focus on Cancel (auth.md AU-12, profile.md AC-06): set after the enter transition,
      // since the modal focus trap moves focus to the container on open.
      slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
    >
      <DialogTitle id={titleId} variant="h4" component="h2" sx={{ overflowWrap: "anywhere" }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Typography id={bodyId} component="div" color="text.secondary">
          {children}
        </Typography>
        {error && (
          <Box sx={{ mt: 2 }}>
            <Banner severity="error">{error}</Banner>
          </Box>
        )}
        {disabledReason && (
          <Typography id={reasonId} variant="caption" component="p" color="text.secondary" sx={{ mt: 2 }}>
            {disabledReason}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 3, "& > :not(style) ~ :not(style)": { marginInlineStart: 0 } }}>
        <Button ref={cancelRef} variant="text" onClick={cancel} disabled={inFlight}>
          {t("cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            if (!inFlight && !disabledReason) onConfirm();
          }}
          loading={inFlight}
          aria-disabled={Boolean(disabledReason) || undefined}
          aria-describedby={disabledReason ? reasonId : undefined}
        >
          {confirmLabel}
          {inFlight && inFlightLabel && (
            <span style={visuallyHidden}>{inFlightLabel}</span>
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
