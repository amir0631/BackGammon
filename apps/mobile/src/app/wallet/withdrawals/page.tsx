import { WithdrawalsPrompt } from "@/features/wallet/WithdrawalsScreens";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("withdrawals.title");

// WD-06 Withdrawal requests (wallet.md §3.7). The detail slot shows a prompt beside the list.
export default function WithdrawalsPage() {
  return <WithdrawalsPrompt />;
}
