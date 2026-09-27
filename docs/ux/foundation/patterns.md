# Interaction patterns

Status: draft for approval (CLAUDE.md §17 step 0)

Every screen spec in `docs/ux/screens/` uses these patterns. A spec may deviate only by stating why. Section numbers here (patterns.md §N) are referenced from other UX docs.

---

## 1. Surfaces: when to use which

| Surface | Use for | Do not use for | Dismiss |
| --- | --- | --- | --- |
| **Full screen (route)** | Primary tasks and destinations: lobby lists, match, replay, detail pages, auth steps, payment status | Short choices or confirmations | Back |
| **Bottom sheet (modal)** | Setup and confirmation of an action started on the current screen: table setup, join/spend confirmation, bot setup, prediction, filters, match menu, reactions, resign, item actions | Content the user needs to navigate within (more than one level deep) | Drag down, scrim tap, back, close button. Coin-spend and resign sheets: scrim tap and drag do **not** dismiss while a request is in flight. |
| **Side panel** (`md`/`lg`) | The same component as a sheet when there is room: move history, reactions, spectators, prediction pool, list details | Blocking decisions | Persistent |
| **Dialog (centered)** | Blocking, time-critical decisions that must interrupt: opponent offers a double (take/drop), "match ended by forfeit", session expired | Anything long or scrollable | Explicit button only |
| **Banner (inline, top of content)** | Persistent status: offline, "return to match", announcements from admin, gateway unavailable | Errors about a specific field | Close button when non-critical; status banners disappear when the status clears |
| **Snackbar / toast** | Confirmation of a completed, non-critical action ("Theme equipped", "Coins added to your wallet") | Errors that need action; anything in a match except reactions | Auto 4 s (8 s if it has an action). Pauses on hover or focus. Never covers primary game controls. |
| **In-match overlay** | Opponent's reaction bubble, "your turn", disconnect countdown | Anything that needs a decision (use a dialog) | Auto; never blocks board input |

Sizing rules:
- **Sheets at `sm`:** open at the height of their content, up to 90 % of `dvh`. Anything taller scrolls inside the sheet. The primary action sits in a sticky footer in the thumb zone, respecting `env(safe-area-inset-bottom)`.
- **Sheets at `md`/`lg`:**
  - Setup and confirmation sheets become centered dialogs, max 480 px wide.
  - Panel-type sheets (move history, reactions, pool) become side panels.
  - Author these as container-query components (§11.7).
- **Stacking:** one modal layer at a time. A sheet can replace itself with the next step (setup → confirm). Never stack a sheet on a sheet.

---

## 2. Coin-spend confirmation (all spends)

Applies to:
- Table entry
- Bot entry (if `bot.entry_enabled`)
- Prediction stake
- Tournament registration
- Shop item
- Username change
- Coin package purchase (rial price instead of coin cost; see §2.3)

### 2.1 Anatomy (top to bottom, in the sheet)

1. **Title:** what is being bought or entered ("Enter 100-coin table").
2. **Summary of the thing:** variant, length, tier / item preview / tournament name and start time.
3. **Cost block.** Always three rows, never collapsed:

   | Row | fa | en |
   | --- | --- | --- |
   | Cost | هزینه | Cost |
   | Your balance | موجودی شما | Your balance |
   | Balance after | موجودی پس از پرداخت | Balance after |

4. **Feature-specific money facts:**
   - **Table:** Entry · Platform fee (10 %) of the pot · Winner receives. Example at the 100 tier: entry ۱۰۰, pot ۲۰۰, fee ۲۰, winner receives ۱۸۰. Values come from the server tier and the `table.rake_pct` setting, never from client math alone.
   - **Prediction:** one plain sentence on how the pool works, plus current totals on both sides (see §2.4).
   - **Tournament:** entry, prize split from the server config, and what happens if the tournament is cancelled or not filled (full refund).
   - **Username change:** cost and the next date a change is allowed (cooldown).
5. **Primary button** with the amount in the label: "Pay ۱۰۰ coins and search" / «پرداخت ۱۰۰ سکه و جستجو».
6. **Secondary button:** Cancel.
7. **"?" link** to the relevant `/help/[topic]`.

### 2.2 Rules

