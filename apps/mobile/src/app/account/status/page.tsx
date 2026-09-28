import { AccountStatusScreen } from "@/features/auth/AccountStatusScreen";
import { param, titled, type PageProps } from "../../metadata";

export const generateMetadata = () => titled("account.suspended.title");

// AU-13 Account suspended (auth.md).
export default async function AccountStatusPage({ searchParams }: PageProps) {
  return <AccountStatusScreen next={await param(searchParams, "next")} />;
}
