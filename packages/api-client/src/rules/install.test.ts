import { describe, expect, it } from "vitest";
import { INSTALL_RESHOW_MS, installBannerDue, installPlatform, isInstallHost, recordInstallShow } from "./install";

describe("install banner rules", () => {
  it("shows on the first visit, again after 7 days, at most 3 times", () => {
    const t0 = 1_000_000;
    expect(installBannerDue(null, t0)).toBe(true);
    let r = recordInstallShow(null, t0);
    expect(installBannerDue(r, t0 + INSTALL_RESHOW_MS - 1)).toBe(false);
    expect(installBannerDue(r, t0 + INSTALL_RESHOW_MS)).toBe(true);
    r = recordInstallShow(recordInstallShow(r, t0 + INSTALL_RESHOW_MS), t0 + 2 * INSTALL_RESHOW_MS);
    expect(r.shows).toBe(3);
    expect(installBannerDue(r, t0 + 10 * INSTALL_RESHOW_MS)).toBe(false);
  });

  it("detects the install path", () => {
    expect(installPlatform({ standalone: true, hasPrompt: true, userAgent: "" })).toBe("installed");
    expect(installPlatform({ standalone: false, hasPrompt: true, userAgent: "Android" })).toBe("prompt");
    expect(installPlatform({ standalone: false, hasPrompt: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe("ios");
    expect(installPlatform({ standalone: false, hasPrompt: false, userAgent: "Mozilla/5.0 (Macintosh)", maxTouchPoints: 5 })).toBe("ios");
    expect(installPlatform({ standalone: false, hasPrompt: false, userAgent: "Mozilla/5.0 (X11; Linux)" })).toBe("manual");
  });

  it("only allows tab roots", () => {
    expect(isInstallHost("/play")).toBe(true);
    expect(isInstallHost("/match/abc")).toBe(false);
    expect(isInstallHost("/wallet/transfer")).toBe(false);
  });
});
