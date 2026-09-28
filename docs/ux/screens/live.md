# Live: live list, spectating, predictions

Status: draft for UI build (CLAUDE.md §17 steps 8 and 12).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 2–5, 10, 11; §7.5; §10.2 (Live, Predictions); §10.3 (`spectate.*`, `spectators.count`, `pool.update`, `react.recv`, `opponent.*`, `match.ended`); §11.1; §11.7; §12.1 (suspended); §12.2 (`chip_dumping`, `prediction_collusion`); §14 (`predict.*`, `live.*`); §20.4; §21.2; ia.md §1–§4; patterns.md (P§) 1, 2, 2.4, 3, 4, 5, 6, 9, 10, 11, 13, 16, 17; journeys.md J5; personas P2 Maryam, P3 Hamid.
Related specs: `match.md` (board, player bars, dice, move history MA-04, reaction bubbles MA-06, 3D loader MA-01, finished summary MA-14; written in parallel), `play.md` (lobby, variant and length labels), `history-replay.md` (replays; spectators never get a replay link), `tournaments.md` (tournament matches in the list), `wallet.md` (ledger rows `prediction_*`).

This spec merges the planned `predictions.md` into `live.md`: predictions exist only inside the spectator view, and "My predictions" is their history. Screen IDs follow screen-inventory.md §2.4.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET config` | `spectating_enabled` (= `live.max_spectators_per_match` > 0), `predictions_enabled` (= `predict.enabled`), `tiers`, `allowed_lengths` |
| `GET matches/live?tier=&variant=&tournament=&sort=spectators\|pool\|elo` | `{results: LiveMatchRow[], next: null}`, at most 100, not paginated. `LiveMatchRow`: `match_id`, `variant`, `length`, `entry`, `tier_id`, `players[2]` (`username`, `avatar`, `elo`, `level`), `score [a, b]`, `game_no`, `spectators`, `pool`, `avg_elo`, `tournament_id`. Tournament matches always come first, then the chosen sort (default `spectators`). Only human-vs-human, `active` matches. |
| WS `spectate.join` (C→S, `match_id`) | Reply `spectate.state` (`MatchStateOut` with `you: null`), then the players' event stream on the spectator group. Errors (below) arrive as an `error` envelope. The api-client re-sends `spectate.join` after a socket reconnect. |
| WS `spectate.leave` (C→S) | No reply |
| WS `spectators.count` (S→C) | `{count}`; throttled to 1 per 5 s; players get it too |
| WS `spectate.react` (C→S `{emoji_key}`, S→C `{key}`) | Spectators only; never sent to players; the sender is not identified. Only the free emoji keys are accepted from spectators. |
| WS `pool.update` (S→C, spectators only) | `{total_a, total_b, open}`; sent with `seq: 0` after each stake and when the pool closes |
| `GET predictions/open` | `{results: OpenPool[], next: null}`, at most 100 open pools. `OpenPool`: `match_id`, `players [a, b]` (usernames), `entry`, `total_a`, `total_b`, `open`, `max_stake_per_user`, `blocked` (`"player"`, `"linked"`, `"referral"`, or `null`) |
| `POST predictions {match_id, side (0\|1), amount}` + `Idempotency-Key` | `201 PredictionRow`. The same key again returns the original row and moves nothing. |
| `GET me/predictions?cursor=` | `{results: PredictionRow[], next}`, newest first, 30 per page. `PredictionRow`: `id`, `match_id`, `side`, `amount`, `payout` (null until settled or refunded), `pool_status` (`open`, `closed`, `held`, `settled`, `refunded`), `created_at` |
| `GET matches/{id}` | `MatchSummary` (players, status, winner, score, `end_reason`, `you`). Used for My predictions rows and for the ended state. |

Server rules the UI relies on (`backend/predictions/services.py`, `backend/realtime/spectate.py`, `backend/game/views.py`):

- **Pool eligibility (§7.5):** `predict.enabled`, human vs human, random pairing, **not a tournament match**, and entry ≥ `predict.min_table_entry`. A pool opens at `match.found` and closes at the first roll (`predictions.close` runs inside the opening roll). Settings are snapshotted per pool (`rake_pct`, `max_stake_per_user`, `max_pool_total`).
- **One side per user:** further stakes on the same side are allowed until `max_stake_per_user` in total; a stake on the other side is refused (`other_side`).
- **Payout:** `pool = total_a + total_b`; `rake = floor(pool × rake_pct / 100)`; `payout_i = floor(stake_i × (pool − rake) / winning_side_total)`; dust goes to the platform. One side empty, or the match aborted or voided → every stake refunded in full, no rake. A held pool (antifraud) settles only after an admin decision.
- **Spectating (§20.4):** any signed-in user, human-vs-human `active` matches only; a player of the match can't spectate it (`player`); `live.max_spectators_per_match` = 0 disables spectating (`disabled`); at the cap → `full`. Spectators are read-only.
- **Suspended (§12.1):** can watch and see their own predictions; `POST predictions` → `ACCOUNT_SUSPENDED`.

---

## 1. Goal and user story

- As an evening casual (P2 Maryam), I want to find an interesting match quickly, watch it without lag or clutter, and react with other spectators without disturbing the players.
- As a spectator, I want to predict the winner with a small stake, understand in one sentence how the pool pays, see both totals and my possible return before I pay, and find the result later.
- As a competitive player (P3 Hamid), I want to sort matches by rating and follow tournament matches first.
- As a player being watched, I want spectators to never affect my game (read-only, no spectator reactions reach me).

Success means:
- No coin leaves the wallet without the stake, the balance after, the pool rule sentence, and both totals on screen.
- A spectator always knows whether predictions are open, closed, or not offered for this match, and why when it matters.
- Nothing in the spectator view looks like a game control.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Bottom nav "Live" (side rail at `md`/`lg`) | LV-01 `/live` (last filters kept for the session) |
| Tournament detail or bracket "Watch" on a live slot (tournaments.md) | LV-03 `/match/[id]` |
| Tournament detail "Live matches of this tournament" | LV-01 `/live?tournament=<id>` |
| Push or deep link to `/match/[id]` for a match the user doesn't play in | LV-03 |
| Account hub "My predictions" (profile.md AC-01) | PR-04 `/me/predictions` |
| Empty state on the Leaderboard predict scope (leaderboard.md) | LV-01 |
| Redirect from `app.` with path and query | Any of the above |

| Exit | Destination |
| --- | --- |
| Back or "Leave" on LV-03 | Previous screen (usually LV-01, scroll and filters kept). Sends `spectate.leave`. No confirmation: leaving costs nothing. |
| Row tap on LV-01 for a match the user plays in | `match.md` player view (same route; the server resolves the role) |
| "View profile" in a player peek sheet (MA-15) | `/profile/[username]` |
| PR-04 row tap | `/match/[id]`: LV-03 while live, or the non-player finished summary (MA-14) after the end. Never `/replay/[id]`. |
| "Get coins" in the insufficient sheet | `/shop/coins` (shop.md) |

---

## 3. Flow

### 3.1 Live list (LV-01)

1. On open: read `GET config` (cached for the session). If `spectating_enabled` is false → LV-01 **disabled** state (§5); stop.
2. `GET matches/live` with the current filters and sort. In parallel, if `predictions_enabled`: `GET predictions/open` to mark rows whose pool is open (the list's own `pool` field is not reliable yet, see §10 Q1).
3. Render rows in server order. Tournament matches are always first, with a "Tournament" label (icon plus text).
4. **Refresh:**
   - Automatic every 15 s while the tab is visible and online; paused when hidden or offline.
   - Values (score, game, spectator count, "Predictions open") update in place.
   - Order changes, new rows, and ended rows are **not** applied under the user's finger. A pill "New list available · Show" appears at the top; tapping it (or pull-to-refresh, or the Refresh button at `lg`) applies them and keeps focus on the list heading.
   - A row whose match ended since the last load shows "Ended" (icon plus text); tapping it opens the finished summary.
5. **Filters and sort** (LV-02 sheet; side panel at `lg`): tier, variant, tournament, sort. "Apply" reloads; the URL query mirrors the choice (`?tier=&variant=&tournament=&sort=`), so a redirect or a shared link restores it. "Clear filters" resets to no filters and the default sort.
6. Row tap → `/match/[id]`.

### 3.2 Watching a match (LV-03)

1. `/match/[id]` resolves the role (ia.md open question 2). The viewer is not a player → spectator view.
2. Show the 3D loader (match.md MA-01). In parallel, open the socket and send `spectate.join`.
3. **Join result:**
   - `spectate.state` → render the board and bars from the state; the view is live.
   - `error` with `MATCH_ACTION_INVALID` and `details.reason`:
     - `full` → LV-06 **match full**.
     - `disabled` → LV-06 **spectating off**.
     - `not_live` → `GET matches/{id}`: if it ended → the non-player finished summary (MA-14); if it's a bot match or unknown → LV-06 **not available**.
     - `player` → the viewer is a player: switch to the player view (match.md) without a reload.
   - `MATCH_NOT_FOUND` → LV-06 **not found**.
4. **During the match** the spectator receives the same events as the players (`turn.rolled`, `turn.moved`, `turn.passed`, `turn.timeout`, `cube.update`, `game.started`, `game.ended`, `react.recv`, `opponent.disconnected`, `opponent.back`, `match.ended`), plus `spectators.count`, `spectate.react`, and `pool.update`.
   - The board, dice throws (same `throw_seed`), and player bars behave as in match.md, with **no** game controls: no roll, confirm, undo, cube, resign, or legal-move highlights.
   - Players' reactions (`react.recv`) appear as bubbles next to the sender's bar (MA-06), in the viewer's locale.
   - **Player disconnects** (`opponent.disconnected {player, grace_seconds}`): a non-blocking overlay on that player's bar: "@{username} disconnected · {mm:ss} until they forfeit", warning state at 30 s and 10 s (P§6.4). `opponent.back` clears it with the toast "@{username} is back".
   - **Timeouts** (`turn.timeout {count, limit}`): when `count` = `limit − 1`, the bar shows "One more timeout ends the match" (as the players see it).
5. **Prediction panel** (PR-01): see §3.4. It shows only when `predictions_enabled` and the match has or had a pool for this viewer.
6. **Spectator reactions** (LV-04): see §3.3.
7. **Match end** (`match.ended`): LV-07 card over the lower part of the screen: winner, final score, reason. If the viewer has a prediction on this match, the PR-03 result replaces the prediction panel content (§3.6). The board stays visible. Actions: "Back to Live" (primary), "Watch another match" (→ LV-01). No replay link (§2 rule 13).
8. **Leaving** (back, "Leave" in LV-05, or tab switch at `md`/`lg`): send `spectate.leave`; no dialog.

### 3.3 Spectator reactions (LV-04)

1. If `spectate.react` returns `REACTION_REJECTED` with `reason: disabled`, or the view learns that reactions are off (§10 Q6), the reactions button is removed for the rest of the session and a one-time note in LV-05 reads "Spectator reactions are turned off."
2. The reactions button opens a small picker (sheet at `sm`, popover at `md`, always-visible strip at `lg`) with the free emoji set only. Spectators can't send phrases.
3. Sending: tap an emoji → send `spectate.react`. The button then shows a 3 s cooldown (ring plus the remaining seconds as text; the ring does not mirror). Taps during the cooldown are ignored with the tooltip "Wait a moment". The client enforces 1 per 3 s (§10 Q5).
4. Received spectator reactions (including one's own, echoed by the server) float up in the **spectator lane**, a narrow strip along the end edge above the bottom controls, at most 3 visible, 2 s each. They never cover the board's playing area, the player bars, or the dice. Under reduced motion they appear and fade without movement.
5. LV-05 has a switch "Show spectator reactions" (device-local, default on). Players' reactions are not affected by it.
6. Players never see spectator reactions (§20.4). The picker says so once: "Only other spectators see these."

### 3.4 Prediction panel: loading and states (PR-01)

1. **Data on entering LV-03** (when `predictions_enabled`):
   - `GET predictions/open` → the entry for this `match_id`, if any (totals, `open`, `max_stake_per_user`, `blocked`).
   - `GET me/predictions` (first page) → this viewer's rows for this `match_id`: side and the sum of amounts.
   - Then keep totals current from `pool.update`. The first `turn.rolled` with `opening: true` also closes the panel at once, even before `pool.update {open: false}` arrives.
2. **Panel state** from that data:

   | Condition | State |
   | --- | --- |
   | No pool entry and no own prediction | **Hidden.** No prediction UI at all (not eligible, or closed before arrival; see §10 Q2). The match info line may say "Predictions: not offered" only when the server can tell us (§10 Q2). |
   | Pool open, `blocked` = null, not suspended | **Open** (§3.5) |
   | Pool open, `blocked` = `referral` | **Blocked, referral:** "You can't predict on this match because you and one of the players are connected by an invitation." |
   | Pool open, `blocked` = `linked` | **Blocked, generic:** "Predictions on this match aren't available for your account." No further detail (no antifraud disclosure). |
   | Pool open, `blocked` = `player` | Not reachable in the spectator view (the viewer is a player); treat as hidden. |
   | Pool open, account suspended | **Open, read-only:** totals and the rule sentence, with the Predict button disabled, `account.suspended.actionBlocked` and "Details". |
   | Pool closed, own prediction exists | **Closed:** final totals, "Your prediction: {amount} coins on @{player}", "Predictions closed at the first roll." |
   | Match ended, own prediction exists | **Result** (§3.6) |

3. The panel is a bottom sheet at `sm` (opened by the "Predict" button, or "Your prediction" once staked), and a persistent side panel at `md`/`lg` (P§1).

### 3.5 Placing a prediction (PR-01 open → PR-02 → done)

1. **PR-01 open** shows, in order:
   1. Title "Who will win?" and the countdown-free status line "Open until the first roll" (there is no timer to show; see §10 Q3).
   2. The rule sentence `predict.howItWorks` (P§2.4) with the pool's `rake_pct` (§10 Q4), and a "?" link to `/help/predictions`.
   3. Two side cards, one per player: avatar, username, ELO, and that side's current total ("{total} coins on this side"). **None is selected.** They form a radio group.
      - If the viewer already has a stake, their side is marked "Your side" (icon plus text) and pre-chosen, because that is the only allowed side; the other card is disabled with "You already predicted on @{player}. You can add to that side only."
   4. Stake field (empty, `inputmode="numeric"`), with helper text before typing: "Up to {remaining} coins more on this match · Your balance: {balance}". `remaining` = `max_stake_per_user` − own stake so far.
   5. Quick-pick chips at 10%, 25%, and 50% of `max_stake_per_user` (rounded down, shown only if ≤ `remaining`). None is active by default. No "max" chip.
   6. Estimate line, only when a side and a valid stake are set: "If @{player} wins, you'd get about {estimate} coins" with the tag `predict.estimate` ("estimate, changes as others predict"). If the other side's total is 0: "If nobody predicts on @{other}, every stake is refunded."
   7. Button "Continue", disabled with a visible reason until a side and a valid stake are set ("Choose a player", "Enter a stake").
2. **Client checks before Continue** (the server checks again): stake ≥ 1; ≤ `remaining` (field error "You can add up to {remaining} more coins on this match"); ≤ balance → otherwise the insufficient sheet (§3.7).
3. **Estimate arithmetic** (display only; integers; the server is authoritative):
   `pool' = total_a + total_b + s`; `rake' = floor(pool' × rake_pct / 100)`; `estimate = floor((own + s) × (pool' − rake') / (side_total + s))`, where `own` is the viewer's existing stake on that side.
4. **PR-02 confirmation** (the sheet replaces itself, P§1; P§2.1 anatomy):

   | Row | Value |
   | --- | --- |
   | Title | "Predict on @{player}" |
   | Summary | "@{a} vs @{b}", variant, "first to {n}", table entry |
   | Stake | {s} coins, with the toman equivalent (P§2.1) |
   | Your balance | balance |
   | Balance after | balance − s |
   | Pool now | "@{a}: {total_a} · @{b}: {total_b}" |
   | How it works | `predict.howItWorks` |
   | Estimate | as step 1.6 |
   | Final note | "A stake can't be taken back once placed. Predictions close at the first roll." |
   | Primary | "Pay {s} coins on @{player}" |
   | Secondary | "Back" (to PR-01 with entries kept) |

5. Primary → `POST predictions` with a new `Idempotency-Key` (kept for retries of this same confirmation). In-flight rules of P§2.2: spinner, sheet not dismissible, repeat taps ignored, "Still working… Check status" after 10 s. "Check status" re-reads `GET me/predictions` and looks for a row with this match and amount created in the last minute; if found → success; if not → retry with the **same** key.
6. **Success:** the sheet returns to PR-01 in the **staked** state: "Your prediction: {total} coins on @{player}", totals updated (from the response and the next `pool.update`), the "add more" field (empty) if `remaining` > 0. Snackbar "Prediction placed: {s} coins on @{player}". The spectator view has no balance chip (immersive), so PR-01 always shows "Your balance: {balance}".
7. **Pool closes while the user is on PR-01 or PR-02** (`pool.update {open: false}` or the opening roll) and no request is in flight: the primary button is disabled and the sheet shows "Predictions closed at the first roll. Nothing was charged." If a request is in flight, wait for the server's answer; it decides.
8. Errors → §3.8.

### 3.6 Results (PR-03)

1. On `match.ended`, if the viewer has a prediction on this match: re-read `GET me/predictions` (first page) and find the row(s) for this match.
2. If `pool_status` is still `closed` (settlement not visible yet), poll every 5 s for up to 60 s. Then show "The result will appear in My predictions shortly." with a link to PR-04.
3. Result content (sign plus words, never color alone; equal visual weight for wins and losses, P§9.2):

   | `pool_status` / data | Text |
   | --- | --- |
   | `settled`, `payout` > 0 | "@{player} won. You get {payout} coins." with «+{payout}» and "won" |
   | `settled`, `payout` = 0 | "@{player} didn't win. Your stake of {amount} coins went to the winning side." with «−{amount}» |
   | `refunded`, match `aborted` or `voided` | "The match was cancelled, so every stake was returned in full." «+{amount}» "refunded" |
   | `refunded`, otherwise | "Nobody predicted on one of the players, so every stake was returned in full." |
   | `held` | "This pool's result is under review. You'll see the outcome here and in your wallet when the review ends." No accusation, no reason. |

4. Actions: "My predictions" (text) and "Back to Live". **Never** a shop link, "predict again", or any loss-chasing copy after a lost prediction (P§9.1).

### 3.7 Insufficient coins

Checked before PR-02 opens and again on the server. The P§9.1 sheet (shared component from play.md PL-05):
- "Not enough coins": stake, your balance, shortfall.
- Options, in order: "Change stake" (returns to PR-01 with the stake field focused and cleared; nothing is pre-filled), "Get coins" (text-style → `/shop/coins`), "Close".
- Never shown after a lost prediction; a result screen never links to the shop.

### 3.8 Error map (every code these endpoints and events can return)

The catalog key is the backend `message_key` (fallback text). The screen uses the contextual key when one is given. Unknown codes → `errors.generic` plus the code (P§4.2).

| Code (HTTP) / event | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `PREDICTION_REFUSED {reason: closed}` (409) | `POST predictions` | PR-02 action error; primary disabled; PR-01 switches to closed. Nothing charged. | `errors.predictions.refused` | `predict.error.closed` |
| `PREDICTION_REFUSED {reason: player}` (409) | same | Switch to the player view (should not happen) | ← | `predict.blocked.player` |
| `PREDICTION_REFUSED {reason: linked}` (409) | same | PR-01 blocked (generic) | ← | `predict.blocked.linked` |
| `PREDICTION_REFUSED {reason: referral}` (409) | same | PR-01 blocked (referral) | ← | `predict.blocked.referral` |
| `PREDICTION_REFUSED {reason: other_side}` (409) | same | Back to PR-01; re-read `me/predictions`; the other card is disabled | ← | `predict.error.otherSide` |
| `PREDICTION_REFUSED {reason: max_stake, remaining}` (409) | same | Back to PR-01, field error with `remaining` (0 → "You've reached the limit for this match") | ← | `predict.error.maxStake` / `predict.error.maxStakeReached` |
| `PREDICTION_REFUSED {reason: pool_full}` (409) | same | PR-02 action error; primary disabled | ← | `predict.error.poolFull` |
| `ACCOUNT_SUSPENDED` (403) | same | PR-01 suspended read-only; re-fetch `GET me` so the banner appears after leaving the immersive view | `errors.wallet.accountSuspended` | `account.suspended.actionBlocked` |
| `AMOUNT_INVALID` (400) | same | PR-01 field error | `errors.wallet.amountInvalid` | `predict.stake.invalid` |
| `WALLET_INSUFFICIENT {balance, needed}` (409) | same | §3.7 sheet with the server `balance` | `errors.wallet.insufficient` | `coins.insufficient.title` |
| `VALIDATION` (400) | same | PR-01 action error `errors.validation` | `errors.validation` | — |
| `IDEMPOTENCY_KEY_REQUIRED` (400) | same | Client bug: `errors.generic` + code; nothing charged | `errors.wallet.idempotencyKeyRequired` | — |
| `NETWORK` (client) | reads | LV-01 screen error + Retry; PR-01 inline "Couldn't load predictions" + Retry | `errors.network` | `predict.loadError` |
| `NETWORK` (client) | `POST predictions` | "Still working… / Check status" (§3.5 step 5); never a blind retry with a new key | `errors.network` | `common.stillWorking` |
| WS `MATCH_ACTION_INVALID {reason: full}` | `spectate.join` | LV-06 match full | `errors.match.actionInvalid` | `spectate.full.*` |
| WS `MATCH_ACTION_INVALID {reason: disabled}` | `spectate.join` | LV-06 spectating off | ← | `spectate.disabled.*` |
| WS `MATCH_ACTION_INVALID {reason: not_live}` | `spectate.join` | Ended → MA-14 summary; else LV-06 not available | ← | `spectate.notLive.*` |
| WS `MATCH_ACTION_INVALID {reason: player}` | `spectate.join` | Switch to the player view | ← | — |
| WS `MATCH_ACTION_INVALID {reason: not_watching}` | `spectate.react` | Re-send `spectate.join`, then drop the reaction silently | ← | — |
| WS `MATCH_NOT_FOUND` | `spectate.join` | LV-06 not found | `errors.match.notFound` | `spectate.notFound.*` |
| WS `REACTION_REJECTED {reason: disabled}` | `spectate.react` | Remove the reactions button; note in LV-05 | `errors.match.reactionRejected` | `spectate.reactions.off` |
| WS `REACTION_REJECTED {reason: unknown}` | `spectate.react` | Drop silently (stale emoji list); refresh the list on next open | ← | — |
| `NOT_FOUND` (404) | `GET matches/{id}` | LV-06 not found | `errors.notFound` | `spectate.notFound.*` |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` (401) | all | api-client refreshes once; on failure SY-08 | `errors.unauthenticated` | — |
| `AUTH_BANNED` (403) | all | `/login` with AU-14 | `errors.auth.banned` | `account.banned.*` |
| `VALIDATION` (400) | `GET matches/live` (bad query) | Drop the invalid filter, reload, and show "Some filters were reset" | `errors.validation` | `live.filters.reset` |
| Any other / `HTTP_ERROR` | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

### 3.9 My predictions (PR-04)

1. `GET me/predictions`, newest first; "Show more" loads the next cursor page.
2. Each row needs the players' usernames. Until `PredictionRow` carries them (§10 Q7), the client fetches `GET matches/{id}` per distinct match on the visible page (cached for the session) and shows a skeleton in the name slot meanwhile.
3. Row content: date and time (Jalali in fa), "@{a} vs @{b}", "Your pick: @{player}", stake, and a status chip (icon plus text):

   | Status | Chip | Amount shown |
   | --- | --- | --- |
   | `open` | "Open" | «−{amount}» staked |
   | `closed` | "Waiting for result" | «−{amount}» staked |
   | `held` | "Under review" | «−{amount}» staked |
   | `settled`, payout > 0 | "Won" | «+{payout}» |
   | `settled`, payout = 0 | "Not won" | «−{amount}» |
   | `refunded` | "Refunded" | «+{amount}» refunded |

4. Several stakes on the same match are separate rows (the API returns one row per stake); each shows its own amount and, when settled, its own payout.
5. Row tap → `/match/[id]` (LV-03 while live; the non-player summary after the end).
6. The list has no totals or "profit" banner: nothing that frames predicting as income.

---

## 4. Screen list

Common: LV-01 and PR-04 have the standard app bar (title, balance chip). LV-03 is immersive (no nav, no app bar, ia.md §3.4).

### LV-01 Live list `/live` (Tab 2 root)

- **Purpose:** pick a match to watch.
- **Content priority:**
  1. Filter summary bar: active filters as removable chips ("100-coin table ×"), the sort in words ("Most watched"), and the "Filters" button (icon plus label). Nothing when no filter is set except the sort and the button.
  2. First-visit hint (P§14, once): "Watch any live match. When a match has just started you may be able to predict the winner." Dismiss (×).
  3. Rows (cards), in server order.
  4. "New list available · Show" pill (floating at the top of the list when present).
- **Row (card) content, in order:**
  1. Tournament label when `tournament_id` is set: trophy icon + "Tournament" + name and round when known (§10 Q8).
  2. Players: two lines, each avatar (32 px), username (LTR-isolated), level, ELO. Player A on the first line.
  3. Score «۲ – ۱» (player A – player B, `<bdi>`), "Game {game_no}", "First to {length}".
  4. Meta line: variant name; table entry with coin icon ("100-coin table"); hidden for tournament matches (entry 0).
  5. Status chips: spectators (eye icon + number, read as "{n} watching"); "Predictions open" (icon + text) when the pool is open; "Your match" when the viewer is a player; "Ended" after the match ended.
- **Components:** filter chips, list of cards (≥ 72 px tall, whole card is one 44 px+ target), skeleton cards, pill, pull-to-refresh.
- **Primary action:** tap a row. There is no other primary button.

### LV-02 Filters and sort (sheet; side panel at `lg`)

- Tier: chips from `GET config.tiers` (entry values: "50", "100", …), single choice, plus "Any" (selected when nothing is set). Filter values are table filters, not spends, so "Any" as the default is not a pre-selection under P§2.2.
- Variant: "Any", standard with cube, standard without cube, traditional (labels from play.md).
- Tournament: "Any", or a running tournament from `GET tournaments?status=running` (names, localized). Hidden when none is running.
- Sort (radio): "Most watched" (`spectators`, default), "Biggest prediction pool" (`pool`), "Highest rated" (`elo`). A line under the group: "Tournament matches always come first."
- Footer: "Show matches" (primary), "Clear filters" (text).

### LV-03 Spectator view `/match/[id]` (immersive)

- **Purpose:** watch the match; predict while the pool is open.
- **Content priority (portrait `sm`):**
  1. Top strip: back (mirrors), "Watching" label with eye icon and the spectator count ("۱۲ نفر در حال تماشا"), match info (variant, first to N, score), menu button (LV-05).
  2. Player B bar (top), board, player A bar (bottom). Perspective and bar content come from match.md for `you: null` (§10 Q9). Bars show timers, time bank, cube ownership, disconnect overlays, and the "Bot" label never (bots are not spectated).
  3. Bottom action row, inside the bottom 40% of the screen: "Predict" (only when PR-01 is open; with a coin icon and the text "Predict") or "Your prediction" (when staked or closed with a stake), and the reactions button (icon, labeled). Nothing else.
  4. Spectator lane (end edge), LV-07 card at the end.
- **No game controls.** No roll, confirm, undo, cube, resign, or move highlights; tapping the board does nothing (no selection, no haptic).
- **Primary action:** none during play. "Predict" is prominent only while the pool is open.

### LV-04 Spectator reactions (picker sheet at `sm`, popover at `md`, strip at `lg`)

- Grid of the free emojis (≥ 44 × 44 px each), each with an accessible name from `reactions.emoji.<key>`.
- Note "Only other spectators see these."
- Cooldown state on the trigger button (3 s).

### LV-05 Spectator menu (sheet; side panel section at `lg`)

- Items: Match info (variant, length, entry, tournament and round, provably-fair `seed_commit` with a "?" to `/help/fair-dice`), Move history (MA-04), Sound (switch), Lite graphics (switch, same setting as ST-01), Show spectator reactions (switch, device-local), Help, Leave.
- No resign, no "leave match" warning (spectators can't forfeit).

### LV-06 Spectating unavailable (in place on `/match/[id]`)

| Variant | Title | Body | Actions |
| --- | --- | --- | --- |
| Match full | "This match is full" | "It has reached its viewer limit. Try again later or watch another match." | "Try again" (re-sends `spectate.join`), "Back to Live" |
| Spectating off | "Watching live matches is turned off" | "Live viewing isn't available right now." | "Back" |
| Not available | "This match isn't live" | "It may have ended or can't be watched." | "Back to Live" |
| Not found | "Match not found" | "Check the link, or pick a match from the Live list." | "Back to Live" |

No 3D scene is loaded for these states (save data on 4G).

### LV-07 Spectator match-ended card

- Title by result: "@{winner} won the match", final score «۵ – ۳» (A – B), reason line: "by resignation", "on time", "by disconnection", "at the table" (normal end), or "Match cancelled before the first roll" (aborted).
- If the viewer predicted: PR-03 content inside the card.
- Actions: "Back to Live" (primary), "Watch another match" (text).
- No replay link, no share action.

### PR-01 Prediction panel (sheet at `sm`; side panel at `md`/`lg`)

- As §3.4 and §3.5. Always shows "Your balance: {balance}" at the top of the stake section (no app bar chip in the immersive view).

### PR-02 Prediction confirmation (sheet step; centered dialog at `md`/`lg`)

- As §3.5 step 4. At `md`/`lg` the confirmation is a centered dialog (max 480 px) even though PR-01 is a side panel, because it is a coin spend (P§1).

### PR-03 Prediction result (inside PR-01 and LV-07)

- As §3.6.

### PR-04 My predictions `/me/predictions` (Tab 5 child)

- **Purpose:** history of stakes and results.
- **Content:** intro line "Your predictions and their results"; rows (§3.9); "Show more".
- **Primary action:** none. Empty-state action "Watch live matches" → `/live`.

---

## 5. States

| State | LV-01 | LV-02 | LV-03 | LV-04 / LV-05 | PR-01 / PR-02 / PR-03 | PR-04 |
| --- | --- | --- | --- | --- | --- | --- |
| **Loading** | 4 skeleton cards; filter bar renders at once | Tournament options: skeleton row | MA-01 loader with progress and Cancel (→ back). The join is sent in parallel; the board shows only after `spectate.state`. | Picker renders static | Skeleton of two side cards; "Place" spinner in flight | 6 skeleton rows; "Show more" in-button spinner |
| **Empty** | `live.empty` "No live matches right now" + "Play a match" (→ `/play`). Filtered: `live.emptyFiltered` + "Clear filters". | "Tournament" group hidden when none running | — | — | Hidden when there is no pool and no own prediction | `predict.mine.empty` "No predictions yet" + "Watch live matches" |
| **Error** | Screen error `live.loadError` + Retry | — | Join errors → LV-06; socket errors → reconnecting | Reaction errors per §3.8 | Inline `predict.loadError` + Retry; action errors per §3.8 | Screen error + Retry; per-row name fetch failure → "Match #{short id}" |
| **Offline** | Banner `net.offline`; cached list with `common.lastUpdated`; auto-refresh paused; row tap shows `live.offlineWatch` "Connect to the internet to watch." | Apply disabled with `net.offlineAction` | As reconnecting | Send disabled | Place disabled with `net.offlineAction`; entries kept | Cached list readable; "Show more" disabled |
| **Reconnecting** | n/a (REST). On reconnect: refresh once. | — | Non-blocking banner at the top: "Reconnecting…" with attempt count and "Retry now". The board stays with a "Paused, reconnecting" label; no forfeit countdown (spectators can't forfeit). The api-client re-sends `spectate.join`; the new `spectate.state` replaces the view. If the rejoin returns `full`, show LV-06 match full. | Send disabled | Totals frozen with "Reconnecting…"; a new `GET predictions/open` after the rejoin | — |
| **Player disconnected** | — | — | Overlay on that player's bar with the grace countdown (§3.2 step 4) | — | Unaffected | — |
| **Insufficient coins** | — | — | — | — | §3.7 sheet; never after a result | — |
| **Suspended** | Suspension banner (AU-13); watching works | Works | Works | Works | Open pool shows read-only with the Predict button disabled, `account.suspended.actionBlocked` + "Details". Existing predictions show and settle normally (§12.1). | Works |
| **Banned** | No session (AU-14) | ← | ← | ← | ← | ← |
| **First-time user** | One-time hint (§4 LV-01) | — | One-time hint near "Predict" when a pool is open: "You can predict the winner until the first roll." | Note "Only other spectators see these." | Rule sentence always visible; no extra onboarding | Empty state |
| **Spectating disabled** (`config.spectating_enabled` false) | Replace the list with `spectate.disabled.title` / `.body`; no action. The tab stays in the nav. | — | LV-06 spectating off | — | — | Works (history) |
| **Predictions disabled** (`config.predictions_enabled` false) | No "Predictions open" chips; the "Biggest prediction pool" sort is hidden | ← | No Predict button | — | Hidden. Existing rows still settle and show. | Works |

---

## 6. Responsive notes (§11.7)

| Breakpoint | LV-01 | LV-03 spectator view | PR-01 | PR-04 |
| --- | --- | --- | --- | --- |
| `xs` 320–359 | Single column; card players on 2 lines, meta wraps to 2 lines; nav icon-only | Portrait: board fills the width (match.md framing); bars 2-line; bottom row: Predict (label may shorten to icon + «پیش‌بینی») and reactions | Bottom sheet up to 90% `dvh`; side cards stack vertically | Single column |
| `sm` 360–599 (390 × 844) | Single column; filter bar sticky under the app bar | As `xs`; Predict and reactions in the bottom 40%, reachable one-handed | Bottom sheet; side cards side by side (2 columns) at ≥ 360 px; sticky primary in the thumb zone | Single column |
| `md` 600–1023 | Side rail. List plus detail: the selected match opens as a live **preview** in the detail panel (players, score, chips, "Watch" button). Watching always opens the immersive view; no 3D in the panel. | Board plus one side panel with tabs: Prediction · Moves · Spectators (reactions lane moves into the Spectators tab) | Persistent side panel tab; PR-02 as a centered dialog | List plus detail: the selected row shows the match summary in the panel |
| `lg` ≥ 1024 | Shell max 1280: side rail, filters as a persistent side panel (start), list, preview panel (end). Hover states; Refresh button. | Board plus two side panels: start panel = move history + players' reactions log; end panel = spectators (count, reactions strip, picker) + prediction pool | Always visible in the end panel while relevant | As `md` |

- **Landscape phones** (height < 500 px): LV-01 uses the side rail. LV-03 uses the natural board orientation (match.md); the bottom action row becomes a vertical column on the end edge; PR-01 opens as a side sheet from the end edge (max 50% width) so the board stays visible.
- Orientation and width changes keep the open sheet, the entered stake, the chosen side, and the idempotency key; the 3D scene re-frames without reloading (§11.7).
- `dvh`/`svh` only; `env(safe-area-inset-*)` respected by the bottom action row and sheets.
- Container queries: PR-01 is one component rendered as a sheet or a side panel.
- Keyboard on `m.`: Esc closes sheets; in LV-03, `P` opens the prediction panel and `R` the reactions picker (shown in LV-05 "Keyboard shortcuts"); none of the §11.0 game shortcuts are active for spectators.

---

## 7. RTL/LTR notes and i18n keys

- fa first. Layout, back arrows, chips, and list chevrons mirror. The 3D board, dice, cube, and timer rings never mirror (P§11).
- Usernames are LTR-isolated (`<bdi dir="ltr">`) with `@` in running text.
- Score is always "player A – player B" for spectators (the same order as the rows and side cards), isolated with `<bdi>`; the side cards are laid out in reading order (A at the start side).
- Numbers: locale digits (fa `۰–۹`) with grouping; percentages via `Intl.NumberFormat` percent style; dates Jalali in fa.
- Variant and length labels reuse play.md keys (`play.variant.*`, `play.length.*`); if play.md names them differently, play.md wins and this spec follows.
- Emoji accessible names use `reactions.emoji.<key>` (shared with match.md).

| Key | fa | en |
| --- | --- | --- |
| `live.title` | مسابقه‌های زنده | Live matches |
| `live.hint.firstVisit` | هر مسابقه‌ی زنده‌ای را تماشا کنید. در ابتدای بعضی مسابقه‌ها می‌توانید برنده را پیش‌بینی کنید. | Watch any live match. When a match has just started you may be able to predict the winner. |
| `live.filters.button` | فیلترها | Filters |
| `live.filters.title` | فیلتر و مرتب‌سازی | Filter and sort |
| `live.filters.tier` | میز | Table |
| `live.filters.tierValue` | میز {entry} سکه‌ای | {entry}-coin table |
| `live.filters.any` | همه | Any |
| `live.filters.variant` | نوع بازی | Variant |
| `live.filters.tournament` | تورنمنت | Tournament |
| `live.filters.sort` | مرتب‌سازی | Sort by |
| `live.filters.sort.spectators` | پربیننده‌ترین | Most watched |
| `live.filters.sort.pool` | بیشترین مبلغ پیش‌بینی | Biggest prediction pool |
| `live.filters.sort.elo` | بالاترین امتیاز | Highest rated |
| `live.filters.tournamentFirst` | مسابقه‌های تورنمنت همیشه اول نمایش داده می‌شوند. | Tournament matches always come first. |
| `live.filters.apply` | نمایش مسابقه‌ها | Show matches |
| `live.filters.clear` | پاک کردن فیلترها | Clear filters |
| `live.filters.remove` | حذف فیلتر {name} | Remove filter {name} |
| `live.filters.reset` | بعضی فیلترها بازنشانی شدند. | Some filters were reset. |
| `live.row.tournament` | تورنمنت | Tournament |
| `live.row.tournamentRound` | تورنمنت {name} · دور {round} | Tournament {name} · Round {round} |
| `live.row.score` | {a} – {b} | {a} – {b} |
| `live.row.game` | دست {n} | Game {n} |
| `live.row.firstTo` | تا {n} امتیاز | First to {n} |
| `live.row.spectators` | {count, plural, one {# نفر در حال تماشا} other {# نفر در حال تماشا}} | {count, plural, one {# watching} other {# watching}} |
| `live.row.poolOpen` | پیش‌بینی باز است | Predictions open |
| `live.row.yourMatch` | مسابقه‌ی شما | Your match |
| `live.row.ended` | تمام شد | Ended |
| `live.row.label` | {a} در برابر {b}، {score}، {meta} | {a} vs {b}, {score}, {meta} |
| `live.newList` | فهرست جدید آماده است · نمایش | New list available · Show |
| `live.refresh` | به‌روزرسانی | Refresh |
| `live.empty` | الان مسابقه‌ی زنده‌ای در جریان نیست. | No live matches right now. |
| `live.emptyAction` | شروع یک بازی | Play a match |
| `live.emptyFiltered` | مسابقه‌ای با این فیلترها نیست. | No matches for these filters. |
| `live.loadError` | فهرست مسابقه‌ها بارگذاری نشد. | Couldn't load live matches. |
| `live.offlineWatch` | برای تماشا به اینترنت وصل شوید. | Connect to the internet to watch. |
| `live.preview.watch` | تماشا | Watch |
| `spectate.watching` | {count, plural, one {# نفر در حال تماشا} other {# نفر در حال تماشا}} | {count, plural, one {# watching} other {# watching}} |
| `spectate.label` | در حال تماشا | Watching |
| `spectate.back` | بازگشت به فهرست زنده | Back to Live |
| `spectate.menu` | منوی تماشا | Viewing menu |
| `spectate.menu.info` | اطلاعات مسابقه | Match info |
| `spectate.menu.moves` | تاریخچه‌ی حرکت‌ها | Move history |
| `spectate.menu.showReactions` | نمایش واکنش تماشاگران | Show spectator reactions |
| `spectate.menu.shortcuts` | میان‌برهای صفحه‌کلید: P پیش‌بینی، R واکنش | Keyboard shortcuts: P predict, R react |
| `spectate.menu.leave` | خروج از تماشا | Stop watching |
| `spectate.info.entry` | ورودی میز: {entry} سکه | Table entry: {entry} coins |
| `spectate.info.seedCommit` | تعهد تاس منصفانه | Fair-dice commitment |
| `spectate.paused` | متوقف شد؛ در حال اتصال دوباره | Paused, reconnecting |
| `spectate.reconnecting` | در حال اتصال دوباره… (تلاش {n}) | Reconnecting… (attempt {n}) |
| `spectate.retryNow` | تلاش دوباره | Retry now |
| `spectate.playerDisconnected` | اتصال {username} قطع شد · {time} تا باخت او | @{username} disconnected · {time} until they forfeit |
| `spectate.playerBack` | {username} برگشت | @{username} is back |
| `spectate.lastTimeout` | یک وقت‌تمام‌شدن دیگر، مسابقه را تمام می‌کند | One more timeout ends the match |
| `spectate.full.title` | ظرفیت تماشای این مسابقه پر است | This match is full |
| `spectate.full.body` | تعداد تماشاگران به سقف رسیده است. بعداً دوباره امتحان کنید یا مسابقه‌ی دیگری را تماشا کنید. | It has reached its viewer limit. Try again later or watch another match. |
| `spectate.disabled.title` | تماشای مسابقه‌های زنده خاموش است | Watching live matches is turned off |
| `spectate.disabled.body` | فعلاً امکان تماشای زنده وجود ندارد. | Live viewing isn't available right now. |
| `spectate.notLive.title` | این مسابقه زنده نیست | This match isn't live |
| `spectate.notLive.body` | ممکن است تمام شده باشد یا قابل تماشا نباشد. | It may have ended or can't be watched. |
| `spectate.notFound.title` | مسابقه پیدا نشد | Match not found |
| `spectate.notFound.body` | نشانی را بررسی کنید یا از فهرست زنده یک مسابقه انتخاب کنید. | Check the link, or pick a match from the Live list. |
| `spectate.reactions.button` | واکنش تماشاگر | Spectator reaction |
| `spectate.reactions.note` | فقط تماشاگران دیگر این‌ها را می‌بینند. | Only other spectators see these. |
| `spectate.reactions.wait` | کمی صبر کنید | Wait a moment |
| `spectate.reactions.cooldown` | {seconds} ثانیه تا واکنش بعدی | {seconds} s until the next reaction |
| `spectate.reactions.off` | واکنش تماشاگران خاموش است. | Spectator reactions are turned off. |
| `spectate.reactions.received` | واکنش تماشاگر: {emoji} | Spectator reaction: {emoji} |
| `spectate.ended.won` | {username} مسابقه را برد | @{username} won the match |
| `spectate.ended.score` | نتیجه‌ی نهایی {score} | Final score {score} |
| `spectate.ended.reason.resign` | با کناره‌گیری حریف | by resignation |
| `spectate.ended.reason.timeout` | با تمام شدن وقت حریف | on time |
| `spectate.ended.reason.disconnect` | با قطع اتصال حریف | by disconnection |
| `spectate.ended.reason.normal` | در جریان بازی | at the table |
| `spectate.ended.aborted` | مسابقه پیش از اولین پرتاب تاس لغو شد. | Match cancelled before the first roll. |
| `spectate.ended.anotherMatch` | تماشای مسابقه‌ای دیگر | Watch another match |
| `predict.title` | چه کسی می‌برد؟ | Who will win? |
| `predict.openUntil` | تا اولین پرتاب تاس باز است | Open until the first roll |
| `predict.button` | پیش‌بینی | Predict |
| `predict.yourPrediction` | پیش‌بینی شما | Your prediction |
| `predict.howItWorks` | (existing, P§2.4) برندگان کل مبلغ را پس از کسر {pct}٪ کارمزد، به نسبت مبلغ پیش‌بینی خود تقسیم می‌کنند؛ اگر کسی روی یک طرف پیش‌بینی نکند، همه مبلغ خود را پس می‌گیرند. | (existing, P§2.4) Winners split the whole pool, minus a {pct}% fee, in proportion to their stakes. If nobody picks one side, everyone gets their stake back. |
| `predict.sideTotal` | {total} سکه روی این بازیکن | {total} coins on this side |
| `predict.yourSide` | انتخاب شما | Your side |
| `predict.otherSideLocked` | شما روی {username} پیش‌بینی کرده‌اید و فقط می‌توانید به همان طرف اضافه کنید. | You already predicted on @{username}. You can add to that side only. |
| `predict.stake.label` | مبلغ پیش‌بینی (سکه) | Stake (coins) |
| `predict.stake.helper` | تا {remaining} سکه‌ی دیگر روی این مسابقه · موجودی شما: {balance} | Up to {remaining} coins more on this match · Your balance: {balance} |
| `predict.stake.invalid` | مبلغ را به سکه و به عدد صحیح وارد کنید. | Enter a whole number of coins. |
| `predict.balance` | موجودی شما: {balance} سکه | Your balance: {balance} coins |
| `predict.estimate` | (existing, P§2.4) تخمینی؛ با پیش‌بینی دیگران تغییر می‌کند | (existing, P§2.4) estimate, changes as others predict |
| `predict.estimateLine` | اگر {username} ببرد، حدود {estimate} سکه دریافت می‌کنید | If @{username} wins, you'd get about {estimate} coins |
| `predict.estimateOneSided` | اگر کسی روی {username} پیش‌بینی نکند، همه‌ی مبالغ برگردانده می‌شود. | If nobody predicts on @{username}, every stake is refunded. |
| `predict.continue` | ادامه | Continue |
| `predict.reason.chooseSide` | یک بازیکن را انتخاب کنید | Choose a player |
| `predict.reason.enterStake` | مبلغ را وارد کنید | Enter a stake |
| `predict.confirm.title` | پیش‌بینی روی {username} | Predict on @{username} |
| `predict.confirm.match` | {a} در برابر {b} · {variant} · تا {n} امتیاز | @{a} vs @{b} · {variant} · first to {n} |
| `predict.confirm.stake` | مبلغ پیش‌بینی | Stake |
| `predict.confirm.poolNow` | مجموع فعلی: {a}: {totalA} · {b}: {totalB} | Pool now: @{a}: {totalA} · @{b}: {totalB} |
| `predict.confirm.final` | مبلغ پیش‌بینی پس از ثبت قابل برگشت نیست. پیش‌بینی با اولین پرتاب تاس بسته می‌شود. | A stake can't be taken back once placed. Predictions close at the first roll. |
| `predict.confirm.cta` | پرداخت {amount} سکه روی {username} | Pay {amount} coins on @{username} |
| `predict.placed` | پیش‌بینی ثبت شد: {amount} سکه روی {username} | Prediction placed: {amount} coins on @{username} |
| `predict.staked` | پیش‌بینی شما: {amount} سکه روی {username} | Your prediction: {amount} coins on @{username} |
| `predict.addMore` | افزودن به پیش‌بینی | Add to your prediction |
| `predict.closed` | پیش‌بینی با اولین پرتاب تاس بسته شد. | Predictions closed at the first roll. |
| `predict.error.closed` | پیش‌بینی پیش از ثبت مبلغ شما بسته شد. هیچ سکه‌ای کسر نشد. | Predictions closed before your stake was placed. Nothing was charged. |
| `predict.error.otherSide` | شما قبلاً روی بازیکن دیگر پیش‌بینی کرده‌اید. فقط می‌توانید به همان طرف اضافه کنید. | You already predicted on the other player. You can add to that side only. |
| `predict.error.maxStake` | می‌توانید حداکثر {remaining} سکه‌ی دیگر روی این مسابقه پیش‌بینی کنید. | You can add up to {remaining} more coins on this match. |
| `predict.error.maxStakeReached` | به سقف پیش‌بینی برای این مسابقه رسیده‌اید. | You've reached the limit for this match. |
| `predict.error.poolFull` | مجموع پیش‌بینی‌های این مسابقه به سقف رسیده است. هیچ سکه‌ای کسر نشد. | This match's prediction pool is full. Nothing was charged. |
| `predict.blocked.player` | بازیکنان یک مسابقه نمی‌توانند روی آن پیش‌بینی کنند. | Players can't predict on their own match. |
| `predict.blocked.linked` | پیش‌بینی روی این مسابقه برای حساب شما در دسترس نیست. | Predictions on this match aren't available for your account. |
| `predict.blocked.referral` | چون شما و یکی از بازیکنان از طریق دعوت به هم مرتبط هستید، نمی‌توانید روی این مسابقه پیش‌بینی کنید. | You can't predict on this match because you and one of the players are connected by an invitation. |
| `predict.loadError` | اطلاعات پیش‌بینی بارگذاری نشد. | Couldn't load predictions. |
| `predict.firstHint` | تا پیش از اولین پرتاب تاس می‌توانید برنده را پیش‌بینی کنید. | You can predict the winner until the first roll. |
| `predict.result.won` | {username} برد. {payout} سکه دریافت می‌کنید. | @{username} won. You get {payout} coins. |
| `predict.result.lost` | {username} نبرد. مبلغ {amount} سکه‌ی شما به طرف برنده رسید. | @{username} didn't win. Your stake of {amount} coins went to the winning side. |
| `predict.result.refundedCancelled` | مسابقه لغو شد و همه‌ی مبالغ کامل برگردانده شد. | The match was cancelled, so every stake was returned in full. |
| `predict.result.refundedOneSided` | کسی روی یکی از بازیکنان پیش‌بینی نکرده بود، پس همه‌ی مبالغ کامل برگردانده شد. | Nobody predicted on one of the players, so every stake was returned in full. |
| `predict.result.held` | نتیجه‌ی این پیش‌بینی در حال بررسی است. پس از پایان بررسی، نتیجه را همین‌جا و در کیف پول خود می‌بینید. | This pool's result is under review. You'll see the outcome here and in your wallet when the review ends. |
| `predict.result.pending` | نتیجه به‌زودی در «پیش‌بینی‌های من» نمایش داده می‌شود. | The result will appear in My predictions shortly. |
| `predict.result.signWon` | +{amount} برد | +{amount} won |
| `predict.result.signLost` | −{amount} باخت | −{amount} lost |
| `predict.result.signRefunded` | +{amount} برگشت | +{amount} refunded |
| `predict.mine.title` | پیش‌بینی‌های من | My predictions |
| `predict.mine.intro` | پیش‌بینی‌های شما و نتیجه‌ی آن‌ها | Your predictions and their results |
| `predict.mine.match` | {a} در برابر {b} | @{a} vs @{b} |
| `predict.mine.pick` | انتخاب شما: {username} | Your pick: @{username} |
| `predict.mine.unknownMatch` | مسابقه‌ی {id} | Match #{id} |
| `predict.mine.status.open` | باز | Open |
| `predict.mine.status.closed` | در انتظار نتیجه | Waiting for result |
| `predict.mine.status.held` | در حال بررسی | Under review |
| `predict.mine.status.won` | برد | Won |
| `predict.mine.status.lost` | نبرد | Not won |
| `predict.mine.status.refunded` | برگشت داده شد | Refunded |
| `predict.mine.empty` | هنوز پیش‌بینی‌ای ثبت نکرده‌اید. | No predictions yet. |
| `predict.mine.emptyAction` | تماشای مسابقه‌های زنده | Watch live matches |
| `predict.mine.loadError` | پیش‌بینی‌ها بارگذاری نشد. | Couldn't load your predictions. |
| `predict.insufficient.changeStake` | تغییر مبلغ | Change stake |
| `errors.predictions.refused` | این پیش‌بینی ثبت نشد. هیچ سکه‌ای کسر نشد. | This prediction wasn't placed. Nothing was charged. |
| `errors.match.actionInvalid` | این کار الان ممکن نیست. | That isn't possible right now. |
| `errors.match.notFound` | مسابقه پیدا نشد. | Match not found. |
| `errors.match.reactionRejected` | این واکنش ارسال نشد. | That reaction wasn't sent. |
| `errors.match.notAPlayer` | شما بازیکن این مسابقه نیستید. | You're not a player in this match. |

`errors.match.*` wording is shared with match.md; if match.md defines them first, its wording wins.

Shared keys used: `common.back`, `common.close`, `common.retry`, `common.stillWorking`, `common.checkStatus`, `common.errorCode`, `common.lastUpdated`, `common.help`, `coins.cost`, `coins.tomanEquivalent`, `coins.balance`, `coins.balanceAfter`, `coins.shortfall`, `coins.insufficient.title`, `coins.getCoins`, `net.offline`, `net.offlineAction`, `account.suspended.actionBlocked`, `account.suspended.details`, `reactions.emoji.<key>`, `errors.wallet.*`, `errors.validation`, `errors.network`, `errors.generic`.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| LV-01 | Suspension banner (if any) → app bar (title, balance chip) → filter chips (each removable) → Filters button → hint (dismiss) → "New list" pill (when shown) → rows in order → nav |
| LV-02 | Sheet title (focused on open) → tier chips (radio group) → variant (radio group) → tournament (radio group) → sort (radio group) → Show matches → Clear filters. Close returns focus to "Filters". |
| LV-03 | Back → "Watching" label (count) → match info → menu → player B bar → board region (a single focusable region with the accessible move list, match.md MA-18 in read-only mode) → player A bar → Predict / Your prediction → Reactions |
| LV-04 | Note → emoji grid (one tab stop, arrow keys move) → close |
| PR-01 | Title (focused on open) → rule sentence → "?" link → side radio group (A, B) → stake field → chips → estimate (read after changes, polite) → Continue |
| PR-02 | Title (focused) → cost block (read as a list) → pool now → how it works → final note → primary → Back |
| LV-06 / LV-07 | Title (focused) → body → primary → secondary |
| PR-04 | Back → title → rows → Show more |

**Labels**

- Filter chip remove buttons: `live.filters.remove`.
- Row: a single accessible name `live.row.label` (players, score, meta, chips), not every sub-element separately.
- Spectator count: "{n} watching" (not the eye icon alone).
- Reactions button: `spectate.reactions.button`; during cooldown `spectate.reactions.cooldown`.
- Each emoji: `reactions.emoji.<key>`.
- Side cards: "{username}, {total} coins on this side", with `aria-checked`.
- "Predict" button: `predict.button`; when staked: `predict.staked`.

**Live regions (polite)**

- Dice values and move summaries for spectators, as match.md defines for the opponent's moves (the spectator can turn them off with the same setting as players).
- Player disconnect and return; the 30 s and 10 s warnings.
- Prediction open (once, on join), prediction closed, prediction placed, result.
- Pool totals are **not** announced on every update (too chatty); they are read when focus is in PR-01.
- Spectator reactions: not announced (decorative, frequent). The lane has `aria-hidden="true"`; a count of recent reactions is available in the Spectators panel at `md`/`lg`.

**Other rules**

- **Not color alone:** "Predictions open", "Your match", "Ended", tournament label, status chips (icon plus text); the selected side (check badge plus outline); win/loss in results (sign plus words).
- **Contrast:** 4.5:1 for all text, including the top strip over the 3D scene (solid backgrounds, P§13); chips 3:1 boundaries.
- **Targets:** every row, chip, emoji, and button ≥ 44 × 44 px; side cards ≥ 72 px tall.
- **Motion:** spectator reactions float only without reduced motion; otherwise they fade in place. The "New list" pill never animates the list itself. No flashing or pulsing on "Predictions open".
- **Text size 200%:** rows grow in height; the chips wrap; side cards stack; the cost block stacks label over value.

---

## 9. Acceptance criteria

1. With `config.spectating_enabled` false, `/live` shows the disabled state and `/match/[id]` for a non-player shows LV-06 "spectating off"; no socket join is attempted from LV-01.
2. `/live` renders rows in server order with tournament matches first; each tournament row has an icon-plus-text label.
3. Filters and sort write `?tier=&variant=&tournament=&sort=` to the URL; opening that URL restores them; "Clear filters" returns to no filters and "Most watched".
4. Auto-refresh every 15 s updates scores and counts in place without moving rows; order changes appear only after "Show" or pull-to-refresh. Refresh pauses when the tab is hidden or offline.
5. Opening a live match as a non-player sends `spectate.join`, shows the loader, and renders from `spectate.state`. No roll, confirm, undo, cube, resign, or move-highlight control exists in the DOM of the spectator view.
6. Join errors map exactly: `full` → LV-06 full with "Try again"; `disabled` → spectating off; `not_live` → finished summary (ended) or not available; `player` → player view without reload; `MATCH_NOT_FOUND` → not found.
7. `opponent.disconnected` shows the grace countdown on that player's bar for spectators, with warning states at 30 s and 10 s; `opponent.back` clears it.
8. Spectator reactions: only free emojis are offered; a second send within 3 s is blocked client-side with a visible cooldown; received ones never overlap the board area, bars, or dice; the "Show spectator reactions" switch hides them; players never receive them (server test).
9. `REACTION_REJECTED {reason: disabled}` removes the reactions button for the session and shows the note in LV-05.
10. The prediction panel is hidden when there is no open pool and no own prediction. When open: the rule sentence with the pool's percent, both totals, two unselected side cards, an empty stake field, and no active chip are shown before any input.
11. Continue stays disabled with a visible reason until a side and a valid stake are chosen. A stake above `remaining` shows `predict.error.maxStake` with the number.
12. PR-02 shows stake, toman equivalent, balance, balance after, both totals, `predict.howItWorks`, the estimate with its "estimate" tag, and the irreversibility note, before any charge. The primary label contains the amount and the player.
13. Double-tapping the primary sends exactly one request with one `Idempotency-Key`; "Check status" after 10 s never creates a second stake.
14. When the pool closes (via `pool.update {open:false}` or the opening `turn.rolled`) while PR-01 or PR-02 is open and nothing is in flight, the primary disables and `predict.error.closed` is shown; no request is sent.
15. With a stake on side A, the side B card is disabled with `predict.otherSideLocked`; the server's `other_side` refusal maps to the same state.
16. `blocked: referral` shows the referral text; `blocked: linked` shows only the generic text, with no mention of devices, IPs, or fraud.
17. After `match.ended`, the result shows won (+payout), not won (−stake), refunded (with the cancelled or one-sided reason), or under review, with signs and words. No shop link, no "predict again" prompt appears after a lost prediction.
18. Insufficient balance shows the P§9.1 sheet with "Change stake" first and "Get coins" as a text-style secondary; the stake field is empty when returning.
19. Suspended users can watch and see their predictions; the Predict button is disabled with the suspended reason; `ACCOUNT_SUSPENDED` maps to the same state.
20. PR-04 lists rows with players, pick, stake, and a status chip (icon plus text) for all six statuses; rows open `/match/[id]`; no row links to a replay.
21. Spectator view actions ("Predict", reactions) sit in the bottom 40% of the screen in portrait at 360 × 800, 390 × 844, and 430 × 932; all targets ≥ 44 × 44 px.
22. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape: no horizontal scroll, no clipped text at 200%, and the spectator view keeps the stake, side, and idempotency key across rotation.
23. All strings come from i18n keys with fa and en; every error code in §3.8 has a mapped state.

---

## 10. Open questions and API gaps

For the main agent unless noted. Q1–Q4 block parts of this spec.

1. **`pool` in the live list is always 0.** `LiveMatchesView` hardcodes `"pool": 0`, so the "Biggest prediction pool" sort does nothing and rows can't show an open pool. Proposal: fill `pool` (total staked) and add `pool_open: bool` per row. Until then the UI marks open pools by intersecting with `GET predictions/open`, and hides the pool sort (§5, predictions-disabled column rule applied).
2. **Pool state for one match.** There is no per-match pool read. `spectate.state` carries no pool fields, and `GET predictions/open` omits closed pools, so the client can't tell "closed" from "not eligible", and a late joiner doesn't see final totals. Proposal: add `pool: {open, total_a, total_b, rake_pct, max_stake_per_user, max_pool_total, blocked, my_side, my_stake} | null` to `spectate.state` (or `GET predictions/pool?match_id=`).
3. **The prediction window is only seconds long.** The pool opens at match creation and closes at the opening roll, which fires 1.5 s after both players connect (`OPENING_DELAY`). In practice spectators will almost never see an open pool, which makes PR-01 mostly unreachable (journeys.md open question 5). Proposal: a setting such as `predict.window_seconds` that delays the first roll of eligible matches, announced to players ("Match starts in 0:30") and to spectators as a real countdown. This is a product decision.
4. **`rake_pct` is not exposed.** `OpenPool` lacks the pool's snapshotted `rake_pct` (and `max_pool_total`), and `GET config` has no `predict.rake_pct`. `predict.howItWorks` and the estimate need it. Please add both to `OpenPool`.
5. **No rate limit on spectator reactions.** `spectate._react` has no per-connection limit (only the global 20 messages/s). Proposal: 1 per 3 s like players, with `REACTION_REJECTED {reason: rate}`.
6. **Spectator reactions switch and emoji list.** `live.spectator_reactions_enabled` is not in `GET config`, and the free emoji keys live only in `backend/realtime/reactions.py`. Proposal: `config.spectator_reactions_enabled` and `config.spectator_emojis: string[]`.
7. **`PredictionRow` lacks match context.** Rows carry `match_id` only; the list needs both usernames and the picked player's name (N extra `GET matches/{id}` calls today). Proposal: add `players: [a, b]` and `match_status`/`end_reason` to `PredictionRow`.
8. **Tournament context on live rows.** `LiveMatchRow` has `tournament_id` but no tournament name or round. Proposal: `tournament: {id, name, round, rounds} | null`. Also `packages/api-client` `matches.live` has no `tournament` parameter although the backend supports it.
9. **Spectator perspective.** Which player is at the bottom for `you: null`? Proposal: player A at the bottom, matching the side cards and score order. To be confirmed with match.md and `packages/game3d`.
10. **Spectator-only events consume the match `seq`.** `spectate.react` is emitted through `live.emit`, which increments `live.seq`, but it is published only to spectators. Players then see a gap in `seq` on every spectator reaction and trigger `match.sync`; spectators see the same gap because the store ignores `spectate.react`. This lets spectator activity add load to players (against §20.4). Proposal: send spectator-only events with `seq: 0` (like `pool.update`) outside the match sequence.
11. **Tournament matches have no pool.** `predictions.eligible` excludes tournament matches, which §7.5 does not list. Confirm this is intended (it is reasonable: entry is 0 in tournament matches).
12. **`tier_id` equals `entry`** in `LiveMatchRow`. The filter works because `?tier=` is compared to the entry, but the field name is misleading. Please return the real tier id or rename it.
13. **Spectator delay.** `live.spectator_delay_seconds` is not applied anywhere. Fine at the default 0; if it is ever raised, spectators need a "Delayed by {n} s" label, and the pool must close on the players' first roll, not the delayed one.
14. **Viewer role on `/match/[id]`** (ia.md open question 2) still applies: `GET matches/{id}` returns `you: null` for non-players, which is enough to choose the spectator view before the socket join. Please confirm this is the intended signal.
