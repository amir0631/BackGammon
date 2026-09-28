"use client";

import Typography from "@mui/material/Typography";
import type { ComponentType, ReactNode } from "react";
import { iconSize } from "@bg/design-tokens";
import { InfoIcon, type IconProps } from "@/components/icons";

// A secondary line with a leading icon: helper facts, notes, and reasons (P§2.5, P§13). The icon
// is decorative; the text carries the meaning.

export interface InfoLineProps {
  children: ReactNode;
  icon?: ComponentType<IconProps>;
  id?: string;
  /** `secondary` (default) for notes; `primary` for facts the user acts on. */
  tone?: "primary" | "secondary";
  component?: "p" | "div" | "li";
}

export function InfoLine({ children, icon: Icon = InfoIcon, id, tone = "secondary", component = "p" }: InfoLineProps) {
  return (
    <Typography
      id={id}
      variant="body2"
      component={component}
      color={tone === "secondary" ? "text.secondary" : "text.primary"}
      sx={{ display: "flex", gap: 0.75, alignItems: "flex-start", m: 0, minWidth: 0 }}
    >
      <Icon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
    </Typography>
  );
}
