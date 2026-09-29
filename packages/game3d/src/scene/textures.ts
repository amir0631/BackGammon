// Procedural, original textures painted on canvases at runtime (docs/ui/3d-art-direction.md §3):
// wood grain, the point field, the khatam star band on the bar, checker top motifs, dice faces,
// markers, and soft shadows. Nothing is downloaded, and the ornament is built from our own 8-point
// star geometry. Grain uses the deterministic PRNG, never Math.random.
import * as THREE from "three";
import { prng } from "../dice/math";
import { BOARD, DIMS } from "./geometry";
import { alpha, type BoardTheme } from "./theme";

export type Quality = "normal" | "lite";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  return [c, ctx];
}

function texture(c: HTMLCanvasElement, anisotropy = 4): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Long straight grain streaks over a base color. */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, streak: string, seed: number, vertical = false, density = 1) {
  const rand = prng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const across = vertical ? w : h;
  const n = Math.round((across / 3) * density);
  ctx.strokeStyle = streak;
  for (let i = 0; i < n; i++) {
    const p = rand() * across;
    ctx.globalAlpha = 0.04 + rand() * 0.1;
    ctx.lineWidth = 0.6 + rand() * 1.8;
    ctx.beginPath();
    const wobble = 1 + rand() * 3;
    const phase = rand() * Math.PI * 2;
    const len = vertical ? h : w;
    for (let s = 0; s <= 24; s++) {
      const t = (s / 24) * len;
      const off = Math.sin(phase + (s / 24) * Math.PI * (1 + rand() * 0.2)) * wobble;
      if (vertical) {
        if (s === 0) ctx.moveTo(x + p + off, y + t);
        else ctx.lineTo(x + p + off, y + t);
      } else if (s === 0) ctx.moveTo(x + t, y + p + off);
      else ctx.lineTo(x + t, y + p + off);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** An 8-point khatam star (two squares at 45°). */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.62) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const px = cx + rr * Math.cos(a);
    const py = cy + rr * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The whole top face: frame, both fields with their points, the inlaid bar, and the trays. */
export function boardTopTexture(theme: BoardTheme, quality: Quality): THREE.CanvasTexture {
  const ppu = quality === "lite" ? 56 : 112;
  const d = DIMS;
  const [c, ctx] = canvas(d.length * ppu, d.depth * ppu);
  const X = (x: number) => (x + d.length / 2) * ppu;
  const Z = (z: number) => (z + d.depth / 2) * ppu;

  grain(ctx, 0, 0, c.width, c.height, theme.frameWood, theme.grainDark, 11);
  // Fields: quiet maple so checkers read clearly (§3).
  for (const [x0, x1] of [
    [d.leftFieldStart, d.leftFieldEnd],
    [d.rightFieldStart, d.rightFieldEnd],
  ] as const) {
    grain(ctx, X(x0), Z(d.zTop), (x1 - x0) * ppu, (d.zBottom - d.zTop) * ppu, theme.fieldWood, theme.fieldGrain, 23 + x0, true, 0.5);
    // Points: triangles from each row's edge toward the middle, alternating colors.
    for (let k = 0; k < 6; k++) {
      for (const bottom of [true, false]) {
        const dark = (k + (bottom ? 0 : 1)) % 2 === 0;
        const left = X(x0 + k) + ppu * 0.03;
        const right = X(x0 + k + 1) - ppu * 0.03;
        const base = bottom ? Z(d.zBottom) : Z(d.zTop);
        const tip = bottom ? Z(d.zBottom - BOARD.pointLength * 0.96) : Z(d.zTop + BOARD.pointLength * 0.96);
        ctx.beginPath();
        ctx.moveTo(left, base);
        ctx.lineTo(right, base);
        ctx.lineTo((left + right) / 2, tip);
        ctx.closePath();
        ctx.fillStyle = dark ? theme.pointDark : theme.pointLight;
        ctx.fill();
        ctx.lineWidth = Math.max(1, ppu * 0.018);
        ctx.strokeStyle = theme.brass;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // Soft inner edge where the field meets the frame (baked occlusion).
    const g = ctx.createLinearGradient(0, Z(d.zTop), 0, Z(d.zTop) + ppu * 0.35);
    g.addColorStop(0, alpha(theme.shadow, 0.28));
    g.addColorStop(1, alpha(theme.shadow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(X(x0), Z(d.zTop), (x1 - x0) * ppu, ppu * 0.35);
    const g2 = ctx.createLinearGradient(0, Z(d.zBottom), 0, Z(d.zBottom) - ppu * 0.35);
    g2.addColorStop(0, alpha(theme.shadow, 0.28));
    g2.addColorStop(1, alpha(theme.shadow, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(X(x0), Z(d.zBottom) - ppu * 0.35, (x1 - x0) * ppu, ppu * 0.35);
  }

  // Bar: walnut with a khatam star band down its length (ornament on the bar, never under checkers).
  const bx0 = X(d.barStart);
  const bw = BOARD.bar * ppu;
  grain(ctx, bx0, Z(d.zTop), bw, (d.zBottom - d.zTop) * ppu, theme.frameWoodDark, theme.grainDark, 41, true);
  const band = bw * 0.46;
  const bandX = bx0 + (bw - band) / 2;
  ctx.fillStyle = theme.inlayEbony;
  ctx.fillRect(bandX, Z(d.zTop), band, (d.zBottom - d.zTop) * ppu);
  const r = band * 0.42;
  for (let y = Z(d.zTop) + r * 1.3; y < Z(d.zBottom) - r; y += r * 2.3) {
    star(ctx, bandX + band / 2, y, r);
    ctx.fillStyle = theme.inlayTurquoise;
    ctx.fill();
    ctx.lineWidth = Math.max(1, ppu * 0.02);
    ctx.strokeStyle = theme.inlayBone;
    ctx.stroke();
    star(ctx, bandX + band / 2, y, r * 0.42, 0.55);
    ctx.fillStyle = theme.inlayBone;
    ctx.fill();
  }
  ctx.strokeStyle = theme.brass;
  ctx.lineWidth = Math.max(1, ppu * 0.025);
  ctx.strokeRect(bandX, Z(d.zTop), band, (d.zBottom - d.zTop) * ppu);

  // Trays: darker floors.
  grain(ctx, X(d.trayStart), Z(d.zTop), BOARD.tray * ppu, (d.zBottom - d.zTop) * ppu, theme.trayFloor, theme.grainDark, 57, true);
  return texture(c, quality === "lite" ? 2 : 8);
}

/** Long-grain walnut for the frame rails. */
export function railTexture(theme: BoardTheme, quality: Quality): THREE.CanvasTexture {
  const [c, ctx] = canvas(quality === "lite" ? 256 : 512, 64);
  grain(ctx, 0, 0, c.width, c.height, theme.frameWood, theme.grainDark, 71, false, 1.4);
  grain(ctx, 0, 0, c.width, c.height, alpha(theme.shadow, 0), theme.grainLight, 73, false, 0.4);
  const t = texture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Top face of a checker: body, rim ring, and the side motif (player A: an engraved 8-point star;
 * player B: concentric rings), so ownership never relies on color (P§13). The area outside the
 * disc is rim color: the checker's sides sample it.
 */
export function checkerTexture(body: string, rim: string, motif: "star" | "rings", quality: Quality, shade: string, light: string): THREE.CanvasTexture {
  const size = quality === "lite" ? 128 : 256;
  const [c, ctx] = canvas(size, size);
  const m = size / 2;
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(m, m, m * 0.97, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(m, m, m * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  // Subtle dished center.
  const g = ctx.createRadialGradient(m, m, m * 0.1, m, m, m * 0.82);
  g.addColorStop(0, alpha(light, 0.06));
  g.addColorStop(1, alpha(shade, 0.12));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = size * 0.028;
  if (motif === "star") {
    star(ctx, m, m, m * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m, m, m * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();
  } else {
    for (const rr of [0.62, 0.42, 0.22]) {
      ctx.beginPath();
      ctx.arc(m, m, m * rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return texture(c);
}

/** Dice faces in a 3 × 2 atlas, cell order 1–6 (see `dieUvCell`). Recessed pips drawn with a gradient. */
export function diceTexture(body: string, pip: string, quality: Quality, shade: string): THREE.CanvasTexture {
  const cell = quality === "lite" ? 96 : 192;
  const [c, ctx] = canvas(cell * 3, cell * 2);
  const layout: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]],
  };
  for (let v = 1; v <= 6; v++) {
    const ox = ((v - 1) % 3) * cell;
    const oy = Math.floor((v - 1) / 3) * cell;
    ctx.fillStyle = body;
    ctx.fillRect(ox, oy, cell, cell);
    const edge = ctx.createRadialGradient(ox + cell / 2, oy + cell / 2, cell * 0.3, ox + cell / 2, oy + cell / 2, cell * 0.72);
    edge.addColorStop(0, alpha(shade, 0));
    edge.addColorStop(1, alpha(shade, 0.14));
    ctx.fillStyle = edge;
    ctx.fillRect(ox, oy, cell, cell);
    for (const [px, py] of layout[v]!) {
      const x = ox + px * cell;
      const y = oy + py * cell;
      const r = cell * (v === 1 ? 0.12 : 0.085);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, pip);
      g.addColorStop(1, pip);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + r * 0.15, y + r * 0.2, r * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(body, 0.5);
      ctx.lineWidth = cell * 0.008;
      ctx.stroke();
    }
  }
  return texture(c);
}

/** Atlas cell (column, row) of a die face value in `diceTexture`. */
export function dieUvCell(value: number): [number, number] {
  return [(value - 1) % 3, Math.floor((value - 1) / 3)];
}

/** Soft round shadow (board contact shadow, checker and dice blobs). */
export function blobTexture(shade: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, alpha(shade, 0.55));
  g.addColorStop(0.55, alpha(shade, 0.25));
  g.addColorStop(1, alpha(shade, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Soft rectangular contact shadow of the board on whatever is behind the canvas. */
export function contactShadowTexture(shade: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 160);
  ctx.filter = "blur(14px)";
  ctx.fillStyle = alpha(shade, 0.55);
  ctx.fillRect(28, 28, 200, 104);
  return new THREE.CanvasTexture(c);
}

/**
 * Legal-destination marker (§5): a ring-and-dot in the legal-move color with a dark outline, and
 * the die number, so it reads on light and dark points and never by color alone. `label` is the
 * localized digit or the "Off" word, drawn with the app's font.
 */
export function markerTexture(theme: BoardTheme, label: string, font: string): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size, size);
  const m = size / 2;
  ctx.beginPath();
  ctx.arc(m, m, m * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = theme.markerInk;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(m, m, m * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = theme.legalMove;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(m, m, m * 0.56, 0, Math.PI * 2);
  ctx.fillStyle = theme.markerInk;
  ctx.fill();
  ctx.fillStyle = theme.legalMove;
  const long = label.length > 2;
  ctx.font = `700 ${long ? size * 0.24 : size * 0.46}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, m, m + size * 0.02, size * 0.8);
  return texture(c);
}

/** A plain ring (selection outline, movable-source marker). */
export function ringTexture(color: string, width = 0.16): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (size / 2) * (1 - width / 2), 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = (size / 2) * width;
  ctx.stroke();
  return texture(c);
}

/** Chevron arrow for the last opponent move (§5: arrows, not color alone). */
export function arrowTexture(color: string): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size, size);
  ctx.beginPath();
  ctx.moveTo(size * 0.2, size * 0.3);
  ctx.lineTo(size * 0.5, size * 0.7);
  ctx.lineTo(size * 0.8, size * 0.3);
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.13;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  return texture(c);
}
