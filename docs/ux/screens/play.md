# Play: lobby, table setup, join confirmation, matchmaking, bot

Status: draft for UI build (CLAUDE.md §17 steps 7 and 8).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 2–4, 7, 10; §5.2; §7.3; §8; §9; §10.2 (Matches); §10.3 (`queue.join`, `queue.leave`, `queue.status`, `match.found`); §11.4 (WebGL2); §11.7; §12.1 (suspended); §14 (`table.*`, `game.allowed_lengths`, `matchmaking.*`, `bot.entry_enabled`); §21.2; ia.md §1–§4; patterns.md (P§) 1, 2, 3, 4, 5, 6, 9, 10, 11, 13, 14, 16, 17; journeys.md J1, J2; personas P1 Reza, P2 Maryam, P4 Ali.
Related specs: `match.md` (game screen, 3D loader MA-01, result sheet MA-13, unsupported MA-17), `live.md` (reuses `play.variant.*`, `play.length.*`, and the PL-05 sheet), `history-replay.md`, `onboarding.md` (signup-bonus notice AU-11 on this screen), `wallet.md` (WA-04 "Get coins" until step 9), `leaderboard.md` (rank card target).

This spec merges the planned `lobby.md` and `matchmaking.md`: the search overlay and "match found" are one continuous flow started from the lobby. Screen IDs follow screen-inventory.md §2.2 (PL-09 Leaderboard stays in `leaderboard.md`).

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET config` | `tiers` (entry values), `allowed_lengths`, `coin_price_toman` |
| `GET tiers` | `{results: Tier[], next: null}`. `Tier`: `id` (= the entry fee), `entry`, `variants` (all three), `lengths` (= `game.allowed_lengths`), `waiting` (players queued at this tier across all variants and lengths) |
| `GET wallet` | `balance` (available coins) for the cost block and the affordability check |
| `GET me` | `status` (`active`, `suspended`), `elo`, `level` (rank card) |
| `GET me/matches/active` | `{match_id: string \| null}`: the player's running match |
| WS `queue.join {tier_id, variant, length}` | Reply `queue.status {state: "waiting", tier_id, variant, length, reason: null}`. Errors as an `error` envelope (§3.9). Joining again first leaves any previous queue. |
| WS `queue.leave` | Reply `queue.status {state: "left", …}`; no reply if the player wasn't queued |
| WS `queue.status {state: "removed", reason: "balance"}` | Sent when a pair formed but this player could no longer pay the entry (or was suspended). The other player is put back in the queue silently. |
| WS `match.found` | `{match_id, you (0\|1), opponent: PlayerInfo, seed_commit, variant, length, entry}`. `PlayerInfo`: `username`, `avatar`, `elo`, `level`, `is_bot`, `bot_level`, themes, `connected` |
| `POST matches/bot {level, variant, length}` | `201 {match_id, seed_commit}`. No entry, never rated, no XP. |

Server rules the UI relies on (`backend/matchmaking/service.py`, `backend/game/views.py`, `backend/game/results.py`):

- **When the entry is taken:** the balance is checked at `queue.join`, but coins move to escrow only when a pair forms (match creation, just before `match.found`). Cancelling a search never costs anything.
- **Refund:** a match that ends before its first roll (a player never joins) is aborted: entries refunded in full, unrated (`match.ended` with `winner: null`, `settlement: {refund}`).
- **Payout:** `pot = entry × 2`, `rake = floor(pot × table.rake_pct / 100)`, `payout = pot − rake`, with `rake_pct` snapshotted per match. The rake percent is **not exposed** to the client yet (§10 Q1).
- **Pairing:** by ELO window (`matchmaking.elo_window`, widening by `widen_step` every `widen_seconds`); linked accounts are never paired. None of these values reach the client, so the UI describes widening in words only.
- **Socket loss drops the queue:** when the socket closes, the server removes the player from the queue without a message. The api-client does not re-send `queue.join` after reconnecting (§10 Q3).
- **One match at a time:** `queue.join` and `POST matches/bot` return `MATCH_IN_PROGRESS {match_id}` while the player has an active match.
- **Suspended (§12.1):** `queue.join` and `POST matches/bot` return `ACCOUNT_SUSPENDED`. A match already running continues.
- **Bots (§2 rule 10, §9):** only through `POST matches/bot`; never in coin tables or tournaments; `bot.entry_enabled` is not implemented in this endpoint (§10 Q6).

---

## 1. Goal and user story

- As a returning regular (P1 Reza), I want to start a coin table in two or three taps from a cold app open, knowing the entry, the fee, and what the winner gets before I pay.
- As a new player (P4 Ali), I want to play a free, clearly labeled bot game without risking coins, and see which tables I can afford.
- As any player, I want to see that the search is working, how long I've waited, and cancel at any time without losing coins.
- As a player with a running match, I want to get back to it from anywhere.

Success means:
- No entry is taken without the entry, the fee, the winner's payout, the balance, and the balance after on screen, and nothing pre-selected.
- A search always shows progress and a Cancel in the thumb zone.
- Bots are always labeled and never cost coins.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Bottom nav "Play" (side rail at `md`/`lg`); app open when signed in (ia.md §4) | PL-01 `/play` |
| "Play again" on the match result sheet (match.md MA-13) | PL-03 with the same tier, variant, and length |
| "Search again" after an aborted match (MA-13) | PL-03 with the same settings |
| Empty state "Play a match" on `/live`; "Play vs bot" on empty `/me/matches` | PL-01; PL-04 |
| Lower tier or bot offered in PL-05 | PL-02 with that tier / PL-04 |
| Redirect from `app.` with path and query | PL-01 |

| Exit | Destination |
| --- | --- |
| `match.found` | `/match/[id]` (match.md MA-01 loader, then MA-02) |
| Bot match created | `/match/[id]` |
| Resume banner (PL-08) or `MATCH_IN_PROGRESS` "Return to match" | `/match/[id]` |
| Rank card | `/leaderboard` |
| "Get coins" in PL-05 | WA-04 sheet (step 3) → `/shop/coins` from step 9 |
| "?" links | `/help/fees`, `/help/variants`, `/help/fair-dice` |

---

## 3. Flow

### 3.1 Lobby load (PL-01)

1. On open, in parallel: `GET tiers`, `GET me/matches/active`, `GET me` (cached), `GET wallet` (the balance chip; cached for 30 s).
2. **WebGL2 check** (synchronous, no download). If it fails, every "Play" and "Play vs bot" button is disabled with `play.unsupported.reason` and a "Details" link that opens the match.md MA-17 content. Nothing is charged or queued on a device that can't show the board.
3. `active.match_id` not null → show PL-08 resume banner; all play buttons are disabled with `play.inMatch.reason` ("Finish your current match first").
4. Account `suspended` → play buttons disabled with `account.suspended.actionBlocked` + "Details" (P§16). Tier cards still render (read-only).
5. Refresh `GET tiers` every 30 s while visible, for the `waiting` counts only; nothing reorders.

### 3.2 Choosing a table (PL-01 → PL-02 → PL-03)

1. The user taps a tier card (or its "Play" button). PL-02 opens with that tier chosen, because the user just chose it.
2. PL-02 shows three groups. Tier is set; **variant and length are not selected** (P§2.2):
   - Table: chips of every tier; the tapped one is checked. Unaffordable tiers stay selectable and show "Needs {entry}" (icon + text); choosing one leads to PL-05 at Continue, not before.
   - Variant: radio cards for `standard_cube`, `standard_nocube`, `traditional`, each with a one-line description and a "?" to `/help/variants`.
   - Length: chips from `tier.lengths` ("First to 1", "First to 3", …).
3. "Continue" is disabled with a visible reason until variant and length are chosen (`play.setup.reason.variant`, `play.setup.reason.length`).
4. Continue:
   - `balance < entry` → PL-05 (§3.7).
   - Otherwise PL-03 replaces the sheet (P§1 stacking).
5. **"Play again" card** (PL-01): after a successful `queue.join`, the client stores the last tier, variant, and length on the device. The card shows them in words ("100-coin table · Standard with cube · First to 3"). Tapping it opens PL-03 directly. This is not a pre-selection: the user picks a fully described option, and PL-03 still shows every cost row.

### 3.3 Join confirmation (PL-03)

Anatomy per P§2.1:

| Row | Value |
| --- | --- |
| Title | "Enter {entry}-coin table" |
| Summary | Variant name, "First to {n}", "Rated match" (icon + text) |
| Entry | {entry} coins, with the toman equivalent line (P§2.1) |
| Platform fee | "{pct}% of the pot of {pot}": {rake} coins (server values, §10 Q1) |
| Winner receives | {payout} coins |
| Your balance | balance |
| Balance after | balance − entry, labeled "when the match starts" |
| Timing note | "Your entry is taken when an opponent is found. If the match is cancelled before the first roll, you get it back in full. Cancelling the search costs nothing." |
| Primary | "Pay {entry} coins and search" |
| Secondary | Cancel |
| Help | "?" → `/help/fees` |

1. Primary → send `queue.join {tier_id, variant, length}`. The button shows a spinner; the sheet can't be dismissed; repeat taps are ignored.
2. `queue.status {state: waiting}` → the sheet closes and PL-06 opens.
3. No reply within 10 s → inline "Still working…" with "Try again". Re-sending `queue.join` is safe: the server leaves the old queue first, and nothing is charged before pairing.
4. Errors → §3.9.

### 3.4 Searching (PL-06)

1. Full-screen overlay above PL-01 (nav hidden). Content, top to bottom:
   - Title "Finding an opponent"
   - Elapsed time mm:ss (client clock from the `waiting` reply; `<bdi dir="ltr">`)
   - An indeterminate progress indicator (static bar with a moving segment; under reduced motion a static bar plus the elapsed time only)
   - Table summary: "{entry}-coin table · {variant} · First to {n}", "Winner receives {payout}"
   - "Looking for a player near your rating. The range widens the longer you wait." (static text; no server values needed)
   - "{n} players searching at this table" from `Tier.waiting`, refreshed every 15 s; hidden when the value is unavailable (§10 Q8)
   - "Cancel search" (primary position, bottom 40%, full width)
2. **Cancel** (button, back gesture, Esc): send `queue.leave`, close the overlay at once, return to PL-01. No confirmation (P§3). A snackbar is not needed; the lobby is the feedback.
3. **Long wait:** after 2 minutes, a neutral line appears under the summary: "Few players are searching at this table right now." with two text actions: "Change table" (sends `queue.leave`, opens PL-02) and "Play vs bot" (sends `queue.leave`, opens PL-04). The search continues if the user does nothing. No urgency styling.
4. **Socket lost** (api-client status `reconnecting`, or `navigator.onLine` false): the server has already dropped the queue.
   - The overlay switches to "Connection lost. You're not in the queue while offline." with the elapsed timer paused and "Cancel search" still available.
   - On reconnect (`open`): the client re-sends the same `queue.join` automatically, then shows "Searching again" for 3 s; the elapsed timer restarts from 0 (the server wait restarts too). If the re-join fails, show the §3.9 error.
5. **App backgrounded:** nothing special while the socket stays open. If the OS closes it, step 4 applies on return.
6. **Removed** (`queue.status {state: removed, reason: balance}`): close the overlay and open PL-05 in its "removed" variant: "You left the queue because your balance is now below the entry. Nothing was charged." Unknown `reason` → `play.queue.removed.generic`.
7. **`queue.status {state: left}`** that the user didn't request (another tab or device cancelled) → close the overlay with the snackbar "Search cancelled on another device."

### 3.5 Match found (PL-07)

1. On `match.found` (any time the overlay is open): haptic and sound if enabled (P§8). The overlay content is replaced by:
   - "Opponent found"
   - Opponent card: avatar, username (LTR-isolated), level, ELO
   - "Entry paid: {entry} coins" and the balance chip updates (re-read `GET wallet`)
   - Fair-dice line: "The dice for this match are fixed in advance and can be checked after the match." with "?" → `/help/fair-dice`
2. Navigate to `/match/[id]` after 1.5 s, or at once when the user taps "Go to match". The match.md loader (MA-01) keeps the opponent card in its header, so the transition is continuous. Under reduced motion there is no animated transition.
3. **Found after Cancel** (race: `match.found` arrives after `queue.leave` was sent): open PL-07 in its "race" variant instead of discarding the event:
   - "An opponent was found just before you cancelled. Your entry of {entry} coins has been taken for this match."
   - Primary "Go to match".
   - Secondary "Cancel this match": opens `/match/[id]` with the match.md MA-19 "cancel match" sheet already open (entry refunded in full if the match is cancelled before the first roll; match.md §3.12).
   - Never silently drop a found match: the coins are already in escrow.
4. `match.found` received by another open tab or device of the same account (no overlay open there): show PL-08 (resume banner) instead of navigating.

### 3.6 Play vs bot (PL-04)

1. "Play vs bot" on PL-01 opens PL-04. The sheet title and every bot row carry the "Bot" label (icon + text, §2 rule 10).
2. Groups, **none selected**:
   - Level: radio cards "Easy", "Medium", "Hard", each with one plain line (e.g., "Makes more mistakes", "Plays solid moves", "Strongest bot").
   - Variant: same cards as PL-02.
   - Length: chips from `config.allowed_lengths`.
3. Info line: "Practice match: free, no rating change, no XP."
4. "Start practice match" is disabled with a visible reason until level, variant, and length are chosen.
5. Primary → `POST matches/bot`. In-flight: spinner, sheet not dismissible. Creating a bot match costs nothing, so a network timeout offers plain "Try again" (a second call returns `MATCH_IN_PROGRESS {match_id}` if the first one succeeded; the client then opens that match).
6. `201` → `/match/[id]`.
7. **Bot entry enabled** (`bot.entry_enabled`): not supported by the API yet (§10 Q6). When it is, PL-04 gains the P§2 cost block and the primary becomes "Pay {entry} coins and start".

### 3.7 Insufficient coins (PL-05, shared component)

Trigger: `balance < entry` at PL-02 Continue or PL-03 primary; `WALLET_INSUFFICIENT {balance, needed}` from `queue.join`; `queue.status removed/balance`.

1. Content (P§9.1): title "Not enough coins"; rows Entry, Your balance, Shortfall (server `balance` when the error provides it).
2. Options, in this order:
   1. Affordable lower tiers, each as a row "{entry}-coin table · winner receives {payout}" → PL-02 with that tier chosen and the variant and length kept.
   2. "Practice vs bot (free)" → PL-04 with variant and length kept (level still unselected).
   3. "Get coins" (text-style) → WA-04 / `/shop/coins`.
   4. "Close".
3. **Variant `afterLoss`** (opened from "Play again" on a lost match's result sheet, match.md MA-13): option 3 is not rendered. Copy is the same neutral text.
4. Variant `removed` (§3.4 step 6): the first line explains the removal; the options are the same.
5. Used by `live.md` (stake) and later by tournaments and shop with their own first option.

### 3.8 Resume banner (PL-08)

1. Shown on every non-immersive screen while `GET me/matches/active` returns a match id (checked on app open, on focus, and after `match.found`).
2. Content: "Match in progress" + "Return" button; with §10 Q7 data: opponent, score, and "Your turn" / "@{opponent}'s turn" (icon + text).
3. Not dismissible; it disappears when the match ends.
4. Tapping it opens `/match/[id]`.

### 3.9 Error map

The catalog key is the backend `message_key`; the screen uses the contextual key.

| Code / event | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `WALLET_INSUFFICIENT {balance, needed}` | `queue.join` | Close PL-03, open PL-05 with the server balance | `errors.wallet.insufficient` | `coins.insufficient.title` |
| `ACCOUNT_SUSPENDED` (403) | `queue.join` | PL-03 action error; re-fetch `GET me`; lobby switches to the suspended state | `errors.wallet.accountSuspended` | `account.suspended.actionBlocked` |
| `ACCOUNT_SUSPENDED` (403) | `POST matches/bot` | Same, in PL-04 | `errors.match.accountSuspended` | `account.suspended.actionBlocked` |
| `MATCH_IN_PROGRESS {match_id}` | both | Action error "You already have a match in progress." + "Return to match" → `/match/{match_id}`; PL-08 appears | `errors.match.inProgress` | `play.error.inProgress` |
| `QUEUE_INVALID {reason: tier}` | `queue.join` | Action error; reload `GET tiers`; PL-02 re-opens with the tier cleared | `errors.queue.invalid` | `play.error.tierGone` |
| `QUEUE_INVALID {reason: length \| variant}` | `queue.join` | Same, with that choice cleared | `errors.queue.invalid` | `play.error.optionGone` |
| `MATCH_LENGTH_NOT_ALLOWED {allowed}` | `POST matches/bot` | Length chips re-render from `allowed`; choice cleared; field error | `errors.match.lengthNotAllowed` | `play.error.optionGone` |
| `VALIDATION` (400) | `POST matches/bot` | Action error | `errors.validation` | — |
| `BAD_MESSAGE` (WS) | `queue.*` | Client bug: `errors.generic` + code | `errors.ws.badMessage` | — |
| `queue.status removed {reason: balance}` | overlay | PL-05 `removed` | — | `play.queue.removed.balance` |
| `queue.status removed {reason: other}` | overlay | Close overlay; snackbar | — | `play.queue.removed.generic` |
| `NETWORK` / socket not open | `queue.join` | PL-03 action error `net.offlineAction`; entries kept | `errors.network` | `net.offlineAction` |
| `NETWORK` | `POST matches/bot` | "Try again" (safe, §3.6 step 5) | `errors.network` | — |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` | all | api-client refreshes once; else SY-08 | `errors.unauthenticated` | — |
| `AUTH_BANNED` | all | `/login` with AU-14 | `errors.auth.banned` | — |
| Any other | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

