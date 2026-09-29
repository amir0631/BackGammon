import { MatchHistoryScreen } from "@/features/history/MatchHistoryScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("history.title");

// HI-01 Match history (history-replay.md §3.1).
export default function MatchHistoryPage() {
  return <MatchHistoryScreen />;
}
