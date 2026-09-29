"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { SceneLabels } from "@bg/game3d/scene";
import { useFormat } from "@/lib/useFormat";

/** Localized digits and the "Off" word for the 3D markers, drawn in the app's own font. */
export function useSceneLabels(): SceneLabels {
  const f = useFormat();
  const t = useTranslations("match.move");
  const [font, setFont] = useState("sans-serif");
  useEffect(() => {
    // Wait for the self-hosted font so the canvas labels use it, not a fallback.
    void document.fonts.ready.then(() => setFont(getComputedStyle(document.body).fontFamily || "sans-serif"));
  }, []);
  return useMemo(
    () => ({ digits: [1, 2, 3, 4, 5, 6].map((n) => f.number(n)), off: t("off"), font }),
    [f, t, font],
  );
}
