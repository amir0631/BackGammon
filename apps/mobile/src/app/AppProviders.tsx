"use client";

import { useEffect, type ReactNode } from "react";
import { TournamentReadyHost } from "@/features/tournaments/TournamentReadyHost";
import { ActiveMatchProvider } from "@/lib/activeMatch";
import { useTrackInAppNavigation } from "@/lib/inAppNav";
import { LocaleSwitchProvider } from "@/lib/locale";
import { SessionProvider } from "@/lib/session";
import { SocketProvider } from "@/lib/socket";
import { WalletProvider } from "@/lib/wallet";

/**
 * App-wide client state below the theme: language switching, the signed-in user, the wallet
 * summary, the running match for the resume banner, the shared game socket, and the tournament
 * "match ready" dialog (TO-08), which must reach every route.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  useTrackInAppNavigation();
  // The PWA runtime (worker registration, install state) loads after first paint (§11.5); the
  // install prompt is caught earlier by the inline script in the root layout.
  useEffect(() => void import("@/lib/pwa").then((m) => m.startPwa()), []);
  return (
    <LocaleSwitchProvider>
      <SessionProvider>
        <WalletProvider>
          <ActiveMatchProvider>
            <SocketProvider>
              {children}
              {/* TO-08 on every route, including the spectator view (review TO-01). */}
              <TournamentReadyHost />
            </SocketProvider>
          </ActiveMatchProvider>
        </WalletProvider>
      </SessionProvider>
    </LocaleSwitchProvider>
  );
}
