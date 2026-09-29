import { BankAccountScreen } from "@/features/wallet/BankAccountScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("bank.title");

// WD-08 Bank account (wallet.md §3.5).
export default function BankAccountsPage() {
  return <BankAccountScreen />;
}