---

## 4. Screen list

### PL-01 Play lobby `/play` (Tab 1 root)

- **Purpose:** start a coin match or a practice match.
- **App bar:** logo, title "Play", balance chip.
- **Content priority:**
  1. PL-08 resume banner (when a match is running).
  2. Signup-bonus notice (onboarding.md AU-11, one time).
  3. First-time hint (P§14, once): "Coin tables: both players pay the entry; the winner gets the pot minus a platform fee." with "?" → `/help/fees`.
  4. "Play again" card (when last settings exist): summary in words, entry, "Play again".
  5. Section "Play online · Rated": tier cards in server order. Card: entry with coin icon ("100-coin table"), "Winner receives {payout}", "{n} searching" (when > 0), "Play" button. Unaffordable cards show "Needs {entry} coins" (icon + text) but stay tappable (PL-05 explains).
  6. Section "Practice": bot card with the Bot label, "Free · unrated · no XP", "Play vs bot".
  7. Rank card: ELO, level, "Leaderboard" link.
- **Primary action:** a tier card's "Play". Coin tables and practice have equal visual weight (J1 step 6).

### PL-02 Table setup (sheet; centered dialog at `md`/`lg`)

- Title "Choose your game"; groups Table, Variant, Length (§3.2); footer "Continue" (sticky, thumb zone) with its disabled reason; "?" to `/help/variants`.

