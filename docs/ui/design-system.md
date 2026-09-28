# Design system (`m.` Phase 1, reused by `app.` in Phase 2)

Status: UI foundation, CLAUDE.md §17 step 0. Owner: UI specialist.
Source of truth for values: `packages/design-tokens/src/index.ts`. This document explains them; if the two disagree, the code wins and this file must be fixed.
Built on: `docs/ux/foundation/patterns.md` (P§), `ia.md`, `personas.md`.

Contents: 1 Principles · 2 Color · 3 Typography · 4 Spacing, radii, elevation · 5 Layout and breakpoints · 6 Motion · 7 Icons and illustration · 8 MUI theme · 9 Components · 10 Accessibility checks · 11 Gallery · 12 Rules for screen work

---

## 1. Principles

- **The board is the product.** The UI chrome is calm, dark, and modern so the 3D board stands out. Ornament (khatam-style geometry, brass, inlay) belongs on the board. In the chrome it appears only as small accents: the brand mark, the coin glyph, and the illustrations for empty and error states.
- **Premium Persian craft.** Warm walnut darks, brass as the accent, and firouzeh (turquoise) as the second accent.
- **fa first.** Every component is designed RTL first and then checked in LTR.
- **Tokens only.** No literal colors, px spacing, or ms durations in components. They come from `@bg/design-tokens`, directly or through the MUI theme.
- **No dark patterns in visual form.** Buy buttons, the Shop tab, and the balance chip never pulse, glow, or animate for attention (P§8, P§9).

---

## 2. Color

Dark is the default scheme. Light is fully supported. Both define every token. Contrast is enforced by `packages/design-tokens/src/contrast.test.mjs` (`pnpm --filter @bg/design-tokens test`).

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `background` | `#14110f` | `#f6f1e9` | Page background |
| `surface` | `#1c1714` | `#fffcf7` | App bar, nav, cards (MUI `background.paper`) |
| `surfaceRaised` | `#251f1b` | `#ffffff` | Sheets, dialogs, menus, balance chip |
| `surfaceSunken` | `#0f0c0a` | `#ede6db` | Input fills, cost block, wells |
| `scrim` | `rgba(6,4,3,.64)` | `rgba(30,25,21,.48)` | Modal backdrop |
| `textPrimary` | `#f4ede3` | `#1e1915` | Body text |
| `textSecondary` | `#c4b8a9` | `#574c43` | Labels, helper text (still ≥ 4.5:1) |
| `textDisabled` | `#857a6e` | `#91867b` | Disabled text (exempt from contrast, kept legible) |
| `outline` | `#8f8375` | `#827464` | Control boundaries: inputs, outlined buttons, chips (≥ 3:1) |
| `outlineSubtle` | `#3a322c` | `#ddd3c6` | Decorative dividers only, never the only boundary of a control |
| `focusRing` | `#ffd684` | `#1e1915` | Keyboard focus ring (≥ 3:1 on every surface) |
| `primary` / `onPrimary` | `#d9a94e` / `#1b1407` | `#7f5310` / `#ffffff` | Brass: primary buttons, active nav, links |
| `primaryContainer` / `on…` | `#3e2f14` / `#f3ddb0` | `#f5e3bf` / `#3a2605` | Active-tab pill, selection |
| `secondary` / `onSecondary` | `#56c2b8` / `#04201d` | `#0b6961` / `#ffffff` | Firouzeh accent; legal-move color in HTML overlays |
| `success`, `warning`, `error`, `info` (+ `on…`, `…Container`, `on…Container`) | see code | see code | Status. Always paired with an icon and text |
| `inverseSurface` / `onInverseSurface` | `#f4ede3` / `#1e1915` | `#2a2420` / `#f4ede3` | Snackbars, tooltips, skip link |
| `coin` / `coinRim` | `#e9b949` / `#9a6e1c` | `#c8961e` / `#6b4a0c` | Coin glyph (decorative, always next to a number) |
| `playerLight` / `playerLightRim`, `playerDark` / `playerDarkRim` | see code | see code | Player markers in bars, mirroring checker colors |

**Avatar art** (`avatarArt`, `avatarFallbackArt`): the 12 preset avatars (`avatar_01` … `avatar_12`, the keys `GET avatars` returns) are original flat motifs on a colored disc: khatam star, cypress, paisley, pomegranate, moon, sun, die, crown, bird, fish, tulip, mountain. Each has `ground`, `ink`, and `accent`. They are artwork, so they are the same in both schemes (like a photo). The test keeps `ink` at ≥ 3:1 on `ground` so each shape reads at 40 px.

Contrast guarantees (tested for both schemes):
- `textPrimary`, `textSecondary`, and every tone (`primary` through `info`) reach at least 4.5:1 on `background`, `surface`, and `surfaceRaised`. So a tone color can be used for text such as links and error helper text.
- Every `onX` reaches 4.5:1 on `X`, and every `onXContainer` on `XContainer`.
- `outline`, `focusRing`, and `primary` reach 3:1 on every surface.
- Lowest margins: dark `outline` on `surfaceRaised` is 4.39:1. Light `outline` on `surfaceSunken` is 3.66:1.

Rules:
- Components read colors with `tokensOf(theme)` (in `styled`) or `sx` paths such as `bgcolor: "tokens.surfaceRaised"`. Both resolve to CSS variables (`--bg-palette-tokens-*`), so the scheme switches without re-rendering.
- Never convey state by color alone. Add an icon, text, shape, or weight (P§13).
- Text over the 3D board sits on solid `surface` backgrounds, never directly on the canvas.

---

## 3. Typography

Fonts are self-hosted variable woff2 files loaded through `next/font/local` (`apps/mobile/src/theme/fonts.ts`). Sources, versions, and checksums are in `apps/mobile/src/fonts/README.md`. Both fonts are SIL OFL 1.1.

