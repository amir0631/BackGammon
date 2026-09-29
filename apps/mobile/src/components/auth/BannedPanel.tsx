"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { iconSize } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import { ErrorIcon } from "@/components/icons";
import { AuthPanel } from "./AuthScreen";
import { useSupportContact } from "@/lib/config";

// AU-14 Banned panel (auth.md §4): shown on login or password reset when the server answers
// AUTH_BANNED (only after the password or code matched). A role="alert" region inside the page,
// not a dialog; focus moves to its title. No reason, no accusation.

export function BannedPanel({ onBack }: { onBack: () => void }) {
  const t = useTranslations();
  const supportContact = useSupportContact(t("support.contact.fallback"));
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <AuthPanel role="alert" aria-labelledby="banned-title">
      <Stack spacing={2}>
        <ErrorIcon sx={{ fontSize: iconSize.lg, color: "tokens.error" }} />
        <Typography
          id="banned-title"
          ref={titleRef}
          tabIndex={-1}
          variant="h2"
          component="h1"
          sx={{ "&:focus": { outline: "none" } }}
        >
          {t("account.banned.title")}
        </Typography>
        <Typography>{t("account.banned.body")}</Typography>
        <Typography color="text.secondary">{t("account.banned.withdrawals")}</Typography>
        <Typography color="text.secondary">
          {t("account.banned.support", { channel: isolate(supportContact) })}
        </Typography>
        <Button variant="outlined" size="large" fullWidth onClick={onBack}>
          {t("common.back")}
        </Button>
      </Stack>
    </AuthPanel>
  );
}
