import { SessionsScreen } from "@/features/profile/SessionsScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("sessions.title");

// AC-04 Signed-in devices (profile.md).
export default function SessionsPage() {
  return <SessionsScreen />;
}