| Locale | Family | CSS variable | Preload | Notes |
| --- | --- | --- | --- | --- |
| fa | Vazirmatn v33.003 | `--font-fa` | yes | Persian digits, ZWNJ, and its own Latin glyphs. Fallback: Tahoma, system-ui |
| en | Inter v4.1 | `--font-en` | no | Persian inside en text (for example usernames) falls back to Vazirmatn |

`fontStack(script)` builds the stack. There is no Arabic locale (fa and en only).

**Scale.** The scale is the same for both scripts, in rem so it follows the user's text size. Line height and letter spacing differ per script.

| Role | MUI variant | Size | Weight | fa line height | en line height |
| --- | --- | --- | --- | --- | --- |
| display | `h1` | 2rem | 700 | 1.45 | 1.2 |
| headline | `h2` | 1.625rem | 700 | 1.5 | 1.25 |
| titleLarge | `h3` | 1.375rem | 700 | 1.5 | 1.3 |
| title | `h4` | 1.125rem | 600 | 1.55 | 1.35 |
| titleSmall | `h5`, `h6`, `subtitle1` | 1rem | 600 | 1.6 | 1.4 |
| bodyLarge | `bodyLarge` | 1.0625rem | 400 | 1.8 | 1.55 |
| body | `body1` | 1rem | 400 | 1.8 | 1.5 |
| bodySmall | `body2` | 0.875rem | 400 | 1.75 | 1.45 |
| label | `label`, `button` | 0.9375rem | 600 | 1.5 | 1.35 |
| labelSmall | `labelSmall`, `subtitle2` | 0.8125rem | 600 | 1.5 | 1.35 |
| caption | `caption` | 0.8125rem | 400 | 1.7 | 1.4 |

Script rules:
- **Persian letter spacing is always 0.** Letter spacing breaks cursive joining. The test enforces this.
- **Persian body text has a line height of at least 1.6.** The test enforces this.
- **Numbers** always go through `@bg/i18n` formatters (`formatNumber`, `formatPercent`, `localizeDigits`) or the app hook `useFormat()`. This gives Persian digits `۰–۹` in fa and Latin digits in en. Coin amounts use `coins.value` (ICU plural in en) and toman amounts use `money.toman`.
- **Mixed direction.**
  - Wrap user text (usernames, codes) passed into messages with `isolate()` (FSI…PDI). In JSX, use `<bdi>`.
  - Wrap digit groups inside fa strings, such as phone examples, in LRI…PDI. Otherwise the groups visually reorder.
- **Tabular numbers** (`font-variant-numeric: tabular-nums`) on balances, costs, timers, and OTP boxes.
- **Inputs** are 16 px (1rem) so iOS does not zoom on focus.
- **No uppercase transforms.** They are meaningless in Persian and shouty in English.

---

## 4. Spacing, radii, elevation

- **MUI spacing unit:** 8 px (`theme.spacing(1)`). Half steps give 4 and 12.
- **Named scale** (`space`, 4 px grid): `none 0`, `xxs 2`, `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32`, `xxxl 48`, `huge 64`.
- **Page gutters** (`layout.gutter`): xs 12, sm 16, md 24, lg 32. Use `gutterStyles` from `apps/mobile/src/theme/layout.ts`. It uses explicit px strings because in `sx`, bare numbers on padding are spacing multipliers.
- **Radii:** `xs 4`, `sm 6`, `md 10` (buttons, inputs), `lg 16` (dialogs, cards, cost block), `xl 24` (bottom sheet top corners), `pill` (chips, nav pill, balance chip).
- **Elevation** has 5 levels. In dark mode, elevation shows mostly through lighter surfaces (`elevationSurface`), and the shadows are soft. Shadows are CSS variables `--bg-elevation-0…4`, defined per scheme, so light mode gets brown-tinted, lighter shadows. MUI's 0–24 shadow scale maps onto these five levels.
- **z-index:** hud 10, banner 1050, topBar and nav 1100, modal 1300, snackbar 1400, tooltip 1500.

---

## 5. Layout and breakpoints (§11.7, ia.md §3.3)

| Token | Min width | Navigation | Notes |
| --- | --- | --- | --- |
| `xs` | 0 (320–359) | Bottom nav, icon-only (labels visually hidden, long-press tooltip) | Gutter 12 |
| `sm` | 360 | Bottom nav, icon plus label | Reference design at 390 × 844 |
| `md` | 600 | Side rail on the start edge (right in fa) | Setup and confirm sheets become centered dialogs (max 480) |
| `lg` | 1024 | Side rail inside a centered shell, max 1280 | Shell framed by `outlineSubtle` beyond 1280 |

- **Short landscape.** Landscape screens under 500 px tall (`layout.compactHeight`) use the side rail at any width. Layout follows available height, not device type.
- **Sizing tokens (`layout`):**
  - Structure: `topBarHeight 56`, `bottomNavHeight 64`, `railWidth 104`. The rail is `max(104px, 6.5rem)`, so it grows with text size.
  - Panels: `dialogMaxWidth 480`, `taskFlowMaxWidth 560`, `readableMaxWidth 720`, `sidePanelWidth 320/360`, `sheetMaxHeightDvh 90`.
  - Component metrics: `navIndicator`, `sheetHandle`, `otpBox`, `listRowMinHeight` (56, grouped list rows; they grow with text).
  - `avatarSize`: `sm 40`, `md 56` (picker minimum, profile.md AC-02), `lg 96`.
- **Units and insets:**
  - Viewport height: `100dvh`, never `100vh`.
  - Safe-area insets are physical, so use the helpers `safeInsetStart(dir)` and `safeInsetEnd(dir)` with logical properties. The side rail pads its start edge. The content column pads whichever edge the rail does not cover.
