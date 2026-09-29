"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactNode } from "react";
import { radii } from "@bg/design-tokens";
import {
  CloseIcon,
  ErrorIcon,
  InfoIcon,
  OfflineIcon,
  SuccessIcon,
  WarningIcon,
  type IconProps,
} from "@/components/icons";
import { tokensOf } from "@/theme/theme";

// Inline banner at the top of content (patterns.md §1): persistent status such as offline,
// "return to match", admin announcements. Icon + text, never color alone. Close button only for
// non-critical banners; status banners disappear when the status clears.

export type BannerSeverity = "info" | "success" | "warning" | "error" | "offline";

const icons: Record<BannerSeverity, ComponentType<IconProps>> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  offline: OfflineIcon,
};

const Root = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 2),
    paddingInlineEnd: theme.spacing(1),
    borderRadius: radii.md,
    containerType: "inline-size",
    "&[data-severity='info']": { backgroundColor: t.infoContainer, color: t.onInfoContainer },
    "&[data-severity='success']": { backgroundColor: t.successContainer, color: t.onSuccessContainer },
    "&[data-severity='warning']": { backgroundColor: t.warningContainer, color: t.onWarningContainer },
    "&[data-severity='error']": { backgroundColor: t.errorContainer, color: t.onErrorContainer },
    "&[data-severity='offline']": {
      backgroundColor: t.surfaceRaised,
      color: t.textPrimary,
      border: `1px solid ${t.outline}`,
    },
    "& .banner-body": {
      flex: "1 1 auto",
      minWidth: 0,
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: theme.spacing(1.5),
      rowGap: theme.spacing(0.5),
      paddingBlock: theme.spacing(0.25),
    },
    "& .banner-text": { flex: "1 1 14rem", minWidth: 0 },
    "& .banner-action": { color: "inherit", borderColor: "currentColor", flex: "none" },
  };
});

export interface BannerAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BannerProps {
  severity?: BannerSeverity;
  title?: string;
  children: ReactNode;
  action?: BannerAction;
  /** Renders a close button; omit for status banners that clear on their own. */
  onClose?: () => void;
  /** Accessible name of the close button (default "Close"). */
  closeLabel?: string;
  /** Icon override (e.g. a megaphone for announcements). */
  icon?: ComponentType<IconProps>;
}

export function Banner({ severity = "info", title, children, action, onClose, closeLabel, icon }: BannerProps) {
  const t = useTranslations("common");
  const Icon = icon ?? icons[severity];
  const assertive = severity === "error";

  return (
    <Root data-severity={severity} role={assertive ? "alert" : "status"}>
      <Icon sx={{ flex: "none", mt: 0.5 }} />
      <div className="banner-body">
        <div className="banner-text">
          {title && (
            <Typography variant="h5" component="p" sx={{ color: "inherit" }}>
              {title}
            </Typography>
          )}
          <Typography variant="body2" component="div" sx={{ color: "inherit" }}>
            {children}
          </Typography>
        </div>
        {action &&
          (action.href ? (
            <Button
              className="banner-action"
              variant="outlined"
              size="small"
              component={NextLink}
              href={action.href}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ) : (
            <Button className="banner-action" variant="outlined" size="small" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
      </div>
      {onClose && (
        <IconButton onClick={onClose} aria-label={closeLabel ?? t("close")} sx={{ color: "inherit", flex: "none", mt: -0.5 }}>
          <CloseIcon />
        </IconButton>
      )}
    </Root>
  );
}
