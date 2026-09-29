"use client";

import Box from "@mui/material/Box";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { OfflineBanner, SuspensionBanner } from "@/components/feedback/StatusBanners";
import { ResumeMatchBanner } from "@/components/play/ResumeMatchBanner";
import { TournamentPrestartBanner, TournamentReadyDialog } from "@/features/tournaments/TournamentAlerts";
import { readJson, storageKeys } from "@/lib/storage";
import { ErrorState } from "@/components/states/ErrorState";
import { useRequireUser, useSession } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { gutterStyles } from "@/theme/layout";
import { AppShell } from "./AppShell";
import { TopBar, type TopBarProps } from "./TopBar";

// Frame for signed-in, non-immersive screens (ia.md §3, §4):
// - Guests are sent to /login?next=<this path>.
// - A suspended account sees AU-13 once per sign-in (auth.md §4 AU-13), then a non-dismissible
//   suspension banner on every screen; offline shows the offline banner.
// - The balance chip shows the available balance from the shared wallet summary (ia.md §3.2);
//   task flows hide it (the cost block shows the balance there, wallet.md §4).

export interface SignedInShellProps {
  topBar: TopBarProps;
  children: ReactNode;
  hideNav?: boolean;
  /** AU-13 itself: no banner pointing at the page the user is on, and no gate. */
  isStatusPage?: boolean;
  /** Task flows hide the balance chip (wallet.md §4). */
  showBalance?: boolean;
}

export function SignedInShell({ topBar, children, hideNav, isStatusPage = false, showBalance = true }: SignedInShellProps) {
  const t = useTranslations();
  const { me, status } = useRequireUser();
  const { reload } = useSession();
  const online = useOnline();
  const router = useRouter();
  const pathname = usePathname();
  const wallet = useWallet();

  useEffect(() => {
    if (me?.status !== "suspended" || isStatusPage) return;
    if (readJson<boolean>("session", storageKeys.suspendedSeen)) return;
    router.push(`/account/status?next=${encodeURIComponent(`${pathname}${window.location.search}`)}`);
  }, [me?.status, pathname, router, isStatusPage]);

  return (
    <AppShell
      hideNav={hideNav}
      topBar={<TopBar balance={showBalance && me ? (wallet.summary?.balance ?? null) : undefined} {...topBar} />}
      banner={
        <>
          {!isStatusPage && <SuspensionBanner me={me} />}
          {me && <ResumeMatchBanner />}
          {me && <TournamentPrestartBanner />}
          {me && <TournamentReadyDialog />}
          <OfflineBanner />
        </>
      }
    >
      {status === "error" && !me ? (
        // `GET /me` failed for network or server reasons: say so instead of loading forever.
        <Box sx={{ ...gutterStyles, py: 3 }}>
          <ErrorState
            kind={online ? "error" : "offline"}
            message={online ? t("errors.generic") : t("net.offline")}
            onRetry={() => void reload()}
          />
        </Box>
      ) : (
        children
      )}
    </AppShell>
  );
}
