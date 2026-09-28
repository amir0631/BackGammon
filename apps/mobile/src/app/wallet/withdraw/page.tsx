import { WithdrawScreen } from "@/features/wallet/WithdrawScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("withdraw.title");

// WD-01 … WD-05 Withdraw (wallet.md §3.6).
export default function WithdrawPage() {
  return <WithdrawScreen />;
}
