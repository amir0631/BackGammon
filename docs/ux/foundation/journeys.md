# User journeys

Status: draft for approval (CLAUDE.md §17 step 0)

- Routes are listed in `ia.md`. Pattern references (P§n) point to `patterns.md`.
- Each journey lists the happy path, then its edge cases.
- Specs in `docs/ux/screens/` must cover every step and edge case listed here.

| ID | Journey | Main persona |
| --- | --- | --- |
| J1 | First launch → signup → first match | P4 Karim, P2 Maryam |
| J2 | Returning player, quick coin table, disconnect | P1 Reza |
| J3 | Getting coins: (a) no gateway yet, (b) gateway live | P1 Reza, P2 Maryam |
| J4 | Entering a tournament | P3 Hamid |
| J5 | Spectating and predicting | P2 Maryam |
| J6 | Watching a replay and verifying dice | P3 Hamid |

---

## J1 — First launch → signup → first match

**Context:** Karim opens a friend's referral link `m.<domain>/?ref=AB12CD` on a low-end Android over 4G, in ar.

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | `/` Welcome | Opens the link | Locale detected from the browser (ar); a language switcher is visible. One-line value statement, "Create account" (primary), "Log in". The `ref` code is stored locally. No install banner yet (step 10). |
| 2 | `/signup` | Enters phone; checks "I am 18 or older" and "I accept the terms and privacy policy" (both unchecked by default) | Continue is enabled only when both are checked and the phone is valid (P§9.3). |
| 3 | `/signup/verify` | Receives SMS, enters or pastes the 5-digit code | Validity countdown (2:00), resend with cooldown, "Change number". Auto-submits. |
| 4 | `/signup/account` | Sets password and username; sees the referral code prefilled from `ref` (editable until submit) | Live username check; note that a later change costs coins. |
| 5 | `/signup/avatar` | Picks an avatar or skips | A default avatar is assigned on skip. |
| 6 | `/play` (first time) | Lands in the lobby | Balance chip (probably 0, see open questions). Daily bonus card. One hint: "Start with a free game against the bot". |
| 7 | Bot setup sheet | Chooses level, variant, length | Sheet with a clear "Bot" label. Free, unrated, no ELO change (§8). |
| 8 | `/match/[id]` loading | Waits | Engine load progress with size and percent (P§6.1). A WebGL2 check runs first; if it fails, the unsupported state appears and nothing is downloaded. |
| 9 | Match | Opening roll; plays with tap-tap | First-match hint: tap-tap / drag, then confirm and undo. If the frame rate stays below 30 fps for 10 s, a one-time suggestion to turn on lite mode (§11.6). |
| 10 | Result sheet | Sees the result | Score, XP gained, "Play again", "Play online", "Back to lobby". Back on `/play`, the install banner may now appear once (P§15). |

**Edge cases**
- OTP rate limit reached: a live countdown until the next allowed request (P§4.2).
- Phone already registered: an inline message with a "Log in" link. It must not reveal more than the existing login flow already does.
- Username taken or profane: an inline error with 2–3 available suggestions if the API offers them.
- Invalid referral code: inline "Code not found". The user can clear it and continue; signup is never blocked by a bad code.
- The user loses connection during signup: data entered in the current step is kept and the step can be retried.
- The user closes the app after OTP: see open question 2.

**Success:** the user reaches a playable board within one session, and the "free vs coin" distinction and bot labeling are clear.

---

## J2 — Returning player: quick coin table, with a disconnect

