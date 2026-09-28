import localFont from "next/font/local";

// Self-hosted variable fonts (CLAUDE.md §2 rule 9, §11.3). Sources, versions, and checksums are
// recorded in src/fonts/README.md; licenses (SIL OFL 1.1) ship next to the files.
// The `variable` names must match `fontFamilyVar` in @bg/design-tokens (next/font needs literals).

/** Vazirmatn v33.003 (fa). Default locale, so it is preloaded. Includes Persian digits and ZWNJ. */
export const fontFa = localFont({
  src: "../fonts/Vazirmatn-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-fa",
  preload: true,
  fallback: ["Tahoma", "system-ui", "sans-serif"],
});

/**
 * Inter v4.1 (en). Not preloaded: fa users never need it (Vazirmatn carries its own Latin), and
 * en users get it on first paint through `font-display: swap`.
 */
export const fontEn = localFont({
  src: "../fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-en",
  preload: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const fontVariables = `${fontFa.variable} ${fontEn.variable}`;
