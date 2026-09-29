import { Suspense } from "react";
import { ShopListScreen } from "@/features/shop/ShopListScreen";
import { titled } from "../metadata";

export const generateMetadata = () => titled("shop.title");

// SH-01 Themes (shop.md §4). `?filter=owned` shows owned items only.
export default function ShopPage() {
  return (
    <Suspense>
      <ShopListScreen segment="themes" />
    </Suspense>
  );
}
