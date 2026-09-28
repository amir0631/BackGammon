"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiRequestError } from "@bg/api-client";
import type { AdminMe } from "@bg/protocol";

type Status = "loading" | "signedIn" | "signedOut";

interface AdminContextValue {
  status: Status;
  admin: AdminMe | null;
  signedIn: (admin: AdminMe) => void;
  signOut: () => Promise<void>;
  /** Handles session and access errors globally. Returns true when the error was consumed. */
  handleError: (error: unknown) => boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const PUBLIC_PATHS = ["/login", "/denied"];

function currentPath(pathname: string, search: URLSearchParams): string {
  const q = search.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [expired, setExpired] = useState(false);

  const handleError = useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiRequestError)) return false;
      if (error.body.code === "ADMIN_UNAUTHENTICATED") {
        setExpired(true);
        return true;
      }
      const reason = error.body.details?.reason;
      if (error.body.code === "ADMIN_FORBIDDEN" && (reason === "ip" || reason === "host")) {
        router.replace(`/denied?reason=${reason}`);
        return true;
      }
      return false;
    },
    [router],
  );

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) {
      setStatus((s) => (s === "loading" ? "signedOut" : s));
      return;
    }
    if (status !== "loading") return;
    const controller = new AbortController();
    api.admin
      .me({ signal: controller.signal })
      .then((me) => {
        setAdmin(me);
        setStatus("signedIn");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus("signedOut");
        if (error instanceof ApiRequestError && error.body.code === "ADMIN_UNAUTHENTICATED") {
          router.replace(`/login?next=${encodeURIComponent(currentPath(pathname, search))}`);
          return;
        }
        handleError(error);
      });
    return () => controller.abort();
  }, [pathname, search, status, router, handleError]);

  const value = useMemo<AdminContextValue>(
    () => ({
      status,
      admin,
      handleError,
      signedIn: (me) => {
        setAdmin(me);
        setStatus("signedIn");
        setExpired(false);
      },
      signOut: async () => {
        try {
          await api.admin.logout();
        } finally {
          setAdmin(null);
          setStatus("signedOut");
          router.replace("/login");
        }
      },
    }),
    [status, admin, handleError, router],
  );

  return (
    <AdminContext.Provider value={value}>
      {children}
      {/* AD-08: the session ended mid-task; unsaved edits are lost and the dialog says so. */}
      <Dialog open={expired} aria-labelledby="session-expired-title" disableEscapeKeyDown>
        <DialogTitle id="session-expired-title">{t("errors.admin.unauthenticated")}</DialogTitle>
        <DialogContent>{t("admin.sessionExpired.body")}</DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              setExpired(false);
              setStatus("signedOut");
              router.replace(`/login?next=${encodeURIComponent(currentPath(pathname, search))}`);
            }}
          >
            {t("admin.sessionExpired.cta")}
          </Button>
        </DialogActions>
      </Dialog>
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminProvider");
  return ctx;
}

/** Same-origin admin path only, so `next` can never redirect off-site. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/settings";
}
