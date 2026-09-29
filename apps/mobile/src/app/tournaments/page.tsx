import { Suspense } from "react";
import { TournamentListScreen } from "@/features/tournaments/TournamentListScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("tournaments.title");

// TO-01 Tournament list (tournaments.md §4). `?segment=upcoming|mine|running|finished`.
export default function TournamentsPage() {
  return (
    <Suspense>
      <TournamentListScreen />
    </Suspense>
  );
}
