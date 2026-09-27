# Interaction patterns

Status: draft for approval (CLAUDE.md §17 step 0). Revised with product owner decisions (fa and en only; toman pricing; custom purchase amount; signup bonus; no daily bonus; transfer and withdrawal in Phase 1).

Every screen spec in `docs/ux/screens/` uses these patterns. A spec may deviate only by stating why. Section numbers here (patterns.md §N, short form P§N) are referenced from other UX docs.

---

## 1. Surfaces: when to use which

| Surface | Use for | Do not use for | Dismiss |
| --- | --- | --- | --- |
| **Full screen (route)** | Primary tasks and destinations: lobby lists, match, replay, detail pages, auth steps, payment status | Short choices or confirmations | Back |
| **Task flow (route, stepped)** | Multi-step money flows with their own URL: `/wallet/transfer`, `/wallet/withdraw`. Shows a step indicator ("Step 2 of 4") and a close (×) button, no nav. | Single decisions | Close (×) or back |
| **Bottom sheet (modal)** | Setup and confirmation of an action started on the current screen: table setup, join/spend confirmation, bot setup, prediction, filters, match menu, reactions, resign, item actions | Content the user needs to navigate within (more than one level deep) | Drag down, scrim tap, back, close button. Coin-spend and resign sheets: scrim tap and drag do **not** dismiss while a request is in flight. |
| **Side panel** (`md`/`lg`) | The same component as a sheet when there is room: move history, reactions, spectators, prediction pool, list details | Blocking decisions | Persistent |
| **Dialog (centered)** | Blocking, time-critical decisions that must interrupt: opponent offers a double (take/drop), "match ended by forfeit", session expired | Anything long or scrollable | Explicit button only |
| **Banner (inline, top of content)** | Persistent status: offline, "return to match", announcements from admin, "online purchase not available yet" | Errors about a specific field | Close button when non-critical; status banners disappear when the status clears |
| **Snackbar / toast** | Confirmation of a completed, non-critical action ("Theme equipped", "Coins added to your wallet") | Errors that need action; anything in a match except reactions | Auto 4 s (8 s if it has an action). Pauses on hover or focus. Never covers primary game controls. |
| **In-match overlay** | Opponent's reaction bubble, "your turn", disconnect countdown | Anything that needs a decision (use a dialog) | Auto; never blocks board input |

Sizing rules:
- **Sheets at `sm`:** open at the height of their content, up to 90 % of `dvh`. Anything taller scrolls inside the sheet. The primary action sits in a sticky footer in the thumb zone, respecting `env(safe-area-inset-bottom)`.
- **Sheets at `md`/`lg`:**
  - Setup and confirmation sheets become centered dialogs, max 480 px wide.
  - Panel-type sheets (move history, reactions, pool) become side panels.
  - Author these as container-query components (§11.7).
- **Task flows at `md`/`lg`:** a centered single column, max 560 px.
- **Stacking:** one modal layer at a time. A sheet can replace itself with the next step (setup → confirm). Never stack a sheet on a sheet.

---

## 2. Money confirmation (every coin spend or coin movement)

Applies to:
- Table entry
- Bot entry (if `bot.entry_enabled`)
- Prediction stake
- Tournament registration
- Shop item
- Username change
- Coin transfer
- Withdrawal
- Coin purchase (toman price instead of coin cost; see §2.3)

### 2.1 Anatomy (top to bottom)

1. **Title:** what is being bought, entered, or moved ("Enter 100-coin table", "Send coins to @ali_tbz").
2. **Summary of the thing:** variant, length, tier / item preview / tournament name and start time / recipient card / bank account card.
3. **Cost block.** Always shown in full, never collapsed. Rows that don't apply are omitted, never hidden behind "details".

   | Row | Key | fa | en | Used by |
   | --- | --- | --- | --- | --- |
   | Amount / cost | `coins.cost` | هزینه / مبلغ | Cost / Amount | all |
   | Toman equivalent (secondary text under the cost) | `coins.tomanEquivalent` | معادل ۱۰۰٬۰۰۰ تومان | Equals 100,000 toman | all (see open question 6) |
   | Fee | `coins.fee` | کارمزد | Fee | transfer, withdrawal (shown even when 0: «کارمزد: ۰») |
   | Recipient receives | `transfer.recipientReceives` | دریافتی گیرنده | Recipient receives | transfer |
   | You receive in your bank account | `withdraw.youReceive` | مبلغ واریزی به حساب شما | Paid to your bank account | withdrawal (in toman) |
   | Your balance | `coins.balance` | موجودی شما | Your balance | all |
   | Balance after | `coins.balanceAfter` | موجودی پس از این کار | Balance after | all |

