"use client";

import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { feedbackTiming, radii } from "@bg/design-tokens";
import { useFormat } from "@/lib/useFormat";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Loading patterns (patterns.md §6.1).
// - list / cards: skeletons shaped like the content (no spinners for lists).
// - progress: determinate bar with percent, a detail line (size remaining), and Cancel; after
//   10 s without progress, "This is taking longer than usual" with Retry / Cancel.

const Row = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1.5),
  paddingBlock: theme.spacing(1.5),
  borderBlockEnd: `1px solid ${tokensOf(theme).outlineSubtle}`,
}));

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <Row key={i}>
          <Skeleton variant="circular" width="2.5rem" height="2.5rem" sx={{ flex: "none" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" width="60%" sx={{ typography: "body1" }} />
            <Skeleton variant="text" width="35%" sx={{ typography: "body2" }} />
          </div>
        </Row>
      ))}
    </div>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <Stack spacing={1.5}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rectangular" height="6rem" sx={{ borderRadius: `${radii.lg}px` }} />
      ))}
    </Stack>
  );
}

export interface ProgressProps {
  /** 0–100 */
  value: number;
  label: string;
  /** e.g. "3.2 MB remaining", already localized. */
  detail?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}

function Progress({ value, label, detail, onCancel, onRetry }: ProgressProps) {
  const t = useTranslations("common");
  const f = useFormat();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    setStalled(false);
    const timer = window.setTimeout(() => setStalled(true), feedbackTiming.slowRequestMs);
    return () => window.clearTimeout(timer);
  }, [value]);

  const labelId = useId();
  const percent = f.percent(Math.max(0, Math.min(100, value)) / 100);

  return (
    <Stack spacing={1.5} sx={{ width: "100%", maxWidth: "28rem", mx: "auto", py: 4, px: 2 }}>
      <Typography variant="h4" component="p" id={labelId}>
        {label}
      </Typography>
      <LinearProgress variant="determinate" value={value} aria-labelledby={labelId} />
      <Stack direction="row" sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="body2">{t("loadingProgress", { percent })}</Typography>
        {detail && (
          <Typography variant="body2" color="text.secondary">
            {detail}
          </Typography>
        )}
      </Stack>
      {stalled && (
        <Typography variant="body2" role="status">
          {t("loadingSlow")}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {stalled && onRetry && (
          <Button variant="contained" onClick={onRetry}>
            {t("retry")}
          </Button>
        )}
        {onCancel && (
          <Button variant="text" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

export type LoadingStateProps =
  | { variant: "list"; rows?: number }
  | { variant: "cards"; rows?: number }
  | ({ variant: "progress" } & ProgressProps);

export function LoadingState(props: LoadingStateProps) {
  const t = useTranslations("common");
  if (props.variant === "progress") return <Progress {...props} />;
  return (
    <div aria-busy="true">
      <span role="status" style={visuallyHidden}>
        {t("loading")}
      </span>
      <div aria-hidden>
        {props.variant === "list" ? <ListSkeleton rows={props.rows ?? 5} /> : <CardSkeleton rows={props.rows ?? 3} />}
      </div>
    </div>
  );
}