- **Logical properties only:** `paddingInlineStart`, `insetInlineEnd`, `borderBlockEnd`, and so on. The RTL stylis plugin flips physical properties, which is how MUI's own styles mirror. Our own styles never rely on it.
- **Container queries:**
  - Components that live in both sheets and side panels query their container, not the viewport.
  - The sheet body and footer are `container-type: inline-size`.
  - `CostBlock` stacks label over value under `18rem`.
  - The bottom nav drops labels under `24em`, which catches 200% text.
- **Media query helpers** in `apps/mobile/src/theme/layout.ts`: `mqXs`, `mqMdUp`, `mqLgUp`, `mqRail`, `mqBeyondShell`.
- **Review viewports:** `reviewViewports` in tokens lists the six §11.7 viewports. Playwright visual regression should import it.

---

## 6. Motion

| Token | Normal | Reduced | Use |
| --- | --- | --- | --- |
| `fast` | 150 ms | 0 | Hover, press, color |
| `base` | 200 ms | 80 ms | Most UI transitions |
| `slow` | 250 ms | 100 ms | Sheets, dialogs, panels |
| `checkerShort` | 200 ms | 80 ms | One-point checker hop |
| `checker` | 280 ms | 100 ms | Default checker move |
| `checkerLong` | 350 ms | 120 ms | Across the board, to the bar, bear-off |
| `diceFade` | 300 ms | 150 ms | Lite mode dice appear (§11.6) |

Easing curves:

| Name | Curve | Use |
| --- | --- | --- |
| `standard` | `cubic-bezier(.2,0,0,1)` | General UI |
| `enter` | `cubic-bezier(0,0,.2,1)` | Decelerate: elements entering |
| `exit` | `cubic-bezier(.4,0,1,1)` | Accelerate: elements leaving |
| `checker` | `cubic-bezier(.25,.8,.35,1)` | Slight ease-out, no overshoot |

`easingCurve` exposes the control points for the 3D scene.

Feedback timings (`feedbackTiming`):

| Timing | Value |
| --- | --- |
| Toast | 4 s |
| Toast with action | 8 s |
| "Still working…" / "Taking longer than usual" | after 10 s |
| Nav long-press tooltip | 500 ms |

Rules:
- **Reduced motion** = the user setting `animations.reduced` or the OS `prefers-reduced-motion`.
  - `ThemeRegistry` combines the two. The MUI theme switches to reduced durations and disables ripples and skeleton pulses.
  - `useReducedMotion()` and `useMotionDurations()` expose the result to components and the scene.
  - `useReducedMotionSetting()` lets the settings screen and the profile sync update the user setting at runtime.
- **Under reduced motion:** no travel (opacity only), no bounces, no parallax, no confetti. Timers show text and a static bar instead of an animated ring (P§7).
- **Dice are physics-driven** and are not timed by these tokens.
  - Lite mode replaces the throw with the `diceFade`.
  - Recommendation for UX open question P-8: under reduced motion, also use the fade.
- **Motion never draws attention to spending.**

---

## 7. Icons and illustration

- **One original outline set** in `apps/mobile/src/components/icons`:
  - 24 px grid, 1.75 stroke (`iconStroke`), round caps and joins, inline SVG (no icon font, no CDN).
  - Sizes: `iconSize.sm 18`, `md 24`, `lg 32`, `illustration 96`.
- **Available icons:**
  - Navigation: Play (die), Live (broadcast), Tournaments (cup), Shop (bag), Account.
  - Actions: Back, ChevronForward, Close, Check, Refresh, Eye, EyeOff, Edit, Copy, Logout (mirrors), Globe (language), Settings, Devices, Document, Lock.
  - Status: Info, Help, Error, Warning, Success, Pending, Offline.
  - Wallet (wallet.md): Wallet, Send (paper plane, mirrors), AddCoins, Bank, Withdraw (arrow into a tray), CoinsIn / CoinsOut (ledger rows), Gift (welcome coins and rewards), Support (headset), Clock (expected dates; never mirrors).
  - Brand: Coin, BrandMark.
- **Mirroring (P§11):**
  - `BackIcon`, `ChevronForwardIcon`, `LogoutIcon`, and `SendIcon` mirror in RTL (`mirrorInRtl`). Vertical arrows (Withdraw, CoinsIn, CoinsOut) never do.
  - Clocks, refresh, media controls, and glyphs such as "?" never mirror.
  - Media icons for replay controls come with the replay screen, and they will not mirror.
- **Icons are `aria-hidden`.** The control around an icon carries the i18n `aria-label`.
- **`CoinIcon`:** a brass disc with a khatam eight-point star, colored from `coin` and `coinRim`.
- **`BrandMarkIcon`:** an eight-point star (two squares at 45°). It is a placeholder mark until a brand identity exists (`APP_NAME`).
- **`Illustration`** (empty, error, offline): a quiet khatam star in an octagon with a small center glyph. It is decorative only.
- **`BoardArt`** (`components/art/BoardArt.tsx`): a static top-down board in the default "Walnut & Brass" colors (`boardDefaultTheme`), with the opening position, two dice, and a khatam star inlay on the bar. Used on the welcome screen and the auth art pane, where there is no WebGL (auth.md AU-01). Decorative (`aria-hidden`), never mirrored.
- **`Avatar`** (`components/profile/Avatar.tsx`): the preset avatar art as inline SVG. Decorative next to a visible username; pass `label` when it stands alone. Unknown keys use `avatarFallbackArt`. Names for screen readers are `avatars.<key>` (profile.md open question 8).
- **All artwork is original,** drawn from geometric primitives. No third-party icon sets.
- **New icons** follow the same grid and stroke, and need a gallery entry.

---

## 8. MUI theme (`apps/mobile/src/theme`)

