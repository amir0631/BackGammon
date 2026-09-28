"use client";

import { useTheme } from "@mui/material/styles";
import { iconSize, iconStroke } from "@bg/design-tokens";
import { tokensOf } from "@/theme/theme";

// Original decorative illustration for empty, error, and offline states: a khatam-inspired
// eight-point star (two squares at 45°) inside an octagonal frame, with a small center glyph.
// Always decorative (alt="" equivalent: aria-hidden). Ornament stays small and quiet in chrome.

export type IllustrationKind = "empty" | "error" | "offline";

export function Illustration({ kind, size = iconSize.illustration }: { kind: IllustrationKind; size?: number }) {
  const theme = useTheme();
  const t = tokensOf(theme);
  const accent = kind === "error" ? t.error : kind === "offline" ? t.textSecondary : t.primary;

  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden focusable="false">
      <g fill="none" stroke={t.outline} strokeWidth={iconStroke} strokeLinejoin="round">
        <path d="M34 8h28l26 26v28L62 88H34L8 62V34z" />
        <rect x="26" y="26" width="44" height="44" rx="2" stroke={accent} />
        <rect x="26" y="26" width="44" height="44" rx="2" stroke={accent} transform="rotate(45 48 48)" />
      </g>
      <g fill="none" stroke={accent} strokeWidth={iconStroke * 1.5} strokeLinecap="round">
        {kind === "empty" && <circle cx="48" cy="48" r="6" />}
        {kind === "error" && (
          <>
            <path d="M48 40v10" />
            <circle cx="48" cy="56" r="0.6" fill={accent} />
          </>
        )}
        {kind === "offline" && <path d="M41 41l14 14M55 41L41 55" />}
      </g>
    </svg>
  );
}
