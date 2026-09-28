"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { iconSize, layout, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import { CloseIcon, SuccessIcon, WarningIcon } from "@/components/icons";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { LoadingState } from "@/components/states/LoadingState";
import { destination } from "@/lib/nextPath";
import { useRequireUser } from "@/lib/session";
import { storageKeys, writeJson } from "@/lib/storage";
import { gutterStyles, mqMdUp } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// AU-13 Account suspended `/account/status` (auth.md §4). Plain and non-accusing: until when, what
// still works, what doesn't, and support. Shown once per sign-in; the banner links back here.
// "Can still" items for features that are not built yet are omitted (no links to 404s). The API
// does not return an end date or reason yet (auth.md open question 12), so "until further notice".

const CAN_STILL = ["profile"] as const;
const CANNOT = ["play", "predict", "tournaments", "buy", "transfer"] as const;

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    maxWidth: layout.taskFlowMaxWidth,
    marginInline: "auto",
    [mqMdUp]: {
      marginBlock: theme.spacing(4),
      padding: theme.spacing(4),
      backgroundColor: t.surface,
      border: `1px solid ${t.outlineSubtle}`,
      borderRadius: radii.lg,
    },
  };
});

const List = styled("ul")(({ theme }) => ({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: theme.spacing(1),
  "& li": { display: "flex", gap: theme.spacing(1), alignItems: "flex-start" },
}));

export function AccountStatusScreen({ next }: { next: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const { me } = useRequireUser();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const to = destination(next);

  useEffect(() => {
    if (!me) return;
    if (me.status !== "suspended") {
      router.replace(to);
      return;
    }
    writeJson("session", storageKeys.suspendedSeen, true);
    headingRef.current?.focus();
  }, [me, router, to]);

  return (
    <SignedInShell hideNav isStatusPage topBar={{ title: "", titleComponent: "p", leading: "brand" }}>
      <Box sx={{ ...gutterStyles, py: 3 }}>
        {me?.status !== "suspended" ? (
          <LoadingState variant="cards" rows={2} />
        ) : (
          <Card>
            <Stack spacing={3}>
              <div>
                <WarningIcon sx={{ fontSize: iconSize.lg, color: "tokens.warning", mb: 1 }} />
                <Typography ref={headingRef} tabIndex={-1} variant="h2" component="h1" sx={{ "&:focus": { outline: "none" } }}>
                  {t("account.suspended.title")}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {t("account.suspended.indefinite")}
                </Typography>
              </div>
              <section aria-labelledby="can-title">
                <Typography id="can-title" variant="h5" component="h2" sx={{ mb: 1 }}>
                  {t("account.suspended.canTitle")}
                </Typography>
                <List>
                  {CAN_STILL.map((key) => (
                    <li key={key}>
                      <SuccessIcon sx={{ fontSize: iconSize.md, color: "tokens.success", flex: "none" }} />
                      <Typography>{t(`account.suspended.can.${key}`)}</Typography>
                    </li>
                  ))}
                </List>
              </section>
              <section aria-labelledby="cannot-title">
                <Typography id="cannot-title" variant="h5" component="h2" sx={{ mb: 1 }}>
                  {t("account.suspended.cannotTitle")}
                </Typography>
                <List>
                  {CANNOT.map((key) => (
                    <li key={key}>
                      <CloseIcon sx={{ fontSize: iconSize.md, color: "text.secondary", flex: "none" }} />
                      <Typography>{t(`account.suspended.cannot.${key}`)}</Typography>
                    </li>
                  ))}
                </List>
              </section>
              <Typography color="text.secondary">
                {t("account.suspended.support", { channel: isolate(t("support.contact.channel")) })}
              </Typography>
              <Button variant="contained" size="large" fullWidth onClick={() => router.replace(to)}>
                {t("account.suspended.continue")}
              </Button>
            </Stack>
          </Card>
        )}
      </Box>
    </SignedInShell>
  );
}