### PL-03 Join confirmation (sheet step; centered dialog at `md`/`lg`)

- As §3.3.

### PL-04 Bot setup (sheet; centered dialog at `md`/`lg`)

- As §3.6. Bot icon + "Bot" in the title: "Practice vs bot".

### PL-05 Insufficient coins (sheet; centered dialog at `md`/`lg`)

- As §3.7.

### PL-06 Matchmaking (full overlay; centered card over a dimmed lobby at `md`/`lg`)

- As §3.4. Only one action on screen besides the long-wait text actions: "Cancel search".

### PL-07 Match found (content of the same overlay)

- As §3.5. Variants: normal, race.

### PL-08 Resume banner (global, above the bottom nav / at the top of the content at `md`/`lg`)

- As §3.8.

---

## 5. States

| State | PL-01 | PL-02 / PL-04 | PL-03 | PL-06 / PL-07 |
| --- | --- | --- | --- | --- |
| **Loading** | Skeleton tier cards (4) and bot card; the balance chip keeps its cached value | Tier chips from `config.tiers` render at once | — | Spinner-free: elapsed timer starts at the `waiting` reply; before it, PL-03 shows the in-button spinner |
| **Empty** | `GET tiers` returns no tiers → "No coin tables are open right now." Practice card stays. | — | — | — |
| **Error** | `GET tiers` fails → screen error in the "Play online" section only, with Retry; practice card still works | `POST matches/bot` errors per §3.9 | Action errors per §3.9 | §3.9 |
| **Offline** | Banner `net.offline`; play buttons disabled with `net.offlineAction`; cached tiers shown with `common.lastUpdated` | Primary disabled with `net.offlineAction`; choices kept | Primary disabled; choices kept | §3.4 step 4 |
| **Reconnecting** | n/a (REST); socket status only matters once searching | — | Primary disabled until the socket is open ("Connecting…") | §3.4 step 4 |
| **Insufficient coins** | Unaffordable tier cards labeled "Needs {entry} coins" | Continue → PL-05 | PL-05 | Removed → PL-05 `removed` |
| **Suspended** | Suspension banner (AU-13); tier and bot buttons disabled with `account.suspended.actionBlocked` + "Details"; PL-08 still works | Not reachable | `ACCOUNT_SUSPENDED` → action error | Not reachable |
| **Banned** | No session (AU-14) | ← | ← | ← |
| **Match in progress** | PL-08; play buttons disabled with `play.inMatch.reason` | Not reachable | `MATCH_IN_PROGRESS` → "Return to match" | — |
| **WebGL2 missing** | Play buttons disabled with `play.unsupported.reason` + "Details" | Not reachable | — | — |
| **First-time user** | Bonus notice + fee hint (one at a time, P§14); no "Play again" card | Nothing pre-selected; "?" links | Full cost block; hint text about when the entry is taken | Same as others |

