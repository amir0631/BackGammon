import type { Metadata } from "next";
import { Suspense } from "react";
import { Gallery } from "./Gallery";
import { assertGalleryEnabled } from "./guard";

// Dev-only component gallery (docs/ui/design-system.md §Gallery). Evaluated per request so the
// production guard runs at request time, not once at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function GalleryPage() {
  assertGalleryEnabled();
  return (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}
