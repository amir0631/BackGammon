# Screen inventory

Status: draft for approval (CLAUDE.md §17 step 0). Revised with product owner decisions (fa and en only; transfer and withdrawal in Phase 1; signup bonus; no daily bonus; toman and custom purchase amount).

Every user-facing screen, sheet, dialog, and overlay on `m.` in Phase 1.

- Routes follow `ia.md`.
- "Spec" is the file in `docs/ux/screens/` that owns the screen (template §21.1).
- "Step" is the §17 step in which it is built.
- Every screen marked **S**, **T**, or **I** must be designed and reviewed at the six §11.7 viewports, in fa then en, portrait and landscape.
- Sheets (**Sh**), dialogs (**D**), and overlays (**O**) are reviewed at `sm`, `md`, and `lg` (sheet vs dialog vs side panel, patterns.md §1).

---

## 1. Feature specs to write

| Spec file | Covers | Step |
| --- | --- | --- |
| `auth.md` | Welcome, signup (phone, 18+, terms, OTP, account, avatar step), login, password reset, logout, account suspended screen and banner, banned panel | 2 |
| `onboarding.md` | Signup-bonus notice, first-time hints framework (the avatar step moved to `auth.md`) | 3 |
| `profile.md` | Account hub, edit profile, username change, sessions, public profile, and the step-2 base of `/settings` (language, lite graphics, reduced animations, sound, vibration) | 2 (username change purchase active from step 3) |
| `wallet.md` | Balance, on-hold and welcome-coin amounts, transaction history (all §7.2 types), get-coins (support top-up) sheet, transfer task flow and receipt, received-coins notice, bank account (one per user: add, change, remove), withdrawal task flow (SMS code or password), requests list and detail, cancel. Consolidates the planned `transfer.md` and `withdrawal.md`. Pending payments are added with `coins-purchase.md` (step 9). | 3 |
| `match.md` | Game screen (player), all in-match sheets, dialogs and overlays, result sheet, finished-match summary, loading, unsupported | 5–6 |
| `lobby.md` | Play tab, table setup, join confirmation, bot setup, insufficient-coins sheet, resume banner | 7–8 |
| `matchmaking.md` | Search overlay, match found | 8 |
| `live.md` | Live list, filters, spectator view | 8 |
| `replay.md` | Replay viewer, verify dice, 403 and purged states | 8 |
| `history.md` | Match history list | 8 |
| `leaderboard.md` | Leaderboards | 8 |
| `coins-purchase.md` | Support top-up state, packages + custom amount, checkout confirmation, payment status | 9 (support state can ship with step 3) |
| `shop.md` | Themes, packs, item preview, buy, equip | 10 |
| `referral.md` | Referral link, earnings | 11 |
| `predictions.md` | Prediction sheet and pool panel, my predictions | 12 |
| `tournaments.md` | List, detail, bracket, registration, round waiting | 13 |
| `settings.md` | Additions to `/settings` after step 2: notifications and install app (the base lives in `profile.md`) | 17 |
| `help-legal.md` | Help topics, terms, privacy | 2 |
| `system.md` | Offline, unsupported device, not found, update available, install banner and iOS guide, push permission sheet, global banners (account status is in `auth.md`) | 1, 6, 17 |
| `admin-settings.md` | Admin panel (`admin.`): login with TOTP, shell, Settings with every registry key, edit/reset with confirmation and audit, SMS status card | 1–2 |
| `admin-users-wallet.md` | Admin panel (`admin.`): users search and detail, wallet top-up (§7.9), withdrawals queue with approve and reject (§7.12) | 3 |

Recommended writing order: `auth` → `wallet` (includes transfer and withdrawal) → `admin-users-wallet` → `coins-purchase` → `match` → `lobby` → `matchmaking`, then the rest in step order. The wallet specs move up because step 3 now ships them.

---

## 2. Inventory

Types: **S** screen (route), **T** task flow (stepped route), **I** immersive screen, **Sh** sheet / side panel, **D** dialog, **O** overlay or banner.

