import { TransferScreen } from "@/features/wallet/TransferScreen";
import { param, titled, type PageProps } from "../../metadata";

export const generateMetadata = () => titled("transfer.title");

// TR-00 … TR-05 Send coins (wallet.md §3.4). `to`: recipient username from a public profile.
export default async function TransferPage({ searchParams }: PageProps) {
  return <TransferScreen to={await param(searchParams, "to")} />;
}
