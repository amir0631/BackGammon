import type { Metadata } from "next";
import { Suspense } from "react";
import { assertGalleryEnabled } from "../gallery/guard";
import { DevBoard } from "./DevBoard";

// Dev-only 3D board preview (docs/ui/3d-art-direction.md §11 deliverables 4–5: framing per
// viewport, normal and lite captures). Same production guard as the gallery; not linked anywhere.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DevBoardPage() {
  assertGalleryEnabled();
  return (
    <Suspense>
      <DevBoard />
    </Suspense>
  );
}
