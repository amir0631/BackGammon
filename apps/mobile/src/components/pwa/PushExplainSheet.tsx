"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { pushOfferable, subscribePush } from "@bg/api-client";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { isStandalone, swRegistration } from "@/lib/pwa";
import { readJson, writeJson } from "@/lib/storage";

// TO-07 push explanation sheet (CLAUDE.md §11.5; patterns.md §15; tournaments.md §3.3 step 4).
// The browser prompt appears only after "Allow"; "Not now" asks nothing. Used by the Settings
// switch and, once per account, after the first tournament registration (review TO-03).

export type PushOutcome = "on" | "off" | "denied" | "unsupported" | "disabled" | "failed";

const askedKey = (account: string) => `bg.push.offered.${account}`;

/** Whether to open the sheet after a first registration; marks the account as asked when true. */
export async function offerPushOnce(account: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const asked = readJson<boolean>("local", askedKey(account)) === true;
  const permission = typeof Notification === "undefined" ? null : Notification.permission;
  if (asked || permission !== "default") return false;
  const reg = await swRegistration();
  const ok = pushOfferable({
    asked,
    permission,
    pushManager: Boolean(reg && "pushManager" in reg),
    standalone: isStandalone(),
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  if (ok) writeJson("local", askedKey(account), true);
  return ok;
}

export default function PushExplainSheet({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult?: (outcome: PushOutcome) => void }) {
  const t = useTranslations("notifications");
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    let outcome: PushOutcome;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") outcome = permission === "denied" ? "denied" : "off";
      else {
        const reg = await swRegistration();
        if (!reg) outcome = "unsupported";
        else {
          const result = await subscribePush(reg);
          outcome = result === "subscribed" ? "on" : result;
        }
      }
    } catch {
      outcome = "failed";
    }
    setBusy(false);
    onResult?.(outcome);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={() => !busy && onClose()} dismissible={!busy} title={t("sheet.title")}>
      <Stack spacing={2}>
        <Typography>{t("sheet.body")}</Typography>
        <Button variant="contained" size="large" loading={busy} onClick={() => void enable()}>
          {t("sheet.allow")}
        </Button>
        <Button variant="text" onClick={onClose} disabled={busy}>
          {t("sheet.notNow")}
        </Button>
      </Stack>
    </BottomSheet>
  );
}