- Nothing is pre-selected: tier, stake amount, package, quantity, or checkbox. Stake input starts empty. Quick-pick chips are allowed; none is active by default.
- The primary button is disabled until every required choice is made. The disabled state has a visible text reason ("Choose a stake").
- The cost shown is the cost charged. If the server price or rules change between showing the sheet and confirming, the server returns an error and the sheet refreshes with a notice. It never charges a different amount silently.
- **In-flight state:**
  - The button shows a spinner.
  - The sheet cannot be dismissed.
  - Repeat taps are ignored.
  - The client sends an `Idempotency-Key` (§10.1).
  - If there is no response in 10 s, show "Still working…" with a "Check status" action that re-queries the resource. Never offer a blind retry that could spend twice.
- **Success:**
  - The sheet closes or advances.
  - The balance chip updates.
  - A snackbar confirms the amount spent.
  - Table entry has no snackbar; matchmaking itself is the feedback.
- **Insufficient balance:** see §9.1. Checked before the sheet opens and again on the server.

### 2.3 Coin package purchase (when a gateway exists)

The cost block becomes:
- Price (rial / toman, see open questions)
- Coins you receive
- Your balance now
- Balance after

The primary button says "Pay with bank card" and states that the user is leaving the app for the bank gateway.

### 2.4 Prediction explanation sentence

- **Key:** `predict.howItWorks`
- **fa:** «برندگان کل مبلغ را پس از کسر ۱۰٪ کارمزد، به نسبت مبلغ پیش‌بینی خود تقسیم می‌کنند؛ اگر کسی روی یک طرف پیش‌بینی نکند، همه مبلغ خود را پس می‌گیرند.»
- **en:** "Winners split the whole pool, minus a 10% fee, in proportion to their stakes. If nobody picks one side, everyone gets their stake back."

The percent is interpolated from `predict.rake_pct`; never hardcode it.

Always shown with:
- Totals for side A and side B
- Your stake (if any)
- "Estimated payout if <player> wins" for the entered stake, labeled `predict.estimate` ("estimate, changes as others predict")

---

## 3. Non-coin confirmations

Confirm only irreversible or costly actions. Do not confirm reversible ones.

| Action | Confirmation | Notes |
| --- | --- | --- |
| Resign game / resign match | Sheet with two clearly separated options. Each states what the opponent receives (points, and for a match: the whole match and the entry pot). Destructive styling plus a text label, not color alone. | Default focus on Cancel |
| Offer double | No confirmation, but the cube button requires a deliberate tap. A 3 s undo toast is **not** possible (server authoritative), so the button label is explicit: "Double to ۲". | |
| Take / drop a double | Blocking dialog with the cube value after taking and the points lost if dropping. Dialog timer = turn timer. | |
| Cancel matchmaking | No confirmation (nothing is charged before a match starts; §7.3) | |
| Leave tournament registration | Sheet with the refund amount | Only before start |
| Leave the match screen | Sheet: Stay / Leave screen / Resign (ia.md §3.4) | |
| Log out / log out other devices | Dialog | |
| Undo move, change setting, equip theme | None | Reversible |

---

## 4. Errors

### 4.1 Levels

| Level | Pattern | Example |
| --- | --- | --- |
| Field | Inline text under the field. The error icon plus text is never color-only. Focus moves to the first invalid field on submit. | Username taken, wrong code |
| Action | Inline message inside the sheet or above the button, with retry if safe | Join failed: tier closed |
| Screen | Full error state in the content area: illustration, one-line cause, primary "Try again", secondary "Back" | List failed to load |
| Global | Banner (offline, maintenance, announcement) | Server maintenance |

### 4.2 Rules

- Map every API `message_key` (§10.1) to a string in fa, ar, and en. Unknown codes fall back to `errors.generic` plus the error `code` in small text, for support.
- Say what happened and what to do next. Never blame the user. Never show stack traces, HTTP codes as the main text, or raw English in fa or ar.
- Rate limits (OTP, login lock) show the exact wait as a live countdown ("Try again in ۱۴:۵۲").
- Coin errors (`WALLET_INSUFFICIENT`, price changed, pool closed, tournament full) always leave the balance visible and unchanged in the UI until the server confirms.
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
| Reconnect (self) | Countdown to forfeit (§6.4) | "Retry now", leave (warns about forfeit) |
| Opponent disconnected | Opponent's grace countdown | Wait, reactions, resign |
| Tournament waiting for next round | Round status, which matches are still playing | Watch a running tournament match, leave screen |
| OTP resend cooldown | Countdown | "Change number" |

