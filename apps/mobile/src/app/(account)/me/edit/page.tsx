import { EditProfileScreen } from "@/features/profile/EditProfileScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("profile.edit.title");

// AC-02 Edit profile (profile.md).
export default function EditProfilePage() {
  return <EditProfileScreen />;
}
