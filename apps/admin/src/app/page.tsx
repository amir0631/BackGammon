import { redirect } from "next/navigation";

// Settings is the only section in this step; later the Dashboard (CLAUDE.md §13).
export default function AdminHome() {
  redirect("/settings");
}
