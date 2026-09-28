import { SettingsScreen } from "@/features/profile/SettingsScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("settings.title");

// ST-01 Settings (profile.md).
export default function SettingsPage() {
  return <SettingsScreen />;
}
