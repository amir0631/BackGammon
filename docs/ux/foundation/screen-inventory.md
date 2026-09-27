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
| `auth.md` | Welcome, signup (phone, 18+, terms, OTP, account), login, password reset | 2 |
| `onboarding.md` | Avatar step, signup-bonus notice, first-time hints framework | 2–3 |
| `profile.md` | Account hub, edit profile, username change, sessions, public profile | 2 (username change cost UI after step 3) |
| `wallet.md` | Balance, on-hold amount, transaction history (all §7.2 types), pending payments | 3 |
| `transfer.md` | Transfer task flow, receipt, received-transfer notice | 3 |
| `withdrawal.md` | Bank accounts, withdrawal task flow, SMS code, requests list and detail, cancel | 3 |
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
| `settings.md` | Language (fa / en), sound, haptics, lite mode, reduced animations, notifications, install app | 2 (base), 6 (graphics), 17 (push, install) |
| `help-legal.md` | Help topics, terms, privacy | 2 |
| `system.md` | Offline, unsupported device, account status, not found, update available, install banner and iOS guide, push permission sheet, global banners | 1, 6, 17 |

Recommended writing order: `auth` → `wallet` → `transfer` → `withdrawal` → `coins-purchase` (support state) → `match` → `lobby` → `matchmaking`, then the rest in step order. The wallet specs move up because step 3 now ships them.

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
| AU-05 | Avatar picker | `/signup/avatar` | S | onboarding | loading avatars, skip |
| AU-06 | Login | `/login` | S | auth | wrong credentials, locked 15 min (countdown), suspended/banned → SY-03 |
| AU-07 | Reset: phone | `/password/reset` | S | auth | unknown phone (no account enumeration beyond the login flow) |
| AU-08 | Reset: SMS code | `/password/reset/verify` | S | auth | as AU-03 |
| AU-09 | Reset: new password | `/password/reset/new` | S | auth | success → login or auto-login (open question) |
| AU-10 | Language picker | Sheet from AU-01 / settings | Sh | auth | fa, en |
| AU-11 | Signup-bonus notice | Card on PL-01 (one time) | O | onboarding | granted, held for review, not granted (no notice) |

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
| TR-01 | Transfer step 1: recipient | `/wallet/transfer` | T | transfer | lookup loading, found (card), not found, self, prefilled `to` |
| TR-02 | Transfer step 2: amount | `/wallet/transfer` | T | transfer | below min, above daily remaining, above balance, fee preview |
| TR-03 | Transfer step 3: review + password | `/wallet/transfer` | T | transfer | in-flight, wrong password, locked (countdown), refused (linked accounts), recipient unavailable, fee changed |
| TR-04 | Transfer receipt | `/wallet/transfer` (final state) | T | transfer | — |
| TR-05 | Discard transfer? | Dialog | D | transfer | — |
| WD-01 | Withdraw eligibility / intro | `/wallet/withdraw` | T | withdrawal | eligible, nothing withdrawable (bonus-only, with reason), antifraud-blocked, first-time hint |
| WD-02 | Withdraw step 1: bank account | `/wallet/withdraw` | T | withdrawal | none registered → WD-08, one, several (none pre-selected) |
| WD-03 | Withdraw step 2: amount | `/wallet/withdraw` | T | withdrawal | below min, above daily remaining, above withdrawable, toman preview |
| WD-04 | Withdraw step 3: review | `/wallet/withdraw` | T | withdrawal | price or fee changed |
| WD-05 | Withdraw step 4: SMS code | `/wallet/withdraw` | T | withdrawal | expired, wrong, resend cooldown, rate-limited, in-flight |
| WD-06 | Withdrawal requests | `/wallet/withdrawals` | S | withdrawal | empty, list with status chips (icon + text) |
| WD-07 | Withdrawal detail | `/wallet/withdrawals/[id]` | S | withdrawal | pending (cancel), paid (bank ref), rejected (reason), cancelled, "already paid" race |
| WD-08 | Bank accounts / add account | `/wallet/bank-accounts` | S | withdrawal | empty, invalid Sheba, name required, verification pending (open question), remove blocked while pending |
| WD-09 | Cancel withdrawal | Sheet | Sh | withdrawal | in-flight |
| WD-10 | Discard withdrawal? | Dialog | D | withdrawal | — |

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
| ST-01 | Settings | `/settings` | S | settings | lite mode, reduced animations, sound, haptics, language (fa / en), notifications, install |
| HL-01 | Help index and topics | `/help`, `/help/[topic]` | S | help-legal | topics: coins and prices, fees, signup bonus, transfers, withdrawals, predictions, tournaments, replays and fair dice, variants, lite mode, account |
| HL-02 | Terms / privacy | `/terms`, `/privacy` | S | help-legal | placeholder content (§18) |

### 2.9 System

| ID | Screen | Route / host | Type | Spec | Key states |
| --- | --- | --- | --- | --- | --- |
| SY-01 | Offline | `/offline` | S | system | retry, local bot (open question) |
| SY-02 | Offline banner | Global | O | system | — |
| SY-03 | Account status | `/account/status` | S | system | suspended (until date), banned |
| SY-04 | Not found | 404 | S | system | — |
| SY-05 | Install banner (Android) / iOS guide | Banner + sheet | O / Sh | system | frequency rules (§11.5) |
| SY-06 | New version available | Snackbar | O | system | never during a match or a money flow |
| SY-07 | Announcement banner (admin content) | Global | O | system | dismissible |
| SY-08 | Session expired | Dialog → `/login?next=` | D | system | — |

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

1. **Password reset outcome.** After a reset (AU-09), does the user get signed in automatically, or return to login? Are other sessions revoked?
2. **Achievements.** The data model has `achievement` / `user_achievement` and a `achievement_reward` transaction type, but there are no endpoints or UI in §1. Should profiles show achievements in Phase 1?
3. **Bank accounts per user (WD-08).** How many bank accounts may a user register? Can they remove one? Is there a verification state? See patterns.md open question 4.
