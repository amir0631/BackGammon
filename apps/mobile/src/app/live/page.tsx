import { Suspense } from "react";
import { LiveListScreen } from "@/features/live/LiveListScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("live.title");

// LV-01 Live list (live.md §4). `?tier=&variant=&tournament=&sort=` restore the filters.
export default function LivePage() {
  return (
    <Suspense>
      <LiveListScreen />
    </Suspense>
  );
}