4. **Feature-specific money facts:**
   - **Table:** Entry · Platform fee (10 %) of the pot · Winner receives. Example at the 100 tier: entry ۱۰۰, pot ۲۰۰, fee ۲۰, winner receives ۱۸۰. Values come from the server tier and the `table.rake_pct` setting, never from client math alone.
   - **Prediction:** one plain sentence on how the pool works, plus current totals on both sides (see §2.4).
   - **Tournament:** entry, prize split from the server config, and what happens if the tournament is cancelled or not filled (full refund).
   - **Username change:** cost and the next date a change is allowed (cooldown).
   - **Transfer and withdrawal:** see §2.5.
5. **Primary button** with the amount in the label:
   - "Pay ۱۰۰ coins and search" / «پرداخت ۱۰۰ سکه و جستجو»
   - "Send ۲۰۰ coins" / «ارسال ۲۰۰ سکه»
   - "Request withdrawal of ۵۰۰ coins" / «درخواست برداشت ۵۰۰ سکه»
6. **Secondary button:** Cancel.
7. **"?" link** to the relevant `/help/[topic]`.

### 2.2 Rules

- Nothing is pre-selected: tier, stake amount, package, custom amount, transfer amount, withdrawal amount, quantity, or checkbox.
  - Amount inputs start empty.
  - Quick-pick chips (including "All withdrawable") are allowed; none is active by default.
- The primary button is disabled until every required choice is made. The disabled state has a visible text reason ("Enter an amount").
- The cost shown is the cost charged. If the server price, fee, or rules change between showing the sheet and confirming, the server returns an error and the sheet refreshes with a notice. It never charges a different amount silently.
- Fees, limits, and prices always come from the server (settings §14). The client may preview arithmetic but must display the server-confirmed values in the final review.
- **In-flight state:**
  - The button shows a spinner.
  - The sheet or step cannot be dismissed.
  - Repeat taps are ignored.
  - The client sends an `Idempotency-Key` (§10.1).
  - If there is no response in 10 s, show "Still working…" with a "Check status" action that re-queries the resource. Never offer a blind retry that could spend twice.
- **Success:**
  - The sheet closes or advances.
  - The balance chip updates.
  - A snackbar or receipt confirms the amount.
  - Table entry has no snackbar; matchmaking itself is the feedback.
- **Insufficient balance:** see §9.1. Checked before the sheet opens and again on the server.

### 2.3 Buying coins (§7.11)

- **Prices:** always in toman: «تومان» in fa, "toman" in en. The rate is shown once on the page: «هر سکه = ۱٬۰۰۰ تومان» / "1 coin = 1,000 toman" (from `coin.price_toman`).
- **Options:** preset packages (none pre-selected), plus a **custom amount** field:
  - Input in toman, with a live conversion "= N coins" under it.
  - Range from `shop.custom_min_toman` to `shop.custom_max_toman` (default ۱۰٬۰۰۰ to ۱۰٬۰۰۰٬۰۰۰ تومان), shown as helper text before typing.
  - Grouping separators are inserted as the user types. Persian and Latin digits are accepted.
  - **Only whole coins can be bought.** If the typed amount isn't a multiple of the coin price, show "You'll pay ۱۵٬۰۰۰ تومان for ۱۵ coins" and charge the rounded-down amount. The user never pays for a partial coin (see open question 5).
- **Confirmation:**
  - Price (toman), coins you receive, balance now, balance after.
  - The primary button is "Pay with bank card", and the sheet states that the user is leaving the app for the bank's gateway.
- **When the gateway isn't live:** the page shows the support top-up state instead of packages (journeys.md J3a). It shows no packages with disabled buttons.

### 2.4 Prediction explanation sentence

- **Key:** `predict.howItWorks`
- **fa:** «برندگان کل مبلغ را پس از کسر ۱۰٪ کارمزد، به نسبت مبلغ پیش‌بینی خود تقسیم می‌کنند؛ اگر کسی روی یک طرف پیش‌بینی نکند، همه مبلغ خود را پس می‌گیرند.»
- **en:** "Winners split the whole pool, minus a 10% fee, in proportion to their stakes. If nobody picks one side, everyone gets their stake back."

The percent is interpolated from `predict.rake_pct`; never hardcode it.

Always shown with:
- Totals for side A and side B
- Your stake (if any)
- "Estimated payout if <player> wins" for the entered stake, labeled `predict.estimate` ("estimate, changes as others predict")

### 2.5 Transfer and withdrawal specifics

