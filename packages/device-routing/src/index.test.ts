import { describe, expect, it } from "vitest";
import { detectDevice, isExcludedPath, resolveRedirect, type RoutingConfig, type RoutingRequest } from "./index";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

const phase1: RoutingConfig = { baseDomain: "x3d.ir", desktopEnabled: false, scheme: "https" };
const phase2: RoutingConfig = { ...phase1, desktopEnabled: true };

function req(overrides: Partial<RoutingRequest>): RoutingRequest {
  return {
    host: "app.x3d.ir",
    pathname: "/play",
    search: "?tier=2",
    secChUaMobile: null,
    userAgent: WINDOWS,
    viewPref: null,
    ...overrides,
  };
}

describe("detectDevice", () => {
  it("trusts the mobile client hint", () => expect(detectDevice("?1", WINDOWS)).toBe("mobile"));
  it("treats tablets as mobile even with ?0", () => expect(detectDevice("?0", ANDROID_TABLET)).toBe("mobile"));
  it("falls back to the user agent", () => expect(detectDevice(null, IPHONE)).toBe("mobile"));
  it("defaults to desktop", () => expect(detectDevice(null, WINDOWS)).toBe("desktop"));
});

describe("Phase 1 (DESKTOP_ENABLED=false)", () => {
  it("redirects app. to m. with path and query", () => {
    expect(resolveRedirect(req({}), phase1)).toBe("https://m.x3d.ir/play?tier=2");
  });
  it("redirects the root domain to m.", () => {
    expect(resolveRedirect(req({ host: "x3d.ir", pathname: "/" , search: "" }), phase1)).toBe("https://m.x3d.ir/");
  });
  it("serves desktops on m. without redirect", () => {
    expect(resolveRedirect(req({ host: "m.x3d.ir" }), phase1)).toBeNull();
  });
  it("ignores view_pref", () => {
    expect(resolveRedirect(req({ viewPref: "desktop" }), phase1)).toBe("https://m.x3d.ir/play?tier=2");
  });
});

describe("Phase 2 (DESKTOP_ENABLED=true)", () => {
  it("sends a phone on app. to m.", () => {
    expect(resolveRedirect(req({ userAgent: IPHONE }), phase2)).toBe("https://m.x3d.ir/play?tier=2");
  });
  it("sends a desktop on m. to app.", () => {
    expect(resolveRedirect(req({ host: "m.x3d.ir" }), phase2)).toBe("https://app.x3d.ir/play?tier=2");
  });
  it("keeps a desktop on app.", () => expect(resolveRedirect(req({}), phase2)).toBeNull());
  it("lets view_pref override detection", () => {
    expect(resolveRedirect(req({ host: "m.x3d.ir", viewPref: "mobile" }), phase2)).toBeNull();
    expect(resolveRedirect(req({ userAgent: IPHONE, viewPref: "desktop" }), phase2)).toBeNull();
  });
  it("routes the root by view_pref, then by device", () => {
    expect(resolveRedirect(req({ host: "x3d.ir", viewPref: "mobile" }), phase2)).toBe("https://m.x3d.ir/play?tier=2");
    expect(resolveRedirect(req({ host: "x3d.ir", userAgent: IPHONE }), phase2)).toBe("https://m.x3d.ir/play?tier=2");
    expect(resolveRedirect(req({ host: "x3d.ir" }), phase2)).toBe("https://app.x3d.ir/play?tier=2");
  });
  it("preserves a port in local development", () => {
    const local: RoutingConfig = { baseDomain: "localhost", desktopEnabled: true, scheme: "http" };
    expect(resolveRedirect(req({ host: "m.localhost:8080" }), local)).toBe("http://app.localhost:8080/play?tier=2");
  });
});

describe("excluded paths are never redirected", () => {
  const paths = [
    "/api/v1/me",
    "/ws",
    "/payments/callback/sandbox",
    "/_next/static/chunk.js",
    "/manifest.webmanifest",
    "/sw.js",
    "/models/board.glb",
    "/fonts/vazirmatn.woff2",
  ];
  for (const pathname of paths) {
    it(pathname, () => {
      expect(isExcludedPath(pathname)).toBe(true);
      expect(resolveRedirect(req({ pathname, userAgent: IPHONE }), phase2)).toBeNull();
      expect(resolveRedirect(req({ pathname }), phase1)).toBeNull();
    });
  }
  it("does not exclude app routes", () => expect(isExcludedPath("/profile/ali")).toBe(false));
});

it("ignores unrelated hosts", () => {
  expect(resolveRedirect(req({ host: "admin.x3d.ir" }), phase1)).toBeNull();
});

describe("standalone view_pref (rule 5)", () => {
  it("derives the base domain and pins mobile", async () => {
    const { baseDomainFromHost, standaloneViewPrefCookie } = await import("./index");
    expect(baseDomainFromHost("m.x3d.ir")).toBe("x3d.ir");
    expect(baseDomainFromHost("m.localhost:3000")).toBe("localhost");
    expect(standaloneViewPrefCookie("m.x3d.ir", "https:")).toContain("view_pref=mobile; Domain=.x3d.ir");
    expect(standaloneViewPrefCookie("m.x3d.ir", "https:")).toContain("Secure");
  });
});
