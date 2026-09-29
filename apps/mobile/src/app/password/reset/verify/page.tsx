import { ResetVerifyScreen } from "@/features/auth/ResetVerifyScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("auth.verify.title");

// AU-08 Reset: SMS code (auth.md).
export default function ResetVerifyPage() {
  return <ResetVerifyScreen />;
}
