import { Suspense } from "react";
import { SettingsScreen } from "./SettingsScreen";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}