---

## 6. Responsive notes (§11.7)

| Breakpoint | PL-01 | Sheets (PL-02 to PL-05) | PL-06 / PL-07 |
| --- | --- | --- | --- |
| `xs` 320–359 | Single column; tier cards full width with entry and payout on 2 lines; nav icon-only | Bottom sheet up to 90% `dvh`; variant cards stack; length chips wrap; sticky footer | Full screen; summary wraps; Cancel full width at the bottom |
| `sm` 360–599 (390 × 844) | Single column; "Play" buttons at the card's end edge | Bottom sheet; primary in the thumb zone | Full screen; Cancel within the bottom 40% |
| `md` 600–1023 | Side rail. Two columns: tier cards (2-up grid) in the main column; Practice and Rank cards in the side column | Centered dialogs, max 480 px | Centered card (max 480 px) over the dimmed lobby; Cancel inside the card |
| `lg` ≥ 1024 | Shell max 1280: side rail, tier grid (up to 4-up), context panel on the end side with the rank card and a leaderboard snippet (top 5) | As `md`; hover states; Enter activates the primary | As `md` |

- **Landscape phones** (height < 500 px): side rail; tier cards in a 2-up grid; sheets open as end-edge side sheets (max 60% width) so the lobby stays visible; PL-06 is a two-column overlay (summary start, Cancel end).
- Orientation or width changes keep the open sheet and all choices.
- `dvh`/`svh` only; sticky footers respect `env(safe-area-inset-bottom)`.
- Keyboard on `m.`: Tab through cards; Enter opens; Esc closes sheets and cancels the search (same as Cancel).

