"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { unsubscribePush } from "@bg/api-client";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { swRegistration } from "@/lib/pwa";
import PushExplainSheet, { type PushOutcome } from "./PushExplainSheet";

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

  // The explanation sheet's outcome (the browser prompt appears only after "Allow").
  const onResult = (outcome: PushOutcome) => {
    if (outcome === "on") {
      setStatus("on");
      setNote("on");
    } else if (outcome === "denied") {
      setStatus("denied");
      setNote("denied");
    } else if (outcome === "off") {
      setStatus("off");
      setNote(null);
    } else {
      if (outcome === "unsupported") setStatus("unsupported");
      setNote(outcome);
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
      <PushExplainSheet open={sheet} onClose={() => setSheet(false)} onResult={onResult} />
    </>
  );
}
