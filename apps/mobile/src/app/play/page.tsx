import { PlayPlaceholder } from "@/features/play/PlayPlaceholder";
import { titled } from "../metadata";

export const generateMetadata = () => titled("nav.play");

export default function PlayPage() {
  return <PlayPlaceholder />;
}
