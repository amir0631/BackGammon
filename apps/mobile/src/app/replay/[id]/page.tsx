import type { Metadata } from "next";
import { ReplayScreen } from "@/features/replay/ReplayScreen";
import { param, titled, type PageProps } from "../../metadata";

// Replays are private to the two players (CLAUDE.md §2 rule 13): never indexed (history-replay.md AC 15).
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await titled("replay.title")), robots: { index: false, follow: false } };
}

// `/replay/[id]` (history-replay.md RP-01 … RP-03). `verify=1` opens RP-02 after the replay loads.
export default async function ReplayPage({ params, searchParams }: PageProps & { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReplayScreen matchId={id} openVerify={(await param(searchParams, "verify")) === "1"} />;
}