### 2.1 Auth and onboarding

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| AU-01 | Welcome | `/` | S | auth | guest, `ref` captured, language switch |
| AU-02 | Signup: phone, 18+, terms | `/signup` | S | auth | invalid phone, already registered, rate-limited, offline |
| AU-03 | Signup: SMS code | `/signup/verify` | S | auth | code expired, wrong code, resend cooldown, rate-limited |
| AU-04 | Signup: password, username, referral | `/signup/account` | S | auth | username taken/profane, invalid ref code, weak password |
| AU-05 | Avatar picker | `/signup/avatar` | S | auth | loading avatars, none selected, skip, save failed |
| AU-06 | Login | `/login` | S | auth | wrong credentials, locked 15 min (countdown), suspended → AU-13, banned → AU-14 panel |
| AU-07 | Reset: phone | `/password/reset` | S | auth | unknown phone (no account enumeration beyond the login flow) |
| AU-07U | Reset unavailable (SMS off) | Panel on `/password/reset` | O | auth | `503 SMS_UNAVAILABLE`; support contact; back to log in; try again |
| AU-08 | Reset: SMS code | `/password/reset/verify` | S | auth | as AU-03 |
| AU-09 | Reset: new password | `/password/reset/new` | S | auth | weak password, verification expired; success → signed in here, all other sessions revoked (§12.1) |
| AU-10 | Language picker | Sheet from AU-01 / settings | Sh | auth | fa, en |
| AU-11 | Signup-bonus notice | Card on PL-01 (one time) | O | onboarding | granted, held for review, not granted (no notice) |
| AU-12 | Log out | Dialog from AC-01 | D | auth | in-flight, failed (stays open), match-in-progress note |
| AU-13 | Account suspended + global suspension banner | `/account/status` (= SY-03) + banner | S / O | auth | until date, indefinite, reason category, can / cannot lists |
| AU-14 | Banned panel | On AU-06 / AU-09 | O | auth | login, reset, session ended by ban |

### 2.2 Play (Tab 1)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| PL-01 | Play lobby | `/play` | S | lobby | first-time, loading, offline, match-in-progress banner |
| PL-02 | Table setup (variant, length, tier) | Sheet on PL-01 | Sh | lobby | tier unavailable, lengths per tier |
| PL-03 | Join confirmation (entry, fee, payout, balance before/after) | Sheet on PL-01 | Sh | lobby | in-flight, price changed, insufficient → PL-05 |
| PL-04 | Bot setup (level, variant, length) | Sheet on PL-01 | Sh | lobby | bot entry enabled (then shows the P§2 cost block) |
| PL-05 | Insufficient coins | Sheet | Sh | lobby (shared component) | alternatives available / none; hidden shop link after a loss |
| PL-06 | Matchmaking | Full overlay on PL-01 | O | matchmaking | searching, widening, cancelled, error, offline |
| PL-07 | Match found / starting | Overlay → `/match/[id]` | O | matchmaking | opponent card, aborted before first roll (refund notice) |
| PL-08 | Resume-match banner | Global, above nav | O | lobby | your turn / their turn |
| PL-09 | Leaderboard | `/leaderboard` | S | leaderboard | scope tabs, own rank row pinned, empty predict scope |

### 2.3 Match (immersive)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| MA-01 | 3D loading | `/match/[id]` | I | match | progress, slow, cancel, WebGL2 missing → MA-17 |
| MA-02 | Game screen (player) | `/match/[id]` | I | match | opening roll, your turn pre-roll, rolled, moving, confirm pending, opponent's turn, forced move, no legal move, Crawford game, time bank active, timeout warning |
| MA-03 | Match menu | Sheet | Sh | match | sound, haptics, lite mode, move history, help, leave screen, resign |
| MA-04 | Move history / pip count | Sheet (`md`/`lg`: side panel) | Sh | match | — |
| MA-05 | Reactions picker (emojis, phrases) | Sheet (`lg`: side panel) | Sh | match | rate-limited (1 per 3 s) cooldown; only owned packs |
| MA-06 | Reaction bubble | Overlay | O | match | incoming / outgoing |
| MA-07 | Double offered (take/drop) | Dialog | D | match | timer running |
| MA-08 | Resign (game / match) | Sheet | Sh | match | in-flight |
| MA-09 | Leave match screen (stay / leave / resign) | Sheet | Sh | match | — |
| MA-10 | Self reconnecting (countdown to forfeit) | Overlay | O | match | retrying, 30 s / 10 s warnings, recovered, expired |
| MA-11 | Opponent disconnected (grace countdown) | Overlay on opponent bar | O | match | back, expired |
| MA-12 | Timeout warning (one more timeout forfeits) | Inline in own bar | O | match | — |
| MA-13 | Result sheet (game end, match end) | Sheet | Sh | match | win, loss (no shop link), resign, forfeit by timeout/disconnect, aborted/refunded, bot match (no ELO), tournament round |
| MA-14 | Finished match summary | `/match/[id]` (status ended) | S | match | player (replay link) / non-player (summary only, no replay link) |
| MA-15 | Player profile peek | Sheet from an avatar | Sh | match | bot (no profile link) |
| MA-16 | Lite-mode suggestion | Snackbar with action | O | match | — |
| MA-17 | Unsupported device | `/unsupported` or in place | S | system | — |
| MA-18 | Keyboard / screen-reader move entry | Panel | Sh | match | — |

