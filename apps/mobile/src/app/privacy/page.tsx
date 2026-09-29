import { LegalPlaceholder } from "@/features/legal/LegalPlaceholder";
import { titled } from "../metadata";

export const generateMetadata = () => titled("legal.privacy.title");

export default function PrivacyPage() {
  return <LegalPlaceholder titleKey="legal.privacy.title" />;
}
