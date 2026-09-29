import { SignupAccountScreen } from "@/features/auth/SignupAccountScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("auth.account.title");

// AU-04 Signup: account details (auth.md).
export default function SignupAccountPage() {
  return <SignupAccountScreen />;
}
