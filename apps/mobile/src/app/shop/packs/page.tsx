import { Suspense } from "react";
import { ShopListScreen } from "@/features/shop/ShopListScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("shop.segment.packs");

// SH-02 Packs (shop.md §4).
export default function ShopPacksPage() {
  return (
    <Suspense>
      <ShopListScreen segment="packs" />
    </Suspense>
  );
}
