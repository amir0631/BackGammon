import { CoinsScreen } from "@/features/shop/CoinsScreen";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("shop.coins.title");

// CO-01 / CO-02 Coins (shop.md §4).
export default function ShopCoinsPage() {
  return <CoinsScreen />;
}
