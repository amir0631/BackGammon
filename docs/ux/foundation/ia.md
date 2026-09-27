# Information architecture and navigation

Status: draft for approval (CLAUDE.md §17 step 0)
Applies to: `m.` in Phase 1. Every route here must also exist in `apps/desktop` in Phase 2 (§2 rule 14, §11.0 rule 7).

---

## 1. Sitemap

```
/                          Welcome (guests) | redirect to /play (signed in)
├── Auth (no nav)
│   ├── /login
│   ├── /signup                  phone, 18+ confirmation, terms
│   ├── /signup/verify           SMS code
│   ├── /signup/account          password, username, referral code
│   ├── /signup/avatar           avatar picker (skippable)
│   ├── /password/reset          phone
│   ├── /password/reset/verify   SMS code
│   └── /password/reset/new      new password
│
├── [Tab 1] Play — /play
│   ├── sheet: table setup (variant, length, tier)
│   ├── sheet: join confirmation (entry, fee, payout, balance before/after)
│   ├── sheet: bot setup (level, variant, length)
│   ├── overlay: matchmaking (full-screen, cancellable)
│   └── /leaderboard             (also linked from Account)
│
├── [Tab 2] Live — /live
│   ├── sheet: filters and sort
│   └── /match/[id]              spectator view when the viewer is not a player
│       ├── sheet: prediction (while the pool is open)
│       └── sheet: spectator reactions
│
├── [Tab 3] Tournaments — /tournaments
│   └── /tournaments/[id]        overview | bracket (tab)
│       └── sheet: registration confirmation
│
├── [Tab 4] Shop — /shop         themes (default segment)
│   ├── /shop/packs              emoji and phrase packs
│   ├── /shop/coins              coin packages | "online purchase not available yet"
│   ├── /shop/items/[id]         item preview (3D preview for themes)
│   └── /shop/payment/[id]       payment status after gateway return
│
├── [Tab 5] Account — /me
│   ├── /wallet                  balance and transaction history (also via the balance chip)
│   ├── /me/matches              match history → /match/[id] (summary) → /replay/[id]
│   ├── /me/predictions
│   ├── /me/referral
│   ├── /me/edit                 avatar, username change (costs coins)
│   ├── /me/sessions             signed-in devices
│   ├── /profile/[username]      public profile (own or others)
│   ├── /settings
│   ├── /help, /help/[topic]
│   └── /terms, /privacy
│
├── Immersive (no nav)
│   ├── /match/[id]              player view | spectator view | finished-match summary
│   └── /replay/[id]
│
└── System (no nav)
    ├── /offline                 connection lost; local bot (see open questions)
    ├── /unsupported             no WebGL2
    ├── /account/status          suspended or banned
    └── not found (Next.js 404)
```

---

## 2. Route list

All paths are identical on `m.` and `app.` (§11.0 rule 7). The routes named in rule 7 are included verbatim: `/play`, `/live`, `/match/[id]`, `/replay/[id]`, `/tournaments/[id]`, `/shop`, `/profile/[username]`.

| Route | Screen | Auth | Nav | Owning spec (`docs/ux/screens/`) |
| --- | --- | --- | --- | --- |
| `/` | Welcome (guest); signed in → 302 to `/play` | Public | None | `auth.md` |
| `/login` | Log in | Guest only | None | `auth.md` |
| `/signup` | Phone, 18+, terms | Guest only | None | `auth.md` |
| `/signup/verify` | SMS code | Guest only | None | `auth.md` |
| `/signup/account` | Password, username, referral code | Guest only | None | `auth.md` |
| `/signup/avatar` | Avatar picker | Signed in | None | `onboarding.md` |
| `/password/reset` | Phone | Guest only | None | `auth.md` |
| `/password/reset/verify` | SMS code | Guest only | None | `auth.md` |
| `/password/reset/new` | New password | Guest only | None | `auth.md` |
| `/play` | Play lobby | Signed in | Tab 1 | `lobby.md` |
| `/leaderboard` | Leaderboards (`?scope=all\|weekly\|monthly\|predict`) | Signed in | Tab 1 child | `leaderboard.md` |
| `/live` | Live matches | Signed in | Tab 2 | `live.md` |
| `/match/[id]` | Player view, spectator view, or finished summary (resolved by server role and match status) | Signed in | Immersive | `match.md`, `live.md` |
| `/replay/[id]` | Replay viewer (players of the match only; others get the 403 state) | Signed in | Immersive | `replay.md` |
| `/tournaments` | Tournament list | Signed in | Tab 3 | `tournaments.md` |
| `/tournaments/[id]` | Detail; `?tab=overview\|bracket` | Signed in | Tab 3 child | `tournaments.md` |
| `/shop` | Themes | Signed in | Tab 4 | `shop.md` |
| `/shop/packs` | Emoji and phrase packs | Signed in | Tab 4 | `shop.md` |
| `/shop/coins` | Coin packages or gateway-unavailable state | Signed in | Tab 4 | `coins-purchase.md` |
| `/shop/items/[id]` | Item preview | Signed in | Tab 4 child | `shop.md` |
| `/shop/payment/[id]` | Payment status | Signed in | None | `coins-purchase.md` |
| `/wallet` | Balance and history | Signed in | Tab 5 child | `wallet.md` |
| `/me` | Account hub | Signed in | Tab 5 | `profile.md` |
| `/me/edit` | Edit avatar and username | Signed in | Tab 5 child | `profile.md` |
| `/me/matches` | Match history | Signed in | Tab 5 child | `history.md` |
| `/me/predictions` | My predictions | Signed in | Tab 5 child | `predictions.md` |
| `/me/referral` | Referral link and earnings | Signed in | Tab 5 child | `referral.md` |
| `/me/sessions` | Signed-in devices | Signed in | Tab 5 child | `profile.md` |
| `/profile/[username]` | Public profile | Signed in | Child of the origin tab | `profile.md` |
| `/settings` | Settings | Signed in | Tab 5 child | `settings.md` |
| `/help`, `/help/[topic]` | Help | Public | Tab 5 child (signed in) | `help-legal.md` |
| `/terms`, `/privacy` | Legal | Public | None or Tab 5 child | `help-legal.md` |
| `/offline` | Connection lost | Public | None | `system.md` |
| `/unsupported` | Device not supported | Public | None | `system.md` |
| `/account/status` | Suspended or banned | Signed in | None | `system.md` |