**Context:** Reza opens the installed PWA while waiting for a fare. His balance is 340.

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | App launch | Taps the home-screen icon | Silent token refresh. If a match is in progress → straight to `/match/[id]` with a sync (ia.md §4). Otherwise → `/play`. |
| 2 | `/play` | Taps "Play again: standard, 3 points, 100" (last-settings card) or picks a tier | Tier list shows entry, winner payout, and players waiting (if the API provides it). Nothing is pre-selected. |
| 3 | Join confirmation sheet | Reviews: entry ۱۰۰, fee ۲۰ (10% of pot ۲۰۰), winner receives ۱۸۰, balance ۳۴۰ → ۲۴۰ | Primary "Pay ۱۰۰ coins and search" (P§2). The entry is charged when the match starts (§7.3); the sheet says so. |
| 4 | Matchmaking overlay | Waits | Elapsed time, table summary, "widening search" note after the first widen, Cancel always visible (P§6.2). |
| 5 | Match found | — | Opponent card (avatar, username, ELO, level). Short "match starting" state. A "fair dice" info link explains the commitment. |
| 6 | Match | Plays | Controls in the thumb zone, timer in own bar. |
| 7 | **Connection drops** | — | Self: blocking reconnect overlay with the countdown to forfeit, "Turn timer is still running", Retry now. Opponent: sees Reza's grace countdown on Reza's bar (P§6.4). |
| 8 | Reconnects after 20 s | — | `match.sync`; the board catches up (missed moves animate quickly, or instantly under reduced motion). Toast "Reconnected". |
| 9 | Result sheet (loss) | Sees −۱۰۰, ELO change, XP | Actions: Play again, View replay, Back to lobby. **No shop link, no buy prompt** (P§9.1). If he can't afford Play again, it is disabled with a reason and lower tiers or the bot are offered. |

**Edge cases**
- Session expired (refresh older than 30 days): `/login?next=/play`. After login, back to the same place.
- Insufficient balance at step 2: neutral insufficient sheet (P§9.1).
- Match aborted before the first roll (opponent never connects): notice "Match cancelled — entry refunded" and the balance restored (§7.3).
- Three consecutive timeouts approaching: persistent warning after the 2nd (P§6.4).
- The opponent disconnects: Reza sees their countdown and can keep playing his turn. On expiry, a "You won — opponent forfeited" result.
- The app is killed during the match: on the next open, it goes straight back to the match if the grace period is still running (ia.md §4). See the push question in patterns.md.
- Account suspended since the last visit: `/account/status`.

---

## J3a — Getting coins while no payment gateway exists (current state, §7.9, §18)

**Context:** The gateway is not live. Coins reach users only through daily bonus, winnings, rewards, and admin top-up by support.

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | Entry | Taps the balance chip → `/wallet` → "Get coins"; or Shop → Coins; or "Get coins" in the insufficient sheet | — |
| 2 | `/shop/coins` (unavailable state) | Reads | Neutral info panel `shop.coins.unavailable.*` (see the copy table below). No package list with disabled buy buttons (it would tease). |
| 3 | Contacts support | Uses the channel shown | Out of app (channel TBD, open question 1). |
| 4 | Support tops up in admin (§7.9) | — | Ledger `admin_topup`. |
| 5 | Next app interaction | Opens the app or returns to the tab | The balance refreshes when the app regains focus and when `/wallet` opens. Snackbar "۵۰۰ coins added to your wallet" the first time the client notices an increase from a top-up. |
| 6 | `/wallet` | Checks history | Row labeled "Top-up by support" (`wallet.tx.admin_topup`), shown separately from bank purchases, with date and amount. |

What the unavailable panel says, in order:

| # | Content | Example / notes |
| --- | --- | --- |
| 1 | Online purchase status | "Buying coins online isn't available yet." |
| 2 | How to get coins now | Contact support; they can add coins to your account |
| 3 | What to tell support | Your username (with a copy button). **Never ask for or display the phone number here.** |
| 4 | Other ways to earn coins | Daily bonus, winning matches, level rewards |
| 5 | Security note | Support never asks for your password or SMS code |

**Edge cases**
- The gateway becomes available while the user is on the page: the next load shows J3b. No live switch is needed.
- The user doesn't notice a top-up: the balance chip is correct everywhere after refresh. The snackbar is a courtesy, not a requirement.

**Needs from backend:** a signal that checkout is unavailable (e.g., a flag in `GET shop/packages`) and a support-contact content key. See open questions.

---

