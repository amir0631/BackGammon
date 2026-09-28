import { notFound } from "next/navigation";
import { WithdrawalDetail } from "@/features/wallet/WithdrawalsScreens";
import { param, titled, type PageProps } from "../../../metadata";

export const generateMetadata = () => titled("withdrawals.detail.title");

// WD-07 Withdrawal detail (wallet.md §3.7). `submitted=1`: just created by the withdraw flow.
export default async function WithdrawalPage({ params, searchParams }: PageProps & { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <WithdrawalDetail key={id} id={id} submitted={(await param(searchParams, "submitted")) === "1"} />;
}
