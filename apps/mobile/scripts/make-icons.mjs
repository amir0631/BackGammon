// Generates the PWA icons in public/icons from design tokens (CLAUDE.md §11.5; original art: the
// brand mark, a khatam-style eight-point star with a turquoise inlay on the dark chrome).
// Run once after changing the mark or the palette: `node scripts/make-icons.mjs [path-to-sharp]`.
// The PNGs are checked in, so the build needs no image tooling. sharp is resolved from next's
// optional dependency; pass its path when it isn't resolvable from here.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] ?? "sharp");

// Tokens (packages/design-tokens: palette.dark, boardDefaultTheme). Kept literal so this script
// runs with plain node; update together with the tokens.
const BG = "#14110f";
const FRAME = "#5a3a22";
const BRASS = "#d9a94e";
const INLAY = "#3fa59c";
const IVORY = "#ede4d0";

/** The mark on a 24-unit grid, scaled into a `size` square with `pad` (fraction of the side). */
function svg(size, pad, { rounded, mono = false }) {
  const inner = size * (1 - pad * 2);
  const s = inner / 24;
  const o = size * pad;
  const stroke = mono ? "#ffffff" : BRASS;
  const r = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${mono ? "" : `<rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>`}
  ${mono ? "" : `<circle cx="${size / 2}" cy="${size / 2}" r="${inner * 0.47}" fill="${FRAME}" opacity="0.55"/>`}
  <g transform="translate(${o} ${o}) scale(${s})" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round">
    <rect x="5.5" y="5.5" width="13" height="13" rx="1"/>
    <rect x="5.5" y="5.5" width="13" height="13" rx="1" transform="rotate(45 12 12)"/>
    <circle cx="12" cy="12" r="2.6" fill="${mono ? "#ffffff" : INLAY}" stroke="${mono ? "#ffffff" : IVORY}" stroke-width="0.9"/>
  </g>
</svg>`;
}

const out = join(import.meta.dirname, "..", "public", "icons");
mkdirSync(out, { recursive: true });
const jobs = [
  ["icon-192.png", 192, svg(192, 0.1, { rounded: true })],
  ["icon-512.png", 512, svg(512, 0.1, { rounded: true })],
  // Maskable: full bleed, the mark inside the 80 % safe zone.
  ["maskable-192.png", 192, svg(192, 0.2, { rounded: false })],
  ["maskable-512.png", 512, svg(512, 0.2, { rounded: false })],
  ["apple-touch-icon.png", 180, svg(180, 0.12, { rounded: false })],
  // Notification badge: white on transparent (Android tints it).
  ["badge-96.png", 96, svg(96, 0.06, { rounded: false, mono: true })],
];
for (const [name, size, markup] of jobs) {
  await sharp(Buffer.from(markup)).resize(size, size).png({ compressionLevel: 9 }).toFile(join(out, name));
}
writeFileSync(join(out, "icon.svg"), svg(512, 0.1, { rounded: true }));
console.log(`wrote ${jobs.length + 1} icons to ${out}`);
