import { ResetPhoneScreen } from "@/features/auth/ResetPhoneScreen";
import { param, titled, type PageProps } from "../../metadata";

export const generateMetadata = () => titled("auth.reset.title");

// AU-07 Reset: phone (auth.md). `next`: where a signed-in user returns after changing the password.
export default async function ResetPage({ searchParams }: PageProps) {
  return <ResetPhoneScreen next={await param(searchParams, "next")} />;
}
