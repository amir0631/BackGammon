"use client";

import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { iconStroke } from "@bg/design-tokens";

// Original outline icon set on a 24 px grid, drawn for this project (docs/ui/design-system.md §Icons).
// Self-hosted as inline SVG: no icon font, no CDN. Icons are decorative by default (aria-hidden);
// the control that holds an icon carries the accessible label.
//
// Mirroring (patterns.md §11): directional icons flip in RTL; clocks, refresh, media controls,
// and anything with Latin glyphs never flip.

export type IconProps = Omit<SvgIconProps, "children">;

interface IconSpec {
  name: string;
  mirrorInRtl?: boolean;
  body: ReactNode;
}

function createIcon({ name, mirrorInRtl = false, body }: IconSpec) {
  function Icon(props: IconProps) {
    const theme = useTheme();
    const mirror = mirrorInRtl && theme.direction === "rtl";
    return (
      <SvgIcon
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={iconStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable="false"
        data-icon={name}
        {...props}
        sx={[{ fill: "none", ...(mirror ? { transform: "scaleX(-1)" } : {}) }, ...(Array.isArray(props.sx) ? props.sx : [props.sx])]}
      >
        {body}
      </SvgIcon>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

/** Small filled dot used for pips and the dot of "!" / "i" / "?". */
function Dot({ cx, cy, r = 1.2 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
}

// ---- Navigation ------------------------------------------------------------------------------

export const PlayIcon = createIcon({
  name: "Play",
  body: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <Dot cx={8.5} cy={8.5} r={1.4} />
      <Dot cx={12} cy={12} r={1.4} />
      <Dot cx={15.5} cy={15.5} r={1.4} />
    </>
  ),
});

export const LiveIcon = createIcon({
  name: "Live",
  body: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 8.1a5.5 5.5 0 0 1 0 7.8" />
      <path d="M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
    </>
  ),
});

export const TournamentsIcon = createIcon({
  name: "Tournaments",
  body: (
    <>
      <path d="M8 4h8v5.5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5.5v1a3.5 3.5 0 0 0 3 3.46M16 6h2.5v1a3.5 3.5 0 0 1-3 3.46" />
      <path d="M12 13.5V17M9 20h6M10 17h4" />
    </>
  ),
});

export const ShopIcon = createIcon({
  name: "Shop",
  body: (
    <>
      <path d="M5 8.5h14l-1.1 11.1a1.5 1.5 0 0 1-1.5 1.4H7.6a1.5 1.5 0 0 1-1.5-1.4L5 8.5z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
});

export const AccountIcon = createIcon({
  name: "Account",
  body: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
});

// ---- Actions ---------------------------------------------------------------------------------

/** Back: points against the reading direction, so it mirrors in RTL. */
export const BackIcon = createIcon({
  name: "Back",
  mirrorInRtl: true,
  body: <path d="M19 12H5M11 6l-6 6 6 6" />,
});

/** Forward chevron for list rows; mirrors in RTL. */
export const ChevronForwardIcon = createIcon({
  name: "ChevronForward",
  mirrorInRtl: true,
  body: <path d="M9.5 6l6 6-6 6" />,
});

export const CloseIcon = createIcon({
  name: "Close",
  body: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
});

export const CheckIcon = createIcon({
  name: "Check",
  body: <path d="M5 12.5l4.5 4.5L19 7.5" />,
});

/** Circular arrow; never mirrored (clock direction stays clockwise). */
export const RefreshIcon = createIcon({
  name: "Refresh",
  body: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
});

export const EyeIcon = createIcon({
  name: "Eye",
  body: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
});

export const EyeOffIcon = createIcon({
  name: "EyeOff",
  body: (
    <>
      <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.3A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M4 4l16 16" />
    </>
  ),
});

// ---- Status ----------------------------------------------------------------------------------

export const InfoIcon = createIcon({
  name: "Info",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <Dot cx={12} cy={7.75} />
    </>
  ),
});

export const HelpIcon = createIcon({
  name: "Help",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
      <Dot cx={12} cy={16.9} />
    </>
  ),
});

export const ErrorIcon = createIcon({
  name: "Error",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <Dot cx={12} cy={16.25} />
    </>
  ),
});

export const WarningIcon = createIcon({
  name: "Warning",
  body: (
    <>
      <path d="M10.3 4.4a2 2 0 0 1 3.4 0l7.3 12.7a2 2 0 0 1-1.7 3H4.7a2 2 0 0 1-1.7-3l7.3-12.7z" />
      <path d="M12 9.5v4" />
      <Dot cx={12} cy={16.6} />
    </>
  ),
});

export const SuccessIcon = createIcon({
  name: "Success",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.8 2.8L16 9.6" />
    </>
  ),
});

/** Unmet requirement marker (hollow circle); paired with text, never color alone. */
export const PendingIcon = createIcon({
  name: "Pending",
  body: <circle cx="12" cy="12" r="7" strokeDasharray="2.5 2.5" />,
});

export const OfflineIcon = createIcon({
  name: "Offline",
  body: (
    <>
      <path d="M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.6-2.6M14.6 9.9A10 10 0 0 1 19 12.5M2 9a14.5 14.5 0 0 1 4.3-2.8M11 5.5A14.5 14.5 0 0 1 22 9" />
      <Dot cx={12} cy={19.25} />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
});

// ---- Brand -----------------------------------------------------------------------------------

/**
 * Coin glyph: brass disc with a khatam eight-point star. Colored from tokens (not currentColor)
 * because it is a brand mark; it always sits next to a number, so it is decorative.
 */
export function CoinIcon(props: IconProps) {
  const theme = useTheme();
  const t = (theme.vars ?? theme).palette.tokens;
  return (
    <SvgIcon viewBox="0 0 24 24" aria-hidden focusable="false" data-icon="Coin" {...props}>
      <circle cx="12" cy="12" r="9.25" fill={t.coin} stroke={t.coinRim} strokeWidth="1.5" />
      <path
        d="M12 6.8l1.5 3.7 3.7 1.5-3.7 1.5-1.5 3.7-1.5-3.7L6.8 12l3.7-1.5z"
        fill="none"
        stroke={t.coinRim}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

/** Eight-point khatam star used as the app mark in the top bar. */
export const BrandMarkIcon = createIcon({
  name: "BrandMark",
  body: (
    <>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" />
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="2.25" />
    </>
  ),
});
