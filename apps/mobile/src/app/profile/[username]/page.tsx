import { PublicProfileScreen } from "@/features/profile/PublicProfileScreen";

// AC-05 Public profile (profile.md). The title is the username (user content, not an i18n key).
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: decodeURIComponent((await params).username) };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  return <PublicProfileScreen username={decodeURIComponent((await params).username)} />;
}