| | Transfer (§7.13) | Withdrawal (§7.12) |
| --- | --- | --- |
| Before the amount | Recipient step: username entry → lookup → **recipient card** (avatar, username, level). The user must confirm "This is the right person". Self and not-found are inline errors. | Bank account step. Each user has **exactly one** Sheba account (§7.12). If none is registered, add it (§12). If one is registered, show its card with a "Change" action; nothing to choose. Masked display: `IR•• •••• •••• •••• •••• ••12 34` plus the bank name derived from the bank code. |
| Amount helper text | Min `transfer.min_coins`, remaining in the last 24 hours (of `transfer.daily_max_coins`, rolling window, §7.13), available balance | Min `withdraw.min_coins`, remaining in the last 24 hours (of `withdraw.daily_max_coins`, rolling window, §7.12), **withdrawable now** (see below) |
| Extra rows in the cost block | Fee, recipient receives | Fee, paid to your bank (toman at today's `coin.price_toman`, fixed at request time) |
| Irreversibility / timing note | «انتقال سکه قابل بازگشت نیست.» / "Transfers can't be undone." | «واریز حداکثر تا یک روز کاری پس از درخواست انجام می‌شود. پس از واریز پیامک دریافت می‌کنید. تا پیش از واریز می‌توانید درخواست را لغو کنید.» / "We pay withdrawals within one business day of your request. You'll get an SMS when it's paid. You can cancel while it's pending." (§7.12; business days are Iranian working days.) |
| Safety note | "Support will never ask you to send coins or share your password." | "Support will never ask for your SMS code." |
| Step-up check | Password field in the review step (§2.6) | SMS code step after review (§2.6) |
| Result | Receipt: amount, recipient, time (Jalali), transaction id; "Done" → `/wallet` | "Request submitted" with status Pending and "Expected by {date}" → `/wallet/withdrawals/[id]` |

**Rolling 24-hour limits (transfer and withdrawal)**
- Limits count everything sent or requested in the **last 24 hours**, not per calendar day (§7.12, §7.13).
- Wording:
  - Helper: «باقی‌مانده در ۲۴ ساعت اخیر: ۳٬۰۰۰ از ۵٬۰۰۰ سکه» / "Left in the last 24 hours: 3,000 of 5,000 coins".
  - Never "today" or "per day".
- When the amount exceeds what's left, the field error also says when more becomes available: "More becomes available at {time}" (the time the oldest counted item leaves the window; Jalali date plus time in fa). The value comes from the server (open question 2).

**Expected payout date (withdrawal)**
- "Expected by {date}" = the end of the next Iranian working day after the request. It is computed and returned by the server (it knows the holiday calendar), and never computed by the client (open question 1).
- Shown on the review step (as "Expected payout: by {date}"), on the submitted screen, on the request detail, and in the requests list.
- If the date passes while the request is still pending, the detail shows «واریز این درخواست بیش از زمان معمول طول کشیده است. در صورت نیاز با پشتیبانی تماس بگیرید.» / "This is taking longer than usual. Contact support if you need help." This is a neutral statement: no alarm styling, no blame.

**Withdrawable amount (§7.12)**
- Show "Withdrawable now: X of Y coins" when the two differ, with a one-line reason:
  - Signup-bonus coins become withdrawable after your first coin purchase or top-up.
  - Coins already on hold for a pending withdrawal are not withdrawable.
- The value comes from the server, never from client math (open question 2).

**Ineligible states** (no amount step is shown):

| State | Message and way forward |
| --- | --- |
| No withdrawable coins | Explains why, with a link to `/help/withdrawals` |
| Account has an open antifraud flag | "Withdrawals aren't available for your account right now. Contact support." No accusation, no flag details. |
| Transfer refused because the accounts are linked by antifraud | "This transfer can't be completed. Contact support if you think this is a mistake." Nothing is charged. |

**Recipient side of a transfer**
- A ledger row «دریافت از @username» / "Received from @username".
- A snackbar the first time the client sees it.
- The sender's phone number is never shown anywhere.

### 2.6 Step-up confirmation (password or SMS code)

- **Transfer:**
  - The password field sits inside the review step, directly above the primary button, with `autocomplete="current-password"`.
  - A wrong password is an inline error and the field is cleared. Lockout behavior follows the server (open question 3). A lockout shows a live countdown.
- **Withdrawal:**
  - After the user taps "Request withdrawal", a code step with the same OTP input as signup (§12), sent to the user's own phone (shown masked to them only: `0912•••••34`).
  - It shows the validity countdown and resend cooldown.
  - The coins are held only after the code is accepted. Until then, backing out costs nothing, and the screen says so.
- Codes and passwords are never kept when the user goes back a step.

---

## 3. Non-coin confirmations

Confirm only irreversible or costly actions. Do not confirm reversible ones.

| Action | Confirmation | Notes |
| --- | --- | --- |
| Resign game / resign match | Sheet with two clearly separated options. Each states what the opponent receives (points, and for a match: the whole match and the entry pot). Destructive styling plus a text label, not color alone. | Default focus on Cancel |
| Offer double | No confirmation, but the button label is explicit: "Double to ۲". There is no undo (server authoritative). | |
| Take / drop a double | Blocking dialog with the cube value after taking and the points lost if dropping. Dialog timer = turn timer. | |
| Cancel matchmaking | No confirmation (nothing is charged before a match starts; §7.3) | |
| Leave tournament registration | Sheet with the refund amount | Only before start |
| Cancel a pending withdrawal | Sheet: "Cancel this withdrawal? ۵۰۰ coins go back to your balance." Cancel withdrawal / Keep request. | Only while status is `pending`. If the server says it's already paid, show the paid state instead. |
| Change the bank account (replaces the only one, §7.12) | Dialog: "Your new Sheba will replace {masked old}. Future withdrawals go to the new account." | Blocked (with explanation, and a link to the pending request) while a withdrawal is pending |
| Leave the match screen | Sheet: Stay / Leave screen / Resign (ia.md §3.4) | |
| Close a transfer or withdrawal task flow with input entered | Dialog: "Discard?" | Nothing has been charged at that point, and the dialog says so |
| Log out / log out other devices | Dialog | |
| Undo move, change setting, equip theme | None | Reversible |

---

## 4. Errors

### 4.1 Levels

| Level | Pattern | Example |
| --- | --- | --- |
| Field | Inline text under the field. The error icon plus text is never color-only. Focus moves to the first invalid field on submit. | Username taken, wrong code, invalid Sheba |
| Action | Inline message inside the sheet or step, above the button, with retry if safe | Join failed: tier closed; 24-hour transfer limit reached |
| Screen | Full error state in the content area: illustration, one-line cause, primary "Try again", secondary "Back" | List failed to load |
| Global | Banner (offline, maintenance, announcement) | Server maintenance |

### 4.2 Rules

- Map every API `message_key` (§10.1) to a string in fa and en. Unknown codes fall back to `errors.generic` plus the error `code` in small text, for support.
- Say what happened and what to do next. Never blame the user. Never show stack traces, HTTP codes as the main text, or raw English in fa.
- Rate limits (OTP, login lock, password confirmation lock) show the exact wait as a live countdown ("Try again in ۱۴:۵۲").
- **Coin errors keep the balance unchanged until the server confirms.** This covers:
  - `WALLET_INSUFFICIENT`
  - price or fee changed
  - pool closed
  - tournament full
  - over the rolling 24-hour limit
  - below minimum
- **403 on replay:**
  - Show "This replay is only available to the two players of the match."
  - No request-access action.
  - No share affordance anywhere.

---

## 5. Empty states

Structure: small illustration (decorative, `alt=""`), one-sentence explanation, at most one action. Neutral, no guilt, no pressure.

| Screen | Message intent | Action |
| --- | --- | --- |
| `/live` no matches | No live matches right now | Play a match (`/play`) |
| `/live` filtered, none | No matches for these filters | Clear filters |
| `/tournaments` none upcoming | No tournaments scheduled yet | None |
| `/me/matches` | You haven't played yet | Play vs bot |
| `/me/predictions` | No predictions yet | Watch live matches |
| `/me/referral` earnings | No earnings yet; commission starts after your friend's first purchase | Copy link |
| `/wallet` history | No transactions yet | None |
| `/wallet/withdrawals` | No withdrawal requests | None (Withdraw is already on `/wallet`) |
| `/wallet/bank-accounts` | No bank account yet. Add your Sheba number to withdraw. | Add bank account |
| Owned themes | Only the default theme | Browse themes |
| Leaderboard predict scope | Needs at least N predictions to appear (N from `predict.min_count_for_board`) | None |

---

## 6. Loading, waiting, offline, reconnect

### 6.1 Loading

| Case | Pattern |
| --- | --- |
| Lists and cards | Skeletons shaped like the content. No spinners for lists. |
| Button actions | In-button spinner; label kept for screen readers ("Paying…") |
| 3D scene first load (§11.4) | Full-screen loader over the match route with: determinate progress bar, percent, download size remaining, and Cancel. Cancel returns to the origin screen. If a coin match was already found, Cancel does not leave the match: it shows the same Stay / Leave screen / Resign choice as ia.md §3.4, with the turn timer and grace rules stated. Full behavior is specified in `match.md`. Tip text rotates at most every 5 s and is not animated under reduced motion. |
| Theme download | Progress on the item card; the old theme stays until the new one is ready |
| Over 10 s without progress | Show "This is taking longer than usual" plus Retry / Cancel |

### 6.2 Wait states: every wait has progress and a way out (§21.2)

| Wait | Progress shown | Way out |
| --- | --- | --- |
| Matchmaking | Elapsed time (mm:ss), selected table summary, "widening search" note after the first widen step | Cancel (always visible, thumb zone) |
| Opponent's turn | Opponent's turn timer and time bank in their bar | Reactions, menu (resign, leave screen) |
| Opening roll / forced move / no legal move | The dice themselves, with a text caption ("No legal move", "Forced move") | None needed (1–1.5 s) |
| Payment verification | Status step list: Returned from bank → Verifying → Coins added | "Check status" button, "Back to shop"; support reference number |
| Withdrawal processing | Status timeline on `/wallet/withdrawals/[id]`: Requested (date/time) → Pending payment by finance ("Expected by {date}", within one business day, §7.12) → Paid (bank reference) / Rejected (reason) / Cancelled | "Cancel request" while pending; support contact |
| Reconnect (self) | Countdown to forfeit (§6.4) | "Retry now", leave (warns about forfeit) |
| Opponent disconnected | Opponent's grace countdown | Wait, reactions, resign |
| Tournament waiting for next round | Round status, which matches are still playing | Watch a running tournament match, leave screen |
| OTP resend cooldown | Countdown | "Change number" (signup) / "Back" (withdrawal) |

### 6.3 Offline (not in a match)

- Top banner: `net.offline` "You're offline. We'll reconnect automatically." Cached screens stay readable.
- Coin actions (including transfer and withdrawal) and matchmaking are disabled, with the reason in text.
- If the app starts offline, or a route isn't cached: `/offline` screen with "Try again" and, if available, local bot play (see open questions).

### 6.4 Reconnect in a match (both players must see it)

Server events: `opponent.disconnected`, `opponent.back` (§10.3). Grace = `game.reconnect_grace_seconds`.

| Who | What they see | Timing |
| --- | --- | --- |
| **Disconnected player** (client detects socket loss) | Blocking overlay over the board (board still visible behind a scrim): "Connection lost — reconnecting", attempt count, **countdown to forfeit**, a statement that the turn timer is still running, "Retry now" | Starts immediately. The countdown uses the last-known grace value and the local clock, and corrects when the server syncs (`match.sync`). |
| **Opponent of the disconnected player** | Non-blocking overlay on the disconnected player's bar: "Opponent disconnected — ۰۱:۱۲ until they forfeit". The board stays usable if it's their turn. | On `opponent.disconnected` |
| **Both, on return** | Overlay clears. Short toast "Reconnected" / "Opponent is back". | On `opponent.back` or successful sync |
| **Both, on expiry** | Match-ended dialog stating the reason (forfeit by disconnect) | On `match.ended` |
| **Spectators** | Same info as the opponent, non-blocking | |

Warnings before any forfeit:
- The countdown turns into a warning state at 30 s and 10 s left: text change, icon, haptic (if enabled), and a screen-reader announcement.
- Turn timeouts: after `game.max_consecutive_timeouts − 1` consecutive timeouts, show a persistent warning in the player's bar: "One more timeout ends the match".

Rules:
- Never auto-close these overlays silently.
- Never hide the countdown behind a sheet. If a sheet is open, it closes first.

---

## 7. Timers

- **Turn timer:** ring or bar in the player's bar plus mm:ss text. When it runs out, the **time bank** is shown and counts down as a separate labeled value (`match.timebank`).
- **Thresholds:**
  - 10 s left on turn + time bank: warning style (icon plus text, not color alone) and haptic (if enabled).
  - 5 s: screen-reader announcement. There is no per-second announcing.
- Timers are server-driven. The client displays them and corrects on every `match.state`.
- Under reduced motion, the ring is replaced by text and a static bar.

---

## 8. Feedback: haptics, sound, motion

| Event | Haptic (if enabled) | Sound (if enabled) | Visual |
| --- | --- | --- | --- |
| Your turn | Short pulse | Soft chime | "Your turn" caption on own bar |
| Dice land | None | Dice sound | 3D throw (lite: fade) |
| Illegal drop | Light double pulse | None | Checker returns; legal targets re-shown |
| Timer warning | Pulse at 10 s | Tick at 10 s | Warning state |
| Reaction received | None | Optional pop | Bubble near the sender's bar, 3 s |
| Coins received (purchase, top-up, transfer, refund) | None | None | Snackbar |

- `animations.reduced` and `prefers-reduced-motion` shorten checker and UI animations and remove parallax, bounces, and confetti. Dice still show the throw unless lite mode is on (§11.6). **Open question:** should reduced motion also switch the throw to the fade?
- Never animate, pulse, or flash the balance chip, the Shop tab, or buy buttons.

---

## 9. Monetization ethics (hard constraints for every spec)

### 9.1 Insufficient coins

Trigger: the user picks a spend larger than their balance.

**Sheet content:**
- Title: "Not enough coins"
- Cost, your balance, and the shortfall
- **Options, in this order:**
  1. Cheaper alternatives, if any (a lower tier, the bot, a smaller stake)
  2. "Get coins" as a text-style secondary action to `/shop/coins`
  3. Close

**Copy rules:** neutral. No urgency, no "only X left", no discount timers, no emotional language.

**Never shown after a loss.** The match result screen and anything triggered by a loss must not link to the shop or mention buying. If "Play again" is unaffordable after a loss, it is disabled with the text "Not enough coins for this table", and lower tiers and the bot are offered.

**Transfers** never suggest buying: over-balance is an inline field error ("More than your balance").

### 9.2 Always

- Show the cost before the user commits (§2). Nothing is pre-selected.
- No fake urgency, countdown sales, "limited offer" timers, or loss-chasing copy ("win it back", "get revenge", "don't stop now").
- Post-loss action labels are neutral: "Play again", "Back to lobby", "View replay".
- **Signup bonus (§7.10):**
  - A one-time, dismissible notice on `/play` after the first sign-in: «۱۰۰ سکه هدیه ثبت‌نام به حساب شما اضافه شد.» / "100 welcome coins were added to your account."
  - The amount comes from `bonus.signup_coins`.
  - It includes one line: "Welcome coins become withdrawable after your first coin purchase or top-up", with a "?" link.
  - If antifraud holds the bonus: "Your welcome coins are being reviewed." No accusation.
- **There is no daily bonus.** No streaks, no daily reward cards, no "come back tomorrow" prompts.
- **Leaving with money is never harder than adding it:**
  - Withdrawal is reachable from `/wallet` with the same prominence as "Get coins".
  - No retention offers, guilt copy, or extra confirmation steps beyond §2.6.
  - Cancelling a pending request is always possible while it is pending.
- No purchase prompts in push notifications or SMS.
- Winnings and losses are shown with equal visual weight on the result screen, with + / − signs and words, not green/red alone.

### 9.3 18+ confirmation

- On `/signup`: unchecked checkbox "I am 18 or older" plus a terms/privacy checkbox (or combined, see the auth spec).
- Continue is disabled until both are checked.
- The confirmation time is stored server-side (`user.age_confirmed_at`).

---

## 10. Numbers, coins, money, dates, time

Use `packages/i18n` formatters only. Never format numbers or dates by hand.

| Item | fa | en |
| --- | --- | --- |
| Locale tag for `Intl` | `fa-IR` (digits ۰–۹) | `en` |
| Coin amount | «۱٬۲۵۰ سکه» + coin icon | "1,250 coins" + coin icon |
| Money | Toman only: «۱۵۰٬۰۰۰ تومان». Never rial in the UI (§11.3). | "150,000 toman" |
| Signed change | «+۱۸۰» / «−۱۰۰» plus a text label (won / paid) | "+180" / "−100" |
| Percent | `Intl.NumberFormat` percent style | same |
| Dates | Jalali (`fa-IR-u-ca-persian`), e.g. «۵ مهر ۱۴۰۵» | Gregorian |
| Relative time | «۲ ساعت دیگر» | "in 2 hours" |
| Timers | mm:ss in Persian digits, isolated with `<bdi dir="ltr">` so minute:second order stays correct | mm:ss |
| Phone input | Accept Persian and Latin digits; normalize to `09xxxxxxxxx` before sending | same |
| Amount input | Accept Persian and Latin digits; show grouping as the user types; store integers only | same |
| Sheba / IBAN | Always displayed LTR inside `<bdi dir="ltr">`, grouped in 4s: `IR12 3456 …`, Latin digits (it is a bank identifier) | same |

Mixed-direction strings (usernames in Latin inside fa text, numbers inside sentences, Sheba numbers) are wrapped in `<bdi>` to avoid bidi reordering.

---

## 11. Direction and mirroring (fa RTL, en LTR)

| Element | fa (RTL) behavior |
| --- | --- |
| Layout, text alignment, padding, list chevrons, back arrow, forward arrow, bottom-nav order, side rail edge, sheet close position, carousel direction, step indicators, general progress bars (loading, upload) | Mirror |
| 3D board, checkers, dice, board numbering, cube | **Never mirror** (§11.1) |
| Replay media controls (play, pause, step back, step forward, speed) and the replay timeline/scrubber | **Never mirror** (media convention). Step buttons carry text tooltips. |
| Undo icon | Mirror (it means "back one step" in the UI). Always paired with the visible label «برگشت حرکت» / "Undo". |
| "Send coins" arrow icon | Mirror (points from the user toward the recipient in reading direction) |
| Clocks, timer rings | Do not mirror (clockwise stays clockwise) |
| Icons containing Latin letters or numbers | Do not mirror; use a localized variant if one exists |
| Player bars in portrait | Opponent top, self bottom, regardless of direction. Within a bar: avatar on the start side. |
| Score "۳ – ۱" | Always "self – opponent" in reading order, isolated with `<bdi>` |

---

## 12. Forms

- Labels are always visible (no placeholder-only fields). Helper text sits under the field.
- **Phone:** `inputmode="numeric"`, `autocomplete="tel"`, country fixed to +98 (display hint `09xx xxx xxxx`).
- **SMS code** (signup, password reset, withdrawal):
  - 5 digits (§12.1): a single input with `autocomplete="one-time-code"` and `inputmode="numeric"`, visually split into 5 boxes.
  - Pasting works, including Persian digits.
  - Auto-submits on the 5th digit.
  - Shows a validity countdown (2 minutes) and a resend cooldown.
- **Password:** show/hide toggle with a label; requirements shown before typing, not only as errors.
- **Username (own):**
  - Live availability and profanity check (debounced).
  - Constraints in the helper text (3–20 characters).
  - Tells the user a later change costs coins (amount from `username.change_cost`).
- **Recipient username (transfer):**
  - Exact match lookup after typing stops. Shows a recipient card or "No player with this username".
  - No browsing or autocomplete list of other users, to avoid enumeration.
  - Own username → "You can't send coins to yourself".
- **Coin / toman amount:**
  - `inputmode="numeric"`.
  - Min, max, and remaining limit shown as helper text before typing.
  - Live conversion line (coins ↔ toman).
  - Errors for below minimum, above limit, and above balance/withdrawable.
- **Sheba (one per user, §7.12):**
  - Fixed `IR` prefix plus 24 digits, `inputmode="numeric"`, grouped display.
  - Paste is accepted with or without `IR`, with spaces, and with Persian digits.
  - **Validation** (client-side for instant feedback, then server-side), each failure with its own message:
    1. Length: exactly 24 digits after `IR`. «شماره شبا باید ۲۴ رقم بعد از IR داشته باشد.» / "A Sheba number has 24 digits after IR."
    2. Checksum (ISO 13616 mod-97). «این شماره شبا معتبر نیست. آن را دوباره از کارت یا اپ بانک خود کپی کنید.» / "This Sheba number isn't valid. Copy it again from your bank card or banking app."
    3. Known bank code. «بانک این شماره شبا شناخته نشد.» / "We don't recognize the bank for this Sheba number."
  - Once valid, the bank name is shown from the bank code, as confirmation the user can check at a glance.
  - Helper text: «شبای حساب بانکی خودتان را وارد کنید.» / "Enter the Sheba of your own bank account." The declared Sheba is accepted as the user's own; there is no ownership inquiry, no holder-name field, and no "verifying" state.
  - Changing it replaces the old account after a confirmation (§3). It is blocked while a withdrawal is pending.
- **Submit button:** in a sticky footer above the keyboard.
- **On error:** focus the first invalid field and announce the error.

---

## 13. Accessibility baseline (WCAG 2.2 AA)

- **Contrast:** text 4.5:1; large text and UI component boundaries 3:1. This includes text over the 3D board (player bars need solid backgrounds).
- **Targets:** at least 44 × 44 CSS px for all touch targets, including checkers at 360 px width (§11.1) and sheet handles.
- **Not color alone:**
  - Checker ownership: shape or rim marking plus player-bar mapping.
  - Legal destinations: highlight plus a marker shape.
  - Selected checker: lift plus outline.
  - Timer warning: icon plus text.
  - Win/loss: sign plus words.
  - Withdrawal status: icon plus text.
- **Labels:** every icon-only control has an i18n `aria-label`. Examples: roll, undo, confirm, double, reactions, menu, sound, back, close, copy, balance chip ("Balance: 1,250 coins, open wallet").
- **Focus order:** follows reading order in the current direction. Each screen spec lists it explicitly.
  - Opening a sheet moves focus to its title.
  - Closing it returns focus to the trigger.
  - Dialogs trap focus.
  - Task-flow steps move focus to the step heading.
- **Live regions (polite):** your turn, dice values («۶ و ۳»), opponent's move summary, timer thresholds, reconnect status, balance changes, recipient lookup result, conversion result.
- **Board alternative for screen-reader and keyboard users:** a keyboard move-entry mode (select the source point, then the destination, by point number). Legal moves are listed in an accessible list. Specified in `match.md`.
- **Motion:** honor `prefers-reduced-motion` and `animations.reduced` (§8).
- **Text size:** layouts must survive 200% text without clipping or horizontal scroll (§11.7). Player bars wrap to 2 lines. Cost-block rows stack label over value.
- **Language:** `<html lang dir>` set per locale; mixed-language fragments get their own `lang`.

---

## 14. First-time guidance

- Explain the app, not the game.
- At most one hint visible at a time. Hints are skippable, never block input, and never re-appear once dismissed (stored per account).
- **Planned hints:**
  - Signup bonus notice (§9.2)
  - First coin table: the fee and payout
  - First match: tap-tap or drag, confirm and undo
  - First visit to Live: predictions
  - First tournament detail: prizes and refunds
  - First replay: verify dice
  - First withdrawal: manual processing and SMS
- The game rules for variants are one tap away in `/help/variants`, never shown unasked.

---

## 15. Permissions and install prompts

- **Push permission:**
  - Ask only in context, after an explicit user action that benefits from it: registering for a tournament, or turning on "your turn" alerts in settings.
  - First show an in-app explanation sheet; call the browser prompt only if the user taps "Allow".
  - Never ask on first launch.
- **Install app (§11.5):**
  - First-visit banner, dismissible; re-shown after 7 days, at most 3 times.
  - Never shown during a match, matchmaking, payment, transfer, or withdrawal.
  - Android uses the captured prompt; iOS shows the Share → Add to Home Screen guide sheet.
  - Permanent item in Account.

---

## 16. Account status

Decided in CLAUDE.md §12.1. Screens are specified in auth.md (AU-13, AU-14).

- **Suspended users can sign in.**
  - **They can:** watch live matches; see their own match history, replays, and predictions; request withdrawals (and view the wallet); edit avatar, settings, and sessions; log out.
  - **They cannot:** join queues or tables, start matches (including bot matches), place predictions, enter tournaments, buy, or transfer. Username change and shop items are treated as blocked too (auth.md open question 13).
  - `/account/status` shows once per sign-in: the end date or "until further notice", the reason category if provided, the two lists, and support.
  - After that, a non-dismissible banner on every non-immersive screen.
  - **Blocked controls** stay visible, disabled, with `account.suspended.actionBlocked` and a "Details" link. They are never hidden, and never replaced with a shop prompt.
- **Banned users cannot sign in.** The login form shows the banned panel (no session, no `/account/status` route). Pending withdrawals are held for admin decision, and the panel says so.
- **In-flight matches at suspension time:** backend decision (open question 7).

---

## 17. i18n key conventions

- Format: `<feature>.<screen>.<element>[.<state>]`, e.g. `lobby.joinSheet.cta`, `match.reconnect.selfTitle`, `withdraw.review.youReceive`, `errors.wallet.insufficient`.
- Shared keys:

  | Namespace | Contents |
  | --- | --- |
  | `common.*` | cancel, back, retry, close, confirm, copy |
  | `coins.*` | cost, fee, balance, balanceAfter, shortfall, tomanEquivalent |
  | `money.*` | toman unit, rate line |
  | `nav.*` | navigation labels |
  | `net.*` | connectivity |
  | `support.*` | support contact, including the placeholder `support.contact.channel` |

- Plurals and numbers use ICU MessageFormat through next-intl. Never concatenate strings.
- Every key ships in fa and en in the same PR (§19). fa is written first.

---

## 18. Sensitive data display

| Data | Who sees it | How |
| --- | --- | --- |
| Phone number | Only the owner, in account settings and masked in OTP steps (`0912•••••34`) | Never to other users, not in transfers, receipts, profiles, or live views (§2 rule 11) |
| Sheba | Only the owner | Masked in lists and review (last 4 digits visible), with the bank name; full value only in the add/change form while typing |
| Transfer counterpart | Both parties | Username and avatar only |
| Bank reference of a paid withdrawal | Only the owner | Shown in withdrawal detail, copyable |

---

## Open questions

1. **Expected payout date and rolling-limit times from the API.** The payout promise is decided (within one business day, §7.12), but the client can't know Iranian holidays. Please return `expected_by` on each withdrawal request (and a preview value before submitting). For the rolling 24-hour limits, return `remaining` and `next_available_at` for transfers and withdrawals (e.g., in `GET wallet`).
2. **Withdrawable amount.** How is it computed when signup-bonus coins are mixed with won or bought coins (bonus spent first, or held last)? The UI will display a server-provided value; please make sure the API returns `withdrawable`.
3. **Transfer password failures.** Does a wrong transfer password count toward the login lock (5 failures → 15 min), or does it have its own limit?
5. **Custom purchase amounts.** §7.11 floors the coins, so a non-multiple amount would lose the user money. Recommended: the server rejects, or charges only whole-coin amounts. This is for the main agent.
6. **Toman equivalent on spends.** Should every spend confirmation show the toman equivalent under the coin cost? Recommended for transparency now that coins can be withdrawn. Please confirm.
7. **Suspension mid-activity.** Access rules are decided (§12.1). Still open: what happens to a match in progress and to predictions already placed when an account is suspended (play on, void, or forfeit)?
8. **Reduced motion and the dice.** Should reduced motion also replace the physics throw with the lite-mode fade? Recommended: yes.
9. **Local bot offline (§11.5).** This needs a client-side engine and bot, but the bot is a server-side Python service (§9). Is an offline local bot in scope for Phase 1? If not, `/offline` offers only "Try again".
10. **Push before forfeit.** Can the server send a push notification when a player disconnects mid-match ("Return within 90 s")? Without it, a player whose app was killed may forfeit without seeing the in-app warning.
11. **Legal copy for withdrawals.** Is any legal or compliance text required on the withdrawal and purchase screens (terms acceptance, tax, identity)? The UX leaves space for one line and a link.
