"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { Illustration } from "./Illustration";

// Screen-level error (patterns.md §4.1): illustration, one-line cause, primary "Try again",
// secondary "Back". Unknown API codes show `errors.generic` plus the code in small text for
// support (§4.2). Never a stack trace or a bare HTTP status.

export interface ErrorStateProps {
  /** Localized cause; defaults to `errors.generic`. */
  message?: string;
  /** API error `code`, shown small for support. */
  code?: string;
  onRetry?: () => void;
  onBack?: () => void;
  /** Offline variant uses the offline illustration. */
  kind?: "error" | "offline";
}

export function ErrorState({ message, code, onRetry, onBack, kind = "error" }: ErrorStateProps) {
  const t = useTranslations();
  return (
    <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 4, px: 2 }} role="alert">
      <Illustration kind={kind} />
      <Typography variant="h4" component="p" sx={{ maxWidth: "32rem" }}>
        {message ?? t("errors.generic")}
      </Typography>
      {code && (
        <Typography variant="caption" color="text.secondary" component="p">
          <bdi>{t("common.errorCode", { code })}</bdi>
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center", rowGap: 1 }}>
        {onRetry && (
          <Button variant="contained" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )}
        {onBack && (
          <Button variant="text" onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
