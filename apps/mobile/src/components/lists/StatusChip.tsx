"use client";

import { styled } from "@mui/material/styles";
import type { ComponentType, ReactNode } from "react";
import { iconSize, radii } from "@bg/design-tokens";
import type { IconProps } from "@/components/icons";
import { tokensOf } from "@/theme/theme";

// Status chip: icon plus text, never color alone (patterns.md §13). Not interactive; a 3:1 border
// carries the boundary. Tones map to token roles; "neutral" is the default.

const Root = styled("span")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    minHeight: 28,
    maxWidth: "100%",
    paddingInline: theme.spacing(1),
    paddingBlock: theme.spacing(0.25),
    borderRadius: radii.pill,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    color: t.textPrimary,
    ...theme.typography.labelSmall,
    "& > svg": { flex: "none" },
    "& > .chip-text": { minWidth: 0, overflowWrap: "anywhere" },
    "&[data-tone='primary']": { borderColor: t.primary, color: t.primary },
    "&[data-tone='success']": { borderColor: t.success, color: t.success },
    "&[data-tone='warning']": { borderColor: t.warning, color: t.warning },
    "&[data-tone='info']": { borderColor: t.info, color: t.info },
  };
});

export interface StatusChipProps {
  icon?: ComponentType<IconProps>;
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "info";
  /** Read as this instead of the visible text (e.g. "12 watching" for an eye and a number). */
  label?: string;
}

export function StatusChip({ icon: Icon, children, tone = "neutral", label }: StatusChipProps) {
  return (
    <Root data-tone={tone} role={label ? "img" : undefined} aria-label={label}>
      {Icon && <Icon sx={{ fontSize: iconSize.sm }} aria-hidden />}
      <span className="chip-text" aria-hidden={label ? true : undefined}>
        {children}
      </span>
    </Root>
  );
}
