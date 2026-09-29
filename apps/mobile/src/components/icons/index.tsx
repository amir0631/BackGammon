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

export function createIcon({ name, mirrorInRtl = false, body }: IconSpec) {
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
export function Dot({ cx, cy, r = 1.2 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
}

// ---- Navigation ------------------------------------------------------------------------------

export const PlayIcon = /*#__PURE__*/ createIcon({
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

export const LiveIcon = /*#__PURE__*/ createIcon({
  name: "Live",
  body: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 8.1a5.5 5.5 0 0 1 0 7.8" />
      <path d="M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
    </>
  ),
});

export const TournamentsIcon = /*#__PURE__*/ createIcon({
  name: "Tournaments",
  body: (
    <>
      <path d="M8 4h8v5.5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5.5v1a3.5 3.5 0 0 0 3 3.46M16 6h2.5v1a3.5 3.5 0 0 1-3 3.46" />
      <path d="M12 13.5V17M9 20h6M10 17h4" />
    </>
  ),
});

export const ShopIcon = /*#__PURE__*/ createIcon({
  name: "Shop",
  body: (
    <>
      <path d="M5 8.5h14l-1.1 11.1a1.5 1.5 0 0 1-1.5 1.4H7.6a1.5 1.5 0 0 1-1.5-1.4L5 8.5z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
});

export const AccountIcon = /*#__PURE__*/ createIcon({
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
export const BackIcon = /*#__PURE__*/ createIcon({
  name: "Back",
  mirrorInRtl: true,
  body: <path d="M19 12H5M11 6l-6 6 6 6" />,
});

/** Forward chevron for list rows; mirrors in RTL. */
export const ChevronForwardIcon = /*#__PURE__*/ createIcon({
  name: "ChevronForward",
  mirrorInRtl: true,
  body: <path d="M9.5 6l6 6-6 6" />,
});

export const CloseIcon = /*#__PURE__*/ createIcon({
  name: "Close",
  body: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
});

export const CheckIcon = /*#__PURE__*/ createIcon({
  name: "Check",
  body: <path d="M5 12.5l4.5 4.5L19 7.5" />,
});

/** Circular arrow; never mirrored (clock direction stays clockwise). */
export const RefreshIcon = /*#__PURE__*/ createIcon({
  name: "Refresh",
  body: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
});

export const EyeIcon = /*#__PURE__*/ createIcon({
  name: "Eye",
  body: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
});

export const EyeOffIcon = /*#__PURE__*/ createIcon({
  name: "EyeOff",
  body: (
    <>
      <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.3A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M4 4l16 16" />
    </>
  ),
});

/** Pencil: edit. Never mirrored (a tool, not a direction). */
export const EditIcon = /*#__PURE__*/ createIcon({
  name: "Edit",
  body: (
    <>
      <path d="M4.5 19.5l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L9 18.5z" />
      <path d="M13.5 7l3.5 3.5" />
    </>
  ),
});

/** Two overlapping sheets: copy to clipboard. */
export const CopyIcon = /*#__PURE__*/ createIcon({
  name: "Copy",
  body: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
});

/** Door with an arrow leaving it: log out. Mirrors in RTL (the arrow points outward, end side). */
export const LogoutIcon = /*#__PURE__*/ createIcon({
  name: "Logout",
  mirrorInRtl: true,
  body: (
    <>
      <path d="M13.5 4.5h-6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6" />
      <path d="M11 12h9.5M17 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
});

/** Globe: language. Never mirrored. */
export const GlobeIcon = /*#__PURE__*/ createIcon({
  name: "Globe",
  body: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z" />
    </>
  ),
});

/** Gear with eight teeth (a nod to the khatam star): settings. */
export const SettingsIcon = /*#__PURE__*/ createIcon({
  name: "Settings",
  body: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5l1.6 2.4 2.8-.6.6 2.8 2.4 1.6-1.6 2.3 1.6 2.3-2.4 1.6-.6 2.8-2.8-.6L12 20.5l-1.6-2.4-2.8.6-.6-2.8-2.4-1.6L6.2 12 4.6 9.7 7 8.1l.6-2.8 2.8.6z" />
    </>
  ),
});

/** Phone in front of a laptop: signed-in devices. */
export const DevicesIcon = /*#__PURE__*/ createIcon({
  name: "Devices",
  body: (
    <>
      <path d="M4.5 15.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2" />
      <path d="M2.5 18.5h9" />
      <rect x="14" y="10.5" width="7" height="10" rx="1.5" />
      <path d="M17 18h1" />
    </>
  ),
});

/** Page with lines: terms and other documents. */
export const DocumentIcon = /*#__PURE__*/ createIcon({
  name: "Document",
  body: (
    <>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5M8.5 12.5h7M8.5 16h5" />
    </>
  ),
});

/** Padlock: password and privacy. */
export const LockIcon = /*#__PURE__*/ createIcon({
  name: "Lock",
  body: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <Dot cx={12} cy={15.5} r={1.3} />
    </>
  ),
});

// ---- Wallet (wallet.md) -------------------------------------------------------------------------

/** Wallet: the balance card and the account hub row. */
export const WalletIcon = /*#__PURE__*/ createIcon({
  name: "Wallet",
  body: (
    <>
      <path d="M4.5 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h10" />
      <path d="M20.5 11.5h-4a2 2 0 0 0 0 4h4" />
      <Dot cx={16.5} cy={13.5} r={1} />
    </>
  ),
});

/** Paper plane: send coins. Points in the reading direction, so it mirrors in RTL (P§11). */
export const SendIcon = /*#__PURE__*/ createIcon({
  name: "Send",
  mirrorInRtl: true,
  body: (
    <>
      <path d="M4 11.5L20 4l-5 16-3.2-6.8z" />
      <path d="M11.8 13.2L20 4" />
    </>
  ),
});

/** Coin with a plus: get coins. */
export const AddCoinsIcon = /*#__PURE__*/ createIcon({
  name: "AddCoins",
  body: (
    <>
      <circle cx="10.5" cy="12" r="6.5" />
      <path d="M10.5 9.5v5M8 12h5" />
      <path d="M19.5 6v5M17 8.5h5" />
    </>
  ),
});

/** Bank building with columns: bank account and withdrawals. */
export const BankIcon = /*#__PURE__*/ createIcon({
  name: "Bank",
  body: (
    <>
      <path d="M3.5 9L12 4l8.5 5z" />
      <path d="M5.5 9.5v7.5M9.8 9.5v7.5M14.2 9.5v7.5M18.5 9.5v7.5" />
      <path d="M3.5 20h17" />
    </>
  ),
});

/** Arrow into a tray: withdraw to the bank. Vertical, never mirrored. */
export const WithdrawIcon = /*#__PURE__*/ createIcon({
  name: "Withdraw",
  body: (
    <>
      <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
      <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </>
  ),
});

/** Coins added to the balance (ledger rows): arrow down into a line. Never mirrored. */
export const CoinsInIcon = /*#__PURE__*/ createIcon({
  name: "CoinsIn",
  body: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v8M8.5 12l3.5 3.5 3.5-3.5" />
    </>
  ),
});

/** Coins deducted from the balance (ledger rows): arrow up. Never mirrored. */
export const CoinsOutIcon = /*#__PURE__*/ createIcon({
  name: "CoinsOut",
  body: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 16.5v-8M8.5 12L12 8.5l3.5 3.5" />
    </>
  ),
});

/** Gift box: welcome coins and rewards. */
export const GiftIcon = /*#__PURE__*/ createIcon({
  name: "Gift",
  body: (
    <>
      <rect x="4" y="9" width="16" height="4" rx="1" />
      <path d="M5.5 13v6a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6M12 9v11.5" />
      <path d="M12 9c-1.5-3.5-5-4-5-1.8C7 8.6 9 9 12 9zM12 9c1.5-3.5 5-4 5-1.8C17 8.6 15 9 12 9z" />
    </>
  ),
});

/** Headset: support. */
export const SupportIcon = /*#__PURE__*/ createIcon({
  name: "Support",
  body: (
    <>
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.5" y="13.5" width="4" height="5.5" rx="1.5" />
      <rect x="16.5" y="13.5" width="4" height="5.5" rx="1.5" />
      <path d="M18.5 19c0 1-1 1.5-3.5 1.5h-1.5" />
    </>
  ),
});

/** Clock: expected dates and countdowns. Never mirrored (P§11). */
export const ClockIcon = /*#__PURE__*/ createIcon({
  name: "Clock",
  body: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
});

// ---- Status ----------------------------------------------------------------------------------

export const InfoIcon = /*#__PURE__*/ createIcon({
  name: "Info",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <Dot cx={12} cy={7.75} />
    </>
  ),
});

export const HelpIcon = /*#__PURE__*/ createIcon({
  name: "Help",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
      <Dot cx={12} cy={16.9} />
    </>
  ),
});

