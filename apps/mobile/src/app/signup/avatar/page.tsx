import { SignupAvatarScreen } from "@/features/auth/SignupAvatarScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("auth.avatar.title");

// AU-05 Avatar (auth.md). Signed in.
export default function SignupAvatarPage() {
  return <SignupAvatarScreen />;
}
