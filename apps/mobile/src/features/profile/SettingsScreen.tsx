"use client";

import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { api, ApiRequestError } from "@bg/api-client";
import { radii } from "@bg/design-tokens";
import type { UserPrefs } from "@bg/protocol";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { LanguageOptions, useChooseLanguage } from "@/components/i18n/LanguageControls";
import { DevicesIcon, LockIcon } from "@/components/icons";
import { InfoRow, NavGroup, NavRow } from "@/components/lists/NavList";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { queuePendingPrefs, readPendingPrefs, useSession } from "@/lib/session";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { usePrefersReducedMotion, useReducedMotionSetting } from "@/theme/motion";
import { tokensOf } from "@/theme/theme";

// ST-01 Settings `/settings` (profile.md §3.3, §4). Every change applies at once; there is no
// save button. Language: radio group written in each language, applied immediately and saved to
// the account. Game toggles apply locally first and sync with `PATCH me {prefs}`: silent on
// success; offline they stay on this device with a note and sync on reconnect; a server
// rejection reverts the toggle with a note. OS reduce-motion and missing vibration support show
// the switch disabled with the reason, without touching the stored value.

type PrefKey = keyof UserPrefs;
type Note = "savedLocally" | "saveFailed";

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "& > * + *": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

const DEFAULT_PREFS: UserPrefs = { graphics_lite: false, animations_reduced: false, sound: true, vibration: true };

export function SettingsScreen() {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const { me, setMe } = useSession();
  const chooseLanguage = useChooseLanguage();
  const { setSetting: setReducedMotion } = useReducedMotionSetting();
  const osReduced = usePrefersReducedMotion();
  const languageTitleId = useId();
  const languageNoteId = useId();

  const [local, setLocal] = useState<Partial<UserPrefs>>({});
  const [notes, setNotes] = useState<Partial<Record<PrefKey, Note>>>({});
  const [canVibrate, setCanVibrate] = useState(true);

  useEffect(() => {
    setLocal(readPendingPrefs() ?? {});
    setCanVibrate(typeof navigator.vibrate === "function");
  }, []);

  // Pending changes synced (reconnect or focus): drop the "saved on this device" notes.
  useEffect(() => {
    if (readPendingPrefs()) return;
    setLocal({});
    setNotes((n) => Object.fromEntries(Object.entries(n).filter(([, v]) => v !== "savedLocally")));
  }, [me]);

  const prefs: UserPrefs = { ...DEFAULT_PREFS, ...me?.prefs, ...local };

  const change = async (key: PrefKey, value: boolean) => {
    const previous = prefs[key];
    setLocal((l) => ({ ...l, [key]: value }));
    setNotes((n) => ({ ...n, [key]: undefined }));
    if (key === "animations_reduced") setReducedMotion(value);
    try {
      const saved = await api.me.update({ prefs: { [key]: value } });
      setMe(saved);
      setLocal((l) => {
        const rest = { ...l };
        delete rest[key];
        return rest;
      });
    } catch (error) {
      const rejected = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
      if (rejected) {
        setLocal((l) => ({ ...l, [key]: previous }));
        if (key === "animations_reduced") setReducedMotion(previous);
        setNotes((n) => ({ ...n, [key]: "saveFailed" }));
      } else {
        queuePendingPrefs({ [key]: value });
        setNotes((n) => ({ ...n, [key]: "savedLocally" }));
      }
    }
  };

  const note = (key: PrefKey) => {
    const value = notes[key];
    return value === "savedLocally" ? t("settings.savedLocally") : value === "saveFailed" ? t("settings.saveFailed") : undefined;
  };

  return (
    <DetailColumns>
      <Stack spacing={4} className="detail-main">
        <section aria-labelledby={languageTitleId}>
          <Typography id={languageTitleId} variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1, paddingInline: 1 }}>
            {t("settings.language.title")}
          </Typography>
          <Card sx={{ paddingInline: 2, paddingBlock: 0.5 }}>
            <LanguageOptions
              value={f.locale}
              onChange={(next) => void chooseLanguage(next)}
              disabled={!online}
              labelledBy={languageTitleId}
              describedBy={!online ? languageNoteId : undefined}
            />
          </Card>
          {!online && (
            <Typography id={languageNoteId} variant="body2" color="text.secondary" sx={{ mt: 1, paddingInline: 1 }}>
              {t("settings.language.offline")}
            </Typography>
          )}
        </section>

        <section aria-labelledby="settings-game">
          <Typography id="settings-game" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 1, paddingInline: 1 }}>
            {t("settings.game.title")}
          </Typography>
          <Card>
            <SwitchRow
              label={t("settings.lite.label")}
              description={t("settings.lite.desc")}
              checked={prefs.graphics_lite}
              onChange={(v) => void change("graphics_lite", v)}
              note={note("graphics_lite")}
            />
            <SwitchRow
              label={t("settings.reduced.label")}
              description={t("settings.reduced.desc")}
              checked={osReduced || prefs.animations_reduced}
              disabled={osReduced}
              onChange={(v) => void change("animations_reduced", v)}
              note={osReduced ? t("settings.reduced.osOn") : note("animations_reduced")}
            />
            <SwitchRow
              label={t("settings.sound.label")}
              description={t("settings.sound.desc")}
              checked={prefs.sound}
              onChange={(v) => void change("sound", v)}
              note={note("sound")}
            />
            <SwitchRow
              label={t("settings.vibration.label")}
              description={t("settings.vibration.desc")}
              checked={canVibrate && prefs.vibration}
              disabled={!canVibrate}
              onChange={(v) => void change("vibration", v)}
              note={!canVibrate ? t("settings.vibration.unsupported") : note("vibration")}
            />
          </Card>
        </section>

        <NavGroup title={t("settings.account.title")}>
          {me && (
            <InfoRow label={t("settings.account.phone")} value={<bdi dir="ltr">{f.maskedPhone(me.phone)}</bdi>} />
          )}
          <NavRow href="/password/reset?next=%2Fsettings" icon={LockIcon} label={t("settings.account.changePassword")} />
          <NavRow href="/me/sessions" icon={DevicesIcon} label={t("profile.hub.sessions")} />
        </NavGroup>
      </Stack>
    </DetailColumns>
  );
}
