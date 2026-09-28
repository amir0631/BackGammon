"use client";

import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Me } from "@bg/protocol";
import { DevicesIcon, DocumentIcon, LockIcon, LogoutIcon, SettingsIcon } from "@/components/icons";
import { ActionRow, NavGroup, NavRow } from "@/components/lists/NavList";
import { LogoutDialog } from "./LogoutDialog";
import { ProfileCard } from "./ProfileViews";

// AC-01 Account hub content (profile.md §4). The order is fixed so later steps insert rows without
// reshuffling: profile card → wallet (step 3 screens) → activity (steps 8, 11, 12) → account →
// support → log out. Rows for features that are not built yet are omitted, never "coming soon".

export function AccountHub({ me, current }: { me: Me | null; current?: string }) {
  const t = useTranslations();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <Stack spacing={3}>
      <ProfileCard me={me} />
      <NavGroup title={t("profile.hub.group.account")}>
        <NavRow href="/me/sessions" icon={DevicesIcon} label={t("profile.hub.sessions")} current={current === "/me/sessions"} />
        <NavRow href="/settings" icon={SettingsIcon} label={t("profile.hub.settings")} current={current === "/settings"} />
      </NavGroup>
      <NavGroup title={t("profile.hub.group.support")}>
        <NavRow href="/terms" icon={DocumentIcon} label={t("profile.hub.terms")} />
        <NavRow href="/privacy" icon={LockIcon} label={t("profile.hub.privacy")} />
      </NavGroup>
      <NavGroup>
        <ActionRow icon={LogoutIcon} label={t("auth.logout.item")} chevron={false} onClick={() => setLogoutOpen(true)} />
      </NavGroup>
      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </Stack>
  );
}
