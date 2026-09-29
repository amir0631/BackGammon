import { SignupVerifyScreen } from "@/features/auth/SignupVerifyScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("auth.verify.title");

// AU-03 Signup: SMS code (auth.md).
export default function SignupVerifyPage() {
  return <SignupVerifyScreen />;
}
