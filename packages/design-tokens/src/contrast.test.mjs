// WCAG 2.2 AA contrast checks for every token pair the UI relies on.
// Runs with Node's built-in test runner (type stripping imports the .ts source directly).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  colorModes,
  contrastRatio,
  palette,
  toneRoles,
  typeRoles,
  lineHeight,
  letterSpacing,
  breakpoints,
  duration,
  reducedDuration,
  minTouchTarget,
  boardDefaultTheme,
  avatarArt,
  avatarFallbackArt,
} from "./index.ts";

const TEXT = 4.5;
const UI = 3;

function expectContrast(fg, bg, min, label) {
  const ratio = contrastRatio(fg, bg);
  assert.ok(ratio >= min, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
}

for (const mode of colorModes) {
  const c = palette[mode];
  const surfaces = { background: c.background, surface: c.surface, surfaceRaised: c.surfaceRaised };

  describe(`${mode} palette`, () => {
    it("has body text at 4.5:1 on every surface", () => {
      for (const [name, bg] of Object.entries(surfaces)) {
        expectContrast(c.textPrimary, bg, TEXT, `${mode} textPrimary/${name}`);
        expectContrast(c.textSecondary, bg, TEXT, `${mode} textSecondary/${name}`);
      }
      expectContrast(c.textPrimary, c.surfaceSunken, TEXT, `${mode} textPrimary/surfaceSunken`);
      expectContrast(c.textSecondary, c.surfaceSunken, TEXT, `${mode} textSecondary/surfaceSunken`);
    });

    it("has tone colors usable as text (links, helper errors) on every surface", () => {
      for (const role of toneRoles) {
        for (const [name, bg] of Object.entries(surfaces)) {
          expectContrast(c[role], bg, TEXT, `${mode} ${role}/${name}`);
        }
      }
    });

    it("has on-colors at 4.5:1 on their fills and containers", () => {
      for (const role of toneRoles) {
        const on = `on${role[0].toUpperCase()}${role.slice(1)}`;
        expectContrast(c[on], c[role], TEXT, `${mode} ${on}/${role}`);
        expectContrast(c[`${on}Container`], c[`${role}Container`], TEXT, `${mode} ${on}Container`);
      }
      expectContrast(c.onInverseSurface, c.inverseSurface, TEXT, `${mode} inverse`);
    });

    it("has control boundaries and focus rings at 3:1 on every surface", () => {
      for (const [name, bg] of Object.entries(surfaces)) {
        expectContrast(c.outline, bg, UI, `${mode} outline/${name}`);
        expectContrast(c.focusRing, bg, UI, `${mode} focusRing/${name}`);
        expectContrast(c.primary, bg, UI, `${mode} primary (UI)/${name}`);
      }
      expectContrast(c.outline, c.surfaceSunken, UI, `${mode} outline/surfaceSunken`);
    });

    it("keeps the two player markers distinguishable from each other and the surface", () => {
      expectContrast(c.playerLight, c.playerDark, UI, `${mode} player markers`);
      expectContrast(c.playerLightRim, c.playerLight, UI, `${mode} light marker rim`);
      expectContrast(c.playerDarkRim, c.playerDark, UI, `${mode} dark marker rim`);
    });
  });
}

describe("typography", () => {
  it("gives Persian body text a line height of at least 1.6", () => {
    for (const role of ["body", "bodyLarge", "bodySmall", "caption"]) {
      assert.ok(lineHeight.fa[role] >= 1.6, `fa ${role} line height ${lineHeight.fa[role]}`);
    }
  });

  it("never letter-spaces Persian", () => {
    for (const role of typeRoles) assert.equal(letterSpacing.fa[role], "0");
  });
});

describe("layout and motion", () => {
  it("uses the §11.7 breakpoints", () => {
    assert.deepEqual(breakpoints, { xs: 0, sm: 360, md: 600, lg: 1024 });
    assert.equal(minTouchTarget, 44);
  });

  it("keeps UI motion within 150–250 ms and checker moves within 200–350 ms", () => {
    for (const key of ["fast", "base", "slow"]) {
      assert.ok(duration[key] >= 150 && duration[key] <= 250, key);
    }
    for (const key of ["checkerShort", "checker", "checkerLong"]) {
      assert.ok(duration[key] >= 200 && duration[key] <= 350, key);
    }
  });

  it("never makes reduced motion slower than normal motion", () => {
    for (const key of Object.keys(duration)) {
      assert.ok(reducedDuration[key] <= duration[key], key);
    }
  });

  it("keeps the default board theme readable (template for every theme)", () => {
    const b = boardDefaultTheme;
    expectContrast(b.pointLight, b.pointDark, UI, "point colors");
    expectContrast(b.checkerLight, b.checkerDark, UI, "checker sides");
    expectContrast(b.checkerLightRim, b.checkerLight, UI, "light checker rim");
    expectContrast(b.checkerDarkRim, b.checkerDark, UI, "dark checker rim");
  });

  it("keeps the legal-move highlight distinct from both checker colors", () => {
    expectContrast(boardDefaultTheme.legalMove, boardDefaultTheme.checkerDark, UI, "legal/checkerDark");
    expectContrast(boardDefaultTheme.selection, boardDefaultTheme.checkerDark, UI, "selection/checkerDark");
  });

  it("keeps markers readable on the field and their digits on the marker", () => {
    const b = boardDefaultTheme;
    expectContrast(b.markerInk, b.legalMove, TEXT, "marker digit/legalMove");
    expectContrast(b.legalMove, b.pointDark, UI, "legalMove/pointDark");
    expectContrast(b.selection, b.pointDark, UI, "selection/pointDark");
  });
});

describe("avatar art", () => {
  it("keeps every motif readable on its ground", () => {
    for (const [key, art] of Object.entries({ ...avatarArt, fallback: avatarFallbackArt })) {
      expectContrast(art.ink, art.ground, UI, `avatar ${key} ink/ground`);
    }
  });
});