### 2.4 Live and predictions (Tab 2)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| LV-01 | Live list | `/live` | S | live | loading, empty, filtered empty, offline |
| LV-02 | Filters and sort | Sheet (`lg`: side panel) | Sh | live | — |
| LV-03 | Spectator view | `/match/[id]` (viewer not a player) | I | live | joining, match full, match ended while watching, reconnecting, player disconnected |
| LV-04 | Spectator reactions | Sheet / side panel | Sh | live | disabled by setting |
| PR-01 | Prediction panel / sheet | On LV-03 (`md`/`lg`: side panel) | Sh | predictions | open, closed, blocked user, not eligible, limit reached, insufficient |
| PR-02 | Prediction confirmation | Sheet step | Sh | predictions | in-flight, closed mid-entry (nothing charged) |
| PR-03 | Prediction result | Inside PR-01 | Sh | predictions | won, lost, refunded, on hold |
| PR-04 | My predictions | `/me/predictions` | S | predictions | empty, pending, settled, held |

### 2.5 Tournaments (Tab 3)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| TO-01 | Tournament list | `/tournaments` | S | tournaments | segments, empty, loading |
| TO-02 | Tournament detail: overview | `/tournaments/[id]` | S | tournaments | open, full, registered, started, finished, cancelled/refunded |
| TO-03 | Bracket | `/tournaments/[id]?tab=bracket` | S | tournaments | live, your path highlighted (not color only), finished |
| TO-04 | Registration confirmation | Sheet | Sh | tournaments | in-flight, full, insufficient |
| TO-05 | Leave registration | Sheet | Sh | tournaments | refund amount |
| TO-06 | Round ready / waiting between rounds | Banner + state on TO-02 | O | tournaments | no-show countdown (open question) |
| TO-07 | Push permission explanation | Sheet | Sh | system | allow / not now / denied in browser |

### 2.6 Shop and coins (Tab 4)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| SH-01 | Themes | `/shop` | S | shop | free, level-locked, purchasable, owned, equipped |
| SH-02 | Emoji and phrase packs | `/shop/packs` | S | shop | as SH-01 |
| SH-03 | Item preview (3D preview for themes) | `/shop/items/[id]` | S | shop | loading theme, preview failed |
| SH-04 | Item purchase confirmation | Sheet | Sh | shop | in-flight, insufficient |
| CO-01 | Coin packages + custom amount | `/shop/coins` | S | coins-purchase | gateway available; custom amount below min / above max / rounding note |
| CO-02 | Support top-up state | `/shop/coins` | S | coins-purchase | current state (§7.9, §7.11); support channel placeholder |
| CO-03 | Purchase confirmation (leaving to bank) | Sheet | Sh | coins-purchase | in-flight |
| CO-04 | Payment status | `/shop/payment/[id]` | S | coins-purchase | returned, verifying, verified, failed, cancelled, unknown / check status |

