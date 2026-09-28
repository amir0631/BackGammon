"use client";

import type { ReactNode } from "react";
import { LocaleSwitchProvider } from "@/lib/locale";
import { SessionProvider } from "@/lib/session";

/** App-wide client state below the theme: language switching and the signed-in user. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleSwitchProvider>
      <SessionProvider>{children}</SessionProvider>
    </LocaleSwitchProvider>
  );
}
