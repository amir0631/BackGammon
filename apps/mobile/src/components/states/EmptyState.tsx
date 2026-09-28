"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { Illustration } from "./Illustration";

// Empty state (patterns.md §5): small decorative illustration, one sentence, at most one action.
// Neutral copy only; no guilt, no pressure.

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  message: string;
  action?: EmptyStateAction;
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 4, px: 2 }}>
      <Illustration kind="empty" />
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: "32rem" }}>
        {message}
      </Typography>
      {action &&
        (action.href ? (
          <Button variant="outlined" component={NextLink} href={action.href}>
            {action.label}
          </Button>
        ) : (
          <Button variant="outlined" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </Stack>
  );
}
