import type { ReactNode } from "react";
import { AccountLayout } from "@/components/profile/AccountLayout";

// Tab 5 (Account) routes share one frame so the hub list stays mounted in list-detail layouts.
export default function AccountGroupLayout({ children }: { children: ReactNode }) {
  return <AccountLayout>{children}</AccountLayout>;
}
