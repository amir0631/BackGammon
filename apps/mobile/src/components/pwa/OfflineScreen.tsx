"use client";

import { styled } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { focusRing, minTouchTarget, radii } from "@bg/design-tokens";
import { Illustration } from "@/components/states/Illustration";
import { useOnline } from "@/lib/useOnline";
import { safeInsetBottom, safeInsetTop } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// SY-01 Offline (CLAUDE.md §11.5): a connection-lost screen with a retry, shown by the service
// worker in place of a page that couldn't load. "Try again" reloads the address the user asked for
// (the worker keeps it), and coming back online retries on its own. Offline bot play is deferred by
// the user (§11.5, review PW-01), so nothing here offers it. "Go to the lobby" shows only while the
// browser reports a connection, since the lobby can't load offline either (review PW-03).
// Plain elements styled from tokens (no MUI Button/Typography): this fallback page stays tiny and
// doesn't change how the shared UI chunks split (§11.4 budget).

const Main = styled("main")(({ theme }) => ({
  minHeight: "100dvh",
  maxWidth: 480,
  marginInline: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: theme.spacing(2.5),
  textAlign: "center",
  paddingInline: theme.spacing(3),
  paddingBlockStart: `calc(${safeInsetTop} + ${theme.spacing(3)})`,
  paddingBlockEnd: `calc(${safeInsetBottom} + ${theme.spacing(3)})`,
  "& h1": { ...theme.typography.h3, margin: 0, color: tokensOf(theme).textPrimary, "&:focus": { outline: "none" } },
  "& p": { ...theme.typography.body1, margin: 0, color: tokensOf(theme).textSecondary },
  "& .actions": { display: "grid", gap: theme.spacing(1), width: "100%" },
}));

const Action = styled("a")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    ...theme.typography.button,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: minTouchTarget,
    paddingInline: theme.spacing(2),
    borderRadius: radii.md,
    border: 0,
    cursor: "pointer",
    textDecoration: "none",
    color: t.primary,
    backgroundColor: "transparent",
    "&[data-primary='true']": { backgroundColor: t.primary, color: t.onPrimary },
    "&:focus-visible": { outline: `${focusRing.width}px solid ${t.focusRing}`, outlineOffset: focusRing.offset },
  };
});

export function OfflineScreen() {
  const t = useTranslations();
  const online = useOnline();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wasOffline = useRef(!online);

  useEffect(() => titleRef.current?.focus(), []);
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) window.location.reload();
  }, [online]);

  return (
    <Main>
      <Illustration kind="offline" />
      <h1 ref={titleRef} tabIndex={-1}>
        {t("offline.title")}
      </h1>
      <p>{t("offline.body")}</p>
      <div className="actions">
        <Action as="button" type="button" data-primary="true" onClick={() => window.location.reload()}>
          {t("common.retry")}
        </Action>
        {online && <Action href="/play">{t("offline.home")}</Action>}
      </div>
    </Main>
  );
}
