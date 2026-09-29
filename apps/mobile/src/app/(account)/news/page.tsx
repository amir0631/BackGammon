import { NewsListScreen } from "@/features/news/NewsScreens";
import { titled } from "../../metadata";

export const generateMetadata = () => titled("news.title");

// NW-02 News (news.md §3.5).
export default function NewsPage() {
  return <NewsListScreen />;
}
