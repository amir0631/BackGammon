import type { ReactNode } from "react";
import { WithdrawalsLayout } from "@/features/wallet/WithdrawalsScreens";

// WD-06 list, kept mounted beside the WD-07 detail at wide widths (wallet.md §3.7 step 4).
export default function Layout({ children }: { children: ReactNode }) {
  return <WithdrawalsLayout>{children}</WithdrawalsLayout>;
}
