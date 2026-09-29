import { MatchScreen } from "@/features/match/MatchScreen";
import { param, titled, type PageProps } from "../../metadata";

export const generateMetadata = () => titled("match.summary.title");

// `/match/[id]` (match.md): the in-match screen for players, the summary otherwise. `cancel=1`
// opens the MA-19 cancel sheet (play.md PL-07 race); `view=summary` shows MA-14 after a server
// says this account isn't a player.
export default async function MatchPage({ params, searchParams }: PageProps & { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MatchScreen
      matchId={id}
      openCancel={(await param(searchParams, "cancel")) === "1"}
      forceSummary={(await param(searchParams, "view")) === "summary"}
    />
  );
}
