"use client";

import Fade from "@mui/material/Fade";
import { styled, useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type FormEvent, type ReactNode, type RefObject } from "react";
import { layout } from "@bg/design-tokens";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { useFormat } from "@/lib/useFormat";
import { gutterStyles, mqMdUp, safeInsetBottom } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Frame of the wallet task flows (wallet.md §3.4, §3.6; patterns.md §1): no nav, no balance chip
// (the cost block shows the balance), a close (×) button, "Step n of N", and the step heading as
// the page's h1, focused whenever the step changes.
// - Phones: one column; the primary action sits in a sticky footer in the thumb zone when the
//   viewport is at least 600 px tall, and inline otherwise (landscape, keyboard open).
// - md/lg: a centered column, max 560 px, with the button at the end of the column.
// - Steps cross-fade (≤ 200 ms through the theme durations; none with reduced motion).

const TALL = "(min-height: 600px)";

const Column = styled("form")(({ theme }) => ({
  flex: "1 1 auto",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  minWidth: 0,
  maxWidth: layout.taskFlowMaxWidth,
  marginInline: "auto",
  ...gutterStyles,
  paddingBlockStart: theme.spacing(3),
  [mqMdUp]: { paddingBlockEnd: theme.spacing(4) },
}));

const Fields = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2.5),
  marginBlockStart: theme.spacing(3),
  // Recipient card, cost block, and bank card adapt to the column, not the viewport.
  containerType: "inline-size",
}));

const Footer = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1.5),
    marginBlockStart: "auto",
    paddingBlockStart: theme.spacing(3),
    paddingBlockEnd: `calc(${theme.spacing(2)} + ${safeInsetBottom})`,
    [`@media ${TALL} and (max-width: 599.98px)`]: {
      "&:not([data-inline='true'])": {
        position: "sticky",
      insetBlockEnd: 0,
        zIndex: 1,
        paddingBlockStart: theme.spacing(2),
        backgroundColor: t.background,
        borderBlockStart: `1px solid ${t.outlineSubtle}`,
        marginInline: `-${layout.gutter.sm}px`,
        paddingInline: `${layout.gutter.sm}px`,
      },
    },
    [`@media ${TALL} and (max-width: 359.98px)`]: {
      "&:not([data-inline='true'])": {
        marginInline: `-${layout.gutter.xs}px`,
        paddingInline: `${layout.gutter.xs}px`,
      },
    },
    [mqMdUp]: { paddingBlockEnd: 0 },
  };
});

export interface TaskFlowProps {
  /** Flow name in the top bar ("Send coins"). */
  flowTitle: string;
  /** Step heading, the page h1. */
  title: string;
  step?: { current: number; total: number };
  intro?: ReactNode;
  onClose: () => void;
  /** Close is unavailable while a request is in flight. */
  closeDisabled?: boolean;
  onSubmit?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Changes whenever the visible step changes (focus and fade). */
  stepKey: string | number;
  /** Replaces the form (TR-00, WD-01, receipts). */
  plain?: boolean;
  /**
   * `inline` keeps the footer in the document flow after the content (review steps, whose
   * password field and notes must not cover the cost block, P§2.1). Default `sticky` on tall phones.
   */
  footerMode?: "sticky" | "inline";
  /** Focus this element instead of the heading when the step appears (the SMS code field). */
  initialFocus?: RefObject<HTMLElement | null>;
}

export function TaskFlow({
  flowTitle,
  title,
  step,
  intro,
  onClose,
  closeDisabled = false,
  onSubmit,
  children,
  footer,
  stepKey,
  plain = false,
  footerMode = "sticky",
  initialFocus,
}: TaskFlowProps) {
  const t = useTranslations();
  const f = useFormat();
  const theme = useTheme();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    const target = initialFocus?.current;
    if (target) {
      // The heading is still announced through the page title of the step; the field gets focus.
      target.focus({ preventScroll: true });
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    // initialFocus is read once per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  return (
    <SignedInShell
      hideNav
      showBalance={false}
      topBar={{ title: flowTitle, titleComponent: "p", leading: "close", onNavigate: onClose, navDisabled: closeDisabled }}
    >
      <Fade in key={stepKey} appear timeout={theme.transitions.duration.shorter}>
        <Column
          noValidate
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSubmit?.();
          }}
          as={plain ? "div" : "form"}
        >
          {step && (
            <Typography variant="labelSmall" component="p" color="text.secondary" sx={{ mb: 0.5 }}>
              {t("wallet.flow.step", { current: f.number(step.current), total: f.number(step.total) })}
            </Typography>
          )}
          <Typography
            ref={headingRef}
            tabIndex={-1}
            variant="h2"
            component="h1"
            sx={{ overflowWrap: "anywhere", "&:focus, &:focus-visible": { outline: "none" } }}
          >
            {title}
          </Typography>
          {intro && (
            <Typography component="div" color="text.secondary" sx={{ mt: 1 }}>
              {intro}
            </Typography>
          )}
          <Fields>{children}</Fields>
          {footer && <Footer data-inline={footerMode === "inline" ? "true" : undefined}>{footer}</Footer>}
        </Column>
      </Fade>
    </SignedInShell>
  );
}
