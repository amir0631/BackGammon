import { redirect } from "next/navigation";
import { HOME } from "@/lib/nav";

// Signed-in admins land on the dashboard (CLAUDE.md §13).
export default function AdminHome() {
  redirect(HOME);
}
