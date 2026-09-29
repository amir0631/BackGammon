"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { iconSize } from "@bg/design-tokens";
import { CheckIcon, type IconProps } from "@/components/icons";
import { AddSquareIcon, InstallIcon, ShareIcon } from "@/components/icons/extra";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { useFormat } from "@/lib/useFormat";
import type { InstallPlatform } from "@bg/api-client";

// Install guide sheet (CLAUDE.md §11.5; screen-inventory SY-05): the iOS Safari steps (Share →
// Add to Home Screen), a browser-menu hint where no prompt was captured, or "installed".

function Step({ n, icon: Icon, children }: { n: number; icon: ComponentType<IconProps>; children: string }) {
  const f = useFormat();
  return (
    <Stack component="li" direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Typography variant="label" component="span" aria-hidden sx={{ minWidth: "1.5em", textAlign: "center" }}>
        {f.number(n)}
      </Typography>
      <Icon sx={{ fontSize: iconSize.md, flex: "none" }} />
      <Typography variant="body1" component="span">
        {children}
      </Typography>
    </Stack>
  );
}

export function InstallSheet({ open, onClose, platform }: { open: boolean; onClose: () => void; platform: InstallPlatform }) {
  const t = useTranslations("install");
  const tc = useTranslations("common");
  const title = platform === "ios" ? t("ios.title") : t("sheet.title");
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <Stack spacing={2}>
        {platform === "ios" ? (
          <Stack component="ol" spacing={1.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
            <Step n={1} icon={ShareIcon}>{t("ios.step1")}</Step>
            <Step n={2} icon={AddSquareIcon}>{t("ios.step2")}</Step>
            <Step n={3} icon={InstallIcon}>{t("ios.step3")}</Step>
          </Stack>
        ) : platform === "installed" ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <CheckIcon sx={{ fontSize: iconSize.md }} />
            <Typography>{t("installed")}</Typography>
          </Stack>
        ) : (
          <Typography>{t("manual.body")}</Typography>
        )}
        <Button variant="outlined" onClick={onClose}>
          {tc("close")}
        </Button>
      </Stack>
    </BottomSheet>
  );
}
