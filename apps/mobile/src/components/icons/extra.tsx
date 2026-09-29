"use client";

import { createIcon } from "./index";

// Icons for news and the PWA install flow, kept out of the shared icon module so they load only
// with the screens that use them (§11.4 first-load budget). Same grid and stroke as ./index.

export const MegaphoneIcon = /*#__PURE__*/ createIcon({
  name: "Megaphone",
  mirrorInRtl: true,
  body: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1z" />
      <path d="M8 15l1.2 4.2a1 1 0 0 0 1 .8h1.3" />
      <path d="M18.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
});

export const NewsIcon = /*#__PURE__*/ createIcon({
  name: "News",
  body: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" />
    </>
  ),
});

export const InstallIcon = /*#__PURE__*/ createIcon({
  name: "Install",
  body: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M12 7.5v7M9 11.5l3 3 3-3" />
      <path d="M10.5 18.5h3" />
    </>
  ),
});

/** iOS-style share glyph (box with an up arrow) for the Add to Home Screen guide. */
export const ShareIcon = /*#__PURE__*/ createIcon({
  name: "Share",
  body: (
    <>
      <path d="M12 3.5v11M8.5 7L12 3.5 15.5 7" />
      <path d="M8 10.5H6.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H16" />
    </>
  ),
});

/** "Add" square for the Add to Home Screen guide. */
export const AddSquareIcon = /*#__PURE__*/ createIcon({
  name: "AddSquare",
  body: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
});
