"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@bg/api-client";
import { avatarSize, iconSize, radii } from "@bg/design-tokens";
import { Banner } from "@/components/feedback/Banner";
import { useToast } from "@/components/feedback/Toast";
import { ActionButton } from "@/components/forms/ActionButton";
import { CopyIcon, InfoIcon } from "@/components/icons";
import { Avatar } from "@/components/profile/Avatar";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { AvatarPicker, AvatarPickerSkeleton } from "@/components/profile/AvatarPicker";
import { PublicProfileView, Username } from "@/components/profile/ProfileViews";
import { maskPhone } from "@bg/i18n";
import { useSession } from "@/lib/session";
import { readJson, removeKey, storageKeys } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { bottomInset } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// AC-02 Edit profile `/me/edit` (profile.md §3.1, §3.2 Mode A, §4).
// - The picker shows the saved avatar checked (current state, not a pre-selection). A different
//   pick shows a sticky "Save avatar" bar in the thumb zone with the unsaved state in text.
// - Username: Mode A (no username-change endpoint or capability signal yet, profile.md open
//   questions 1–2): the name, a copy button, and the "opens when the wallet launches" status line.
//   No button, no disabled control. The rules line needs `username.change_cost` and
//   `username.change_cooldown_days` from the server, which no public endpoint returns yet, so it is
//   omitted rather than showing invented numbers.
// - Mobile number: masked, owner only.

const Section = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1.5),
}));

const SaveBar = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "sticky",
    insetBlockEnd: bottomInset,
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 2),
    marginInline: theme.spacing(-1),
    borderRadius: radii.lg,
    backgroundColor: t.surfaceRaised,
    border: `1px solid ${t.outlineSubtle}`,
    boxShadow: "var(--bg-elevation-3)",
  };
});

export function EditProfileScreen() {
  const t = useTranslations();
  const f = useFormat();
  const toast = useToast();
  const online = useOnline();
  const { me, setMe } = useSession();
  const headingId = useId();

  const [avatars, setAvatars] = useState<string[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [skippedAtSignup, setSkippedAtSignup] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    setAvatars(null);
    api.content
      .avatars()
      .then((res) => setAvatars(res.results.map((a) => a.key)))
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);
  useEffect(() => setSkippedAtSignup(Boolean(readJson<boolean>("local", storageKeys.avatarSkipped))), []);

  const current = pick ?? me?.avatar ?? null;
  const dirty = Boolean(me && pick && pick !== me.avatar);

  const save = async () => {
    if (!pick || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      setMe(await api.me.update({ avatar: pick }));
      setPick(null);
      removeKey("local", storageKeys.avatarSkipped);
      setSkippedAtSignup(false);
      toast.show({ message: t("profile.edit.saved") });
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const copyUsername = async () => {
    if (!me?.username) return;
    try {
      await navigator.clipboard.writeText(me.username);
      toast.show({ message: t("profile.username.copied") });
    } catch {
      // Clipboard blocked: the name is on screen and selectable.
    }
  };

  const preview = me?.username
    ? { username: me.username, avatar: current ?? me.avatar, elo: me.elo, level: me.level, created_at: me.created_at }
    : null;

  return (
    <DetailColumns>
      <Stack spacing={4} className="detail-main">
        {/* Preview header */}
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          {current ? <Avatar avatarKey={current} size={avatarSize.lg} /> : <Box sx={{ width: avatarSize.lg, height: avatarSize.lg }} />}
          <Typography variant="h3" component="p" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <Username name={me?.username} />
          </Typography>
        </Stack>

        <Section aria-labelledby={headingId}>
          <Typography id={headingId} variant="h4" component="h2">
            {t("profile.edit.avatarTitle")}
          </Typography>
          {skippedAtSignup && !dirty && (
            <Typography variant="body2" color="text.secondary">
              {t("profile.edit.pickHint")}
            </Typography>
          )}
          {loadFailed ? (
            <Banner severity="error" action={{ label: t("common.retry"), onClick: load }}>
              {t("auth.avatar.loadError")}
            </Banner>
          ) : avatars === null || !me ? (
            <AvatarPickerSkeleton />
          ) : avatars.length === 0 ? (
            <Banner severity="info" action={{ label: t("common.retry"), onClick: load }}>
              {t("profile.edit.noAvatars")}
            </Banner>
          ) : (
            <AvatarPicker avatars={avatars} value={current} onChange={setPick} labelledBy={headingId} disabled={saving} />
          )}
          {dirty && (
            <SaveBar>
              {saveFailed && <Banner severity="error">{t("profile.edit.saveError")}</Banner>}
              <Typography variant="labelSmall" component="p" color="text.secondary" role="status">
                {t("profile.edit.unsaved")}
              </Typography>
              <ActionButton
                onClick={() => void save()}
                loading={saving}
                loadingLabel={t("profile.edit.saving")}
                disabledReason={!online ? t("net.offlineAction") : null}
              >
                {saveFailed ? t("common.retry") : t("profile.edit.save")}
              </ActionButton>
            </SaveBar>
          )}
        </Section>

        <Section aria-labelledby="username-title">
          <Typography id="username-title" variant="h4" component="h2">
            {t("profile.username.title")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="bodyLarge" component="p" sx={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", userSelect: "all" }}>
              <Username name={me?.username} />
            </Typography>
            {me?.username && (
              <IconButton onClick={() => void copyUsername()} aria-label={t("profile.username.copy")}>
                <CopyIcon />
              </IconButton>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}>
            <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
            <span>{t("profile.username.later")}</span>
          </Typography>
        </Section>

        {me && (
          <Section>
            <Typography variant="body1">
              {t("profile.edit.phone", { phone: `⁦${f.digits(maskPhone(me.phone))}⁩` })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("profile.edit.phonePrivate")}
            </Typography>
          </Section>
        )}
      </Stack>
      <aside className="detail-context" aria-labelledby="edit-preview-title">
        <Typography id="edit-preview-title" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 2 }}>
          {t("profile.hub.previewTitle")}
        </Typography>
        {preview && <PublicProfileView user={preview} headingComponent="h2" note={t("publicProfile.self")} />}
      </aside>
    </DetailColumns>
  );
}
