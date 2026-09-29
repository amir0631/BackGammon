import { NewsItemScreen } from "@/features/news/NewsScreens";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("news.title");

// NW-03 News item (news.md §3.6).
export default async function NewsItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewsItemScreen id={/^\d+$/.test(id) ? Number(id) : -1} />;
}