### 6.3 Offline (not in a match)

- Top banner: `net.offline` "You're offline. We'll reconnect automatically." Cached screens stay readable.
- Coin actions and matchmaking are disabled, with the reason in text.
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
| Coins received | None | None | Snackbar |

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

### 9.2 Always

- Show the cost before the user commits (§2). Nothing is pre-selected.
- No fake urgency, countdown sales, "limited offer" timers, or loss-chasing copy ("win it back", "get revenge", "don't stop now").
- Post-loss action labels are neutral: "Play again", "Back to lobby", "View replay".
- **Daily bonus:**
  - A plain card on `/play`: "Daily bonus: ۲۰ coins", with the amount from `bonus.daily_coins`.
  - No streak counter, no "you'll lose your streak", no escalating rewards unless the product owner defines them.
- No purchase prompts in push notifications.
- Winnings and losses are shown with equal visual weight on the result screen, with + / − signs and words, not green/red alone.

### 9.3 18+ confirmation

- On `/signup`: unchecked checkbox "I am 18 or older" plus a terms/privacy checkbox (or combined, see the auth spec).
- Continue is disabled until both are checked.
- The confirmation time is stored server-side (`user.age_confirmed_at`).

---

## 10. Numbers, coins, dates, time

Use `packages/i18n` formatters only. Never format numbers or dates by hand.

| Item | fa | ar | en |
| --- | --- | --- | --- |
| Locale tag for `Intl` | `fa-IR` (digits ۰–۹, `arabext`) | `ar-u-nu-arab` (digits ٠–٩; set the numbering system explicitly because some `ar` regions default to Latin digits) | `en` |
| Coin amount | «۱٬۲۵۰ سکه» + coin icon | «١٬٢٥٠ عملة» + coin icon | "1,250 coins" + coin icon |
| Signed change | «+۱۸۰» / «−۱۰۰» plus a text label (won / paid) | same pattern | "+180" / "−100" |
| Percent | `Intl.NumberFormat` percent style | same | same |
| Dates | Jalali (`fa-IR-u-ca-persian`), e.g. «۵ مهر ۱۴۰۵» | Gregorian | Gregorian |
| Relative time | «۲ ساعت دیگر» | Intl `RelativeTimeFormat` | "in 2 hours" |
| Timers | mm:ss in locale digits; in RTL keep the minute:second order visually correct by isolating with `<bdi dir="ltr">` | same | mm:ss |
| Phone input | Accept Persian, Arabic, and Latin digits; normalize to `09xxxxxxxxx` before sending | same | same |

Mixed-direction strings (usernames in Latin inside fa text, numbers inside sentences) are wrapped in `<bdi>` to avoid bidi reordering.

---

## 11. Direction and mirroring (fa and ar RTL, en LTR)

| Element | RTL behavior |
| --- | --- |
| Layout, text alignment, padding, list chevrons, back arrow, forward arrow, bottom-nav order, side rail edge, sheet close position, carousel direction, general progress bars (loading, upload) | Mirror |
| 3D board, checkers, dice, board numbering, cube | **Never mirror** (§11.1) |
| Replay media controls (play, pause, step back, step forward, speed) and the replay timeline/scrubber | **Never mirror** (media convention). Step buttons carry text tooltips. |
| Undo icon | Mirror (it means "back one step" in the UI). Always paired with the visible label «برگشت حرکت» / "Undo". |
| Clocks, timer rings | Do not mirror (clockwise stays clockwise) |
| Icons containing Latin letters or numbers | Do not mirror; use a localized variant if one exists |
| Player bars in portrait | Opponent top, self bottom, regardless of direction. Within a bar: avatar on the start side. |
| Score "۳ – ۱" | Always "self – opponent" in reading order, isolated with `<bdi>` |

---

## 12. Forms

- Labels are always visible (no placeholder-only fields). Helper text sits under the field.
- **Phone:** `inputmode="numeric"`, `autocomplete="tel"`, country fixed to +98 (display hint `09xx xxx xxxx`).
- **SMS code:**
  - 5 digits (§12.1): a single input with `autocomplete="one-time-code"` and `inputmode="numeric"`, visually split into 5 boxes.
  - Pasting works, including Persian digits.
  - Auto-submits on the 5th digit.
  - Shows a validity countdown (2 minutes) and a resend cooldown.