export const ErrorIcon = /*#__PURE__*/ createIcon({
  name: "Error",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <Dot cx={12} cy={16.25} />
    </>
  ),
});

export const WarningIcon = /*#__PURE__*/ createIcon({
  name: "Warning",
  body: (
    <>
      <path d="M10.3 4.4a2 2 0 0 1 3.4 0l7.3 12.7a2 2 0 0 1-1.7 3H4.7a2 2 0 0 1-1.7-3l7.3-12.7z" />
      <path d="M12 9.5v4" />
      <Dot cx={12} cy={16.6} />
    </>
  ),
});

export const SuccessIcon = /*#__PURE__*/ createIcon({
  name: "Success",
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.8 2.8L16 9.6" />
    </>
  ),
});

/** A timeline step that was passed without succeeding: a small outline dot (no check). */
export const DotIcon = /*#__PURE__*/ createIcon({
  name: "Dot",
  body: <circle cx="12" cy="12" r="4.5" />,
});

/** Unmet requirement marker (hollow circle); paired with text, never color alone. */
export const PendingIcon = /*#__PURE__*/ createIcon({
  name: "Pending",
  body: <circle cx="12" cy="12" r="7" strokeDasharray="2.5 2.5" />,
});

export const OfflineIcon = /*#__PURE__*/ createIcon({
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
export const BrandMarkIcon = /*#__PURE__*/ createIcon({
  name: "BrandMark",
  body: (
    <>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" />
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="2.25" />
    </>
  ),
});
