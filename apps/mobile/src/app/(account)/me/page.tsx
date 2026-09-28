import { AccountHubScreen } from "@/features/profile/AccountHubScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("profile.hub.title");

// AC-01 Account hub (profile.md).
export default function MePage() {
  return <AccountHubScreen />;
}
