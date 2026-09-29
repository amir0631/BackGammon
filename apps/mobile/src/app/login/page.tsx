import { LoginScreen } from "@/features/auth/LoginScreen";
import { param, titled, type PageProps } from "../metadata";

export const generateMetadata = () => titled("auth.login.title");

// AU-06 Login (auth.md). `next`: where to go after signing in. `reason=banned`: a session the
// server ended with AUTH_BANNED lands here with the AU-14 panel.
export default async function LoginPage({ searchParams }: PageProps) {
  return <LoginScreen next={await param(searchParams, "next")} banned={(await param(searchParams, "reason")) === "banned"} />;
}
