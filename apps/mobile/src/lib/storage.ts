// Small typed wrappers over sessionStorage / localStorage. All app keys start with `bg.` so logout
// can clear user-scoped data in one pass (auth.md §3.4). Storage can throw (private mode, quota),
// so every access is guarded; losing a value only costs the user a re-type.

type Area = "session" | "local";

function area(which: Area): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return which === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(which: Area, key: string): T | null {
  const store = area(which);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(which: Area, key: string, value: unknown): void {
  try {
    area(which)?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignored: the flow still works in memory for this page.
  }
}

export function removeKey(which: Area, key: string): void {
  try {
    area(which)?.removeItem(key);
  } catch {
    // Ignored.
  }
}

/** Storage keys used by the app. */
export const storageKeys = {
  /** Signup flow entries for this tab (AU-02 … AU-04). */
  signup: "bg.signup",
  /** Password reset flow for this tab (AU-07 … AU-09). */
  reset: "bg.reset",
  /** Phone handed from "Log in with this number" to the login form (never in a URL). */
  loginPhone: "bg.login.phone",
  /** Login lock: phone and unlock time, so the countdown survives a reload (auth.md §3.2). */
  loginLock: "bg.login.lock",
  /** Referrer username captured from `?ref=` (local, survives the tab). */
  referral: "bg.ref",
  /** AU-13 was shown for this sign-in. */
  suspendedSeen: "bg.suspendedSeen",
  /** The user skipped the avatar step (AC-02 first-time hint). */
  avatarSkipped: "bg.avatarSkipped",
  /** Preference changes waiting to sync (ST-01 offline). */
  pendingPrefs: "bg.prefs.pending",
} as const;

/** Clears user-scoped data on logout: every `bg.*` sessionStorage key and pending prefs. */
export function clearUserData(): void {
  const session = area("session");
  if (session) {
    try {
      for (const key of Object.keys(session)) if (key.startsWith("bg.")) session.removeItem(key);
    } catch {
      // Ignored.
    }
  }
  removeKey("local", storageKeys.pendingPrefs);
  removeKey("local", storageKeys.avatarSkipped);
}