**Reserved routes. Do not build until the product owner decides (see Open questions):**
- `/wallet/withdraw`
- `/wallet/transfer`
- `/play/invite/[code]`

### Query parameters

| Param | Where | Meaning |
| --- | --- | --- |
| `next` | Auth routes | Path to return to after login or signup. Accept same-origin paths only. |
| `ref` | Any route | Referral code. Store it locally until signup and prefill it in `/signup/account`. |
| `scope` | `/leaderboard` | Leaderboard scope |
| `tab` | `/tournaments/[id]` | `overview` or `bracket` |
| `tier`, `variant`, `tournament`, `sort` | `/live` | Filters, mirroring `GET matches/live` |

A guest who opens any signed-in route goes to `/login?next=<path>`. Deep links from push notifications (`/match/[id]`, `/tournaments/[id]`) use the same rule.

---

## 3. Navigation model

### 3.1 Primary navigation: bottom nav (5 tabs)

Order below is logical. In fa and ar it runs right to left, so Play is rightmost. In en Play is leftmost.

| # | Tab | Icon (intent) | Root route | i18n key | fa | ar | en | Contains |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Play | Dice | `/play` | `nav.play` | بازی | العب | Play | Quick coin tables by tier, bot play, "play again with last settings", daily bonus card, rank card linking to `/leaderboard`, resume-match banner |
| 2 | Live | Broadcast / eye | `/live` | `nav.live` | زنده | مباشر | Live | Live match list with filters and sort; tournament matches highlighted; open-pool badge; entry to the spectator view and predictions |
| 3 | Tournaments | Trophy | `/tournaments` | `nav.tournaments` | تورنمنت‌ها | البطولات | Tournaments | Upcoming, registered, in progress, finished; detail, bracket, registration |
| 4 | Shop | Bag | `/shop` | `nav.shop` | فروشگاه | المتجر | Shop | Themes, emoji and phrase packs, coins; owned items with equip |
| 5 | Account | Person | `/me` | `nav.account` | حساب من | حسابي | Account | Profile, wallet, match history and replays, predictions, referral, sessions, settings, help, install app, log out |

Why these five:
- Play, Live, and Tournaments are the three lobby lists that §11.0 asks for as tabbed lists on mobile.
- Shop is kept as a top-level tab because coins and themes are a core loop and must be findable without hunting. It does not badge or pulse.
- The leaderboard is reached from the rank card on Play and from Account, not from its own tab (maximum 5).

Nav behavior:
- **Visible on:** tab roots and their children.
- **Hidden on:** auth screens, `/match/[id]`, `/replay/[id]`, `/shop/payment/[id]`, system screens, and whenever the on-screen keyboard is open.
- **Re-tapping the active tab:** returns to its root; at the root it scrolls to the top.
- **Tab memory:** each tab keeps its last child route and scroll position for the session.
- **Badges:** numeric or dot only, each with a text label for screen readers (`nav.badge.*`).
  - Allowed: Play shows a dot when a match is in progress. Tournaments shows a dot when a match you registered for is ready.
  - Not allowed: no badges on Shop.
- **Label display:**

| Breakpoint | Labels |
| --- | --- |
| `xs` | Icon-only, with `aria-label` and a long-press tooltip |
| `sm` | Icon plus label |

### 3.2 Top app bar (non-immersive screens)

| Slot (logical) | Content |
| --- | --- |
| Start | Back arrow on child routes (mirrors in RTL); app logo on tab roots |
| Center / start-aligned | Screen title |
| End | Coin balance chip (coin icon + localized number). Tapping it opens `/wallet`. Shown on every signed-in, non-immersive screen, so coins are always visible where they are spent (§21.2). |

The balance chip never animates to attract attention. It updates in place after a transaction and announces the change once to screen readers.

