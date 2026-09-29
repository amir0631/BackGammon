import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { minTouchTarget } from "@bg/design-tokens";

// Automated layout checks from CLAUDE.md §16 (Responsive) and docs/ui/design-system.md §10:
// no horizontal scroll, no visible touch target under 44 × 44 CSS px, and no overflow at 200% text.

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export interface SmallTarget {
  tag: string;
  text: string;
  width: number;
  height: number;
}

/**
 * Visible interactive elements smaller than the minimum target. Exempt (WCAG 2.5.8): links inside
 * a sentence, visually hidden inputs whose label is the target (radios, checkboxes, switches),
 * and the skip link while hidden.
 */
export async function smallTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate((min) => {
    const selector = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=switch]";
    const out: { tag: string; text: string; width: number; height: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
      if (rect.width <= 1 || rect.height <= 1) continue; // visually hidden; the label is the target
      if (el.closest("[aria-hidden=true]")) continue;
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "text" && style.opacity === "0") {
        // MUI checkbox/radio/switch inputs: the visible control around them is measured instead.
        const box = el.parentElement?.getBoundingClientRect();
        if (box && box.width >= min - 0.5 && box.height >= min - 0.5) continue;
      }
      if (el.tagName === "A") {
        const block = el.parentElement;
        const inline = block && (block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length;
        if (inline && style.display === "inline") continue;
      }
      if (rect.width < min - 0.5 || rect.height < min - 0.5) {
        out.push({ tag: el.tagName.toLowerCase(), text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
    return out;
  }, minTouchTarget);
}

/** Root text at 200% (browser text zoom / OS font size), as in the design-system checks. */
export async function setTextScale(page: Page, percent: 100 | 200): Promise<void> {
  await page.evaluate((p) => {
    document.documentElement.style.fontSize = p === 200 ? "200%" : "";
  }, percent);
  await page.waitForTimeout(200);
}

/**
 * Visual regression against the committed baselines in docs/ui/screenshots/<area>/ (§16
 * Responsive): UPDATE_SCREENSHOTS=1 rewrites them; otherwise the page is compared with
 * `toHaveScreenshot` (VISUAL=0 skips the comparison, e.g. on a machine without the baseline fonts).
 */
export async function screenshot(page: Page, area: string, name: string): Promise<void> {
  if (process.env.UPDATE_SCREENSHOTS) {
    await page.screenshot({
      path: path.resolve(__dirname, "../../../docs/ui/screenshots", area, `${name}.png`),
      animations: "disabled",
      caret: "hide",
    });
    return;
  }
  if (process.env.VISUAL === "0") return;
  await expect(page).toHaveScreenshot([area, `${name}.png`], { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01 });
}
