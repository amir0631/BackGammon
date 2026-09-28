"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiRequestError } from "@bg/api-client";
import { isLocale } from "@bg/i18n";
import type { Me, UserPrefs } from "@bg/protocol";
import { useReducedMotionSetting } from "@/theme/motion";
import { referral } from "./flows";
import { useLocaleSwitch } from "./locale";
import { destination, loginHref } from "./nextPath";
import { clearUserData, readJson, removeKey, storageKeys, writeJson } from "./storage";

// Who is signed in (auth.md, ia.md §4). `GET /me` is the source of truth; the api-client handles
// CSRF and the access-token refresh. This module holds view state only: no business rules.

export type SessionStatus = "loading" | "guest" | "user" | "error";

interface SessionValue {
  status: SessionStatus;
  me: Me | null;
  /** Re-reads `GET /me`. */
  reload: () => Promise<Me | null>;
  /** After login, registration, or password reset returned `me`. */
  signIn: (me: Me) => void;
  /** After `PATCH me`. */
  setMe: (me: Me) => void;
  /** After a confirmed logout: clears user data. The caller navigates away itself. */
  signOut: () => void;
  /** True between a logout and the next sign-in: guards do not bounce to /login meanwhile. */
  leaving: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Refetch `me` on focus at most this often, to notice a status change (auth.md §3.2 step 7). */
const FOCUS_REFETCH_MS = 60_000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [me, setMeState] = useState<Me | null>(null);
  const [leaving, setLeaving] = useState(false);
  const lastFetch = useRef(0);
  const { setSetting: setReducedMotion } = useReducedMotionSetting();
  const { switchLocale } = useLocaleSwitch();
  const locale = useLocale();
  const pathname = usePathname();

  // A logout navigates away; once the new route is on screen, guards work normally again.
  useEffect(() => setLeaving(false), [pathname]);

  const applyMe = useCallback(
    (next: Me) => {
      setMeState(next);
      setStatus("user");
      setReducedMotion(next.prefs.animations_reduced);
    },
    [setReducedMotion],
  );

  const reload = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const next = await api.me.get();
      applyMe(next);
      return next;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status !== 0 && error.status < 500) {
        setMeState(null);
        setStatus("guest");
      } else {
        // Network or server trouble: keep what we had; screens show their offline/error state.
        setStatus((s) => (s === "user" ? s : "error"));
      }
      return null;
    }
  }, [applyMe]);

  // First load: who is this, and which language does the account prefer (auth.md §3.2 step 2).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    referral.capture(params.get("ref"));
    void reload().then((loaded) => {
      if (loaded && isLocale(loaded.lang) && loaded.lang !== locale) switchLocale(loaded.lang);
      if (loaded) void flushPendingPrefs(applyMe);
    });
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notice suspensions and ended sessions when the user comes back to the tab or the network.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetch.current < FOCUS_REFETCH_MS) return;
      void reload().then((loaded) => loaded && flushPendingPrefs(applyMe));
    };
    const onOnline = () => void reload().then((loaded) => loaded && flushPendingPrefs(applyMe));
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [reload, applyMe]);

  const signIn = useCallback(
    (next: Me) => {
      removeKey("session", storageKeys.suspendedSeen);
      lastFetch.current = Date.now();
      setLeaving(false);
      applyMe(next);
    },
    [applyMe],
  );

  const signOut = useCallback(() => {
    clearUserData();
    setLeaving(true);
    setMeState(null);
    setStatus("guest");
    setReducedMotion(false);
  }, [setReducedMotion]);

  const value = useMemo(
    () => ({ status, me, reload, signIn, setMe: applyMe, signOut, leaving }),
    [status, me, reload, signIn, applyMe, signOut, leaving],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

// ---- Route guards (ia.md §2, §4) ---------------------------------------------------------------

/** Signed-in routes: guests go to `/login?next=<this path>`. Returns `me` once known. */
export function useRequireUser(): { me: Me | null; status: SessionStatus } {
  const { status, me, leaving } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "guest" && !leaving) router.replace(loginHref(`${pathname}${window.location.search}`));
  }, [status, leaving, pathname, router]);

  return { me: status === "user" ? me : null, status };
}

/**
 * Guest-only routes (`/`, `/login`, `/signup*`): a signed-in user is sent on without the form
 * ever rendering. `enabled` is false while the screen itself completes a sign-in and navigates.
 */
export function useGuestOnly(next: string | null | undefined, enabled = true): boolean {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (enabled && status === "user") router.replace(destination(next));
  }, [enabled, status, next, router]);

  return status === "guest" || status === "error" || !enabled;
}

/**
 * After login or password reset (auth.md §2 exits): apply the account language, then AU-13 for a
 * suspended account, else `next` or `/play`.
 */
export function useCompleteSignIn() {
  const session = useSession();
  const router = useRouter();
  const locale = useLocale();
  const { switchLocale } = useLocaleSwitch();

  return useCallback(
    (me: Me, next: string | null | undefined) => {
      session.signIn(me);
      const to = destination(next);
      if (isLocale(me.lang) && me.lang !== locale) switchLocale(me.lang, { afterNavigation: true });
      router.replace(me.status === "suspended" ? `/account/status?next=${encodeURIComponent(to)}` : to);
    },
    [session, router, locale, switchLocale],
  );
}

// ---- Preferences that could not be saved while offline (profile.md §3.3) ------------------------

export function readPendingPrefs(): Partial<UserPrefs> | null {
  return readJson<Partial<UserPrefs>>("local", storageKeys.pendingPrefs);
}

export function queuePendingPrefs(prefs: Partial<UserPrefs>): void {
  writeJson("local", storageKeys.pendingPrefs, { ...readPendingPrefs(), ...prefs });
}

export async function flushPendingPrefs(onSaved: (me: Me) => void): Promise<void> {
  const pending = readPendingPrefs();
  if (!pending || Object.keys(pending).length === 0) return;
  try {
    const saved = await api.me.update({ prefs: pending });
    removeKey("local", storageKeys.pendingPrefs);
    onSaved(saved);
  } catch (error) {
    // A server rejection will not succeed on retry: drop it. Network trouble: keep for later.
    if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
      removeKey("local", storageKeys.pendingPrefs);
    }
  }
}
