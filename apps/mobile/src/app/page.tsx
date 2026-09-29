import { WelcomeScreen } from "@/features/auth/WelcomeScreen";

// AU-01 Welcome (auth.md). Signed-in users are sent to /play without the screen rendering.
export default function HomePage() {
  return <WelcomeScreen />;
}
