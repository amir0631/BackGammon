"use client";

import { useCallback, useState } from "react";
import { api, ApiRequestError } from "@bg/api-client";
import type { UserPrefs } from "@bg/protocol";
import { useReducedMotionSetting } from "@/theme/motion";
import { queuePendingPrefs, readPendingPrefs, useSession } from "./session";

// Game preferences (profile.md ST-01) toggled from the match menu (match.md MA-03): they apply at
// once and sync with `PATCH me {prefs}`; offline they stay on this device and sync later, the same
// rules as the settings screen.

const DEFAULTS: UserPrefs = { graphics_lite: false, animations_reduced: false, sound: true, vibration: true };

export function usePrefs(): { prefs: UserPrefs; set: (key: keyof UserPrefs, value: boolean) => void } {
  const { me, setMe } = useSession();
  const { setSetting: setReducedMotion } = useReducedMotionSetting();
  const [local, setLocal] = useState<Partial<UserPrefs>>(() => readPendingPrefs() ?? {});
  const prefs: UserPrefs = { ...DEFAULTS, ...me?.prefs, ...local };

  const set = useCallback(
    (key: keyof UserPrefs, value: boolean) => {
      setLocal((l) => ({ ...l, [key]: value }));
      if (key === "animations_reduced") setReducedMotion(value);
      api.me
        .update({ prefs: { [key]: value } })
        .then((saved) => {
          setMe(saved);
          setLocal((l) => {
            const rest = { ...l };
            delete rest[key];
            return rest;
          });
        })
        .catch((error: unknown) => {
          if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
            setLocal((l) => {
              const rest = { ...l };
              delete rest[key];
              return rest;
            });
          } else {
            queuePendingPrefs({ [key]: value });
          }
        });
    },
    [setMe, setReducedMotion],
  );
  return { prefs, set };
}
