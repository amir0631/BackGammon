import { Suspense } from "react";
import { PlayLobbyScreen } from "@/features/play/PlayLobbyScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("play.title");

// PL-01 Play lobby (play.md §4). `again`, `setup`, and `bot` query values open a sheet from the
// match result (match.md MA-13); the lobby removes them after reading.
export default function PlayPage() {
  return (
    <Suspense>
      <PlayLobbyScreen />
    </Suspense>
  );
}
