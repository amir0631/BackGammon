import { Suspense } from "react";
import { LeaderboardScreen } from "@/features/leaderboard/LeaderboardScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("leaderboard.title");

// PL-09 Leaderboard (leaderboard.md §4). `?scope=all|weekly|monthly|predict`.
export default function LeaderboardPage() {
  return (
    <Suspense>
      <LeaderboardScreen />
    </Suspense>
  );
}
