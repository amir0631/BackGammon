import { ReferralScreen } from "@/features/referral/ReferralScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("referral.title");

// RF-01 Invite friends (referral.md §4).
export default function ReferralPage() {
  return <ReferralScreen />;
}
