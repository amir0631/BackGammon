"use client";

import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import type { Me } from "@bg/protocol";
import { BankIcon, ClockIcon, CoinIcon, GiftIcon, DevicesIcon, DocumentIcon, LockIcon, LogoutIcon, SettingsIcon, WalletIcon } from "@/components/icons";
import { InstallIcon, NewsIcon } from "@/components/icons/extra";
import { ActionRow, NavGroup, NavRow } from "@/components/lists/NavList";
import { useFormat } from "@/lib/useFormat";
import { useNews } from "@/lib/news";
import { promptInstall, usePwa } from "@/lib/pwa";
import { useWallet } from "@/lib/wallet";
import { LogoutDialog } from "./LogoutDialog";
import { ProfileCard } from "./ProfileViews";

// AC-01 Account hub content (profile.md §4). The order is fixed so later steps insert rows without
// reshuffling: profile card → wallet (step 3 screens) → activity (steps 8, 11, 12) → account →
// support → log out. Rows for features that are not built yet are omitted, never "coming soon".

const InstallSheet = lazy(() => import("@/components/pwa/InstallSheet").then((m) => ({ default: m.InstallSheet })));

export function AccountHub({ me, current }: { me: Me | null; current?: string }) {
  const t = useTranslations();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const f = useFormat();
  const { summary } = useWallet();
  const news = useNews();
  const pwa = usePwa();
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <Stack spacing={3}>
      <ProfileCard me={me} />
      <NavGroup title={t("profile.hub.group.wallet")}>
        <NavRow
          href="/wallet"
          icon={WalletIcon}
          label={t("profile.hub.wallet")}
          secondary={summary ? t("profile.hub.walletBalance", { amount: f.coins(summary.balance) }) : undefined}
        />
        <NavRow href="/wallet/bank-accounts" icon={BankIcon} label={t("profile.hub.bankAccount")} />
      </NavGroup>
      <NavGroup title={t("profile.hub.group.activity")}>
        <NavRow href="/me/matches" icon={ClockIcon} label={t("profile.hub.matches")} current={current === "/me/matches"} />
        <NavRow href="/me/predictions" icon={CoinIcon} label={t("profile.hub.predictions")} current={current === "/me/predictions"} />
        <NavRow href="/me/referral" icon={GiftIcon} label={t("profile.hub.referral")} current={current === "/me/referral"} />
      </NavGroup>
      <NavGroup title={t("profile.hub.group.account")}>
        <NavRow href="/me/sessions" icon={DevicesIcon} label={t("profile.hub.sessions")} current={current === "/me/sessions"} />
        <NavRow href="/settings" icon={SettingsIcon} label={t("profile.hub.settings")} current={current === "/settings"} />
      </NavGroup>
      <NavGroup title={t("profile.hub.group.support")}>
        <NavRow
          href="/news"
          icon={NewsIcon}
          label={t("news.hub.row")}
          secondary={news.unseen > 0 ? t("news.hub.unseen", { count: news.unseen }) : undefined}
          current={current === "/news" || current?.startsWith("/news/")}
        />
        <ActionRow
          icon={InstallIcon}
          label={t("profile.hub.install")}
          secondary={pwa.platform === "installed" ? t("install.installed") : undefined}
          onClick={() => {
            if (pwa.platform === "prompt") void promptInstall();
            else setInstallOpen(true);
          }}
        />
        <NavRow href="/terms" icon={DocumentIcon} label={t("profile.hub.terms")} />
        <NavRow href="/privacy" icon={LockIcon} label={t("profile.hub.privacy")} />
      </NavGroup>
      <NavGroup>
        <ActionRow icon={LogoutIcon} label={t("auth.logout.item")} chevron={false} onClick={() => setLogoutOpen(true)} />
      </NavGroup>
      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
      {installOpen && (
        <Suspense fallback={null}>
          <InstallSheet open onClose={() => setInstallOpen(false)} platform={pwa.platform} />
        </Suspense>
      )}
    </Stack>
  );
}
