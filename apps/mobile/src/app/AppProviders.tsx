"use client";

import type { ReactNode } from "react";
import { ActiveMatchProvider } from "@/lib/activeMatch";
import { useTrackInAppNavigation } from "@/lib/inAppNav";
import { LocaleSwitchProvider } from "@/lib/locale";
import { SessionProvider } from "@/lib/session";
import { SocketProvider } from "@/lib/socket";
import { WalletProvider } from "@/lib/wallet";

/**
 * App-wide client state below the theme: language switching, the signed-in user, the wallet
 * summary, the running match for the resume banner, and the shared game socket.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  useTrackInAppNavigation();
  return (
    <LocaleSwitchProvider>
      <SessionProvider>
        <WalletProvider>
          <ActiveMatchProvider>
            <SocketProvider>{children}</SocketProvider>
          </ActiveMatchProvider>
        </WalletProvider>
      </SessionProvider>
    </LocaleSwitchProvider>
  );
}
