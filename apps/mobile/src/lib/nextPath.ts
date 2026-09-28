// `next` query parameter on auth routes (ia.md §2): same-origin paths only, never another host.

const DEFAULT_DESTINATION = "/play";

/** A safe in-app path, or null. Rejects protocol-relative (`//x`), backslash, and absolute URLs. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  // Never bounce back into an auth screen after signing in.
  if (/^\/(login|signup|password\/reset)(\/|$|\?)/.test(value)) return null;
  return value;
}

export function destination(next: string | null | undefined): string {
  return safeNext(next) ?? DEFAULT_DESTINATION;
}

export function loginHref(next?: string | null): string {
  const safe = safeNext(next ?? null);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