### 3.3 Breakpoint behavior of navigation (§11.7)

| Breakpoint | Navigation | Content area |
| --- | --- | --- |
| `xs` 320–359 | Bottom nav, icon-only | Single column, reduced padding |
| `sm` 360–599 | Bottom nav, icon plus label | Single column (reference design 390 × 844) |
| `md` 600–1023 | Side rail on the start edge (right in RTL) with icon plus label; balance chip at the top of the content bar | List plus detail panel where a list exists (`/live`, `/tournaments`, `/me/matches`, `/shop`, `/wallet`). Match: board plus one side panel. |
| `lg` ≥ 1024 | Side rail inside a centered shell, max 1280 px | Lists: list plus detail panel plus a context panel (e.g., filters, or a leaderboard snippet on `/play`). Match: board plus two side panels (move history and reactions; spectators and prediction pool). |

Landscape phones (height under 500 px): use the side rail even at `sm` width classes, because the bottom nav would take too much height. The layout is chosen by the available height, not the device type.

List-detail rule (`md` and `lg`):
- Selecting a list item opens its detail in the side panel and updates the URL (e.g., `/tournaments/[id]`), so deep links and redirects keep working.
- At `sm` and below, the same URL renders the detail as a full screen.

### 3.4 Immersive screens

`/match/[id]` and `/replay/[id]` hide the bottom nav and top app bar.

**Match screen in portrait, what stays on screen:**
- Both player bars
- Turn timer and time bank
- Dice or the roll button
- Confirm and undo
- Cube
- Reactions button
- Menu button, which opens a sheet with move history, spectator count details, sound, lite mode, resign, and leaving the screen

Everything else lives in sheets.

**Leaving a running match screen** (back gesture, back button, or the menu's leave item):
- Opens a sheet with three choices: Stay, Leave screen, Resign.
- The sheet states that the turn timer keeps running.
- Leaving never resigns.

**While a player's match is running and they are elsewhere in the app:**
- A persistent "Return to match" banner sits above the bottom nav. It shows the opponent, the score, and whose turn it is.
- It is dismissible only by returning to the match or by the match ending.

### 3.5 Back behavior

| Situation | Back does |
| --- | --- |
| Open sheet or dialog | Closes it (sheets push a history entry) |
| Matchmaking overlay | Cancels the search (same as the Cancel button), then returns to `/play` |
| Auth step 2+ | Returns to the previous step; entered data is kept |
| `/shop/payment/[id]` | Goes to `/shop/coins`; never re-submits a payment |
| Tab root | Leaves the app (browser default); no "are you sure" dialog |

### 3.6 Secondary entry points

| Destination | Reached from |
| --- | --- |
| `/wallet` | Balance chip (all screens), Account hub |
| `/leaderboard` | Rank card on Play, Account hub, public profile rank row |
| `/profile/[username]` | Player bars (tap an avatar in a match → sheet with a "view profile" link), leaderboard rows, live list, tournament bracket |
| `/replay/[id]` | `/me/matches` rows, finished-match summary at `/match/[id]` (players only), match result sheet |
| `/help/[topic]` | Contextual "?" info buttons next to: platform fee, prediction pool, tournament prizes, referral commission, fair dice, variants |
| `/shop/coins` | Account hub, wallet, and the neutral "insufficient coins" sheet (never from the post-loss result, see patterns.md §9) |
| Install app | Account hub item (Android: native prompt; iOS: guide sheet) and the first-visit banner (§11.5) |

---

## 4. Signed-in state routing

| Condition at app open | Destination |
| --- | --- |
| Not signed in | `/` (welcome) or the requested public route |
| Signed in, account suspended or banned | `/account/status` (all other signed-in routes redirect here) |
| Signed in, a match in progress where the user is a player | `/match/[id]` directly, with the reconnect state visible |
| Signed in, signup finished but no avatar chosen | `/play` (the avatar step is skippable; a default avatar is assigned) |
| Signed in | Requested route, or `/play` |
| WebGL2 unavailable | Non-game routes work normally. `/match/[id]` and `/replay/[id]` show the `/unsupported` content in place. |
| Offline at open | App shell from the service worker cache plus the offline state (patterns.md §6) |

---

## Open questions

1. **Withdrawal and transfer.** §1 lists "withdrawal, transfer" and §7.2 says to add those transaction types. §2 rule 2 is ambiguous about whether they are allowed or prohibited, and there are no endpoints, limits, or KYC rules. The routes `/wallet/withdraw` and `/wallet/transfer` are reserved but not designed. Decision needed: in scope for Phase 1? If yes, supply the rules: rial payout method, minimums, fees, transfer recipients, limits, and anti-fraud holds.
2. **Private invite tables.** §7.5 mentions "private invite" matches, but no endpoint or flow exists. Should `/play/invite/[code]` be designed?
3. **Arabic.** §1 lists only fa and en; §11.3 lists fa, ar, and en. This IA assumes all three. Please confirm.
4. **Spectating on the same URL as playing.** `/match/[id]` resolves the role on the server (player vs spectator). Please confirm that the backend can return the viewer's role on `GET matches/{id}`.