### 2.7 Wallet (Tab 5 children)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| WA-01 | Wallet | `/wallet` | S | wallet | available / on hold / withdrawable, empty history, pending payments, actions: Get coins · Send coins · Withdraw (equal prominence, P§9.2) |
| WA-02 | Transaction detail | Sheet | Sh | wallet | per type (§7.2, including `admin_topup`, `signup_bonus`, `transfer` in/out, `withdrawal_hold` / `_payout` / `_refund`) |
| WA-03 | Received-coins notice | Snackbar | O | wallet | top-up, transfer received, refund |
| WA-04 | Get coins (support top-up) | Sheet on WA-01 (step 3); `/shop/coins` CO-02 from step 9 | Sh | wallet | rate, support channel, copy username; disabled while suspended |
| TR-00 | Transfer not available | `/wallet/transfer` (in place of step 1) | T | wallet | suspended, welcome coins only, below minimum, 24 h limit reached |
| TR-01 | Transfer step 1: recipient | `/wallet/transfer` | T | wallet | lookup loading, found (card), not found, self, prefilled `to` |
| TR-02 | Transfer step 2: amount | `/wallet/transfer` | T | wallet | below min, above the rolling 24 h remaining (with next-available time), above balance, fee preview |
| TR-03 | Transfer step 3: review + password | `/wallet/transfer` | T | wallet | in-flight, wrong password, locked (countdown), refused (linked accounts), recipient unavailable, fee changed |
| TR-04 | Transfer receipt | `/wallet/transfer` (final state) | T | wallet | — |
| TR-05 | Discard transfer? | Dialog | D | wallet | — |
| WD-01 | Withdraw eligibility / intro | `/wallet/withdraw` | T | wallet | eligible, nothing withdrawable (bonus-only, with reason), antifraud-blocked, first-time hint |
| WD-02 | Withdraw step 1: bank account | `/wallet/withdraw` | T | wallet | none registered → add (WD-08); registered → the single account card with "Change" (§7.12) |
| WD-03 | Withdraw step 2: amount | `/wallet/withdraw` | T | wallet | below min, above the rolling 24 h remaining (with next-available time), above withdrawable, toman preview |
| WD-04 | Withdraw step 3: review | `/wallet/withdraw` | T | wallet | price or fee changed; expected payout date (one business day) |
| WD-05 | Withdraw step 4: SMS code (SMS mode only; with SMS off the password is on WD-04) | `/wallet/withdraw` | T | wallet | expired, wrong, resend cooldown, rate-limited, in-flight |
| WD-06 | Withdrawal requests | `/wallet/withdrawals` | S | wallet | empty, list with status chips (icon + text) |
| WD-07 | Withdrawal detail | `/wallet/withdrawals/[id]` | S | wallet | pending (cancel, expected by date), pending past the expected date (neutral note), paid (bank ref), rejected (reason), cancelled, "already paid" race |
| WD-08 | Bank account: add or change | `/wallet/bank-accounts` | S | wallet | empty; invalid length / checksum / unknown bank code; valid (bank name shown); change confirmation (replaces the old one); change blocked while a withdrawal is pending |
| WD-09 | Cancel withdrawal | Sheet | Sh | wallet | in-flight |
| WD-10 | Discard withdrawal? | Dialog | D | wallet | — |
| WD-11 | Remove bank account | Dialog | D | wallet | blocked while a withdrawal is pending |

### 2.8 Account (Tab 5)

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| AC-01 | Account hub | `/me` | S | profile | withdrawal status dot |
| AC-02 | Edit profile (avatar) | `/me/edit` | S | profile | — |
| AC-03 | Username change confirmation | Sheet on AC-02 | Sh | profile | cost, cooldown active (next date in Jalali), insufficient |
| AC-04 | Sessions / devices | `/me/sessions` | S | profile | log out others (dialog) |
| AC-05 | Public profile | `/profile/[username]` | S | profile | self, other ("Send coins" action), bot (no page), not found |
| HI-01 | Match history | `/me/matches` | S | history | empty, loading more |
| RP-01 | Replay viewer | `/replay/[id]` | I | replay | loading, playing, paused, 403, purged, bot match |
| RP-02 | Verify dice | Sheet / side panel on RP-01 | Sh | replay | running, verified, mismatch |
| RF-01 | Referral | `/me/referral` | S | referral | inactive until the referee's first purchase, earnings, empty |
| ST-01 | Settings | `/settings` | S | profile (base), settings (step 17 items) | language (fa / en), lite graphics, reduced animations (OS override), sound, vibration (unsupported), account items; later notifications, install |
| HL-01 | Help index and topics | `/help`, `/help/[topic]` | S | help-legal | topics: coins and prices, fees, signup bonus, transfers, withdrawals, predictions, tournaments, replays and fair dice, variants, lite mode, account |
| HL-02 | Terms / privacy | `/terms`, `/privacy` | S | help-legal | placeholder content (§18) |

### 2.9 System

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| SY-01 | Offline | `/offline` | S | system | retry, local bot (open question) |
| SY-02 | Offline banner | Global | O | system | — |
| SY-03 | Account status | `/account/status` | S | auth (AU-13) | suspended only; banned users have no session (AU-14) |
| SY-04 | Not found | 404 | S | system | — |
| SY-05 | Install banner (Android) / iOS guide | Banner + sheet | O / Sh | system | frequency rules (§11.5) |
| SY-06 | New version available | Snackbar | O | system | never during a match or a money flow |
| SY-07 | Announcement banner (admin content) | Global | O | system | dismissible |
| SY-08 | Session expired | Dialog → `/login?next=` | D | system | — |