- **Password:** show/hide toggle with a label; requirements shown before typing, not only as errors.
- **Username:**
  - Live availability and profanity check (debounced).
  - Constraints in the helper text (3–20 characters).
  - Tells the user a later change costs coins (amount from `username.change_cost`).
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
- **Labels:** every icon-only control has an i18n `aria-label`. Examples: roll, undo, confirm, double, reactions, menu, sound, back, balance chip ("Balance: 1,250 coins, open wallet").
- **Focus order:** follows reading order in the current direction. Each screen spec lists it explicitly.
  - Opening a sheet moves focus to its title.
  - Closing it returns focus to the trigger.
  - Dialogs trap focus.
- **Live regions (polite):** your turn, dice values («۶ و ۳»), opponent's move summary, timer thresholds, reconnect status, balance changes.
- **Board alternative for screen-reader and keyboard users:** a keyboard move-entry mode (select the source point, then the destination, by point number). Legal moves are listed in an accessible list. Specified in `match.md`.
- **Motion:** honor `prefers-reduced-motion` and `animations.reduced` (§8).
- **Text size:** layouts must survive 200% text without clipping or horizontal scroll (§11.7). Player bars wrap to 2 lines.
- **Language:** `<html lang dir>` set per locale; mixed-language fragments get their own `lang`.

---

## 14. First-time guidance

- Explain the app, not the game.
- At most one hint visible at a time. Hints are skippable, never block input, and never re-appear once dismissed (stored per account).
- **Planned hints:**
  - First coin table: the fee and payout
  - First match: tap-tap or drag, confirm and undo
  - First visit to Live: predictions
  - First tournament detail: prizes and refunds
  - First replay: verify dice
- The game rules for variants are one tap away in `/help/variants`, never shown unasked.

---

## 15. Permissions and install prompts

- **Push permission:**
  - Ask only in context, after an explicit user action that benefits from it: registering for a tournament, or turning on "your turn" alerts in settings.
  - First show an in-app explanation sheet; call the browser prompt only if the user taps "Allow".
  - Never ask on first launch.
- **Install app (§11.5):**
  - First-visit banner, dismissible; re-shown after 7 days, at most 3 times.
  - Never shown during a match, matchmaking, or payment.
  - Android uses the captured prompt; iOS shows the Share → Add to Home Screen guide sheet.
  - Permanent item in Account.

---

## 16. Account status

`/account/status`:
- **Content:** a plain statement (suspended until <date> or banned), the reason category if the API provides one, the balance (read-only), and a support contact.
- **Suspended users:** may view `/wallet`, `/me/matches`, `/replay/[id]`, and `/help`, if the backend allows (see open questions).
- **In-flight matches at suspension time:** backend decision (see open questions).

---

## 17. i18n key conventions

- Format: `<feature>.<screen>.<element>[.<state>]`, e.g. `lobby.joinSheet.cta`, `match.reconnect.selfTitle`, `errors.wallet.insufficient`.
- Shared keys:

  | Namespace | Contents |
  | --- | --- |
  | `common.*` | cancel, back, retry, close, confirm |
  | `coins.*` | cost, balance, balanceAfter, shortfall |
  | `nav.*` | navigation labels |
  | `net.*` | connectivity |

- Plurals and numbers use ICU MessageFormat through next-intl. Never concatenate strings.
- Every key ships in fa, ar, and en in the same PR (§19). fa is written first. ar is not a machine copy of fa.

---

## Open questions

1. **Rial vs toman.** Show package prices in rial (the legal gateway amount) or toman (everyday usage), or both?
2. **Suspended accounts.** Which read-only areas can a suspended user access? What happens to a match in progress or open predictions at suspension time?
3. **Reduced motion and the dice.** Should reduced motion also replace the physics throw with the lite-mode fade? Recommended: yes.
4. **Local bot offline (§11.5).** This needs a client-side engine and bot, but the bot is a server-side Python service (§9). Is an offline local bot in scope for Phase 1? If not, `/offline` offers only "Try again".
5. **Push before forfeit.** Can the server send a push notification when a player disconnects mid-match ("Return within 90 s")? Without it, a player whose app was killed may forfeit without seeing the in-app warning.
