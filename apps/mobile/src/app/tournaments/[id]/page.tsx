import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TournamentDetailScreen } from "@/features/tournaments/TournamentDetailScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("tournaments.title");

// TO-02 Tournament detail (tournaments.md §4); `?tab=bracket` opens TO-03.
export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return (
    <Suspense>
      <TournamentDetailScreen id={id} />
    </Suspense>
  );
}