---

## 7. RTL/LTR notes and i18n keys

- fa first. Layout, chips, the back arrow, and list chevrons mirror. The coin icon and the progress bar direction mirror; the elapsed timer is `<bdi dir="ltr">` mm:ss in locale digits.
- Usernames are LTR-isolated with `@` in running text.
- Numbers use locale digits and grouping; percentages use `Intl.NumberFormat` percent style.
- Bot level names and variant names are keys; never show `bot_easy` raw usernames. The bot's display name is `play.bot.name` with the level.
- Variant and length keys below are shared with `live.md` and `match.md`.

| Key | fa | en |
| --- | --- | --- |
| `play.title` | بازی | Play |
| `play.hint.fees` | میزهای سکه‌ای: هر دو بازیکن ورودی می‌پردازند و برنده کل مبلغ را پس از کسر کارمزد سکو می‌گیرد. | Coin tables: both players pay the entry; the winner gets the pot minus a platform fee. |
| `play.online.title` | بازی آنلاین · رتبه‌ای | Play online · Rated |
| `play.tier.name` | میز {entry} سکه‌ای | {entry}-coin table |
| `play.tier.payout` | برنده {payout} سکه می‌گیرد | Winner receives {payout} |
| `play.tier.waiting` | {count, plural, one {# نفر در جستجو} other {# نفر در جستجو}} | {count, plural, one {# searching} other {# searching}} |
| `play.tier.needs` | نیاز به {entry} سکه | Needs {entry} coins |
| `play.tier.play` | بازی | Play |
| `play.tier.label` | میز {entry} سکه‌ای، برنده {payout} سکه می‌گیرد، {waiting} | {entry}-coin table, winner receives {payout}, {waiting} |
| `play.tiers.empty` | فعلاً میز سکه‌ای بازی نیست. | No coin tables are open right now. |
| `play.tiers.loadError` | میزها بارگذاری نشد. | Couldn't load the tables. |
| `play.again.title` | بازی دوباره | Play again |
| `play.again.summary` | میز {entry} سکه‌ای · {variant} · تا {n} امتیاز | {entry}-coin table · {variant} · First to {n} |
| `play.practice.title` | تمرین | Practice |
| `play.practice.desc` | رایگان · بدون تغییر امتیاز رتبه · بدون تجربه | Free · unrated · no XP |
| `play.practice.button` | بازی با ربات | Play vs bot |
| `play.rank.title` | رتبه‌ی شما | Your rank |
| `play.rank.elo` | امتیاز رتبه: {elo} | Rating: {elo} |
| `play.rank.level` | سطح {level} | Level {level} |
| `play.rank.leaderboard` | جدول رده‌بندی | Leaderboard |
| `play.inMatch.reason` | اول مسابقه‌ی فعلی خود را تمام کنید. | Finish your current match first. |
| `play.unsupported.reason` | این دستگاه نمی‌تواند صفحه‌ی سه‌بعدی بازی را نمایش دهد. | This device can't show the 3D board. |
| `play.unsupported.details` | جزئیات | Details |
| `play.variant.standard_cube` | استاندارد با مکعب دوبل | Standard with doubling cube |
| `play.variant.standard_cube.desc` | قوانین استاندارد؛ می‌توانید امتیاز دست را دوبل کنید. | Standard rules; you can double the stakes of a game. |
| `play.variant.standard_nocube` | استاندارد بدون مکعب | Standard, no cube |
| `play.variant.standard_nocube.desc` | قوانین استاندارد، بدون دوبل. | Standard rules, no doubling. |
| `play.variant.traditional` | سنتی | Traditional |
| `play.variant.traditional.desc` | قوانین رایج محلی، بدون دوبل؛ امتیاز برد، مارس و مارس کامل: {single}، {gammon}، {backgammon}. | Local traditional scoring, no doubling; single, gammon, backgammon: {single}, {gammon}, {backgammon} points. |
| `play.length.firstTo` | تا {n} امتیاز | First to {n} |
| `play.length.label` | طول مسابقه | Match length |
| `play.setup.title` | بازی خود را انتخاب کنید | Choose your game |
| `play.setup.table` | میز | Table |
| `play.setup.variant` | نوع بازی | Variant |
| `play.setup.continue` | ادامه | Continue |
| `play.setup.reason.variant` | نوع بازی را انتخاب کنید | Choose a variant |
| `play.setup.reason.length` | طول مسابقه را انتخاب کنید | Choose a match length |
| `play.setup.reason.level` | سطح ربات را انتخاب کنید | Choose a bot level |
| `play.join.title` | ورود به میز {entry} سکه‌ای | Enter {entry}-coin table |
| `play.join.rated` | مسابقه‌ی رتبه‌ای | Rated match |
| `play.join.entry` | ورودی | Entry |
| `play.join.fee` | کارمزد سکو ({pct} از مجموع {pot}) | Platform fee ({pct} of the pot of {pot}) |
| `play.join.payout` | برنده دریافت می‌کند | Winner receives |
| `play.join.balanceAfterWhen` | موجودی پس از شروع مسابقه | Balance after the match starts |
| `play.join.timing` | ورودی زمانی کسر می‌شود که حریف پیدا شود. اگر مسابقه پیش از اولین پرتاب تاس لغو شود، کامل برگردانده می‌شود. لغو جستجو هزینه‌ای ندارد. | Your entry is taken when an opponent is found. If the match is cancelled before the first roll, you get it back in full. Cancelling the search costs nothing. |
| `play.join.cta` | پرداخت {entry} سکه و جستجو | Pay {entry} coins and search |
| `play.join.connecting` | در حال اتصال… | Connecting… |
| `play.queue.title` | در جستجوی حریف | Finding an opponent |
| `play.queue.elapsed` | زمان انتظار: {time} | Waiting: {time} |
| `play.queue.summary` | میز {entry} سکه‌ای · {variant} · تا {n} امتیاز | {entry}-coin table · {variant} · First to {n} |
| `play.queue.widening` | دنبال بازیکنی با امتیاز نزدیک به شما هستیم. هر چه بیشتر صبر کنید، محدوده بازتر می‌شود. | Looking for a player near your rating. The range widens the longer you wait. |
| `play.queue.waiting` | {count, plural, one {# نفر در این میز در جستجوست} other {# نفر در این میز در جستجو هستند}} | {count, plural, one {# player searching at this table} other {# players searching at this table}} |
| `play.queue.cancel` | لغو جستجو | Cancel search |
| `play.queue.longWait` | فعلاً بازیکنان کمی در این میز دنبال حریف هستند. | Few players are searching at this table right now. |
| `play.queue.changeTable` | تغییر میز | Change table |
| `play.queue.offline` | اتصال قطع شد. تا وقتی آفلاین هستید، در صف نیستید. | Connection lost. You're not in the queue while offline. |
| `play.queue.searchingAgain` | دوباره در جستجو | Searching again |
| `play.queue.cancelledElsewhere` | جستجو در دستگاه دیگری لغو شد. | Search cancelled on another device. |
| `play.queue.removed.balance` | چون موجودی شما از ورودی کمتر شد، از صف خارج شدید. هیچ سکه‌ای کسر نشد. | You left the queue because your balance is now below the entry. Nothing was charged. |
| `play.queue.removed.generic` | از صف خارج شدید. هیچ سکه‌ای کسر نشد. | You were removed from the queue. Nothing was charged. |
| `play.found.title` | حریف پیدا شد | Opponent found |
| `play.found.entryPaid` | ورودی پرداخت‌شده: {entry} سکه | Entry paid: {entry} coins |
| `play.found.fairDice` | تاس‌های این مسابقه از قبل تعیین شده‌اند و پس از مسابقه قابل بررسی هستند. | The dice for this match are fixed in advance and can be checked after the match. |
| `play.found.go` | رفتن به مسابقه | Go to match |
| `play.found.race` | درست پیش از لغو شما، حریف پیدا شد. ورودی {entry} سکه‌ای شما برای این مسابقه کسر شده است. | An opponent was found just before you cancelled. Your entry of {entry} coins has been taken for this match. |
| `play.found.cancelMatch` | لغو این مسابقه | Cancel this match |
| `play.found.opponentLabel` | حریف: {username}، سطح {level}، امتیاز رتبه {elo} | Opponent: @{username}, level {level}, rating {elo} |
| `play.bot.title` | تمرین با ربات | Practice vs bot |
| `play.bot.label` | ربات | Bot |
| `play.bot.name` | ربات {level} | Bot ({level}) |
| `play.bot.level` | سطح ربات | Bot level |
| `play.bot.level.easy` | آسان | Easy |
| `play.bot.level.easy.desc` | اشتباه بیشتری می‌کند | Makes more mistakes |
| `play.bot.level.medium` | متوسط | Medium |
| `play.bot.level.medium.desc` | حرکت‌های معقول بازی می‌کند | Plays solid moves |
| `play.bot.level.hard` | سخت | Hard |
| `play.bot.level.hard.desc` | قوی‌ترین ربات | Strongest bot |
| `play.bot.info` | مسابقه‌ی تمرینی: رایگان، بدون تغییر امتیاز رتبه و بدون تجربه. | Practice match: free, no rating change, no XP. |
| `play.bot.cta` | شروع مسابقه‌ی تمرینی | Start practice match |
| `play.insufficient.lowerTier` | میز {entry} سکه‌ای · برنده {payout} سکه می‌گیرد | {entry}-coin table · winner receives {payout} |
| `play.insufficient.bot` | تمرین با ربات (رایگان) | Practice vs bot (free) |
| `play.error.inProgress` | شما یک مسابقه‌ی در جریان دارید. | You already have a match in progress. |
| `play.error.returnToMatch` | بازگشت به مسابقه | Return to match |
| `play.error.tierGone` | این میز دیگر در دسترس نیست. میز دیگری انتخاب کنید. | This table is no longer available. Choose another one. |
| `play.error.optionGone` | این گزینه دیگر در دسترس نیست. گزینه‌ی دیگری انتخاب کنید. | This option is no longer available. Choose another one. |
| `play.resume.title` | مسابقه در جریان است | Match in progress |
| `play.resume.detail` | {username} · {score} · {turn} | @{username} · {score} · {turn} |
| `play.resume.yourTurn` | نوبت شما | Your turn |
| `play.resume.theirTurn` | نوبت {username} | @{username}'s turn |
| `play.resume.return` | بازگشت | Return |

Shared keys used: `common.cancel`, `common.close`, `common.retry`, `common.stillWorking`, `common.help`, `common.errorCode`, `common.lastUpdated`, `coins.cost`, `coins.tomanEquivalent`, `coins.balance`, `coins.balanceAfter`, `coins.shortfall`, `coins.insufficient.title`, `coins.getCoins`, `net.offline`, `net.offlineAction`, `account.suspended.actionBlocked`, `account.suspended.details`, `errors.wallet.insufficient`, `errors.wallet.accountSuspended`, `errors.match.*`, `errors.queue.invalid`, `errors.ws.badMessage`, `errors.validation`, `errors.network`, `errors.generic`, `nav.play`.

`play.placeholder` (current catalog) is removed when PL-01 ships.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| PL-01 | Suspension banner → PL-08 banner → app bar (title, balance chip) → notice/hint (dismiss) → "Play again" → tier cards in order (each card one stop; its "Play" button is the card's action) → Practice card button → Rank card link → nav |
| PL-02 | Title (focused on open) → Table chips (radio group, arrow keys) → Variant (radio group) → "?" → Length (radio group) → Continue (with its reason as `aria-describedby`). Close returns focus to the tapped card. |
| PL-03 | Title → summary → cost block (read as a list) → timing note → "?" → primary → Cancel |
| PL-04 | Title (with "Bot") → Level → Variant → Length → info line → primary |
| PL-05 | Title → cost rows → options in order → Close |
| PL-06 | Title (focused on open) → elapsed time → summary → widening note → long-wait actions (when shown) → Cancel search |
| PL-07 | Title (focused) → opponent card → entry paid → fair-dice line → Go to match (→ Cancel this match in the race variant) |

**Labels and announcements**

- Tier card: one accessible name `play.tier.label`.
- Balance chip, coin icons: `coins.balanceChip`; decorative coin icons `aria-hidden`.
- Elapsed time: not announced every second. A polite announcement at 1 minute and at the long-wait note.
- Polite live region: "Searching", "Connection lost", "Searching again", "Opponent found: @{username}".
- Opponent card: `play.found.opponentLabel`.
- Bot rows always include the word "Bot" in the accessible name, not only the icon.

**Other rules**

- Not color alone: unaffordable tiers (icon + text), "Rated" and "Bot" labels (icon + text), selected chips (check mark + outline).
- Contrast: 4.5:1 for all text; chips and cards 3:1 boundaries.
- Targets: cards, chips, and buttons ≥ 44 × 44 px; the Cancel search button ≥ 48 px tall.
- Motion: the search indicator stops under reduced motion (static bar + elapsed time). No pulsing on "Play" or on the balance chip.
- Text size 200%: cards grow; cost rows stack label over value; the overlay scrolls with Cancel sticky.

---

## 9. Acceptance criteria

1. PL-02 opens with only the tapped tier chosen; variant and length are unselected; Continue is disabled with a visible reason until both are chosen.
2. PL-03 shows entry, toman equivalent, platform fee with percent and pot, winner receives, balance, and balance after, all from server values, before `queue.join` is sent. The primary label contains the entry.
3. Double-tapping the PL-03 primary sends one `queue.join`.
4. After `queue.status waiting`, PL-06 shows the elapsed time, the table summary, and "Cancel search" within the bottom 40% of the screen at 360 × 800, 390 × 844, and 430 × 932.
5. Cancel, the back gesture, and Esc each send `queue.leave` and return to PL-01 with no confirmation.
6. With the socket dropped during a search, PL-06 states the user isn't queued; on reconnect it re-sends the same `queue.join` and restarts the elapsed time.
7. `queue.status removed {reason: balance}` opens PL-05 `removed` with "Nothing was charged".
8. `match.found` shows the opponent card and "Entry paid", updates the balance chip, and opens `/match/[id]` within 1.5 s or on "Go to match".
9. `match.found` after Cancel shows the race variant; the event is never discarded.
10. PL-04 shows the Bot label in the title and each level; nothing is pre-selected; the info line says free, unrated, no XP; `POST matches/bot` success opens `/match/[id]`.
11. Balance below the entry opens PL-05 with lower affordable tiers first, the bot second, "Get coins" as a text action third. From a lost match's "Play again", PL-05 has no "Get coins".
12. `MATCH_IN_PROGRESS` shows "Return to match" to the returned `match_id`; PL-08 appears.
13. Suspended accounts see tier and bot buttons disabled with `account.suspended.actionBlocked` + "Details"; no queue or bot request is sent.
14. On a device without WebGL2, play buttons are disabled with `play.unsupported.reason`, and nothing is queued or charged.
15. The "Play again" card appears only after a successful join and opens PL-03 with every cost row.
16. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape; no horizontal scroll; no clipped text at 200%; all targets ≥ 44 × 44 px.
17. Every error code in §3.9 has a mapped state; all strings come from i18n keys with fa and en.

---

## 10. Open questions and API gaps

For the main agent unless noted. Q1 blocks PL-03 as specified.

1. **Rake percent and payout are not exposed.** `Tier` has no `rake_pct`, `pot`, `rake`, or `payout`, and `GET config` has no `table.rake_pct`. PL-01 cards and PL-03 need server values (P§2.2, hard requirement). Proposal: add `rake_pct`, `pot`, `rake`, `payout` to each `Tier`.
2. **Traditional scoring is not exposed.** `play.variant.traditional.desc` needs `game.traditional_points`. Proposal: `GET config.traditional_points`. Until then the description omits the numbers.
3. **Queue after a socket drop.** The server removes the player on disconnect, and the api-client doesn't re-join. This spec re-sends `queue.join` from the UI on reconnect. Please confirm, or move this into `GameSocket` (keep the last `queue.join` and re-send it in `resync()` unless `queue.leave` was sent).
4. **No explicit "cancel match" before the first roll.** The found-after-cancel race relies on match.md MA-19 (`match.resign {scope: match}` before the first roll, which the server treats as an abort with refunds). Please confirm that is intended, or add a `match.abort` action allowed only before the first roll.
5. **Queue feedback.** `queue.status` has no position or window data. The static widening text is enough; no change needed unless product wants an estimate.
6. **Bot entry.** `bot.entry_enabled` is in the settings table but `POST matches/bot` never charges. Confirm it stays off in Phase 1, or add the entry and fixed prize to the endpoint.
7. **Resume banner data.** `GET me/matches/active` returns only `match_id`. Proposal: return `{match_id, opponent {username, avatar, is_bot}, score, your_turn}` so PL-08 can say whose turn it is without opening the socket.
8. **`Tier.waiting` counts all variants and lengths of a tier.** "N searching at this table" can mislead when they wait for a different variant. Proposal: `waiting_by_queue` keyed by `variant:length`, or drop the count.
9. **Private invite tables** (ia.md Q1) are still out of scope.
10. **Suspension error keys differ.** `queue.join` returns `errors.wallet.accountSuspended`, `POST matches/bot` returns `errors.match.accountSuspended`. Harmless because the UI uses the contextual key, but one key would be cleaner.
