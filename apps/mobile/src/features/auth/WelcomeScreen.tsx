"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { layout, radii } from "@bg/design-tokens";
import { BoardArt } from "@/components/art/BoardArt";
import { OfflineBanner } from "@/components/feedback/StatusBanners";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { LanguageButton } from "@/components/i18n/LanguageControls";
import { AppShell } from "@/components/shell/AppShell";
import { TopBar } from "@/components/shell/TopBar";
import { useGuestOnly } from "@/lib/session";
import { gutterStyles, mqMdUp, safeInsetBottom } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// AU-01 Welcome `/` (auth.md §4). Guests choose between creating an account and logging in.
// Phones: static board art (≤ 40% of the height, no WebGL) above the name; both buttons, equal
// width, sit in the bottom 40%. md: art above a centered card. lg (and tall md landscape): art pane
// on the start side, card on the end side. Short landscape (< 500 px tall): no art.

const TWO_PANE = `@media (min-width: 1024px), (min-width: 600px) and (orientation: landscape) and (min-height: ${layout.compactHeight}px)`;
const SHORT = `@media (max-height: ${layout.compactHeight - 0.02}px)`;

const Body = styled("div")(({ theme }) => ({
  flex: "1 1 auto",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  ...gutterStyles,
  paddingBlockStart: theme.spacing(2),
  paddingBlockEnd: `calc(${theme.spacing(3)} + ${safeInsetBottom})`,
  [mqMdUp]: { alignItems: "center", justifyContent: "center", gap: theme.spacing(4), paddingBlock: theme.spacing(4) },
  [TWO_PANE]: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 480px)",
    columnGap: theme.spacing(6),
    alignItems: "center",
    justifyItems: "stretch",
  },
}));

const Hero = styled("div")(({ theme }) => ({
  flex: "1 1 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 0,
  paddingBlock: theme.spacing(2),
  // At most 40% of the height; the rest of the space goes above the buttons (thumb zone).
  "& svg": { maxHeight: "36dvh" },
  [mqMdUp]: { flex: "none", width: "100%", maxWidth: layout.dialogMaxWidth, maxHeight: "34dvh" },
  [TWO_PANE]: { maxWidth: "none", maxHeight: "72dvh", "& svg": { maxHeight: "68dvh" } },
  [SHORT]: { display: "none" },
}));

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(3),
    width: "100%",
    [mqMdUp]: {
      maxWidth: layout.dialogMaxWidth,
      padding: theme.spacing(4),
      backgroundColor: t.surface,
      border: `1px solid ${t.outlineSubtle}`,
      borderRadius: radii.lg,
    },
  };
});

export function WelcomeScreen() {
  const t = useTranslations();
  const ready = useGuestOnly(null);

  return (
    <AppShell
      hideNav
      topBar={<TopBar title="" titleComponent="p" leading="brand" actions={<LanguageButton />} />}
      banner={<OfflineBanner />}
    >
      {ready && (
        <Body>
          <Hero aria-hidden>
            <BoardArt />
          </Hero>
          <Card>
            <div>
              <Typography variant="h1" component="h1">
                {t("app.name")}
              </Typography>
              <Typography variant="bodyLarge" component="p" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("app.tagline")}
              </Typography>
            </div>
            <Stack spacing={1.5}>
              <Button variant="contained" size="large" fullWidth component={NextLink} href="/signup">
                {t("auth.welcome.signup")}
              </Button>
              <Button variant="outlined" size="large" fullWidth component={NextLink} href="/login">
                {t("auth.welcome.login")}
              </Button>
            </Stack>
            <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {t("auth.welcome.ageNote")}
              </Typography>
              <Stack direction="row" sx={{ flexWrap: "wrap", justifyContent: "center", columnGap: 1 }}>
                <StandaloneLink href="/terms">{t("auth.links.terms")}</StandaloneLink>
                <StandaloneLink href="/privacy">{t("auth.links.privacy")}</StandaloneLink>
              </Stack>
            </Stack>
          </Card>
        </Body>
      )}
    </AppShell>
  );
}

