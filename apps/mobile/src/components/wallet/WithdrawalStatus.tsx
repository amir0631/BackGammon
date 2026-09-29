"use client";

import Chip from "@mui/material/Chip";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactNode } from "react";
import { iconSize, space } from "@bg/design-tokens";
import type { WithdrawalStatus } from "@bg/protocol";
import { CloseIcon, ErrorIcon, PendingIcon, SuccessIcon, type IconProps, DotIcon } from "@/components/icons";
import { tokensOf } from "@/theme/theme";

// Withdrawal status chip and timeline (wallet.md WD-06, WD-07; P§6.2, P§13). Icon + text on every
// status; color is secondary. The timeline is an ordered list that mirrors in RTL.

const STATUS_ICON: Record<WithdrawalStatus, ComponentType<IconProps>> = {
  pending: PendingIcon,
  paid: SuccessIcon,
  rejected: ErrorIcon,
  cancelled: CloseIcon,
};

const STATUS_COLOR: Record<WithdrawalStatus, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  paid: "success",
  rejected: "error",
  cancelled: "default",
};

export function WithdrawalStatusChip({ status }: { status: WithdrawalStatus }) {
  const t = useTranslations("withdrawals.status");
  const Icon = STATUS_ICON[status];
  return (
    <Chip
      size="small"
      variant="outlined"
      color={STATUS_COLOR[status]}
      icon={<Icon sx={{ fontSize: iconSize.sm }} />}
      label={t(status)}
      sx={{ flex: "none", alignSelf: "flex-start", maxWidth: "100%", "& .MuiChip-label": { whiteSpace: "normal" }, height: "auto", py: 0.5 }}
    />
  );
}

const List = styled("ol")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    "& > li": {
      position: "relative",
      display: "flex",
      gap: theme.spacing(1.5),
      paddingBlockEnd: theme.spacing(2),
    },
    // Connector between steps on the start side.
    "& > li:not(:last-child)::before": {
      content: '""',
      position: "absolute",
      insetInlineStart: `${iconSize.md / 2 - space.xxs / 2}px`,
      insetBlockStart: iconSize.md + space.xs,
      insetBlockEnd: space.xs,
      width: space.xxs,
      backgroundColor: t.outlineSubtle,
    },
    "& .tl-icon": { flex: "none", fontSize: iconSize.md },
    "& [data-state='done'] .tl-icon": { color: t.success },
    "& [data-state='current'] .tl-icon": { color: t.warning },
    "& [data-state='stopped'] .tl-icon": { color: t.error },
    "& [data-state='neutral'] .tl-icon": { color: t.textSecondary },
    "& [data-state='passed'] .tl-icon": { color: t.textSecondary },
  };
});

export interface TimelineStep {
  key: string;
  label: string;
  detail?: ReactNode;
  /** `passed`: a step that was left behind without succeeding (waiting, then rejected or cancelled). */
  state: "done" | "current" | "stopped" | "neutral" | "passed";
}

const STEP_ICON: Record<TimelineStep["state"], ComponentType<IconProps>> = {
  done: SuccessIcon,
  current: PendingIcon,
  stopped: ErrorIcon,
  neutral: CloseIcon,
  passed: DotIcon,
};

export function WithdrawalTimeline({ steps, label }: { steps: TimelineStep[]; label: string }) {
  return (
    <List aria-label={label}>
      {steps.map((s) => {
        const Icon = STEP_ICON[s.state];
        return (
          <li key={s.key} data-state={s.state}>
            <Icon className="tl-icon" />
            <div style={{ minWidth: 0 }}>
              <Typography variant="body1" component="p" sx={{ fontWeight: 600 }}>
                {s.label}
              </Typography>
              {s.detail && (
                <Typography variant="body2" color="text.secondary" component="div">
                  {s.detail}
                </Typography>
              )}
            </div>
          </li>
        );
      })}
    </List>
  );
}
