"use client";

import { createIcon, Dot } from "./index";

// Game icons (play.md, match.md) in their own module, so routes without the game (wallet,
// account) don't ship them: webpack keeps every export of a shared module that any route uses.
// Same 24 px grid and stroke as the base set (docs/ui/design-system.md §7).

/** Bot label: always paired with the word "Bot" (§2 rule 10). */
export const BotIcon = /*#__PURE__*/ createIcon({
  name: "Bot",
  body: (
    <>
      <rect x="4.5" y="8" width="15" height="11" rx="3" />
      <path d="M12 8V5" />
      <Dot cx={12} cy={4.2} r={1.1} />
      <Dot cx={9.3} cy={13} r={1.3} />
      <Dot cx={14.7} cy={13} r={1.3} />
      <path d="M9.5 16.3h5M2.5 12.5v2.5M21.5 12.5v2.5" />
    </>
  ),
});

/** Undo: a hooked arrow pointing back; mirrors in RTL and always has a text label. */
export const UndoIcon = /*#__PURE__*/ createIcon({
  name: "Undo",
  mirrorInRtl: true,
  body: (
    <>
      <path d="M9 7.5L5 11.5l4 4" />
      <path d="M5.5 11.5H15a4.5 4.5 0 0 1 0 9h-2.5" />
    </>
  ),
});

export const MenuIcon = /*#__PURE__*/ createIcon({
  name: "Menu",
  body: (
    <>
      <Dot cx={12} cy={5.5} r={1.6} />
      <Dot cx={12} cy={12} r={1.6} />
      <Dot cx={12} cy={18.5} r={1.6} />
    </>
  ),
});

/** Resign: a flag on a pole. Never mirrored (not directional). */
export const FlagIcon = /*#__PURE__*/ createIcon({
  name: "Flag",
  body: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h10.5l-2 4 2 4H6" />
    </>
  ),
});

/** Reactions: a smiling face. */
export const ReactionIcon = /*#__PURE__*/ createIcon({
  name: "Reaction",
  body: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <Dot cx={9} cy={10} r={1.2} />
      <Dot cx={15} cy={10} r={1.2} />
      <path d="M8.5 14.2a4.2 4.2 0 0 0 7 0" />
    </>
  ),
});

/** Doubling cube: an isometric cube. */
export const CubeIcon = /*#__PURE__*/ createIcon({
  name: "Cube",
  body: (
    <>
      <path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z" />
      <path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" />
    </>
  ),
});

/** Hit marker: concentric target. */
export const TargetIcon = /*#__PURE__*/ createIcon({
  name: "Target",
  body: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <Dot cx={12} cy={12} r={1.4} />
    </>
  ),
});

/** Rated match: a rising line. Never mirrored (it is a chart, not a direction of travel). */
export const RatedIcon = /*#__PURE__*/ createIcon({
  name: "Rated",
  body: (
    <>
      <path d="M3.5 17.5l5.5-5.5 4 4 7.5-7.5" />
      <path d="M15 8.5h5.5V14" />
    </>
  ),
});

/** Time bank: an hourglass. Never mirrored. */
export const HourglassIcon = /*#__PURE__*/ createIcon({
  name: "Hourglass",
  body: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5" />
    </>
  ),
});

/** Fair dice: a shield with a check. */
export const ShieldIcon = /*#__PURE__*/ createIcon({
  name: "Shield",
  body: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.3" />
    </>
  ),
});

/** Keyboard (move entry, shortcuts). */
export const KeyboardIcon = /*#__PURE__*/ createIcon({
  name: "Keyboard",
  body: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M6 12.5h.01M18 12.5h.01M8.5 15h7" />
    </>
  ),
});

/** Move history: a list with a clock hand. */
export const HistoryIcon = /*#__PURE__*/ createIcon({
  name: "History",
  body: (
    <>
      <path d="M4.5 6.5h9M4.5 11h6M4.5 15.5h5" />
      <circle cx="16.5" cy="15" r="4.5" />
      <path d="M16.5 13v2.2l1.4 1" />
    </>
  ),
});


// ---- Replay media controls (history-replay.md RP-01). Media controls never mirror (P§11). ----

export const MediaPlayIcon = /*#__PURE__*/ createIcon({
  name: "MediaPlay",
  body: <path d="M8 5.5v13l10.5-6.5z" />,
});

export const MediaPauseIcon = /*#__PURE__*/ createIcon({
  name: "MediaPause",
  body: <path d="M8.5 5.5v13M15.5 5.5v13" />,
});

export const StepBackIcon = /*#__PURE__*/ createIcon({
  name: "StepBack",
  body: (
    <>
      <path d="M6.5 6v12" />
      <path d="M18 6.5v11L9.5 12z" />
    </>
  ),
});

export const StepForwardIcon = /*#__PURE__*/ createIcon({
  name: "StepForward",
  body: (
    <>
      <path d="M17.5 6v12" />
      <path d="M6 6.5v11l8.5-5.5z" />
    </>
  ),
});
