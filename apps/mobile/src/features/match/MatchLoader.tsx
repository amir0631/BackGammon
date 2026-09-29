"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { zIndex } from "@bg/design-tokens";
import { LoadingState } from "@/components/states/LoadingState";
import { safeInsetTop } from "@/theme/layout";
import { useReducedMotion } from "@/theme/motion";

// MA-01 3D loading (match.md §4): determinate progress over the whole screen with the match summary
// header, rotating tips (static under reduced motion), the slow state after 10 s without progress,
// and Cancel. Loads under 300 ms show nothing. The scene is procedural, so the download is the
// engine chunk and the Rapier WASM; progress advances by stage (engine, physics, scene, state).

const SHOW_AFTER_MS = 300;
const TIP_MS = 5000;
const OPPONENT_WAITING_MS = 10_000;
const TIPS = ["undo", "lite", "fairDice"] as const;
/** Percent reached at each stage: engine loading, physics loading, building the scene, waiting for the state. */
const STAGE_PERCENT = [8, 55, 85, 96];

export function MatchLoader({
  header,
  stage,
  fresh,
  onCancel,
  onRetry,
}: {
  header: ReactNode;
  stage: 0 | 1 | 2 | 3;
  fresh: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("match.loading");
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [tip, setTip] = useState(0);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const opp = window.setTimeout(() => setWaiting(true), OPPONENT_WAITING_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(opp);
    };
  }, []);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTip((n) => (n + 1) % TIPS.length), TIP_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  if (!visible) return null;
  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: zIndex.modal - 1,
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        px: 2,
        paddingBlockStart: safeInsetTop,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: "28rem", display: "grid", gap: 1, justifyItems: "center", textAlign: "center" }}>{header}</Box>
      <LoadingState variant="progress" value={STAGE_PERCENT[stage]!} label={t("title")} onCancel={onCancel} onRetry={onRetry} />
      {fresh && waiting && (
        <Typography variant="body2" role="status">
          {t("opponentWaiting")}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "28rem", textAlign: "center" }}>
        {t(`tip.${TIPS[tip]!}`)}
      </Typography>
    </Box>
  );
}
