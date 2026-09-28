import type { ReactNode } from "react";
import { avatarArt, avatarFallbackArt, avatarSize, type AvatarArt, type AvatarMotif } from "@bg/design-tokens";

// Preset avatar art (CLAUDE.md §1: avatars from a preset set). The API sends keys only; each key
// maps to an original flat motif on a colored disc (tokens `avatarArt`). Motifs draw on Persian
// craft and the game: khatam star, cypress, paisley, pomegranate, moon, sun, die, crown, bird,
// fish, tulip, mountain. Inline SVG, self-hosted, no raster assets.
//
// Decorative by default (next to a visible username). Pass `label` when the avatar stands alone.

function star(cx: number, cy: number, r: number, inner = 0.55): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const radius = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function motif(kind: AvatarMotif, { ink, accent, ground }: AvatarArt): ReactNode {
  switch (kind) {
    case "star":
      return (
        <>
          <polygon points={star(24, 24, 16)} fill={ink} />
          <circle cx={24} cy={24} r={4.5} fill={accent} />
        </>
      );
    case "cypress":
      return (
        <>
          <path d="M24 7c5 6 8.5 14 7.5 22-.6 4.6-3 7-7.5 7s-6.9-2.4-7.5-7C15.5 21 19 13 24 7z" fill={ink} />
          <path d="M24 13v19M24 20l-3.5-3M24 26l3.5-3" stroke={ground} strokeWidth={1.6} strokeLinecap="round" fill="none" />
          <rect x={22.5} y={35} width={3} height={6} rx={1} fill={accent} />
        </>
      );
    case "paisley":
      return (
        <>
          <path d="M31 8c1.5 4-1 7-4 8.5 5.5-.5 9.5 3.5 9.5 9.5 0 7.5-6 13-13 13-6.5 0-11.5-5-11.5-11.5C12 17 21 10.5 31 8z" fill={ink} />
          <circle cx={23.5} cy={28} r={5.5} fill={ground} />
          <circle cx={23.5} cy={28} r={2.6} fill={accent} />
        </>
      );
    case "pomegranate":
      return (
        <>
          <path d="M19.5 15l1.5-5.5 3 3.5 3-3.5 1.5 5.5z" fill={ink} />
          <circle cx={24} cy={27} r={12.5} fill={ink} />
          <path d="M31 11c3-2 6-1.5 7 .5-2.5 1.5-5 1.5-7-.5z" fill={accent} />
          {[
            [20, 24],
            [24.5, 22],
            [28.5, 25],
            [22, 29],
            [27, 30],
            [24, 33.5],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill={ground} />
          ))}
        </>
      );
    case "moon":
      return (
        <>
          <path d="M28.5 9.5A15 15 0 1 0 38.5 30 12 12 0 1 1 28.5 9.5z" fill={ink} />
          <polygon points={star(33, 16, 4, 0.45)} fill={accent} />
        </>
      );
    case "sun":
      return (
        <>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M24 5l2.4 7h-4.8z" fill={ink} transform={`rotate(${i * 30} 24 24)`} />
          ))}
          <circle cx={24} cy={24} r={9} fill={ink} />
          <circle cx={24} cy={24} r={5} fill={accent} />
        </>
      );
    case "die":
      return (
        <g transform="rotate(-8 24 24)">
          <rect x={11} y={11} width={26} height={26} rx={6} fill={ink} />
          {[
            [17, 17],
            [31, 17],
            [24, 24],
            [17, 31],
            [31, 31],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2.4} fill={ground} />
          ))}
          <rect x={11} y={11} width={26} height={26} rx={6} fill="none" stroke={accent} strokeWidth={1.2} />
        </g>
      );
    case "crown":
      return (
        <>
          <path d="M11 32l1.5-17 7 8.5L24 11l4.5 12.5 7-8.5L37 32z" fill={ink} />
          <rect x={11} y={32} width={26} height={5} rx={1.5} fill={ink} />
          <circle cx={24} cy={27} r={2.4} fill={accent} />
          <circle cx={17} cy={28.5} r={1.6} fill={accent} />
          <circle cx={31} cy={28.5} r={1.6} fill={accent} />
        </>
      );
    case "bird":
      return (
        <>
          <path d="M9 30c3-8 10-12 18-11 3-4 7-5 10-3l3 1.5-3.5 1c.5 7-4.5 14-13 15-6 .6-11-1-14.5-3.5z" fill={ink} />
          <path d="M16 25c5-5 11-6 15-3-5 1-9 4-11 8z" fill={accent} />
          <circle cx={33.5} cy={18} r={1.4} fill={ground} />
        </>
      );
    case "fish":
      return (
        <>
          <path d="M8 24c5-8 13-10.5 20-9 4.5 1 7.5 4 9 6l5-5v16l-5-5c-1.5 2-4.5 5-9 6-7 1.5-15-1-20-9z" fill={ink} />
          <path d="M20 17c2-3 5-4 8-3.5l-2 4z" fill={accent} />
          <circle cx={15} cy={22.5} r={1.7} fill={ground} />
          <path d="M22 20c1.5 2.5 1.5 5.5 0 8" stroke={ground} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </>
      );
    case "tulip":
      return (
        <>
          <path d="M24 29v12" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M24 38c-3-4-7-5-10-4 2 4 6 6 10 5zM24 36c3-4 7-5 10-4-2 4-6 6-10 5z" fill={accent} />
          <path d="M15 11l5 6 4-8 4 8 5-6c1.5 10-2 19-9 19s-10.5-9-9-19z" fill={ink} />
        </>
      );
    case "mountain":
      return (
        <>
          <circle cx={33} cy={14} r={4} fill={accent} />
          <path d="M5 37l13-20 8 11 5-6 12 15z" fill={ink} />
          <path d="M18 17l4.2 6.4-2.2-1.4-2 2.2-1.8-2.4-2.4 1.6z" fill={ground} />
        </>
      );
  }
}

export interface AvatarProps {
  avatarKey: string;
  size?: number;
  /** Accessible name; omit when the avatar sits next to a visible username. */
  label?: string;
}

export function Avatar({ avatarKey, size = avatarSize.md, label }: AvatarProps) {
  const art = avatarArt[avatarKey] ?? avatarFallbackArt;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ display: "block", flex: "none" }}
    >
      <circle cx={24} cy={24} r={24} fill={art.ground} />
      {motif(art.motif, art)}
    </svg>
  );
}
