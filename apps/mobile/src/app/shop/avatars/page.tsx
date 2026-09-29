import { Suspense } from "react";
import { ShopListScreen } from "@/features/shop/ShopListScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("shop.segment.avatars");

// SH-05 Avatars (shop.md §4).
export default function ShopAvatarsPage() {
  return (
    <Suspense>
      <ShopListScreen segment="avatars" />
    </Suspense>
  );
}
