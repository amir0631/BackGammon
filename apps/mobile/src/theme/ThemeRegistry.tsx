"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultColorMode, type Script } from "@bg/design-tokens";
import { ToastProvider } from "@/components/feedback/Toast";
import { MotionProvider, usePrefersReducedMotion } from "./motion";
import { EmotionRegistry } from "./EmotionRegistry";
import { createAppTheme } from "./theme";

export interface ThemeRegistryProps {
  direction: "rtl" | "ltr";
  script: Script;
  /** The user's `animations.reduced` setting, when known (CLAUDE.md §11.6). */
  reducedMotionSetting?: boolean;
  children: ReactNode;
}

export function ThemeRegistry({ direction, script, reducedMotionSetting = false, children }: ThemeRegistryProps) {
  const prefersReduced = usePrefersReducedMotion();
  const [setting, setSetting] = useState(reducedMotionSetting);
  useEffect(() => setSetting(reducedMotionSetting), [reducedMotionSetting]);
  const reducedMotion = setting || prefersReduced;

  const theme = useMemo(
    () => createAppTheme({ direction, script, reducedMotion }),
    [direction, script, reducedMotion],
  );

  // Separate Emotion caches per direction so RTL-flipped styles never leak into LTR; both stay
  // alive so a runtime language switch keeps the React tree.
  return (
    <EmotionRegistry direction={direction}>
      <ThemeProvider theme={theme} defaultMode={defaultColorMode} modeStorageKey="bg-color-mode">
        <CssBaseline enableColorScheme />
        <MotionProvider reduced={reducedMotion} setting={setting} setSetting={setSetting}>
          <ToastProvider>{children}</ToastProvider>
        </MotionProvider>
      </ThemeProvider>
    </EmotionRegistry>
  );
}
