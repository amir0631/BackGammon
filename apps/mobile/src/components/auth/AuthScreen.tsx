"use client";

import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { layout, radii } from "@bg/design-tokens";
import { BoardArt } from "@/components/art/BoardArt";
import { OfflineBanner } from "@/components/feedback/StatusBanners";
import { LanguageButton } from "@/components/i18n/LanguageControls";
import { AppShell } from "@/components/shell/AppShell";
import { TopBar } from "@/components/shell/TopBar";
import { useFormat } from "@/lib/useFormat";
import { gutterStyles, mqMdUp, safeInsetBottom } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Layout of every auth step (auth.md §4 common layout, §6.1):
// - No bottom nav, no balance chip. Top bar: back on steps 2+ (or the app logo), language button.
// - Phones: one column. The primary action sits in a sticky footer when the viewport is at least
//   600 px tall; shorter viewports (landscape, keyboard) keep it inline after the last field so it
//   never covers the focused input.
// - md: a centered card, max 480. lg, and md landscape taller than 500 px: a decorative art pane on
//   the start side and the card on the end side.
// The step heading is the page's h1 and takes focus on load (auth.md §8).

const TALL = "(min-height: 600px)";
const TWO_PANE = `@media (min-width: 1024px), (min-width: 600px) and (orientation: landscape) and (min-height: ${layout.compactHeight}px)`;

const Body = styled("div")(({ theme }) => ({
  flex: "1 1 auto",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  [mqMdUp]: {
    display: "grid",
    placeItems: "center",
    padding: theme.spacing(3),
  },
  [TWO_PANE]: {
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 480px)",
    columnGap: theme.spacing(6),
    paddingInline: theme.spacing(4),
    alignItems: "center",
  },
}));

const ArtPane = styled("div")(({ theme }) => ({
  display: "none",
  [TWO_PANE]: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    maxHeight: "80dvh",
    padding: theme.spacing(2),
  },
}));

const Card = styled("form")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
    ...gutterStyles,
    paddingBlockStart: theme.spacing(3),
    [mqMdUp]: {
      flex: "none",
      maxWidth: layout.dialogMaxWidth,
      padding: theme.spacing(4),
      backgroundColor: t.surface,
      border: `1px solid ${t.outlineSubtle}`,
      borderRadius: radii.lg,
    },
  };
});

const Fields = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2.5),
  marginBlockStart: theme.spacing(3),
}));

const Footer = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1.5),
    marginBlockStart: "auto",
    paddingBlock: theme.spacing(2),
    paddingBlockEnd: `calc(${theme.spacing(2)} + ${safeInsetBottom})`,
    // Phones with room: pin the action to the bottom of the viewport (thumb zone).
    [`@media ${TALL} and (max-width: 599.98px)`]: {
      position: "sticky",
      insetBlockEnd: 0,
      zIndex: 1,
      backgroundColor: t.background,
      borderBlockStart: `1px solid ${t.outlineSubtle}`,
      marginInline: `-${layout.gutter.sm}px`,
      paddingInline: `${layout.gutter.sm}px`,
    },
    [`@media ${TALL} and (max-width: 359.98px)`]: {
      marginInline: `-${layout.gutter.xs}px`,
      paddingInline: `${layout.gutter.xs}px`,
    },
    [mqMdUp]: { paddingBlockEnd: 0, marginBlockStart: theme.spacing(3) },
  };
});

export interface AuthScreenProps {
  /** Page heading (h1). */
  title: string;
  /** "Step N of M" ("Step N" while the total is unknown); omitted outside the numbered steps. */
  step?: { current: number; total?: number };
  intro?: ReactNode;
  /** Back target on steps 2+; omit to show the app logo instead. */
  backHref?: string;
  onBack?: () => void;
  /** Form fields and inline content. */
  children: ReactNode;
  /** Primary action and secondary links. */
  footer?: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Focus the heading on load (default). Screens that focus a field instead pass false. */
  focusHeading?: boolean;
  /** Replaces the whole form (the banned panel, auth.md AU-14). */
  replaceWith?: ReactNode;
  /** While the session is unknown: render the frame only, so no form flashes (auth.md §2). */
  pending?: boolean;
  /** Id for the h1, so a control group can be labelled by it. */
  headingId?: string;
}

export function AuthScreen({
  title,
  step,
  intro,
  backHref,
  onBack,
  children,
  footer,
  onSubmit,
  focusHeading = true,
  replaceWith,
  pending = false,
  headingId,
}: AuthScreenProps) {
  const t = useTranslations();
  const f = useFormat();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasBack = Boolean(backHref || onBack);

  useEffect(() => {
    if (focusHeading && !pending) headingRef.current?.focus({ preventScroll: true });
  }, [focusHeading, pending]);

  return (
    <AppShell
      hideNav
      topBar={
        <TopBar
          title={hasBack ? "" : t("app.name")}
          titleComponent="p"
          leading={hasBack ? "back" : "brand"}
          href={backHref}
          onNavigate={onBack}
          actions={<LanguageButton />}
        />
      }
      banner={<OfflineBanner />}
    >
      <Body>
        <ArtPane aria-hidden>
          <BoardArt />
        </ArtPane>
        {pending ? null : replaceWith ?? (
          <Card
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.(event);
            }}
          >
            {step && (
              <Typography variant="labelSmall" component="p" color="text.secondary" sx={{ mb: 0.5 }}>
                {step.total
                  ? t("auth.step", { current: f.number(step.current), total: f.number(step.total) })
                  : t("auth.stepNoTotal", { current: f.number(step.current) })}
              </Typography>
            )}
            <Typography
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              variant="h2"
              component="h1"
              sx={{ "&:focus": { outline: "none" }, "&:focus-visible": { outline: "none" } }}
            >
              {title}
            </Typography>
            {intro && (
              <Typography component="div" color="text.secondary" sx={{ mt: 1 }}>
                {intro}
              </Typography>
            )}
            <Fields>{children}</Fields>
            {footer && <Footer>{footer}</Footer>}
          </Card>
        )}
      </Body>
    </AppShell>
  );
}

/** Wrapper for `replaceWith` content so it sits where the form card would. */
export const AuthPanel = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    ...gutterStyles,
    paddingBlock: theme.spacing(3),
    [mqMdUp]: {
      maxWidth: layout.dialogMaxWidth,
      padding: theme.spacing(4),
      backgroundColor: t.surface,
      border: `1px solid ${t.outlineSubtle}`,
      borderRadius: radii.lg,
    },
  };
});
