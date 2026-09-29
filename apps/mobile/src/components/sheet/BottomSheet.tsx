"use client";

import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import { styled, useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { layout, minTouchTarget, radii } from "@bg/design-tokens";
import { CloseIcon } from "@/components/icons";
import { useCloseOnBack } from "@/lib/useCloseOnBack";
import { safeInsetBottom } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Modal bottom sheet (patterns.md §1). sm: slides up from the bottom, content height up to 90 dvh,
// sticky footer in the thumb zone. md/lg: a centered dialog, max 480 px. Panel-type content
// (move history, reactions, pool) is laid out as a side panel by the screen, not by this component.
//
// Focus: moves to the title on open, returns to the trigger on close; trapped while open.
// Dismiss: drag down, scrim, Escape, back, close button — all disabled while `dismissible` is false.
// Footer: sticky below the scrolling body by default; `footerMode="inline"` keeps it in the flow
// after the content, so a money confirmation's primary can never cover its cost block or timing
// note (P§2.1; play.md PL-03; the same rule as TaskFlow on TR-03 and WD-04).

const Handle = styled("div")(({ theme }) => ({
  position: "absolute",
  insetBlockStart: theme.spacing(1),
  insetInline: 0,
  marginInline: "auto",
  width: layout.sheetHandle.width,
  height: layout.sheetHandle.height,
  borderRadius: radii.pill,
  backgroundColor: tokensOf(theme).outline,
}));

const Header = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  minHeight: `calc(${minTouchTarget}px + ${theme.spacing(2)})`,
  paddingBlockStart: theme.spacing(2),
  paddingBlockEnd: theme.spacing(0.5),
  paddingInlineStart: theme.spacing(2.5),
  paddingInlineEnd: theme.spacing(1),
  flex: "none",
}));

const Body = styled("div")(({ theme }) => ({
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingInline: theme.spacing(2.5),
  paddingBlock: theme.spacing(1, 2),
  // Components inside adapt to the sheet width, not the viewport (§11.7 container queries).
  containerType: "inline-size",
}));

const Footer = styled("div")(({ theme }) => ({
  flex: "none",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
  paddingInline: theme.spacing(2.5),
  paddingBlockStart: theme.spacing(1.5),
  borderBlockStart: `1px solid ${tokensOf(theme).outlineSubtle}`,
  containerType: "inline-size",
  // Inline: part of the scrolling body, after the content (the body supplies the side padding).
  "&[data-inline='true']": {
    paddingInline: 0,
    paddingBlockStart: theme.spacing(2),
    marginBlockStart: theme.spacing(1),
  },
}));

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Actions pinned below the scrolling body (primary first). */
  footer?: ReactNode;
  /** False while a request is in flight: nothing dismisses the sheet (patterns.md §1, §2.2). */
  dismissible?: boolean;
  hideCloseButton?: boolean;
  /** Push a history entry so back closes the sheet (ia.md §3.5). Default true. */
  closeOnBack?: boolean;
  /** Focus this element instead of the title on open (the safe option of a confirmation, P§3). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** `inline`: the footer follows the content inside the scrolling body (money confirmations). */
  footerMode?: "sticky" | "inline";
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  hideCloseButton = false,
  closeOnBack = true,
  initialFocusRef,
  footerMode = "sticky",
}: BottomSheetProps) {
  const t = useTranslations("common");
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useCloseOnBack(open, onClose, dismissible, closeOnBack);

  const requestClose = () => {
    if (dismissible) onClose();
  };
  const focusTitle = () => (initialFocusRef?.current ?? titleRef.current)?.focus();

  const content = (
    <>
      {!wide && <Handle aria-hidden />}
      <Header>
        <Typography
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          variant="h4"
          component="h2"
          sx={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", "&:focus": { outline: "none" } }}
        >
          {title}
        </Typography>
        {!hideCloseButton && (
          <IconButton onClick={requestClose} disabled={!dismissible} aria-label={t("close")}>
            <CloseIcon />
          </IconButton>
        )}
      </Header>
      <Body>
        {children}
        {footer && footerMode === "inline" && (
          <Footer data-inline="true">{footer}</Footer>
        )}
      </Body>
      {footer && footerMode === "sticky" && (
        <Footer
          sx={{
            paddingBlockEnd: wide ? 2.5 : `calc(${theme.spacing(2)} + ${safeInsetBottom})`,
          }}
        >
          {footer}
        </Footer>
      )}
      {(!footer || footerMode === "inline") && !wide && <div style={{ paddingBlockEnd: safeInsetBottom }} />}
    </>
  );

  if (wide) {
    return (
      <Dialog
        open={open}
        onClose={requestClose}
        disableEscapeKeyDown={!dismissible}
        aria-labelledby={titleId}
        slotProps={{
          transition: { onEntered: focusTitle },
          paper: { sx: { display: "flex", flexDirection: "column", maxWidth: layout.dialogMaxWidth } },
        }}
      >
        {content}
      </Dialog>
    );
  }

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={requestClose}
      onOpen={() => undefined}
      disableSwipeToOpen
      disableDiscovery
      disableEscapeKeyDown={!dismissible}
      // Nothing opens by swipe, so closed sheets need not stay in the DOM.
      ModalProps={{ keepMounted: false }}
      slotProps={{
        transition: { onEntered: focusTitle },
        paper: {
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": titleId,
          sx: { display: "flex", flexDirection: "column" },
        },
      }}
    >
      {content}
    </SwipeableDrawer>
  );
}
