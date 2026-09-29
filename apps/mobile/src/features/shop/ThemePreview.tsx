"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { breakpoints, radii } from "@bg/design-tokens";
import { initialPosition } from "@bg/game-core/src/position";
import type { ShopItem } from "@bg/protocol";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { LoadingState } from "@/components/states/LoadingState";
import { InfoLine } from "@/components/wallet/InfoLine";
import { usePrefs } from "@/lib/prefs";
import { supportsWebGL2 } from "@/lib/webgl";
import { useReducedMotion } from "@/theme/motion";
import { BoardStage, loadScene } from "../match/BoardStage";
import { useSceneLabels } from "../match/useSceneLabels";
import { ItemThumb } from "./ItemCard";

// SH-03 3D preview for board and checker themes (shop.md §3.2 steps 2–3): the opening position,
// static camera as in the match, no dice, no input. The 2D thumbnail shows first; the engine chunk
// loads on demand with a progress bar (stage-based: the API has no asset size yet, §10 Q3). No 3D
// without WebGL2; on Save-Data the preview waits for a tap. Lite mode and reduced motion apply.
// md/lg offer a portrait / landscape framing toggle.

const STAGE_PERCENT = [15, 70, 100];

function saveData(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return Boolean(nav.connection?.saveData);
}

export function ThemePreview({ item, name, equipped }: { item: ShopItem; name: string; equipped: { board_theme: string; checker_theme: string } | null }) {
  const t = useTranslations("shop.preview");
  const { prefs } = usePrefs();
  const reduced = useReducedMotion();
  const labels = useSceneLabels();
  const wide = useMediaQuery(`(min-width: ${breakpoints.md}px)`);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [wanted, setWanted] = useState(false);
  const [engine, setEngine] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ready, setReady] = useState(false);
  const [framing, setFraming] = useState<"portrait" | "landscape">("portrait");

  useEffect(() => {
    setWebgl(supportsWebGL2());
    setWanted(!saveData());
  }, []);

  const start = () => {
    setEngine("loading");
    loadScene()
      .then(() => setEngine("ready"))
      .catch(() => setEngine("error"));
  };
  useEffect(() => {
    if (webgl && wanted && engine === "idle") start();
    // Start once when allowed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, wanted]);

  const board = item.kind === "board_theme" ? item.key : (equipped?.board_theme ?? "default");
  const checkers: [string, string] = [item.kind === "checker_theme" ? item.key : (equipped?.checker_theme ?? "default"), "default"];
  const landscape = wide && framing === "landscape";

  if (webgl === false) {
    return (
      <Stack spacing={1}>
        <ItemThumb item={item} large />
        <InfoLine>{t("no3d")}</InfoLine>
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5}>
      {wide && (
        <ChoiceGroup
          legend={t("framing")}
          layout="chips"
          value={framing}
          onChange={setFraming}
          options={[
            { value: "portrait", label: t("portrait") },
            { value: "landscape", label: t("landscape") },
          ]}
        />
      )}
      <Box
        role="img"
        aria-label={t("a11y", { name })}
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: landscape ? 640 : 480,
          mx: "auto",
          aspectRatio: landscape ? "16 / 10" : "3 / 4",
          maxHeight: "60svh",
          borderRadius: `${radii.lg}px`,
          overflow: "hidden",
          bgcolor: "tokens.surfaceSunken",
        }}
      >
        {!ready && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
            <Box sx={{ width: "100%", maxWidth: 320 }}>
              <ItemThumb item={item} large />
            </Box>
          </Box>
        )}
        {engine === "ready" && (
          <Box sx={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, transition: reduced ? "none" : "opacity 200ms ease-out" }}>
            <BoardStage
              label={t("a11y", { name })}
              position={initialPosition()}
              perspective={0}
              lite={prefs.graphics_lite}
              reducedMotion={reduced}
              dice={null}
              input={null}
              lastMove={null}
              moveHint={null}
              snapKey={0}
              labels={labels}
              themes={{ board, checkers }}
              onReady={() => setReady(true)}
            />
          </Box>
        )}
      </Box>
      {!wanted && engine === "idle" && (
        <Button variant="outlined" onClick={() => setWanted(true)} sx={{ alignSelf: "flex-start" }}>
          {t("load")}
        </Button>
      )}
      {engine === "loading" || (engine === "ready" && !ready) ? (
        <LoadingState variant="progress" value={STAGE_PERCENT[engine === "loading" ? 0 : 1]!} label={t("loading")} onRetry={() => window.location.reload()} />
      ) : null}
      {engine === "error" && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} role="alert">
          <Typography variant="body2">{t("error")}</Typography>
          <Button size="small" variant="outlined" onClick={start}>
            <RetryLabel />
          </Button>
        </Stack>
      )}
      {item.kind === "checker_theme" && <InfoLine>{t("opponentCheckers")}</InfoLine>}
    </Stack>
  );
}

function RetryLabel() {
  const t = useTranslations("common");
  return <>{t("retry")}</>;
}
