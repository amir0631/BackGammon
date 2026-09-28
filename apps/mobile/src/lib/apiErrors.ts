"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiRequestError } from "@bg/api-client";
import type { ApiError } from "@bg/protocol";

// API error → user-facing text (patterns.md §4.2). Every `message_key` maps to an fa and en string;
// unknown codes fall back to `errors.generic` plus the code in small text for support. Errors that
// need values (countdowns, tries left) are rendered by the screens that own them.

const NETWORK: ApiError = { code: "NETWORK", message_key: "errors.network", details: {} };
const UNKNOWN: ApiError = { code: "UNKNOWN", message_key: "errors.generic", details: {} };

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiRequestError) return error.body;
  if (error instanceof TypeError) return NETWORK;
  return UNKNOWN;
}

export function errorStatus(error: unknown): number {
  return error instanceof ApiRequestError ? error.status : 0;
}

/** Seconds from `details.retry_after`, or null. */
export function retryAfter(error: ApiError): number | null {
  const value = error.details.retry_after;
  return typeof value === "number" && value > 0 ? Math.ceil(value) : null;
}

export interface ErrorText {
  message: string;
  /** Set when the message is the generic fallback, so the code can be shown for support. */
  code?: string;
}

/** Plain text for an API error whose message takes no values. */
export function useErrorText() {
  const t = useTranslations();
  return useCallback(
    (error: ApiError): ErrorText => {
      if (error.message_key !== "errors.generic" && t.has(error.message_key)) {
        return { message: t(error.message_key) };
      }
      return { message: t("errors.generic"), code: error.code };
    },
    [t],
  );
}
