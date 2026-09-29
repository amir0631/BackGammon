"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { subscribePush, unsubscribePush } from "@bg/api-client";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { swRegistration } from "@/lib/pwa";

// Web Push opt-in (CLAUDE.md §11.5; patterns.md §15; screen-inventory TO-07): asked only after the
// user turns the switch on, with an explanation sheet first; the browser prompt appears only on
// "Allow". Your-turn and tournament-start alerts; iOS only inside the installed app.

type Status = "checking" | "unsupported" | "denied" | "off" | "on";
type Note = "denied" | "unsupported" | "disabled" | "failed" | "on" | null;

export function NotificationsSetting() {
  const t = useTranslations("notifications");
  const [status, setStatus] = useState<Status>("checking");
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (typeof Notification === "undefined") return setStatus("unsupported");
      const reg = await swRegistration();
      if (!alive) return;
      if (!reg || !("pushManager" in reg)) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (alive) setStatus(sub && Notification.permission === "granted" ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        setNote(permission === "denied" ? "denied" : null);
        return;
      }
      const reg = await swRegistration();
      if (!reg) {
        setStatus("unsupported");
        return;
      }
      const result = await subscribePush(reg);
      if (result === "subscribed") {
        setStatus("on");
        setNote("on");
      } else setNote(result === "denied" ? "denied" : result === "disabled" ? "disabled" : "unsupported");
    } catch {
      setNote("failed");
    } finally {
      setBusy(false);
      setSheet(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await swRegistration();
      if (reg) await unsubscribePush(reg);
      setStatus("off");
      setNote(null);
    } catch {
      setNote("failed");
    } finally {
      setBusy(false);
    }
  };

  const noteText =
    status === "unsupported" ? t("unsupported") : status === "denied" ? t("denied") : note && note !== "on" ? t(note) : note === "on" ? t("on") : undefined;

  return (
    <>
      <SwitchRow
        label={t("label")}
        description={t("desc")}
        checked={status === "on"}
        disabled={busy || status === "checking" || status === "unsupported" || status === "denied"}
        onChange={(v) => {
          if (v) setSheet(true);
          else void disable();
        }}
        note={noteText}
      />
      <BottomSheet open={sheet} onClose={() => !busy && setSheet(false)} dismissible={!busy} title={t("sheet.title")}>
        <Stack spacing={2}>
          <Typography>{t("sheet.body")}</Typography>
          <Button variant="contained" size="large" loading={busy} onClick={() => void enable()}>
            {t("sheet.allow")}
          </Button>
          <Button variant="text" onClick={() => setSheet(false)} disabled={busy}>
            {t("sheet.notNow")}
          </Button>
        </Stack>
      </BottomSheet>
    </>
  );
}
