import { SignupPhoneScreen } from "@/features/auth/SignupPhoneScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("auth.signup.title");

// AU-02 Signup: phone, 18+, terms (auth.md).
export default function SignupPage() {
  return <SignupPhoneScreen />;
}