| File | Purpose |
| --- | --- |
| `theme.ts` | `createAppTheme({ direction, script, reducedMotion })`. CSS-variable color schemes (`cssVariables`, selector `data`, prefix `bg`), both schemes from tokens, script-specific typography, token durations and easings, component overrides |
| `ThemeRegistry.tsx` | `EmotionRegistry`, `ThemeProvider` with `defaultMode="dark"` and storage key `bg-color-mode`, `CssBaseline`, `MotionProvider`, global `ToastProvider` |
| `EmotionRegistry.tsx` | Two Emotion caches for the App Router, `mui` (LTR) and `muirtl` (adds `@mui/stylis-plugin-rtl`), both alive for the session. The provider swaps between them, so a runtime language switch (`router.refresh()`) flips direction without remounting the tree and form entries survive. MUI's `AppRouterCacheProvider` creates its cache once, so it kept RTL styles after a switch to en. |
| `layout.tsx` (app) | `InitColorSchemeScript` sets the scheme before paint (no flash) |
| `mui.d.ts` | Augments `palette.tokens` and the `bodyLarge`, `label`, `labelSmall` variants |
| `layout.ts` | Media queries, safe-area helpers, gutters, `visuallyHidden` |
| `motion.tsx` | Reduced-motion context and hooks |
| `fonts.ts` | `next/font/local` declarations |

Global overrides that matter:
- **Focus:** a visible ring (`focusRing`, 2 px, offset 2) on every `:focus-visible` and on `ButtonBase` `.Mui-focusVisible`. Focused inputs switch their border to `focusRing` at 2 px.
- **Touch targets:**

  | Control | Minimum |
  | --- | --- |
  | Button (all sizes), IconButton, Fab, ToggleButton | 44 px height |
  | Large button | 52 px |
  | Checkbox, Radio | 44 px hit area |
  | Clickable Chip | 44 px |
  | Tab | 48 px |
  | List and menu items | 48 px |
  | Input | 52 px |

- **Buttons:**
  - No text transform, elevation off, labels wrap (`overflow-wrap: anywhere`) instead of clipping.
  - In-flight (`loading`) contained buttons keep their fill so the label stays readable.
- **Surfaces:** no paper gradient overlays. Dialogs and sheets use `surfaceRaised` and the backdrop uses `scrim`.
- **Links:** always underlined (not color alone).
- **Alerts:** use the `…Container` / `on…Container` pairs.
- **Segmented controls** (ToggleButtonGroup) wrap instead of overflowing.
- **`body`** gets `overflow-wrap: break-word`, so long words wrap at 200% text.
- **Switch** (settings, profile.md ST-01): 64 × 44 root, 20 px thumb, 44 × 20 track with a 1 px `outline` border (≥ 3:1) on `surfaceSunken` when off; `primary` track with an `onPrimary` thumb when on; disabled uses `outlineSubtle` / `textDisabled` (checked + disabled: `primaryContainer`). Focus ring on the thumb. The thumb travels toward the end side; in RTL the stylis plugin flips both `left` and `translateX`, so one value serves both directions. Use it inside `SwitchRow`, whose whole row is the target.

---

## 9. Components (`apps/mobile/src/components`)

All components are presentational. They make no API calls and have no business logic (CLAUDE.md §2 rule 14). Every string comes from i18n keys. Every component is shown in `/dev/gallery`.

### 9.1 Shell

**`AppShell`** (`shell/AppShell.tsx`). Props: `topBar`, `banner`, `hideNav`, `activeKey`, `children`.
- Renders a skip link, `SideRail`, a content column (top bar, banner, `<main id="main">`), and `BottomNav`.
- `<main>` is a flex column, so a screen can fill the remaining height (sticky footers, centered cards).
- Both navs render, and CSS shows exactly one (`display:none` removes the other from the accessibility tree).
- The active tab comes from the path (`navigation.ts`, ia.md §3.1 plus child routes).
- The bottom nav hides while the on-screen keyboard is open (`useVirtualKeyboardOpen`).
- The bottom nav publishes its height as `--app-bottom-inset` so toasts sit above it.
- Hide the nav on auth, task-flow, immersive, and system screens.

**`BottomNav` / `SideRail`** (`shell/PrimaryNav.tsx`).
- Next links with `aria-current="page"`.
- The active tab gets a filled `primaryContainer` pill and a bold label, so the state is not shown by color alone.
- Labels:
  - Visually hidden at xs, with a long-press tooltip.
  - Visually hidden when the bar is narrower than 24 label-ems (large text).
  - Wrap in the rail.
- **Dot badges** (ia.md §3.1): `badges` maps a tab to its screen-reader text (`nav.badge.*`). The dot is a 10 px `error` disc with a `surface` ring (shape, not color alone) and is `aria-hidden`; the text is appended to the link name. Used for the Account tab while a withdrawal decision is unseen (wallet.md §3.8, `nav.badge.withdrawal`).

**`TopBar`** (`shell/TopBar.tsx`). Props: `title`, `leading` (`brand` | `back` | `close` | `none`), `href` or `onNavigate`, `navDisabled` (a coin request is in flight: the back/close button stays focusable with `aria-disabled` and does nothing), `balance` (`undefined` hides the chip, `null` shows it loading), `actions`, `titleComponent` (`h1` default; `p` on screens whose h1 is in the content, like auth steps).
- Sticky, solid `surface`, top safe area.
- The title is an `h1`.
- The row wraps: when the title needs the width (xs, large text), the chip moves to its own line.

**`CoinBalanceChip`** (`shell/CoinBalanceChip.tsx`). Props: `balance`, `href` (default `/wallet`).
- A 44 px pill: coin glyph plus localized number.
- Its `aria-label` is `coins.balanceChip` ("Balance: 1,250 coins, open wallet").
- Announces changes once through a polite live region (`coins.balanceUpdated`).
- Never animates.

### 9.2 Surfaces and feedback

**`BottomSheet`** (`sheet/BottomSheet.tsx`, P§1). Props: `open`, `onClose`, `title`, `children`, `footer`, `dismissible`, `hideCloseButton`, `closeOnBack`.
- **Layout by width:**
  - Below md: a swipeable bottom drawer, content height up to 90 dvh, with a handle, a scrolling body, and a sticky footer padded for the home indicator.
  - md and up: a centered dialog, max 480.
