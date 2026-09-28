import { LegalPlaceholder } from "@/features/legal/LegalPlaceholder";
import { titled } from "../metadata";

export const generateMetadata = () => titled("legal.terms.title");

export default function TermsPage() {
  return <LegalPlaceholder titleKey="legal.terms.title" />;
}
