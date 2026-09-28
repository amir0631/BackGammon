"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { feedbackTiming, iconSize } from "@bg/design-tokens";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { visuallyHidden } from "@/theme/layout";

// Copy to clipboard (wallet.md §8): an explicit label ("Copy reference"), and a polite "Copied"
// announcement. The icon turns into a check for a moment (shape, not color). If the clipboard is
// unavailable the value stays selectable on screen, so nothing is lost.

export interface CopyButtonProps {
  value: string;
  /** Accessible name, e.g. `wallet.detail.copyReference`. */
  label: string;
  /** Icon only (default) or icon + visible label. */
  withText?: boolean;
}

export function CopyButton({ value, label, withText = false }: CopyButtonProps) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), feedbackTiming.toastMs);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  const icon = copied ? <CheckIcon sx={{ fontSize: iconSize.sm }} /> : <CopyIcon sx={{ fontSize: iconSize.sm }} />;

  return (
    <>
      {withText ? (
        <Button variant="text" size="small" onClick={copy} startIcon={icon} sx={{ flex: "none" }}>
          {copied ? t("copied") : label}
        </Button>
      ) : (
        <IconButton onClick={copy} aria-label={label} sx={{ flex: "none" }}>
          {icon}
        </IconButton>
      )}
      <span role="status" style={visuallyHidden}>
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}
