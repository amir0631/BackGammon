import { notFound } from "next/navigation";
import { ItemScreen } from "@/features/shop/ItemScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("shop.title");

// SH-03 Item preview (shop.md §4).
export default async function ShopItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <ItemScreen itemId={id} />;
}