## J3b — Buying coins with the gateway live (§7.7)

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | `/shop/coins` | Views packages | Each package: coins, price (rial/toman TBD), bonus coins if any, stated factually. **None pre-selected**; no "best value" badge unless admin content defines it and it is true. |
| 2 | Confirmation sheet | Taps a package | Price, coins received, balance now → after. "You'll be taken to the bank's secure payment page." Primary: "Pay with bank card". |
| 3 | Redirect | — | Checkout created (`pending`), then redirect to the gateway. The app remembers the payment id locally. |
| 4 | Gateway | Pays or cancels | Out of app. |
| 5 | `/shop/payment/[id]` | Returns | Steps: Returned from bank → Verifying → Coins added. Auto-polls. "Check status" button. Support reference visible. |
| 6 | Success | — | Balance chip updates; "Coins added: ۱٬۰۰۰". Actions: back to where the purchase started (stored origin), or Shop. |

**Edge cases**
- **Cancelled or failed at the bank:** "Payment was not completed. No coins were charged" (if the gateway says no deduction). If money may have been deducted, explain the bank's automatic reversal window (wording depends on the PSP, open question).
- **Verify pending or unknown:** the status stays "Verifying" with "Check status" and support ref. It never says "failed" until the server does.
- **User closes the tab mid-payment:** on the next open, a pending payment appears in `/wallet` with "Check status".
- **iOS installed PWA:** the gateway may open in an in-app Safari view and the return URL may not come back into the PWA (open question 3). `/shop/payment/[id]` must work when opened in any browser context, and the PWA must show the payment result on its next focus.

---

## J4 — Entering a tournament

**Context:** Hamid on an iPad, landscape.

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | `/tournaments` | Browses | Segments: Upcoming, My tournaments, In progress, Finished. Card: name, variant, length, entry, start (Jalali + relative), registered/capacity. At `md`, the detail opens in the side panel. |
| 2 | `/tournaments/[id]` | Reads the overview | Format, rules, entry, prize split (percent and current coin amounts, marked as depending on final entrants), min/max players, start time, "If not filled or cancelled: full refund" (§7.6). "?" → `/help/tournaments`. |
| 3 | Registration sheet | Taps Register | Cost, balance, balance after (P§2). "Pay ۵۰۰ coins and register". |
| 4 | Registered | — | State "You're registered". Leave-registration action (refund stated). Push explanation sheet → browser prompt only on Allow (P§15). |
| 5 | Before start | — | In-app banner at T−10 min (timing TBD) and a push if allowed. The Tournaments tab shows a dot. |
| 6 | Round start | Opens `/match/[id]` | Tournament label and round in the player bars. The same match screen as J2. |
| 7 | Between rounds | Waits | Bracket tab with his path, the running matches (watchable), and the next round status (P§6.2). |
| 8 | Eliminated or wins | — | Final placement and prize (if any) credited, shown in the result sheet and the ledger (`tournament_prize`). |

**Edge cases**
- Not filled by start time, or cancelled: notice plus refund, visible in the ledger (`tournament_refund`).
- Tournament full during confirmation: action error in the sheet; nothing is charged.
- **Player not present when their match starts:** rule undefined (open question 4). The design needs the no-show timeout to show a countdown.
- Disconnect in a tournament match: same as J2 step 7.
- Bots never appear in tournaments (§2 rule 10).

---

## J5 — Spectating and predicting

**Context:** Maryam, evening, iPhone PWA.

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | `/live` | Browses | Cards: both players (avatar, username, ELO), score, variant and length, tier, spectator count, tournament highlight. "Predictions open" badge with text, not color only. Filters and sort in a sheet. |
| 2 | `/match/[id]` spectator view | Taps a card | Loading, then the board. A "Watching" label and spectator count. No game controls. Spectator reactions button (if enabled). |
| 3 | Prediction sheet (pool open) | Opens "Predict" | Sentence `predict.howItWorks` (P§2.4). Totals for A and B. Side choice (none selected). Stake input (empty) with chips. Limits shown (max per user). Estimated payout. |
| 4 | Confirmation | Chooses side and stake, confirms | Cost, balance, balance after. "Pay ۲۰۰ coins on <player>". |
| 5 | Pool closes at the first roll | Keeps watching | Panel switches to read-only: final totals, her side and stake. |
| 6 | Match ends | — | Result in the panel: won (payout), lost, or refunded (one-sided / voided), or "Settlement on hold for review" (antifraud, §7.5), without accusing anyone. Listed in `/me/predictions`. |

