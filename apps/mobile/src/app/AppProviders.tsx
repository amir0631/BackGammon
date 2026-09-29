"use client";

import type { ReactNode } from "react";
import { LocaleSwitchProvider } from "@/lib/locale";
import { SessionProvider } from "@/lib/session";
import { WalletProvider } from "@/lib/wallet";

/** App-wide client state below the theme: language switching, the signed-in user, and the wallet summary. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleSwitchProvider>
      <SessionProvider>
        <WalletProvider>{children}</WalletProvider>
      </SessionProvider>
    </LocaleSwitchProvider>
  );
}
