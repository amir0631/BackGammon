import { ResetNewScreen } from "@/features/auth/ResetNewScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("auth.reset.new.title");

// AU-09 Reset: new password (auth.md).
export default function ResetNewPage() {
  return <ResetNewScreen />;
}
