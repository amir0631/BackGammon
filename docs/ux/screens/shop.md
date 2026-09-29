# Shop: themes, avatars, emoji and phrase packs, item preview, coins

Status: draft for UI build (CLAUDE.md §17 steps 9 and 10).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 2–5, 9; §7.7; §7.9; §7.11; §10.1; §10.2 (Shop, Content); §11.1 (each player's own theme); §11.2; §11.4; §11.6; §11.7; §12.1 (suspended, username change); §14 (`coin.price_toman`, `shop.custom_*`, `username.change_*`); §18 (payment gateway); §21.2; ia.md §1–§3; patterns.md (P§) 1, 2, 2.3, 3, 4, 5, 6.1, 8, 9, 10, 11, 13, 16, 17; journeys.md J3a, J3b; personas P2 Maryam, P1 Reza.
Related specs: `wallet.md` (WA-04 support top-up content, `SupportTopupContent`, `shop.coins.supportTopup.*` keys, ledger rows `shop_purchase`, `purchase`), `profile.md` (AC-02 avatar picker, AC-03 username change: the only other coin sink), `match.md` (MA-05 reactions picker lists owned packs; themes on the board), `live.md` (spectators use the free emoji set only), `tournaments.md` (item prizes), `play.md` (PL-05 shared insufficient sheet).

This spec also owns the coins page (CO-01 to CO-04), which screen-inventory.md listed as `coins-purchase.md`; the two are merged because `/shop/coins` is a Shop segment and the support state reuses wallet.md content. SH-05 (Avatars segment) is new.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET shop/items?kind=` | `{results: ShopItem[], next: null}`, all active items (no pagination), ordered by kind, `sort`, id. `kind`: `board_theme`, `checker_theme`, `avatar`, `emoji_pack`, `phrase_pack`. Readable without sign-in. |
| `ShopItem` | `id`, `kind`, `key`, `name` (`{fa, en}`), `unlock` (`free`, `level_locked`, `purchasable`), `price` (coins; 0 unless `purchasable`), `unlock_level` (only for `level_locked`), `owned` (free items and reached levels count as owned), `locked` (`level_locked` and not reached), `equipped`, `data` (themes: `{asset}`; packs: `{keys: string[]}`) |
| `GET themes` | Board and checker items plus `equipped: {board_theme, checker_theme}` (keys; defaults when nothing chosen) |
| `POST shop/items/{id}/buy` + `Idempotency-Key` | `200 ShopItem` (`owned: true`). Keyed per player and item on the server: an item is charged at most once, whatever the retries. |
| `POST me/items/{id}/equip` | `200 ShopItem` (`equipped: true`). Board and checker themes and avatars only. |
| `GET phrases` | `{results: [{key, text: {fa, en}}]}`: phrase texts for pack previews |
| `GET avatars` | `{results: [{key}]}`: the 12 preset avatars of AC-02 (not shop items) |
| `GET shop/packages` | `{enabled, price_toman, custom_min_toman, custom_max_toman, results: [{id, coins, price_toman, name}]}`. `enabled` = `payments.enabled` (currently `false`). |
| `POST shop/checkout {package_id \| custom_toman, surface: "m"}` + `Idempotency-Key` | `201 PaymentInfo + redirect_url`. Same key → same payment. |
| `GET payments/{id}` | `PaymentInfo`: `id`, `coins`, `amount_toman`, `status` (`pending`, `callback_received`, `verified`, `failed`, `expired`), `reference`, `card_mask`, `failure`, `created_at`, `verified_at` |
| Gateway return | The server verifies, then redirects to `https://m.<domain>/shop/coins/result?payment=<id>` (or without `payment` when the payment is unknown) |
| `GET config` | `payments_enabled`, `coin_price_toman`, `username_change {cost, cooldown_days}` |
| `GET me` / `GET wallet` | `level`, `status`; `balance` |

Server rules the UI relies on (`backend/shop/services.py`, `backend/payments/services.py`, `backend/game/services.py`):

- **Ownership:** `free` → everyone owns it. `level_locked` → owned once `me.level ≥ unlock_level` (no action, no notice). `purchasable` → owned after `buy`. Tournament prizes and admin grants also create ownership.
- **Buy:** only `purchasable` items (`ITEM_NOT_FOR_SALE {unlock}` otherwise). Charged at the **current** `price_coins`; the request carries no expected price (§10 Q1). Coins go to `platform:sinks`. No refunds exist.
- **Equip:** themes and avatars only, owned only (`ITEM_NOT_OWNED {unlock, unlock_level}`). Packs are not equipped: every owned pack's keys are usable in matches (`reaction_keys`). Equip works while suspended (it spends nothing).
- **When a theme applies:** the equipped board and checker keys are copied into each player's info **at match creation**. Equipping during a match changes nothing in that match.
- **Suspended (§12.1):** `buy` → `ACCOUNT_SUSPENDED`; `checkout` is not blocked by the server (§10 Q9).
- **Coin purchase:** amount = a package or a custom toman amount within `[custom_min, custom_max]` that is a whole multiple of `price_toman` (`PAYMENT_AMOUNT_INVALID {reason: range | multiple | package | missing}`). Disabled → `503 PAYMENTS_DISABLED`. Coins are credited only after server-side verify, once. Unreturned payments expire after 2 hours (nothing credited).

---

## 1. Goal and user story

- As an evening casual (P2 Maryam), I want to browse board and checker themes, see how they look in 3D before paying, buy with the price and my balance after shown, and switch themes anytime.
- As a regular (P1 Reza), I want to know which items I already own, which unlock by level, and which cost coins, at a glance.
- As any player, I want to add coins clearly and safely: today through support, later through the bank gateway, with no pressure to buy.

Success means:
- No coin leaves the wallet without the price, the balance, and the balance after on screen, and nothing pre-selected.
- Item state (in use, owned, unlocks at level N, price) is shown with icon plus text on every card.
- The coins page never shows packages while online purchase is off, and never nudges.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Bottom nav "Shop" (side rail at `md`/`lg`) | SH-01 `/shop` (Themes) |
| "Get coins" in PL-05 (play.md), tournament and prediction insufficient sheets, WA-01 Get coins (from step 9), Account hub | CO-01 / CO-02 `/shop/coins` |
| Reactions picker "More packs" (match.md MA-05; not shown during a match, only in the pre-match or finished state) | SH-02 `/shop/packs` |
| Tournament result "View in Shop" (tournaments.md) | SH-03 for that item |
| AC-02 "More avatars" (profile.md, §10 Q4) | SH-05 `/shop/avatars` |
| Gateway return | CO-04 `/shop/coins/result?payment=<id>` |
| Announcement link (news.md) | Any shop route |

| Exit | Destination |
| --- | --- |
| Item card | SH-03 `/shop/items/[id]` |
| CO-03 "Pay with bank card" | The bank gateway (leaves the app) |
| CO-04 "Done" / back | `/shop/coins` (never re-submits) or the route that opened the coins page (kept in `sessionStorage` before leaving) |
| "?" links | `/help/coins`, `/help/themes`, `/help/fees` |

---

## 3. Flow

### 3.1 Segments and lists (SH-01, SH-02, SH-05)

1. Shop has four segments (tabs under the app bar; each is its own route so deep links and back work): **Themes** `/shop` · **Avatars** `/shop/avatars` · **Packs** `/shop/packs` · **Coins** `/shop/coins`.
2. Themes: `GET themes`. Two groups in order: "Boards" (`board_theme`), "Checkers" (`checker_theme`). Avatars: `GET shop/items?kind=avatar`. Packs: `GET shop/items?kind=emoji_pack` and `?kind=phrase_pack`, groups "Emoji packs", "Phrase packs".
3. Filter chips per segment: "All" (default) · "Owned". A filter is a view choice, not a spend, so "All" as default is not a pre-selection (P§2.2).
4. Server order is kept within a group. Equipped and owned items are **not** moved to the top.
5. Card tap → SH-03. Cards have one quick action where it is safe:
   - Owned, not in use, equippable → "Use" (equip directly, §3.4).
   - Purchasable, not owned → the price button opens SH-03 (never buys from the card).
   - Others → no quick action.

### 3.2 Item preview (SH-03)

1. `/shop/items/[id]`: the item is found in the cached list; on a cold open, `GET shop/items` (all kinds) and pick by id. Not found or inactive → not-available state.
2. Preview by kind:

   | Kind | Preview |
   | --- | --- |
   | `board_theme` | 3D board in the opening position with the user's equipped checker theme, static camera as in the match (portrait at `sm`), no dice. Loaded on demand from `data.asset` with a determinate progress bar and the download size (P§6.1). A 2D thumbnail shows first (§10 Q3). |
   | `checker_theme` | 3D: the user's equipped board with these checkers in the opening position; the opponent side shows the default checker theme, labeled "Opponent's checkers use their own theme." |
   | `avatar` | Large avatar (128 px) plus how it looks in a player bar |
   | `emoji_pack` | Grid of the pack's emojis (`data.keys`), each with its accessible name |
   | `phrase_pack` | List of the pack's phrases in the current locale (`GET phrases`), with the note "Players see phrases in their own language." |

3. 3D preview rules:
   - Only when WebGL2 is available; otherwise the thumbnail plus `shop.preview.no3d` "3D preview isn't available on this device." Buying still works.
   - Honors lite mode (no real-time shadows, DPR 1.5) and reduced motion (no idle animation; there is none by default anyway). No orbit; a "Portrait / Landscape" toggle at `md`/`lg` shows both framings.
   - Load failure → "Couldn't load the preview" + Retry; thumbnail stays; buying still works.
   - Slow (> 10 s without progress) → P§6.1 slow notice with Retry / Cancel.
   - On a metered connection hint (`navigator.connection.saveData`), the 3D preview doesn't auto-load: "Load 3D preview ({size})" button.
4. Details below the preview: name, kind label, state line (§4 card states), for themes "Applies from your next match.", for packs "Usable in your matches. When watching, only the free emojis are available."
5. Primary action (sticky footer at `sm`, thumb zone):

   | State | Primary | Notes |
   | --- | --- | --- |
   | Purchasable, not owned | "Buy · {price} coins" → SH-04 | |
   | Owned (bought, free, level reached, prize), equippable, not in use | "Use" (equip) | |
   | In use | Disabled "In use" with a check icon | Reason text not needed; state is the label |
   | Owned pack | No button; line "You own this pack. It's available in your matches." | |
   | Level-locked | No button; "Unlocks at level {n}. You're level {m}." | No buy option, no "level up faster" prompt |
   | Suspended, purchasable | "Buy" disabled with `account.suspended.actionBlocked` + "Details" | Use/equip still works |

### 3.3 Buy (SH-04)

1. Client check: `balance < price` → insufficient sheet (§3.6). Otherwise SH-04 (P§2.1, `CostConfirmation`):

   | Row | Value |
   | --- | --- |
   | Title | "Buy {name}" |
   | Summary | Thumbnail, kind label ("Board theme") |
   | Cost | {price} coins, toman equivalent (P§2.1) |
   | Your balance / Balance after | balance, balance − price |
   | Facts | "Yours to keep. You can switch anytime." (themes, avatars); "Usable in all your matches." (packs); "Purchases can't be refunded." |
   | Primary | "Pay {price} coins" |
   | Secondary | Cancel |
   | Help | "?" → `/help/themes` |

2. Primary → `POST shop/items/{id}/buy` with an `Idempotency-Key` created when the sheet opens. In-flight per P§2.2. "Still working… / Check status" after 10 s re-reads `GET shop/items?kind=` and checks `owned`; if not owned, resend (safe: the server keys the charge per player and item).
3. Success: the sheet swaps to a done step (same sheet, P§1): "You own {name}". For equippable items: primary "Use now", secondary "Not now". Nothing is equipped automatically. Packs: single "Done". Balance chip updates. Snackbar only if the user leaves with "Not now": "{name} added to your items."
4. Errors → §3.8.

### 3.4 Use (equip)

1. "Use" → `POST me/items/{id}/equip`. No confirmation (reversible, P§3). Button spinner; the card keeps its place.
2. Success: the previous item of the same kind shows "Owned"; this one "In use". Snackbar: themes "Theme set. It applies from your next match."; avatar "Avatar changed." If the user has a match in progress: themes add "Your current match keeps its theme."
3. The new theme's assets start downloading in the background (service worker cache, §11.2) so the next match loader doesn't wait; progress shows on the card ("Downloading… 40%"); the previous theme stays until done (P§6.1).
4. `ITEM_NOT_OWNED` (e.g., level dropped is impossible, but an admin revoked it) → action error `shop.error.notOwned`; refresh the list.

### 3.5 Coins page (CO-01, CO-02, CO-03, CO-04)

**Mode by `GET shop/packages.enabled`** (fall back to `config.payments_enabled` while loading):

1. **Online purchase off (current): CO-02.** The page renders `SupportTopupContent` (wallet.md WA-04, keys `shop.coins.supportTopup.*`) as page content: status line, rate line, how to get coins from support with the channel and copy, the user's username with copy, other ways (a friend can send coins, winning matches), safety line. No packages, no amounts, no disabled buy buttons (P§2.3).
2. **Online purchase on: CO-01.**
   - Rate line «هر سکه = ۱٬۰۰۰ تومان» / "1 coin = 1,000 toman" (`price_toman`).
   - Packages as radio cards in server order: coins (large), price in toman, package name when set. **None selected.**
   - "Custom amount" radio card with a toman field (empty), helper before typing "Between {min} and {max} toman, in steps of {price}" and a live line "= {n} coins".
   - Field errors: below min / above max (with the limits); not a multiple: "Enter a multiple of {price} toman." with two text actions "Use {lower} toman ({n} coins)" and "Use {higher} toman ({n+1} coins)" (both user-initiated; nothing changes by itself). Persian and Latin digits accepted; grouping as the user types (P§10).
   - Primary "Continue", disabled with a visible reason until a package or a valid custom amount is chosen.
   - Suspended: Continue disabled with `account.suspended.actionBlocked` (§10 Q9).
3. **CO-03 confirmation** (sheet; P§2.3):

   | Row | Value |
   | --- | --- |
   | Title | "Buy {n} coins" |
   | Price | {toman} toman |
   | You receive | {n} coins |
   | Your balance / Balance after | balance, balance + n (labeled "after payment is confirmed") |
   | Note | "You'll leave the app to pay on the bank's secure page (Shaparak). Coins are added after the bank confirms the payment." |
   | Primary | "Pay {toman} toman with bank card" |
   | Secondary | Cancel |

   - Primary → `POST shop/checkout` with an `Idempotency-Key` (kept for this confirmation), `surface: "m"`. Store the origin route in `sessionStorage` (`bg.coinsReturn`). On `201` with `redirect_url` → `window.location.assign(redirect_url)`. The button stays in its in-flight state until the page unloads.
   - `PAYMENT_GATEWAY_UNAVAILABLE` → action error "The bank gateway isn't responding. Try again later. Nothing was charged." `PAYMENTS_DISABLED` → switch the page to CO-02 with the notice "Online purchase was just turned off. Nothing was charged."
4. **CO-04 payment result** `/shop/coins/result?payment=<id>` (no nav; P§6.2 wait pattern):
   - `GET payments/{id}`; poll every 3 s while `pending` or `callback_received`, up to 60 s, then stop and show "Check status".
   - Step list (ordered, icon plus text): "Returned from the bank" → "Confirming the payment" → "Coins added".

   | `status` | Title | Body | Actions |
   | --- | --- | --- | --- |
   | `pending` | "Waiting for the bank" | "We haven't heard back from the bank yet. If you completed the payment, it'll be confirmed shortly." | "Check status", "Back to shop" |
   | `callback_received` | "Confirming your payment" | "This usually takes a few seconds." | "Check status" (after 60 s) |
   | `verified` | "{coins} coins added" | «+{coins}», reference (copyable), card `card_mask`, Jalali date and time | "Done" → `bg.coinsReturn` or `/wallet` |
   | `failed` | "Payment not completed" | "No coins were added. If money was taken from your card, the bank returns it automatically, usually within 72 hours. Keep this reference for support: {id}." | "Back to shop", support link |
   | `expired` | "Payment expired" | "This payment wasn't completed in time. No coins were added." | "Back to shop" |
   | Missing `payment` param or 404 | "We couldn't find this payment" | "If money was taken from your card, contact support." | "Back to shop", support link |

   - Never says "failed" before the server does. No upsell or "buy more" on any result. Back goes to `/shop/coins`, never to the gateway.
   - Balance chip re-reads `GET wallet` on `verified`.

### 3.6 Insufficient coins

The shared PL-05 sheet (P§9.1) with the shop variant:
- Rows: Cost, Your balance, Shortfall.
- Options: (1) "Free and owned items" → the same segment filtered to Owned; (2) "Get coins" (text-style) → `/shop/coins`; (3) Close.
- Neutral copy; nothing about discounts or scarcity.

### 3.7 Username change (other coin sink)

Owned by profile.md AC-03 (`POST me/username` + `Idempotency-Key`, cost and cooldown from `config.username_change`, `USERNAME_COOLDOWN {available_at}`). The shop does not sell username changes and shows no entry for them. Error keys `errors.profile.usernameCooldown`, `errors.wallet.insufficient`. Recorded here only so every coin sink is covered in one place.

### 3.8 Error map

| Code (HTTP) | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `WALLET_INSUFFICIENT {balance, needed}` (409) | buy | Close SH-04, open §3.6 with the server balance | `errors.wallet.insufficient` | `coins.insufficient.title` |
| `ACCOUNT_SUSPENDED` (403) | buy | SH-04 action error; re-fetch `GET me`; buttons switch to suspended | `errors.wallet.accountSuspended` | `account.suspended.actionBlocked` |
| `ITEM_UNAVAILABLE` (404) | buy, equip | Action error; the item is removed from the list on refresh; SH-03 shows not-available | `errors.shop.itemUnavailable` | `shop.error.unavailable` |
| `ITEM_NOT_FOR_SALE {unlock}` (409) | buy | Action error; refresh the item (it became free or level-locked); nothing charged | `errors.shop.itemNotForSale` | `shop.error.notForSale` |
| `ITEM_NOT_OWNED {unlock, unlock_level}` (403) | equip | Action error; refresh | `errors.shop.itemNotOwned` | `shop.error.notOwned` |
| `PRICE_CHANGED {price}` (proposed, §10 Q1) | buy | SH-04 refreshes with the new price and the notice "The price changed to {price} coins. Nothing was charged." | — | `shop.error.priceChanged` |
| `IDEMPOTENCY_KEY_REQUIRED` (400) | buy, checkout | Client bug: `errors.generic` + code | `errors.wallet.idempotencyKeyRequired` | — |
| `PAYMENTS_DISABLED` (503) | checkout | CO-02 with notice | `errors.payments.disabled` | `shop.coins.error.disabled` |
| `PAYMENT_AMOUNT_INVALID {reason: range, min, max}` | checkout | Field error with limits | `errors.payments.amountInvalid` | `shop.coins.error.range` |
| `PAYMENT_AMOUNT_INVALID {reason: multiple, price_toman}` | checkout | Field error + the two "Use …" actions | ← | `shop.coins.error.multiple` |
| `PAYMENT_AMOUNT_INVALID {reason: package}` | checkout | Reload packages; selection cleared; "This package is no longer available." | ← | `shop.coins.error.package` |
| `PAYMENT_GATEWAY_UNAVAILABLE` (502) | checkout | CO-03 action error; nothing charged | `errors.payments.gatewayUnavailable` | `shop.coins.error.gateway` |
| `NOT_FOUND` (404) | `payments/{id}` | CO-04 not-found variant | `errors.notFound` | `shop.coins.result.notFound.*` |
| `NETWORK` | reads | Screen error + Retry | `errors.network` | `shop.loadError` |
| `NETWORK` | buy, checkout | "Still working… / Check status"; never a new key | `errors.network` | `common.stillWorking` |
| `NETWORK` | equip | Action error + Try again (safe) | `errors.network` | — |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED`, `AUTH_BANNED` | all | As play.md §3.9 | ← | — |
| Any other | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

---

## 4. Screen list

Common: tab screens have the app bar (logo on `/shop`, back on children, title "Shop", balance chip) and the segment tabs. An announcement banner (news.md NW-01) may sit above the tabs on `/shop`.

**Item card (shared by SH-01, SH-02, SH-05):**
1. Thumbnail (themes: 2D render; avatars: the image; packs: 3 sample emojis or the first phrase), decorative (`alt=""`; the name carries meaning).
2. Name (current locale, fallback as tournaments.md §7).
3. State line (icon + text, exactly one):
   - "In use" (check)
   - "Owned" (bag with check) — includes free items: free items read "Free · Owned"
   - "Unlocks at level {n}" (lock) — plus "You're level {m}" in secondary text
   - "{price} coins" (coin icon) for purchasable, not owned
   - "Prize" (trophy) for prize-only items the user doesn't own (§10 Q5)
4. Quick action per §3.1 step 5.
- Card ≥ 44 px targets for the action; the whole card is one link (≥ 120 px tall); the quick action is a separate target.

### SH-01 Themes `/shop` (Tab 4 root)

- **Purpose:** browse and choose board and checker themes.
- **Content priority:** segment tabs → filter chips → "Your theme" summary row (current board + checkers thumbnails, "Change" scrolls to the group) → Boards group → Checkers group.
- **Primary action:** card tap.

### SH-05 Avatars `/shop/avatars`

- Grid of avatar items (3 columns at `sm`). The 12 preset avatars from AC-02 are not listed here (they are chosen in `/me/edit`); a line at the top: "Free avatars are in Edit profile." → `/me/edit`.
- Same card states.

### SH-02 Packs `/shop/packs`

- Groups "Emoji packs", "Phrase packs". Intro line: "Packs add emojis and phrases you can send in matches."

### SH-03 Item preview `/shop/items/[id]`

- As §3.2. Back returns to the segment with scroll kept.

### SH-04 Purchase confirmation (sheet; centered dialog at `md`/`lg`)

- As §3.3.

### CO-01 / CO-02 Coins `/shop/coins`

- As §3.5 steps 1–2. Title "Coins". The balance chip is visible.

### CO-03 Purchase confirmation (sheet; centered dialog at `md`/`lg`)

- As §3.5 step 3.

### CO-04 Payment result `/shop/coins/result?payment=<id>`

- As §3.5 step 4. No nav; top bar with close (×) → `bg.coinsReturn` or `/shop/coins`.

---

## 5. States

| State | SH-01 / SH-02 / SH-05 | SH-03 | SH-04 | CO-01 / CO-02 | CO-03 / CO-04 |
| --- | --- | --- | --- | --- | --- |
| **Loading** | 6 skeleton cards per group; tabs render at once | Thumbnail first, then 3D progress bar with size | Button spinner in flight | Skeleton package cards (CO-01); CO-02 renders from config at once | CO-04: step list with the current step spinning; announced once |
| **Empty** | Owned filter with nothing: "Only the default items so far." + "Show all" (P§5). A kind with no items: group hidden; all hidden → "Nothing here yet." | — | — | CO-01 with no packages: custom amount only | — |
| **Error** | Screen error + Retry | Preview error + Retry (buy still works); not-available state for unknown items: "This item isn't available." + "Back to shop" | §3.8 | Screen error + Retry; CO-02 content still renders from config | §3.8; CO-04 read failure → "Check status" |
| **Offline** | Banner; cached lists with `common.lastUpdated`; Buy and Use disabled with `net.offlineAction` | Cached thumbnail; 3D only if the theme is cached; actions disabled | Primary disabled | CO-02 readable; CO-01 Continue disabled | CO-04 polling pauses: "You're offline. We'll check again when you're back." |
| **Reconnecting** | n/a (REST) | n/a | n/a | n/a | Polling resumes on `online` |
| **Insufficient coins** | Price shown normally (no "can't afford" styling) | Buy → §3.6 | §3.6 | n/a | n/a |
| **Suspended** | Banner; Buy disabled with reason; Use works | Buy disabled + Details; Use works | `ACCOUNT_SUSPENDED` | CO-02 readable (support can't sell to suspended users either; `WA-04` suspended note applies); CO-01 Continue disabled (§10 Q9) | CO-04 of an earlier payment still works |
| **Banned** | No session (AU-14) | ← | ← | ← | ← |
| **First-time user** | One-time hint (P§14): "Some items are free or unlock as you level up. Buying is always optional." | "Applies from your next match." always shown | Full cost block | CO-02 as specified | — |
| **Match in progress** | Resume banner (PL-08) | Use: snackbar notes the current match keeps its theme | — | — | — |
| **WebGL2 missing** | Thumbnails only | `shop.preview.no3d` | Works | — | — |

---

## 6. Responsive notes (§11.7)

| Breakpoint | Lists | SH-03 | Coins |
| --- | --- | --- | --- |
| `xs` 320–359 | 2-column grid; tabs scroll with overflow cue; state line may wrap to 2 lines | Preview 16:9 above details; sticky footer | Package cards full width; custom field full width |
| `sm` 360–599 (390 × 844) | 2 columns (avatars 3) | Portrait board preview (as in the match); primary in the bottom 40% | As `xs` |
| `md` 600–1023 | Side rail; list plus detail panel: SH-03 opens in the panel (URL follows); 3 columns | In panel; 3D preview max 480 px wide | Two columns: packages and custom amount; CO-03 centered dialog |
| `lg` ≥ 1024 | Shell max 1280: 4-column list, detail panel with 3D preview, context panel with "Your items" (equipped board, checkers, avatar) | Natural-orientation preview plus the portrait/landscape toggle | Centered column max 720; CO-04 centered 560 |

- **Landscape phones** (height < 500 px): side rail; SH-03 places the preview at the start and details plus the action at the end; sheets open as end-edge side sheets (max 60% width).
- The 3D preview re-frames on rotation without reloading the theme.
- `dvh`/`svh` only; footers respect safe areas.
- Keyboard: arrow keys move within a grid (roving tab index); Enter opens; "U" is not a shortcut (no hidden actions).

---

## 7. RTL/LTR notes and i18n keys

- fa first. Grids flow from the start edge; tabs and chevrons mirror. The 3D board in the preview never mirrors (§11.1).
- Prices: locale digits and grouping; toman only (never rial). Payment reference and card mask are LTR-isolated with Latin digits (bank identifiers, as Sheba in P§10).
- Item names from `name[locale]` with fallback (tournaments.md §7).
- Emoji names: `reactions.emoji.<key>`; phrase text: `GET phrases` in the viewer's locale.

| Key | fa | en |
| --- | --- | --- |
| `shop.title` | فروشگاه | Shop |
| `shop.segment.themes` | تم‌ها | Themes |
| `shop.segment.avatars` | چهره‌ها | Avatars |
| `shop.segment.packs` | بسته‌ها | Packs |
| `shop.segment.coins` | سکه | Coins |
| `shop.filter.all` | همه | All |
| `shop.filter.owned` | مال من | Owned |
| `shop.hint.firstVisit` | بعضی آیتم‌ها رایگان هستند یا با بالا رفتن سطح باز می‌شوند. خرید همیشه اختیاری است. | Some items are free or unlock as you level up. Buying is always optional. |
| `shop.group.boards` | صفحه‌ها | Boards |
| `shop.group.checkers` | مهره‌ها | Checkers |
| `shop.group.emoji` | بسته‌های شکلک | Emoji packs |
| `shop.group.phrase` | بسته‌های جمله | Phrase packs |
| `shop.current.title` | تم فعلی شما | Your theme |
| `shop.current.change` | تغییر | Change |
| `shop.kind.board_theme` | تم صفحه | Board theme |
| `shop.kind.checker_theme` | تم مهره | Checker theme |
| `shop.kind.avatar` | چهره | Avatar |
| `shop.kind.emoji_pack` | بسته‌ی شکلک | Emoji pack |
| `shop.kind.phrase_pack` | بسته‌ی جمله | Phrase pack |
| `shop.state.inUse` | در حال استفاده | In use |
| `shop.state.owned` | مال شما | Owned |
| `shop.state.freeOwned` | رایگان · مال شما | Free · Owned |
| `shop.state.levelLocked` | در سطح {level} باز می‌شود | Unlocks at level {level} |
| `shop.state.yourLevel` | سطح شما: {level} | You're level {level} |
| `shop.state.price` | {count, plural, one {# سکه} other {# سکه}} | {count, plural, one {# coin} other {# coins}} |
| `shop.state.prize` | جایزه‌ی تورنمنت | Tournament prize |
| `shop.card.label` | {name}، {kind}، {state} | {name}, {kind}, {state} |
| `shop.action.use` | استفاده | Use |
| `shop.action.inUse` | در حال استفاده | In use |
| `shop.action.buy` | خرید · {count, plural, one {# سکه} other {# سکه}} | Buy · {count, plural, one {# coin} other {# coins}} |
| `shop.avatars.presetNote` | چهره‌های رایگان در «ویرایش پروفایل» هستند. | Free avatars are in Edit profile. |
| `shop.packs.intro` | بسته‌ها شکلک‌ها و جمله‌هایی اضافه می‌کنند که در مسابقه می‌فرستید. | Packs add emojis and phrases you can send in matches. |
| `shop.preview.appliesNext` | از مسابقه‌ی بعدی شما اعمال می‌شود. | Applies from your next match. |
| `shop.preview.opponentCheckers` | مهره‌های حریف با تم خود او نمایش داده می‌شود. | Opponent's checkers use their own theme. |
| `shop.preview.packUsage` | در مسابقه‌های خودتان قابل استفاده است. هنگام تماشا فقط شکلک‌های رایگان در دسترس است. | Usable in your matches. When watching, only the free emojis are available. |
| `shop.preview.phrasesLocale` | هر بازیکن جمله‌ها را به زبان خودش می‌بیند. | Players see phrases in their own language. |
| `shop.preview.ownedPack` | این بسته مال شماست و در مسابقه‌هایتان در دسترس است. | You own this pack. It's available in your matches. |
| `shop.preview.locked` | در سطح {level} باز می‌شود. سطح فعلی شما {current} است. | Unlocks at level {level}. You're level {current}. |
| `shop.preview.loading` | در حال بارگذاری پیش‌نمایش سه‌بعدی… {percent} | Loading 3D preview… {percent} |
| `shop.preview.size` | حجم: {size} | Size: {size} |
| `shop.preview.load` | بارگذاری پیش‌نمایش سه‌بعدی ({size}) | Load 3D preview ({size}) |
| `shop.preview.error` | پیش‌نمایش بارگذاری نشد. | Couldn't load the preview. |
| `shop.preview.no3d` | پیش‌نمایش سه‌بعدی روی این دستگاه در دسترس نیست. | 3D preview isn't available on this device. |
| `shop.preview.portrait` | عمودی | Portrait |
| `shop.preview.landscape` | افقی | Landscape |
| `shop.preview.a11y` | پیش‌نمایش {name} روی صفحه‌ی بازی | Preview of {name} on the board |
| `shop.item.unavailable` | این آیتم در دسترس نیست. | This item isn't available. |
| `shop.item.backToShop` | بازگشت به فروشگاه | Back to shop |
| `shop.buy.title` | خرید {name} | Buy {name} |
| `shop.buy.keep` | برای همیشه مال شماست. هر وقت بخواهید می‌توانید عوضش کنید. | Yours to keep. You can switch anytime. |
| `shop.buy.packUse` | در همه‌ی مسابقه‌های شما قابل استفاده است. | Usable in all your matches. |
| `shop.buy.noRefund` | خرید قابل بازگشت نیست. | Purchases can't be refunded. |
| `shop.buy.cta` | پرداخت {price} سکه | Pay {price} coins |
| `shop.buy.paying` | در حال پرداخت… | Paying… |
| `shop.buy.done` | {name} مال شما شد | You own {name} |
| `shop.buy.useNow` | همین حالا استفاده کن | Use now |
| `shop.buy.notNow` | بعداً | Not now |
| `shop.buy.added` | {name} به آیتم‌های شما اضافه شد. | {name} added to your items. |
| `shop.equip.themeDone` | تم تنظیم شد و از مسابقه‌ی بعدی اعمال می‌شود. | Theme set. It applies from your next match. |
| `shop.equip.currentMatch` | مسابقه‌ی فعلی شما با تم قبلی ادامه می‌یابد. | Your current match keeps its theme. |
| `shop.equip.avatarDone` | چهره تغییر کرد. | Avatar changed. |
| `shop.equip.downloading` | در حال دریافت… {percent} | Downloading… {percent} |
| `shop.insufficient.owned` | آیتم‌های رایگان و خریده‌شده | Free and owned items |
| `shop.empty.owned` | فعلاً فقط آیتم‌های پیش‌فرض را دارید. | Only the default items so far. |
| `shop.empty.showAll` | نمایش همه | Show all |
| `shop.empty.none` | فعلاً چیزی اینجا نیست. | Nothing here yet. |
| `shop.loadError` | فروشگاه بارگذاری نشد. | Couldn't load the shop. |
| `shop.error.unavailable` | این آیتم دیگر در دسترس نیست. هیچ سکه‌ای کسر نشد. | This item is no longer available. Nothing was charged. |
| `shop.error.notForSale` | این آیتم دیگر فروشی نیست. هیچ سکه‌ای کسر نشد. | This item isn't for sale anymore. Nothing was charged. |
| `shop.error.notOwned` | این آیتم مال شما نیست. | You don't own this item. |
| `shop.error.priceChanged` | قیمت به {price} سکه تغییر کرد. هیچ سکه‌ای کسر نشد. | The price changed to {price} coins. Nothing was charged. |
| `shop.coins.title` | سکه | Coins |
| `shop.coins.rate` | هر سکه = {price} تومان | 1 coin = {price} toman |
| `shop.coins.package` | {coins} سکه · {price} تومان | {coins} coins · {price} toman |
| `shop.coins.custom` | مبلغ دلخواه | Custom amount |
| `shop.coins.customLabel` | مبلغ (تومان) | Amount (toman) |
| `shop.coins.customHelper` | بین {min} تا {max} تومان، مضربی از {price} | Between {min} and {max} toman, in steps of {price} |
| `shop.coins.customResult` | = {count, plural, one {# سکه} other {# سکه}} | = {count, plural, one {# coin} other {# coins}} |
| `shop.coins.useAmount` | {amount} تومان ({coins} سکه) | Use {amount} toman ({coins} coins) |
| `shop.coins.continue` | ادامه | Continue |
| `shop.coins.reason.choose` | یک بسته یا مبلغ دلخواه انتخاب کنید | Choose a package or a custom amount |
| `shop.coins.confirm.title` | خرید {coins} سکه | Buy {coins} coins |
| `shop.coins.confirm.price` | مبلغ قابل پرداخت | Price |
| `shop.coins.confirm.receive` | دریافت می‌کنید | You receive |
| `shop.coins.confirm.balanceAfter` | موجودی پس از تأیید پرداخت | Balance after payment is confirmed |
| `shop.coins.confirm.leaving` | برای پرداخت به صفحه‌ی امن بانک (شاپرک) می‌روید. سکه‌ها پس از تأیید بانک اضافه می‌شوند. | You'll leave the app to pay on the bank's secure page (Shaparak). Coins are added after the bank confirms the payment. |
| `shop.coins.confirm.cta` | پرداخت {amount} تومان با کارت بانکی | Pay {amount} toman with bank card |
| `shop.coins.error.disabled` | خرید آنلاین همین حالا غیرفعال شد. هیچ مبلغی کسر نشد. | Online purchase was just turned off. Nothing was charged. |
| `shop.coins.error.range` | مبلغ باید بین {min} تا {max} تومان باشد. | The amount must be between {min} and {max} toman. |
| `shop.coins.error.multiple` | مضربی از {price} تومان وارد کنید. | Enter a multiple of {price} toman. |
| `shop.coins.error.package` | این بسته دیگر در دسترس نیست. | This package is no longer available. |
| `shop.coins.error.gateway` | درگاه بانک پاسخ نمی‌دهد. بعداً دوباره امتحان کنید. هیچ مبلغی کسر نشد. | The bank gateway isn't responding. Try again later. Nothing was charged. |
| `shop.coins.result.steps.returned` | بازگشت از بانک | Returned from the bank |
| `shop.coins.result.steps.verifying` | تأیید پرداخت | Confirming the payment |
| `shop.coins.result.steps.added` | افزودن سکه‌ها | Coins added |
| `shop.coins.result.pending.title` | در انتظار پاسخ بانک | Waiting for the bank |
| `shop.coins.result.pending.body` | هنوز پاسخی از بانک نرسیده است. اگر پرداخت را انجام داده‌اید، به‌زودی تأیید می‌شود. | We haven't heard back from the bank yet. If you completed the payment, it'll be confirmed shortly. |
| `shop.coins.result.verifying.title` | در حال تأیید پرداخت | Confirming your payment |
| `shop.coins.result.verifying.body` | معمولاً چند ثانیه طول می‌کشد. | This usually takes a few seconds. |
| `shop.coins.result.verified.title` | {coins} سکه اضافه شد | {coins} coins added |
| `shop.coins.result.reference` | کد پیگیری: {ref} | Reference: {ref} |
| `shop.coins.result.card` | کارت: {mask} | Card: {mask} |
| `shop.coins.result.failed.title` | پرداخت انجام نشد | Payment not completed |
| `shop.coins.result.failed.body` | سکه‌ای اضافه نشد. اگر مبلغی از کارت شما کم شده، بانک معمولاً ظرف ۷۲ ساعت آن را خودکار برمی‌گرداند. این کد را برای پشتیبانی نگه دارید: {id} | No coins were added. If money was taken from your card, the bank returns it automatically, usually within 72 hours. Keep this reference for support: {id} |
| `shop.coins.result.expired.title` | مهلت پرداخت تمام شد | Payment expired |
| `shop.coins.result.expired.body` | این پرداخت به‌موقع انجام نشد. سکه‌ای اضافه نشد. | This payment wasn't completed in time. No coins were added. |
| `shop.coins.result.notFound.title` | این پرداخت پیدا نشد | We couldn't find this payment |
| `shop.coins.result.notFound.body` | اگر مبلغی از کارت شما کم شده، با پشتیبانی تماس بگیرید. | If money was taken from your card, contact support. |
| `shop.coins.result.offline` | آفلاین هستید. پس از اتصال دوباره بررسی می‌کنیم. | You're offline. We'll check again when you're back. |
| `shop.coins.result.backToShop` | بازگشت به فروشگاه | Back to shop |
| `shop.coins.supportTopup.*` | (existing, wallet.md WA-04) | (existing, wallet.md WA-04) |

Shared keys used: `common.back`, `common.cancel`, `common.close`, `common.done`, `common.retry`, `common.stillWorking`, `common.checkStatus`, `common.copy`, `common.copied`, `common.errorCode`, `common.lastUpdated`, `common.loadingSlow`, `coins.*`, `money.toman`, `net.offline`, `net.offlineAction`, `account.suspended.*`, `support.contact.channel`, `reactions.emoji.<key>`, `errors.shop.*`, `errors.payments.*`, `errors.wallet.*`, `errors.notFound`, `errors.network`, `errors.generic`, `nav.shop`, `wallet.tx.shop_purchase`, `wallet.tx.purchase`.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| SH-01/02/05 | Suspension banner → announcement banner → app bar (title, balance chip) → segment tabs → filter chips → hint → "Your theme" row → groups: heading, then cards (grid: one tab stop per card, arrow keys move; the quick action is reachable with Tab from its card) → nav |
| SH-03 | Back → name heading → preview region (one stop, with `shop.preview.a11y`) → portrait/landscape toggle (`md`/`lg`) → state line → notes → primary |
| SH-04 | Title (focused) → summary → cost block → facts → "?" → primary → Cancel; done step: heading → Use now → Not now |
| CO-01 | Rate line → package radio group (one stop; arrows move) → custom card → amount field → conversion → Continue (reason via `aria-describedby`) |
| CO-03 | Title → cost rows → leaving note → primary → Cancel |
| CO-04 | Heading (focused) → step list → body → reference (copy) → actions |

**Labels and announcements**

- Card: `shop.card.label` (name, kind, state), so "In use" and prices aren't lost.
- 3D preview: canvas has `role="img"` and `shop.preview.a11y`; progress bar has a label and value.
- Polite: bought, equipped, preview loaded, payment status changes (once each).
- Package cards: "{coins} coins, {price} toman" with `aria-checked`.

**Other rules**

- Not color alone: all item states (icon + text), selected package (check + outline), payment steps (icon + text).
- Contrast 4.5:1, including text on thumbnails (solid label background).
- Targets ≥ 44 × 44; package cards ≥ 72 px tall.
- Motion: no shimmering "new" badges, no pulsing buy buttons (P§8). Reduced motion: preview appears without fade.
- Text 200%: grids drop to 1 column; cost rows stack.

---

## 9. Acceptance criteria

1. The four segments are separate routes (`/shop`, `/shop/avatars`, `/shop/packs`, `/shop/coins`) and deep links open the right one.
2. Every card shows exactly one state line with icon + text: in use, owned (free items "Free · Owned"), unlocks at level N (with the user's level), price, or prize.
3. Level-locked items never show a buy button or a prompt to level up faster.
4. No card buys directly; purchasable cards open SH-03, and buying requires SH-04.
5. SH-04 shows cost, toman equivalent, balance, balance after, and "can't be refunded" before any charge; the primary contains the price; double-tapping sends one request with one key.
6. After buying, nothing is equipped until the user taps "Use now" or "Use".
7. Equip has no confirmation; the snackbar says themes apply from the next match; during a running match it adds that the current match keeps its theme.
8. SH-03 loads a board or checker theme preview in 3D with a determinate progress bar and the size; without WebGL2 it shows the thumbnail and `shop.preview.no3d`, and buying still works.
9. Suspended users can equip but see Buy and Continue disabled with `account.suspended.actionBlocked` + "Details".
10. With `enabled: false`, `/shop/coins` shows the support top-up content (rate, channel, username with copy, safety line) and no packages, amounts, or disabled buy buttons.
11. With `enabled: true`, no package is selected by default; custom amounts outside the range or not a multiple of the price show field errors; CO-03 shows price, coins, balance, balance after, and the leaving-to-bank note.
12. CO-04 shows the status step list; polls while pending/verifying for up to 60 s; never shows "failed" unless the server says so; `verified` shows the coins, reference, and card mask; no result offers "buy more".
13. Insufficient balance opens the PL-05 shop variant with owned items first and "Get coins" as a text action.
14. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape; no horizontal scroll; no clipped text at 200%; targets ≥ 44 × 44 px.
15. Every error in §3.8 has a mapped state; every string comes from an i18n key with fa and en.

---

## 10. Open questions and API gaps

For the main agent unless noted.

1. **No price check on buy (P§2.2).** `POST shop/items/{id}/buy` charges the current price; if an admin changes it after the sheet opened, the user pays a different amount than shown. Proposal: accept `expected_price` and return `409 PRICE_CHANGED {price}` on mismatch. Blocks acceptance criterion 5 in spirit.
2. **Callback route differs from ia.md.** The server redirects to `/shop/coins/result?payment=<id>`; ia.md listed `/shop/payment/[id]`. This spec adopts the implemented route and updates ia.md. Confirm.
3. **Thumbnails and asset sizes.** `data` has only `asset`. Cards need a 2D thumbnail and the preview needs the download size. Proposal: `data.thumb` and `data.size_bytes` (and per-quality assets for lite mode).
4. **Two avatar sources.** Preset avatars come from `GET avatars` and are set by `PATCH me {avatar}` (which accepts only the 12 preset keys); shop avatars are items equipped by `POST me/items/{id}/equip`. After equipping a shop avatar, AC-02 shows no selection, and avatar images for new shop keys need a frontend release (images ship with the app). Proposal: one source (`GET avatars` returns presets plus owned avatar items with image URLs), and profile.md AC-02 lists owned shop avatars too.
5. **Prize-only items.** A tournament prize item with `unlock: purchasable` shows a price to non-winners. Is there a "not for sale" state for prize items (e.g., `unlock: "prize"`), and should the owner see "Won in {tournament}" (`UserItem.source` is not exposed)?
6. **Refunds.** No refund path exists for shop purchases. Confirm "Purchases can't be refunded" is the policy and add it to the terms.
7. **Pack keys and assets.** Emoji glyph images and names are client assets keyed by `data.keys`; a new pack needs a frontend release. Confirm, or serve images and names from the API.
8. **Payment re-verify.** "Check status" only re-reads `GET payments/{id}`. A payment stuck in `callback_received` (verify call failed) never retries. Proposal: a Celery retry of `verify` for `callback_received` payments, or `POST payments/{id}/verify`.
9. **Suspended checkout.** The server doesn't block `checkout` for suspended users, but §12.1 says they can't spend; buying coins isn't a spend. Decide: allow (then enable Continue) or block (add `ACCOUNT_SUSPENDED` to checkout). This spec disables it pending the decision.
10. **Failed-payment wording.** The 72-hour automatic return is the usual Shaparak practice; confirm with the chosen PSP before launch.
11. **Theme cache and lite mode.** §11.2 caches equipped themes; confirm the service worker also pre-fetches on equip (§3.4 step 3) and that lite mode uses reduced-resolution textures from the same item.
