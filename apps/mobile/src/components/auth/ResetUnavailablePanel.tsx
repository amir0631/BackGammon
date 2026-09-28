"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { iconSize } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import { ActionButton } from "@/components/forms/ActionButton";
import { InfoIcon } from "@/components/icons";
import { AuthPanel } from "./AuthScreen";

// AU-07U "Reset unavailable" (auth.md §3.5.3): replaces the AU-07 form in place when the server
// answers 503 SMS_UNAVAILABLE. Neutral info styling (not the user's fault), identical for every
// number, never a dead end: support contact, "Back to log in", and "Try again" (never automatic).
// A signed-in user (Settings → Change password) gets "Back" instead of "Back to log in", and no
// "log in as usual" line.

export interface ResetUnavailablePanelProps {
  signedIn: boolean;
  onBack: () => void;
  onRetry: () => void;
  retrying: boolean;
  offlineReason?: string | null;
}

export function ResetUnavailablePanel({ signedIn, onBack, onRetry, retrying, offlineReason }: ResetUnavailablePanelProps) {
  const t = useTranslations();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <AuthPanel role="region" aria-labelledby={headingId}>
      <Stack spacing={2}>
        <InfoIcon sx={{ fontSize: iconSize.lg, color: "tokens.info" }} />
        <Typography
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          variant="h2"
          component="h1"
          sx={{ "&:focus": { outline: "none" } }}
        >
          {t("auth.reset.unavailable.title")}
        </Typography>
        <Typography>{t("auth.reset.unavailable.body")}</Typography>
        {!signedIn && <Typography color="text.secondary">{t("auth.reset.unavailable.remember")}</Typography>}
        <Typography color="text.secondary">
          {t("auth.reset.unavailable.support", { channel: isolate(t("support.contact.channel")) })}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}>
          <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
          <span>{t("auth.reset.unavailable.safety")}</span>
        </Typography>
        <Stack spacing={1} sx={{ pt: 1 }}>
          <Button variant="contained" size="large" fullWidth onClick={onBack}>
            {signedIn ? t("common.back") : t("auth.reset.backToLogin")}
          </Button>
          <ActionButton variant="text" size="medium" onClick={onRetry} loading={retrying} disabledReason={offlineReason}>
            {t("common.retry")}
          </ActionButton>
        </Stack>
      </Stack>
    </AuthPanel>
  );
}