**Edge cases**
- **Pool already closed on arrival:** read-only totals; no prediction CTA.
- **Viewer blocked from this pool** (a player, or linked by antifraud): "Predictions aren't available to you for this match." No reason detail.
- **Match not eligible** (bot, private, below `predict.min_table_entry`, predictions disabled): no prediction UI at all.
- **Match full** (spectator cap): "This match has reached its viewer limit" plus back to Live.
- **Pool limit reached** (`predict.max_pool_total`): action error; nothing charged.
- **Very short window:** the pool is open only between `match.found` and the first roll, which may be seconds (open question 5). Live cards should show whether a pool is still open, and the sheet must handle closing mid-entry: "Predictions closed before your stake was placed. Nothing was charged."
- **Players:** see the spectator count only (§20.4).

---

## J6 — Watching a replay and verifying dice

**Context:** Hamid reviews last night's 7-point match on desktop (`lg`).

| # | Route / surface | User does | App shows / does |
| --- | --- | --- | --- |
| 1 | `/me/matches` | Opens history | Rows: opponent (or bot label), result, score, variant, length, date (Jalali), coin change. At `lg`, the list is on the left of the detail panel (mirrored in RTL). |
| 2 | `/match/[id]` summary | Selects a match | Summary: games and scores, ELO/XP change, settlement. "Watch replay". Short privacy note: "Only you and your opponent can watch this replay." No share button, copy link, or public-link language. |
| 3 | `/replay/[id]` | Opens | 3D load progress. Controls (never mirrored): play/pause, step back/forward by move, speed 0.5×/1×/2×/4×, game selector (game N of M), timeline with game markers. Reactions shown at their timestamps. At `lg`: move list panel synced with the board. |
| 4 | Verify dice | Opens "Verify dice" | A short explanation of commit–reveal in plain words. Shows `seed_commit` and `seed` (copyable, monospace, LTR-isolated). Runs the check client-side and shows progress, then "All ۸۴ rolls match" or the specific mismatches. |
| 5 | Exit | Back | Returns to the history row, scroll kept. |

**Edge cases**
- **Non-participant opens the URL:** 403 state (P§4.2); no request access.
- **Replay purged** (when `replay.retention_days` > 0): "This replay is no longer available." The summary stays.
- **Bot match:** a replay is available (bot matches are recorded, §20.1). The bot is labeled.
- **Verification failure:** neutral statement plus a support reference. This should never happen, but the state must exist.
- **Lite mode on:** dice appear with the fade instead of the throw (§20.2).

---

## Open questions

1. **Support channel for top-ups (J3a).** What channel do users contact: in-app ticket, phone, Telegram/Bale/Eitaa account, email? Is there a minimum? Does the ledger row show the admin's reason to the user, or only "Top-up by support"? Recommended: generic label only, since reasons may be internal.
2. **Signup order (J1).** Does `POST auth/register` create the account after OTP together with password and username in one call? If the user abandons after OTP, must they redo OTP?
3. **iOS standalone PWA gateway return (J3b).** This must be tested with the chosen PSP. A fallback may be needed, such as opening the gateway in Safari and asking the user to return to the app.
4. **Tournament no-show.** How long does a player have to join a round match before forfeiting? What is the pre-start notice time?
5. **Prediction window length.** With a pool open only from `match.found` to the first roll, the window may be a few seconds. Is there a pre-roll delay for eligible matches (e.g., a setting) so spectators can realistically predict?
6. **Starting coins.** Does a new account receive a signup grant, or only the daily bonus? The lowest tier (50) exceeds the daily bonus (20), so a new user can't join a coin table on day 1 without a top-up. Confirm this is intended.
7. **Referral activation.** Commission activates after the referee's first coin purchase (§7.4). While the gateway doesn't exist, does an admin top-up count as a purchase?
8. **Balance update push.** A `wallet.updated` WebSocket event (not in §10.3) would let the balance chip update right after an admin top-up or a settlement. Is it acceptable, or should the client poll on focus?
