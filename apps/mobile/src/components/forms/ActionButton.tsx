"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useId, type MouseEvent } from "react";
import { iconSize } from "@bg/design-tokens";
import { InfoIcon } from "@/components/icons";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Primary action with an explained disabled state (auth.md §8, patterns.md §2.2):
// - `disabledReason`: the button stays focusable with aria-disabled="true", and the reason is
//   visible text linked by aria-describedby. Activating it does nothing but `onBlockedClick`
//   (screens use it to reveal field errors and move focus to the first one).
// - `loading`: in-button spinner; the label is kept, and `loadingLabel` is announced instead.
//   Repeat activations are ignored while loading.

export type ActionButtonProps = Omit<ButtonProps, "disabled"> & {
  disabledReason?: string | null;
  /** Blocked, with the reason shown elsewhere (e.g. an action error above): id of that element. */
  blockedBy?: string | null;
  onBlockedClick?: () => void;
  loading?: boolean;
  loadingLabel?: string;
};

export function ActionButton({
  disabledReason,
  blockedBy,
  onBlockedClick,
  loading = false,
  loadingLabel,
  onClick,
  children,
  sx,
  variant = "contained",
  size = "large",
  fullWidth = true,
  ...rest
}: ActionButtonProps) {
  const reasonId = useId();
  const blocked = Boolean(disabledReason) || Boolean(blockedBy);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    if (blocked) {
      event.preventDefault();
      onBlockedClick?.();
      return;
    }
    onClick?.(event);
  };

  return (
    <div>
      <Button
        {...rest}
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        loading={loading}
        onClick={handleClick}
        aria-disabled={blocked || undefined}
        aria-busy={loading || undefined}
        aria-describedby={disabledReason ? reasonId : (blockedBy ?? rest["aria-describedby"])}
        sx={[
          (theme) =>
            blocked
              ? {
                  // Looks disabled, stays focusable (not the `disabled` attribute).
                  "&, &:hover": {
                    backgroundColor: variant === "contained" ? theme.vars?.palette.action.disabledBackground : "transparent",
                    color: tokensOf(theme).textDisabled,
                    borderColor: tokensOf(theme).outlineSubtle,
                    cursor: "not-allowed",
                  },
                }
              : {},
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
        {loading && loadingLabel && <span style={visuallyHidden}>{loadingLabel}</span>}
      </Button>
      {disabledReason && (
        <Typography
          id={reasonId}
          variant="caption"
          component="p"
          color="text.secondary"
          sx={{ display: "flex", gap: 0.75, alignItems: "flex-start", mt: 1 }}
        >
          <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
          <span>{disabledReason}</span>
        </Typography>
      )}
    </div>
  );
}
