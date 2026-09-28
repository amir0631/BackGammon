"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@bg/api-client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Banner } from "@/components/feedback/Banner";
import { useToast } from "@/components/feedback/Toast";
import { ActionButton } from "@/components/forms/ActionButton";
import { AvatarPicker, AvatarPickerSkeleton } from "@/components/profile/AvatarPicker";
import { useRequireUser, useSession } from "@/lib/session";
import { storageKeys, writeJson } from "@/lib/storage";
import { useOnline } from "@/lib/useOnline";

// AU-05 Avatar `/signup/avatar` (auth.md §3.1 step 6). Signed in: the account already exists and
// the screen says so. Nothing is pre-selected; Continue is disabled with a reason until a pick;
// Skip always works. A failed save never traps the user: snackbar, then continue.

const EXIT = "/play";

export function SignupAvatarScreen() {
  const t = useTranslations();
  const router = useRouter();
  const online = useOnline();
  const toast = useToast();
  const { setMe } = useSession();
  const { me } = useRequireUser();
  const headingId = useId();

  const [avatars, setAvatars] = useState<string[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    setAvatars(null);
    api.content
      .avatars()
      .then((res) => setAvatars(res.results.map((a) => a.key)))
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);

  const skip = () => {
    writeJson("local", storageKeys.avatarSkipped, true);
    router.replace(EXIT);
  };

  const save = async () => {
    if (!choice || saving) return;
    setSaving(true);
    try {
      setMe(await api.me.update({ avatar: choice }));
    } catch {
      toast.show({ message: t("auth.avatar.saveError") });
    }
    router.replace(EXIT);
  };

  const title = t("auth.avatar.title");
  if (!me) return <AuthScreen title={title} pending>{null}</AuthScreen>;

  return (
    <AuthScreen
      title={title}
      headingId={headingId}
      intro={
        <>
          <Typography component="span" sx={{ display: "block", color: "text.primary" }}>
            {t("auth.avatar.accountCreated")}
          </Typography>
          {t("auth.avatar.helper")}
        </>
      }
      onSubmit={() => void save()}
      footer={
        <Stack spacing={1}>
          <ActionButton
            type="submit"
            loading={saving}
            loadingLabel={t("auth.avatar.saving")}
            disabledReason={!choice ? t("auth.avatar.disabled") : !online ? t("net.offlineAction") : null}
          >
            {t("auth.avatar.cta")}
          </ActionButton>
          <Button variant="text" size="large" fullWidth onClick={skip} disabled={saving}>
            {t("auth.avatar.skip")}
          </Button>
        </Stack>
      }
    >
      {loadFailed ? (
        <Banner severity="error" action={{ label: t("common.retry"), onClick: load }}>
          {t("auth.avatar.loadError")}
        </Banner>
      ) : avatars === null ? (
        <AvatarPickerSkeleton />
      ) : (
        <AvatarPicker avatars={avatars} value={choice} onChange={setChoice} labelledBy={headingId} disabled={saving} />
      )}
    </AuthScreen>
  );
}

