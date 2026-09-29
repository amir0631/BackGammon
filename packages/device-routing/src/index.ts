// Device routing between the desktop (`app.`) and mobile (`m.`) surfaces (CLAUDE.md §11.0).
// Pure functions: each app's Next.js middleware (and tests) call `resolveRedirect`.

export type DeviceClass = "mobile" | "desktop";
export type Surface = "mobile" | "desktop" | "root";

export const VIEW_PREF_COOKIE = "view_pref";
const VIEW_PREF_MAX_AGE = 60 * 60 * 24 * 365;

export interface RoutingConfig {
  baseDomain: string;
  desktopEnabled: boolean;
  scheme: "http" | "https";
}

export interface RoutingRequest {
  host: string;
  pathname: string;
  search: string;
  secChUaMobile: string | null;
  userAgent: string | null;
  viewPref: string | null;
}

const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile/i;

/** Rule 1: Client Hint first, then User-Agent. Phones and tablets are `mobile`. */
export function detectDevice(secChUaMobile: string | null, userAgent: string | null): DeviceClass {
  if (secChUaMobile === "?1") return "mobile";
  // `?0` is also sent by Android tablets, so a desktop hint still falls through to the UA check.
  return userAgent && MOBILE_UA.test(userAgent) ? "mobile" : "desktop";
}

// Rule 5: never redirect API, WebSocket, payment callbacks, static assets, PWA files.
const EXCLUDED_ROOTS = ["/api", "/ws", "/payments/callback", "/_next", "/static", "/assets"];
const EXCLUDED_FILES = new Set(["/manifest.webmanifest", "/sw.js", "/robots.txt", "/favicon.ico"]);

export function isExcludedPath(pathname: string): boolean {
  if (EXCLUDED_FILES.has(pathname)) return true;
  if (EXCLUDED_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))) return true;
  if (/^\/(swe-worker|workbox)-[\w-]*\.js$/.test(pathname)) return true;
  // Any path whose last segment has a file extension is a static asset.
  return /\/[^/]+\.[a-z0-9]{1,8}$/i.test(pathname);
}

function splitHost(host: string): { name: string; port: string } {
  const idx = host.lastIndexOf(":");
  if (idx > -1 && !host.includes("]", idx)) return { name: host.slice(0, idx).toLowerCase(), port: host.slice(idx) };
  return { name: host.toLowerCase(), port: "" };
}

export function surfaceOf(host: string, baseDomain: string): Surface | null {
  const { name } = splitHost(host);
  const base = baseDomain.toLowerCase();
  if (name === `m.${base}`) return "mobile";
  if (name === `app.${base}`) return "desktop";
  if (name === base || name === `www.${base}`) return "root";
  return null;
}

function surfaceUrl(target: "mobile" | "desktop", req: RoutingRequest, config: RoutingConfig): string {
  const { port } = splitHost(req.host);
  const sub = target === "mobile" ? "m" : "app";
  return `${config.scheme}://${sub}.${config.baseDomain}${port}${req.pathname}${req.search}`;
}

/** Returns the absolute URL to 302 to, or null when the request should be served here. */
export function resolveRedirect(req: RoutingRequest, config: RoutingConfig): string | null {
  if (isExcludedPath(req.pathname)) return null;
  const surface = surfaceOf(req.host, config.baseDomain);
  if (surface === null) return null;

  // Phase 1: everything is served by `m.`.
  if (!config.desktopEnabled) {
    return surface === "mobile" ? null : surfaceUrl("mobile", req, config);
  }

  // Rule 4: an explicit preference overrides detection; no redirect except from the root.
  if (req.viewPref === "mobile" || req.viewPref === "desktop") {
    return surface === "root" ? surfaceUrl(req.viewPref, req, config) : null;
  }

  const target = detectDevice(req.secChUaMobile, req.userAgent);
  return surface === target ? null : surfaceUrl(target, req, config);
}

/** Set-Cookie value for the "switch to desktop / mobile version" link (rule 4). */
export function viewPrefCookie(pref: DeviceClass, config: RoutingConfig): string {
  const secure = config.scheme === "https" ? "; Secure" : "";
  return `${VIEW_PREF_COOKIE}=${pref}; Domain=.${config.baseDomain}; Path=/; Max-Age=${VIEW_PREF_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * The base domain from a surface host (`m.x3d.ir` → `x3d.ir`), for client code that only knows its
 * own location. Hosts without a known surface prefix are returned as-is (local dev, bare IPs).
 */
export function baseDomainFromHost(hostname: string): string {
  const name = hostname.toLowerCase().replace(/:\d+$/, "");
  const m = name.match(/^(?:m|app|www)\.(.+)$/);
  return m ? m[1]! : name;
}

/**
 * Rule 5: the installed PWA (`display-mode: standalone`) pins `view_pref=mobile`, so Phase 2
 * detection never sends it to `app.`. Returns the `document.cookie` value to set.
 */
export function standaloneViewPrefCookie(hostname: string, protocol: string): string {
  return viewPrefCookie("mobile", { baseDomain: baseDomainFromHost(hostname), desktopEnabled: false, scheme: protocol === "https:" ? "https" : "http" });
}