### 2.10 Admin panel (`admin.`, desktop-first)

Reviewed at 1440 × 900, 1280 × 800, 1024 × 768, 768 × 1024, and 390 × 844, in fa then en (admin-settings.md §6). Users (search, detail, top-up) and Withdrawals are added in step 3 (admin-users-wallet.md); other §13 sections in step 15.

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| AD-01 | Admin login (username, password, 6-digit TOTP) | `admin.` `/login` | S | admin-settings | invalid (generic), locked (countdown), offline |
| AD-02 | Admin shell (header, nav, language, role) | `admin.` all routes | S | admin-settings | read-only banner for finance/support |
| AD-03 | Settings (all registry keys, grouped by prefix) | `admin.` `/settings` | S | admin-settings | loading, search, only changed, empty search, error, read-only |
| AD-04 | Edit setting (edit → confirm with reason) | Dialog | D | admin-settings | invalid, unchanged, consistency warnings, ack required, in flight, conflict, failed |
| AD-05 | Reset to default | Dialog | D | admin-settings | ack, reason, in flight |
| AD-06 | SMS status card | Card in the SMS group | O | admin-settings | test mode, not configured, unreachable, OTP pattern not active, low credit, OK |
| AD-07 | Setting history | Drawer | Sh | admin-settings | empty, partial (latest 200), error |
| AD-08 | Admin session expired | Dialog | D | admin-settings | — |
| AD-09 | Access denied (IP or host) | `admin.` any route | S | admin-settings | ip, host |
| AD-10 | Users search | `admin.` `/users` | S | admin-users-wallet | newest accounts, phone or username query, 50 cap, empty |
| AD-11 | User detail (profile, status, wallet, recent ledger) | `admin.` `/users/[id]` | S | admin-users-wallet | not found, role-gated top-up, audit block (superadmin) |
| AD-12 | Wallet top-up (amount + reason → confirm) | Dialog | D | admin-users-wallet | above cap, first top-up unlocks welcome coins, suspended/banned warning, replay, check status |
| AD-13 | Withdrawals queue | `admin.` `/withdrawals?status=` | S | admin-users-wallet | pending oldest first, overdue, history tabs, 200 cap, no access (support) |
| AD-14 | Withdrawal drawer | Drawer | Sh | admin-users-wallet | player status, audit (superadmin) |
| AD-15 | Mark as paid (bank reference) | Dialog | D | admin-users-wallet | ack, banned ack, SMS on/off line, already decided (don't pay again) |
| AD-16 | Reject with reason | Dialog | D | admin-users-wallet | reason shown to player, already decided |

---

## 3. Coverage check against §1 and §7

| Feature | Screens |
| --- | --- |
| Phone + password + OTP | AU-02 to AU-09 |
| Username, preset avatar | AU-04, AU-05, AC-02, AC-03 |
| Preset emojis and phrases only | MA-05, MA-06, LV-04, SH-02 |
| Variants and modes (1v1, bot, tournaments) | PL-02, PL-04, TO-* |
| Signup bonus (§7.10) | AU-11, WA-02, WD-01 |
| Coins: buy with toman, custom amount (§7.11) | CO-01 to CO-04 |
| Admin top-up (§7.9) | CO-02, WA-02, WA-03 |
| Coins: spend | P§2 sheets, WA-01 |
| Coins: transfer (§7.13) | TR-01 to TR-05, AC-05, WA-03 |
| Coins: withdrawal (§7.12) | WD-01 to WD-10, WA-01 |
| Table fee with 10% rake | PL-03, MA-13 |
| Referral 1% | RF-01, AU-04 |
| Predictions | PR-01 to PR-04 |
| 3D board, dice, lite mode | MA-01, MA-02, ST-01, MA-16 |
| Themes | SH-01, SH-03, SH-04 |
| ELO, XP, leaderboards | PL-09, MA-13, AC-05 |
| Replays (players and admins only) | HI-01, MA-14, RP-01, RP-02 (admin replay lives in the admin panel, out of scope here) |
| Live spectating | LV-01 to LV-04 |
| Languages fa, en | AU-10, ST-01 |
| PWA install, push, offline | SY-01, SY-02, SY-05, TO-07 |

The daily bonus has been removed (§7.10); no screen exists for it.

---

## Open questions

1. **Achievements.** The data model has `achievement` / `user_achievement` and a `achievement_reward` transaction type, but there are no endpoints or UI in §1. Should profiles show achievements in Phase 1?
