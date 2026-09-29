"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@bg/api-client";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/Toast";
import { useSession } from "@/lib/session";
import { useOnline } from "@/lib/useOnline";

// AU-12 Logout (auth.md §3.4). Neutral (not destructive). On success: clear user data, go to `/`
// and confirm politely. A network failure keeps the dialog open: the HttpOnly cookies cannot be
// cleared by the client, so the UI never pretends to have logged out. Logging out never resigns a
// match, never cancels withdrawals, and never touches other devices.
// The match-in-progress note (auth.md AU-12) arrives with the match screens (step 5+).

export function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const { signOut } = useSession();
  const [inFlight, setInFlight] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setInFlight(true);
    setFailed(false);
    try {
      await api.auth.logout();
      signOut();
      router.replace("/");
      toast.show({ message: t("auth.logout.done") });
    } catch {
      setFailed(true);
    } finally {
      setInFlight(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onCancel={() => {
        setFailed(false);
        onClose();
      }}
      onConfirm={() => void confirm()}
      title={t("auth.logout.title")}
      confirmLabel={t("auth.logout.confirm")}
      inFlight={inFlight}
      inFlightLabel={t("auth.logout.loggingOut")}
      error={failed ? t("auth.logout.failed") : null}
      disabledReason={!online ? t("net.offlineAction") : null}
    >
      {t("auth.logout.body")}
    </ConfirmDialog>
  );
}
