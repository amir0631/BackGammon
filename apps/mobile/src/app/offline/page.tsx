import { OfflineScreen } from "@/components/pwa/OfflineScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("offline.title");

// SY-01 connection lost (CLAUDE.md §11.5). The service worker precaches this page and serves it
// for any page request that fails offline.
export default function OfflinePage() {
  return <OfflineScreen />;
}