- **Accessibility:** `role="dialog"`, `aria-modal`, `aria-labelledby` pointing at the title. Focus moves to the title on open, is trapped while open, and returns to the trigger on close.
- **Back button:** a history entry, so back closes the sheet (`useCloseOnBack`, ia.md §3.5).
- **`dismissible={false}`** (in flight) blocks drag, scrim, Escape, back, and the close button.
- **One sheet at a time.** To advance a step, keep the same instance open and swap its content.

**`Banner`** (`feedback/Banner.tsx`). Props: `severity` (`info` | `success` | `warning` | `error` | `offline`), `title`, `children`, `action`, `onClose`.
- Icon plus text on container colors.
- `role="alert"` for errors, `status` otherwise.
- The close button only appears when `onClose` is given (non-critical banners).

**`ToastProvider` / `useToast().show({ message, action })`** (`feedback/Toast.tsx`).
- Mounted globally in `ThemeRegistry`.
- Queued one at a time. 4 s, or 8 s with an action.
- Pauses on hover (MUI) and while focused.
- `role="status"`. Centered with logical insets (MUI's translate centering breaks under the RTL plugin).
- Sits above the bottom nav. Game screens pass `bottomOffset` so toasts never cover game controls.

### 9.3 Money

**`CostBlock`** (`money/CostBlock.tsx`, P§2.1 item 3).
- Rows in this order: cost or amount (plus the toman equivalent), fee, recipient receives, paid to your bank (toman), your balance, balance after.
- Rows that don't apply are omitted, never collapsed.
- It formats only and never computes: the values come from the server.
- A `<dl>`. It stacks under 18rem container width.

**`CostConfirmation`** (`money/CostConfirmation.tsx`, P§2) is the full confirmation sheet:
- Content: title, `summary`, `CostBlock`, `facts`, the "?" help link.
- Primary button: its label includes the amount (the caller passes the translated label).
- Secondary: Cancel.
- **Disabled state:** `disabledReason` disables the button and shows the reason as visible text linked by `aria-describedby`.
- **In flight** (`inFlight`):
  - The button shows a spinner and keeps its fill. The screen-reader label becomes `inFlightLabel`.
  - The sheet cannot be dismissed. Repeat taps are ignored.
  - After 10 s: "Still working…" plus a "Check status" action (`onCheckStatus`). There is never a blind retry.
- **`error`:** an action-level inline error above the button.
- **Caller contract:**
  - Own the request and its `Idempotency-Key`.
  - Set `inFlight` synchronously in `onConfirm`.
  - Pass server-confirmed values.

### 9.4 Forms (P§12)

**`PhoneField`**. Props: `value` and `onChange` in Latin digits.
- Accepts Persian, Arabic-Indic, and Latin digits, spaces, and the `+98` / `0098` prefixes.
- Displays the grouped number `۰۹۱۲ ۳۴۵ ۶۷۸۹` in locale digits, as LTR, aligned with the label.
- `type="tel"`, `inputmode="numeric"`, `autocomplete="tel"`.
- On submit, call `normalizeMobileNumber(value)` from `@bg/i18n`.

**`PasswordField`**. Props: `autoComplete` (required: `current-password` or `new-password`), `requirements`.
- Show/hide toggle: an IconButton with `aria-label` ("Show password" / "Hide password") and `aria-pressed`. It keeps focus in the field.
- Requirements are listed before typing. Each has an icon and a spoken status ("done" / "not yet").

**`OtpInput`**. Props: `value`, `onChange`, `onComplete`, `length` (default 5), `label`, `error`, `helperText`, `disabled`, `autoFocus`.
- **One real input** (`autocomplete="one-time-code"`, `inputmode="numeric"`) laid transparently over the visual boxes. SMS autofill, paste, and screen readers all see a single field.
- **Digits:**
  - Persian and Arabic-Indic digits are normalized with `digitsOnly`.
  - The boxes show locale digits.
  - The code reads LTR in both locales.
- **`onComplete`** fires once on the last digit (auto-submit).
- **Errors:** red 2 px boxes plus an icon and text. Never color alone.
- **Sizing:** the boxes shrink to fit (max 3.5rem), so 200% text never overflows.

### 9.5 States (P§4–6)

| Component | Props | Behavior |
| --- | --- | --- |
| `EmptyState` | `message`, `action?` | Illustration, one sentence, at most one action |
| `ErrorState` | `message?` (default `errors.generic`), `code?`, `onRetry?`, `onBack?`, `kind` (`error` or `offline`) | `code` renders small (`common.errorCode`) for support |
| `LoadingState` | `variant` (`list` or `cards`), `rows` | Skeletons shaped like the content, with a hidden "Loading…" status |
| `LoadingState` | `variant="progress"`, `value`, `label`, `detail`, `onCancel`, `onRetry` | Determinate bar, percent, and detail. After 10 s without progress: "This is taking longer than usual" plus Retry / Cancel. The base for the 3D scene loader |

### 9.6 Auth and account building blocks (auth.md, profile.md)

| Component | File | Notes |
| --- | --- | --- |
| `AuthScreen` | `auth/AuthScreen.tsx` | Frame for every auth step: no nav, top bar with back or brand plus `LanguageButton`, offline banner. Phones: one column; the footer (primary action) is sticky only when the viewport is ≥ 600 px tall, else inline. md: centered card (max 480). lg and tall md landscape: `BoardArt` pane on the start side. Props: `title` (the h1, focused on load), `step` (`{current, total?}`; "Step N" without a total), `intro`, `backHref`/`onBack`, `footer`, `onSubmit` (a real `<form>`), `replaceWith` (banned and reset-unavailable panels), `pending` (session unknown: frame only, so no form flashes). |
| `AuthPanel` | `auth/AuthScreen.tsx` | The card surface for panels that replace a form. |
| `CodeStep` | `auth/CodeStep.tsx` | SMS code step shared by AU-03 and AU-08: server countdowns, tries left, dead/expired states, resend, WebOTP, offline wait, SMS-off continuation. |
| `BannedPanel` | `auth/BannedPanel.tsx` | AU-14, `role="alert"`, focus on its title. |
| `ResetUnavailablePanel` | `auth/ResetUnavailablePanel.tsx` | AU-07U, `role="region"`, info styling, focus on its heading. |
| `ActionButton` | `forms/ActionButton.tsx` | Primary action with `disabledReason` (stays focusable with `aria-disabled`, visible reason linked by `aria-describedby`), `blockedBy` (reason shown elsewhere, e.g. a countdown banner), `onBlockedClick`, and in-flight `loading` + `loadingLabel`. Playwright treats `aria-disabled` as not actionable: tests submit with Enter. |
| `CheckboxField`, `FieldError`, `FieldSuccess` | `forms/FieldText.tsx` | Real checkbox with the sentence as label (links inside stay separate targets); helper lines with icon + text. |
| `StandaloneLink`, `PromptLink` | `forms/StandaloneLink.tsx` | Links on their own line (44 px tall) and the short link in a prompt line ("Already have an account? Log in"), 44 × 44. Links inside running sentences stay plain (WCAG 2.5.8 inline exception). |
| `SwitchRow` | `forms/SwitchRow.tsx` | Settings row: `<label>` around text and `Switch`, ≥ 56 px, description and status note linked by `aria-describedby`; disabled switches always show their reason. |
| `CountdownText` | `feedback/CountdownText.tsx` | Sentence with a ticking mm:ss for sighted users and a static copy for screen readers, so live regions announce once, not every second. |
| `ConfirmDialog` | `feedback/ConfirmDialog.tsx` | Confirmations (log out, sign out other devices, discard a flow, replace or remove the bank account, cancel a withdrawal): initial focus on the safe option (`cancelLabel`, default "Cancel"; "Keep going", "Keep request"), not dismissible in flight, errors inside, and "Still working…" + `onCheckStatus` after 10 s in flight. |
| `SlowNotice`, `useSlowRequest` | `feedback/SlowNotice.tsx` | "Still working…" (or a custom line such as `wallet.flow.checking`) with "Check status" after `feedbackTiming.slowRequestMs`; the caller re-sends with the same Idempotency-Key or re-reads, never a blind retry. |
| `OfflineBanner`, `SuspensionBanner` | `feedback/StatusBanners.tsx` | Global banners below the top bar; not dismissible; they clear with their status. |
| `SignedInShell` | `shell/SignedInShell.tsx` | Signed-in frame: guest → `/login?next=`, AU-13 once per sign-in for suspended accounts, suspension and offline banners. The balance chip shows `useWallet().summary.balance` (a skeleton until the first read); `showBalance={false}` hides it in task flows (wallet.md §4). |
| `NavGroup`, `NavRow`, `ActionRow`, `InfoRow` | `lists/NavList.tsx` | Inset grouped rows (≥ 56 px): icon, label, optional secondary line, mirrored chevron; the current route gets a filled row plus a start-edge bar (not color alone). |
| `Avatar`, `AvatarPicker`, `AvatarPickerSkeleton` | `profile/` | The picker is a native radio group (one tab stop, arrows move, the browser mirrors them in RTL); options ≥ 56 px that grow with text; selected = check badge + 3 px outline. |
| `ProfileCard`, `PublicProfileView`, `Username` | `profile/ProfileViews.tsx` | Identity views; usernames are always LTR-isolated. |
| `AccountHub`, `LogoutDialog`, `AccountLayout`, `DetailColumns` | `profile/` | Tab 5 frame: list-detail when the frame is ≥ 44rem wide (container query; at 768 px the rail leaves too little room), plus a context column in the detail panel from 44rem. |
| `LanguageButton`, `LanguageOptions`, `useChooseLanguage` | `i18n/LanguageControls.tsx` | AU-10: each option in its own language and font with `lang`; applies at once and, when signed in, `PATCH me {lang}`. |

### 9.7 Wallet (wallet.md)

Task-flow frame and money pieces for the wallet screens (`/wallet`, `/wallet/transfer`, `/wallet/withdraw`, `/wallet/withdrawals[/id]`, `/wallet/bank-accounts`). Presentational components live in `components/wallet/`; screens and their state in `features/wallet/`.

| Component | File | Notes |
| --- | --- | --- |
| `TaskFlow` | `flow/TaskFlow.tsx` | Frame of a multi-step money flow (P§1): no nav, no balance chip, close (×) with `closeDisabled` while in flight, "Step n of N", the step heading as the h1 (focused on every step change), a real `<form>`, and a footer that is sticky in the thumb zone on phones ≥ 600 px tall (inline otherwise, and at the end of a centered 560 px column from md). Steps cross-fade with the theme's short duration (none with reduced motion). `plain` renders a div for TR-00 / WD-01 / receipts. |
| `useFlowSteps` | `lib/useFlowSteps.ts` | Steps in browser history: Back moves one step; Back from step 1 with entries asks "Discard?"; Back is swallowed while `locked`; `exit(fn)` unwinds to the route's own entry before `fn`, then the hook ignores history, so Back after a completed flow never re-enters a step. |
| `AmountField` | `wallet/AmountField.tsx` | Coin input: LTR value, `inputmode="numeric"`, Persian/Arabic-Indic/Latin digits accepted and never converted under the cursor; helper lines (minimum, 24-hour window, movable now) shown before typing and linked by `aria-describedby`; icon + text error. |
| `RecipientCard` | `wallet/RecipientCard.tsx` | "Check the recipient" (check icon + heading), avatar, `@username` (LTR), level, and the irreversibility line; `compact` for the review. Container query: avatar above text under 16rem. |
| `BankAccountCard`, `MaskedIban`, `IbanField` | `wallet/BankAccount.tsx` | Masked Sheba as bullets in 4-character groups, LTR via the `dir` attribute (never CSS `direction`, which the RTL stylis plugin flips), groups wrap between each other, spoken as `bank.card.a11y`. `IbanField`: fixed "IR" on the physical left of the digits in both directions, groups of 4, caret kept among the digits while re-spacing, paste with or without IR, spaces, dashes, Persian digits; shows "Bank: {name}" once valid. |
| `SignedAmount`, `LedgerList`, `TxDetail`, `useTxLabel` | `wallet/Ledger.tsx` | "+۲۰۰" / "−۱۰۰" (U+2212) with the coin glyph; the sign is `aria-hidden` and screen readers hear "200 coins added / deducted". Rows are grouped by local day ("Today", "Yesterday", Jalali date), one button per row (≥ 56 px), mirrored chevron, `aria-current` on the row shown in the side panel. Transfers name the other player by username only; unknown types show "Transaction" + the raw type. |
| `WithdrawalStatusChip`, `WithdrawalTimeline` | `wallet/WithdrawalStatus.tsx` | Status = icon + text (pending: dashed circle, paid: check, rejected: "!", cancelled: ×); the timeline is an ordered list with a connector on the start side. |
| `SupportTopupContent` | `wallet/SupportTopup.tsx` | WA-04 "Get coins" while online purchase is off: status, rate, support channel (a link when it is a URL, email, or phone) with copy, username with copy, other ways that exist now, safety line. No amounts, packages, or urgency (P§9). Reused by the coins page in step 9. |
| `CopyButton` | `wallet/CopyButton.tsx` | Explicit label ("Copy reference"), check icon for 4 s, polite "Copied". |
| `InfoLine` | `wallet/InfoLine.tsx` | Icon + secondary text line for helper facts, notes, and reasons. |

Layout rules used by the wallet screens:
- **WA-01** is one column on phones; from a 40rem container, summary (320–360 px) and history; from 64rem, a third column with the WA-02 detail panel (otherwise WA-02 opens as a bottom sheet, a dialog at md). The panel is detected from its computed display, so it follows text size too.
- **The three wallet actions** (Get coins, Send coins, Withdraw) are identical tonal tiles on `surfaceRaised` with an `outline` border; none is primary. They stack as full-width rows under a 17rem container (xs at 200% text).
- **Landscape phones** (height < 500 px): the balance card drops the toman line and divider and uses the h3 size.
- **Side columns stick** only when the viewport is at least 700 px tall.
- **Review steps** put the password field in the sticky footer, directly above the action error and the button (P§2.6).

### 9.8 Shared helpers

| Helper | Location | Purpose |
| --- | --- | --- |
| `useFormat()` | `lib/useFormat.ts` | `number`, `digits`, `percent`, `coins`, `toman`, `date`, `dateTime`, `monthYear` (Jalali in fa), `relative`, `clock` (mm:ss) for the current locale |
| `useSession`, `useRequireUser`, `useGuestOnly`, `useCompleteSignIn` | `lib/session.tsx` | Who is signed in (`GET /me` via the api-client), route guards, sign-in exits (account language, AU-13) |
| `useLocaleSwitch` | `lib/locale.tsx` | Sets the locale cookie and re-renders the server tree (`router.refresh()`), after the next navigation when needed |
| `useCountdown`, `useOnline` | `lib/` | Server-deadline countdowns; browser connectivity |
| `useWallet` / `WalletProvider` | `lib/wallet.tsx` | The shared `GET wallet` summary (balance chip, account hub, wallet screens), refreshed on sign-in, focus, and reconnect (no polling); cached per tab for offline "Last updated"; received-coins notices (§3.8) held back on task-flow and match routes; the pending → decided withdrawal tracking behind the Account-tab dot |
| `usePublicConfig` | `lib/config.ts` | `GET config` once per page load (SMS mode, prices); screens render neutral copy until it arrives |
| `useSession().handleAuthError` | `lib/session.tsx` | `AUTH_BANNED` ends the session → `/login?reason=banned`; an expired session (401 `AUTH_SESSION_INVALID` / `UNAUTHENTICATED`) opens the SY-08 dialog. Wallet password errors are never session errors |
| `useWalletFormat`, `useAmountErrorText`, `passwordLock`, `tehranToday` | `features/wallet/shared.ts` | Rolling-window times («۷ مهر، ۱۴:۳۰» + relative within 24 h), date-only `expected_by`, amount error text by flow, the per-action password lock kept in sessionStorage |
| `parseAmount`, `amountProblem`, `feeFor`, `ibanDigits`, `ibanProblem`, `maskPhone` | `features/wallet/validation.ts` | Client checks that mirror the server rules for instant feedback (integer-only fee preview, ISO 13616 mod-97, known bank code); the server stays the judge |
| `signupFlow`, `resetFlow`, `referral` | `lib/flows.ts` | Per-tab auth flow state (sessionStorage, never passwords or codes); `?ref=` capture |
| `toApiError`, `useErrorText` | `lib/apiErrors.ts` | API error → i18n text, with the code for unknown errors |
| `useCloseOnBack` | `lib/` | Back button closes the open sheet |
| `useVirtualKeyboardOpen` | `lib/` | Detects the on-screen keyboard |
| `toLatinDigits`, `digitsOnly`, `localizeDigits`, `normalizeMobileNumber`, `groupMobileNumber`, `formatPercent`, `isolate` | `@bg/i18n` | Digit, phone, percent, and bidi helpers, shared with Phase 2 |

### 9.9 i18n keys added

| Namespace | Keys |
| --- | --- |
| `common.*` | close, help, done, skipToContent, stillWorking, checkStatus, errorCode, loadingSlow, loadingProgress |
| `nav.*` | label, play, live, tournaments, shop, account |
| `languages.*` | fa, en (endonyms, the same in both catalogs) |
| `coins.*` | cost, amount, fee, balance, balanceAfter, shortfall, tomanEquivalent, value, balanceChip, balanceUpdated |
| Other money keys | `money.toman`, `units.megabytes`, `transfer.recipientReceives`, `withdraw.youReceive` |
| `net.*` | offline |
| `forms.*` | `phone.*`, `password.*`, `otp.*` |
| `devGallery.*` | Gallery-only sample copy |
| `auth.*`, `account.*`, `errors.auth.*`, `errors.csrf`, `profile.*`, `settings.*`, `sessions.*`, `publicProfile.*`, `legal.*`, `avatars.*`, `support.contact.channel`, `net.offlineAction` | Auth and profile screens (auth.md §7, profile.md §7); `errors.auth.*` match the backend `message_key` values |
| `wallet.*`, `transfer.*`, `withdraw.*`, `withdrawals.*`, `bank.*`, `shop.coins.supportTopup.*`, `errors.wallet.*`, `nav.badge.withdrawal`, `session.expired.*`, `devGallery.sections.wallet` | Wallet screens (wallet.md §7) plus: `shop.coins.supportTopup.how` carries a `<link>` tag around the channel, `.howTitle`, `.copyChannel`; `transfer.review.linked` (TRANSFER_LINKED), `transfer.unavailable.suspended.body`; `withdraw.unavailable.blockedTitle` (WITHDRAW_UNDER_REVIEW), `withdraw.review.timingRule` and `.expectedAfter` (the server now sends `withdraw.expected_by`); `errors.wallet.*` match the backend `message_key` values |

---

## 10. Accessibility and responsive checks

These were run for this foundation with a throwaway Playwright script against `/dev/gallery`. Screen PRs must add them as a committed test suite (§16).

**Coverage:**
- The six review viewports plus 844 × 390 and 800 × 360 landscape, and 320 × 640.
- Both fa and en, at 100% and 200% root text.

**Results:**

| Check | Result |
| --- | --- |
| Horizontal overflow | 0 px at every combination |
| Visible interactive elements under 44 × 44 px | None (the visually hidden skip link is 1 × 1 until focused) |
| Sheet opens | Focus lands on the sheet title |
| Escape while in flight | Does not close the cost sheet |
| "Still working…" | Appears after 10 s |
| Console errors or hydration warnings | None |

**Contrast:** token pairs are unit-tested (§2).

**Committed suite (auth and profile PR):** `apps/mobile/e2e/` (`pnpm --filter @bg/mobile e2e`, needs `E2E_BASE_URL` pointing at the app behind Nginx).
- `screens.spec.ts` renders every screen state with a mocked API, asserts no horizontal overflow and no target under 44 px, then no overflow at 200% text. `UPDATE_SCREENSHOTS=1` writes `docs/ui/screenshots/<area>/<id>--<locale>-<w>x<h>.png`; `ALL_VIEWPORTS=1` runs all six §11.7 viewports in fa and en.

**Wallet suite (wallet PR):** `e2e/wallet.spec.ts` + `e2e/wallet-mocks.ts`, same checks and flags as above, screenshots in `docs/ui/screenshots/wallet/`. It covers every WA/TR/WD screen state in the spec plus behaviour tests (one Idempotency-Key reused across retries, own username refused without a request, Persian-digit Sheba saved as `IR` + Latin digits, "Show more" stops at `next: null`, status chips with text). Pages are ready at `load` + h1 + no `aria-busy` skeleton instead of `networkidle`: against `next start` without Nginx, prefetches of routes that are not built yet (`/live`, `/shop`, `/tournaments`) never settle in Chromium, so `networkidle` hangs on any screen with the nav. Run: `E2E_BASE_URL=http://m.localhost:3000 pnpm --filter @bg/mobile e2e e2e/wallet.spec.ts`.

**Still to add:**
- axe-core (zero serious or critical issues): `@axe-core/playwright` is not a §3 dependency yet; it needs approval (CLAUDE.md §19).
- Lighthouse on non-game routes.

**Bundle size:** first-load JS (budget: 250 kB gzipped, §11.4) after the wallet step: `/` 221 kB, `/wallet` 248 kB, `/wallet/withdraw` 249 kB, `/wallet/transfer` 245 kB. The wallet routes are close to the budget; the next feature that adds weight to them should lazy-load the sheets (WA-02, WA-04) and the SMS code step. The gallery route is dev-only.

---

## 11. Gallery

| Route | Purpose |
| --- | --- |
| `/dev/gallery` | Every token and component (including the wallet section: signed amounts, status chips, timeline, recipient card, bank card, Sheba and amount fields), with controls for language (cookie), color mode, text size 100% / 200% (`?text=200`), and the reduced-motion setting |
| `/dev/gallery/viewports` | The gallery in iframes at the §11.7 viewports and two phone landscapes |

- Both routes return **404 in production builds** unless the deployment sets `DEV_GALLERY=1`, for example a staging review environment.
- They are not linked anywhere and are marked `noindex`.

---

## 12. Rules for screen work

1. Start from the UX spec in `docs/ux/screens/<feature>.md`. Design at 390 × 844 in fa first, then xs, md, lg, landscape, then en.
2. Compose from these components. If a new component is needed, add it here, in the gallery, and to this document in the same PR.
3. Use tokens and logical properties only. No `100vh`, no `left`/`right` for layout, no literal colors or durations.
4. Use `useFormat()` for every number, coin, and toman value. Use `isolate()` or `<bdi>` for user text in sentences.
5. Every state in the spec is implemented: loading, empty, error, offline, reconnecting, insufficient coins, suspended, first-time.
6. Before handing off, run the §10 checks (overflow, targets, 200% text, axe) and capture screenshots at the six viewports in fa and en.
