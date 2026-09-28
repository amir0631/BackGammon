import { WalletHomeScreen } from "@/features/wallet/WalletHomeScreen";
import { param, titled, type PageProps } from "../metadata";

export const generateMetadata = () => titled("wallet.title");

// WA-01 Wallet (wallet.md §4). `tx`: a ledger row to open (from a received-coins notice).
export default async function WalletPage({ searchParams }: PageProps) {
  const tx = Number(await param(searchParams, "tx"));
  return <WalletHomeScreen initialTx={Number.isSafeInteger(tx) && tx > 0 ? tx : null} />;
}
