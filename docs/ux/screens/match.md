# Match: the in-match game screen (player view)

Status: draft for UI build (CLAUDE.md §17 steps 5–8).
Surface: `m.` (Phase 1). Same route on `app.` in Phase 2 (§11.0 rule 7); the desktop layout is specified in Phase 2.
Sources: CLAUDE.md §1, §2 rules 1, 6, 10, 13; §5.1–§5.4; §6; §7.3; §8; §10.2 (Matches); §10.3 (every match event); §11.0 (input, shortcuts); §11.1; §11.3; §11.4; §11.6; §11.7; §12.1; §14 (`game.*`); §20.1, §20.4; §21.2; ia.md §3.4, §4; patterns.md (P§) 1, 3, 4, 6, 7, 8, 9, 11, 13, 14, 16, 17; journeys.md J1, J2, J4 step 6; personas P1 Reza, P3 Hamid, P4 Ali.
Related specs: `play.md` (entry points, PL-05, `play.variant.*`, `play.length.*`, `play.bot.*`), `live.md` (spectator view on the same route; reuses MA-01, MA-04, MA-06, MA-14, MA-18), `history-replay.md` (replay viewer, verify dice), `profile.md` (ST-01 settings: lite graphics, reduced animations, sound, vibration), `system.md` (`/unsupported`, offline), `tournaments.md` (tournament label and next round).

Screen IDs follow screen-inventory.md §2.3; MA-19 (waiting for the opponent to join, cancel match) is new.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET matches/{id}` | `MatchSummary`: `id`, `variant`, `length`, `entry`, `status` (`active`, `finished`, `aborted`, `voided`), `is_bot`, `players[2]` (`username`, `avatar`, `elo`, `is_bot`, `bot_level`), `you` (0, 1, or null), `winner`, `score`, `end_reason`, `seed_commit`, `created_at`, `ended_at`. Used to pick the view before the socket attaches. |
| WS `match.sync {last_seq}` (C→S) | Attaches the socket to the match as a player. `last_seq: 0` → a full `match.state`; otherwise the missed events, or a full `match.state` when they are no longer in the log. The api-client re-sends it after every reconnect. |
| WS `match.state` (S→C) | `MatchStateOut`: `match_id`, `status`, `you`, `players[2]` (`PlayerInfo`: `username`, `avatar`, `elo`, `level`, `is_bot`, `bot_level`, `board_theme`, `checker_theme`, `connected`), `variant`, `length`, `entry`, `seed_commit`, `score`, `game_no`, `crawford_game`, `phase` (`opening`, `roll`, `move`, `cube_offered`, `game_over`, `match_over`), `position`, `turn`, `dice`, `cube_value`, `cube_owner`, `can_double`, `legal`, `clock`, `timeouts[2]`, `results[]`, `winner`, `end_reason`, `spectators` |
| `Clock` | `actor` (whose clock runs, or null), `deadline` (epoch ms, = turn start + `turn_seconds` + that player's bank), `bank[2]` (seconds left in each time bank at the turn start), `turn_seconds`, `server_now` (epoch ms) |
| WS C→S actions | `turn.roll`, `turn.move {moves: [[from, to], …]}` (mover's numbering; 25 = bar, 0 = off), `cube.offer`, `cube.take`, `cube.drop`, `react.send {emoji_key}` or `{phrase_key}`, `match.resign {scope: game\|match}`. Game actions carry the last applied `seq`; a stale `seq` is answered with a fresh `match.state` and no error. |
| WS S→C events | See §3.3 (every type in `backend/realtime/protocol.py` `SERVER_MESSAGES` that a player receives) |
| `GET shop/items?kind=emoji_pack\|phrase_pack`, `GET phrases` | Owned reaction packs (`owned`, `data.keys`) and phrase texts (`text {fa, en}`) |

Server rules the UI relies on (`backend/realtime/live.py`, `backend/game/engine/match.py`, `backend/game/results.py`):

- **Server-authoritative (§2 rule 1):** the client never decides dice, legality, timers, or results. Local steps before Confirm are a preview built by `game-core` `TurnBuilder` from the server's `legal` list.
- **Opening roll:** scheduled 1.5 s after both human players have attached. `turn.rolled {opening: true, player: null, dice: [die_A, die_B]}`; a tie re-rolls 1.5 s later; otherwise the higher die starts and plays both numbers (no roll step).
- **Forced move:** exactly one legal play → the server plays it after 1 s (`turn.moved {auto: "forced"}`). **No legal play** → the turn passes after 1.5 s (`turn.passed`). The clock is stopped during both.
- **Clock:** one deadline per turn = `turn_seconds` + the mover's remaining time bank. Time used beyond `turn_seconds` is taken from the bank. The pre-roll phase is part of the turn. During a double offer the decider's clock runs.
- **Timeout:** `turn.timeout {player, count, limit}`. Then the server rolls if needed and plays the first legal move (`turn.moved {auto: "timeout"}`), or takes an unanswered double. `count` resets to 0 on the player's next own action (no event is sent for the reset). `count = limit` forfeits the match.
- **Disconnect:** when a player's last socket closes, `opponent.disconnected {player, grace_seconds}` goes to everyone; the turn clock keeps running; on expiry the player forfeits (`match.ended`, `reason: "forfeit:disconnect"`). Reattaching sends `opponent.back {player}`. A player who never attaches also forfeits after the grace period, but **no event** is sent for that case.
- **Abort:** a match that ends before its first roll (non-tournament) is aborted: entries refunded, unrated, `match.ended {winner: null, reason: "aborted:…", settlement: {refund}}`. This includes `match.resign {scope: match}` sent before the first roll (§10 Q4).
- **Resign:** any time before the match is over, on either player's turn. `game`: the opponent gets the current game's value: single, gammon (the resigner has borne off nothing), or backgammon (also a checker on the bar or in the winner's home board), times the cube. Not allowed between games (`game_over` phase → `MATCH_ACTION_INVALID {reason: scope}`). `match`: the opponent wins the match.
- **Cube (standard_cube only):** offer before rolling, when the cube is centered or owned, not in the Crawford game, cube < 64. Take → value doubles, owner = taker, the offerer rolls. Drop → the offerer wins the game at the current cube value.
- **Between games:** the next game starts 3 s after `game.ended` (`game.started`), then the opening roll 1.5 s later.
- **Reactions:** free emoji and phrase keys plus keys from owned packs; 1 per 3 s per player (`REACTION_REJECTED {reason: rate}`). Players' reactions go to the opponent and to spectators. Spectator reactions never reach players.
- **Spectators:** players get `spectators.count {count}` (throttled to 1 per 5 s) and `spectators` in `match.state`; never the list.
- **End of match:** `match.ended {winner, score, reason, seed, elo {a, b}, xp {a, b}, settlement}`. `reason`: `points`, `resign`, `forfeit:timeouts`, `forfeit:disconnect`, or `aborted:<cause>`. `settlement`: `{entry, pot, rake, payout}` for coin tables, `{refund}` when aborted with an entry, `null` for bot and tournament matches. Bot matches: `elo` and `xp` null.

---

## 1. Goal and user story

- As a player on a phone held in one hand (P1 Reza), I want the board and dice to fill the screen, with roll, move, undo, and confirm under my thumb, and nothing else in the way.
- As any player, I want to always know whose turn it is, how much time I have, the score, and whether the Crawford rule applies.
- As a player on unstable 4G, I want to never lose a match without having seen a warning and a countdown, and to know that my opponent sees my countdown too.
- As a player, I want to see exactly what I win or lose, in points, rating, XP, and coins, and to be able to check that the dice were fair.

Success means:
- In portrait, every primary game action sits in the bottom 40% of the screen.
- Every automatic action (forced move, pass, timeout move, auto-take, forfeit) is announced in text before or as it happens.
- No forfeit happens without a visible countdown for both players.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| `match.found` (play.md PL-07) | MA-01 loader → MA-02 |
| Bot match created (play.md PL-04) | MA-01 → MA-02 |
| App open with a running match (ia.md §4); PL-08 resume banner; `MATCH_IN_PROGRESS` "Return to match" | MA-01 (short on repeat visits) → MA-02 with the current state |
| Tournament round ready (tournaments.md) | MA-01 → MA-02 |
| Push notification "Your turn" (settings.md) | MA-02 |
| `/match/[id]` for a finished, aborted, or voided match (history row, deep link) | MA-14 |
| `/match/[id]` when the viewer isn't a player | `live.md` spectator view (LV-03) |

| Exit | Destination |
| --- | --- |
| MA-09 "Leave screen" | `/play` (PL-08 banner shows; the match continues) |
| MA-13 "Play again" | play.md PL-03 (coin table) or a new bot match (practice) |
| MA-13 "Search again" (aborted) | PL-03 |
| MA-13 / MA-14 "View replay", "Verify dice" | `/replay/[id]` (history-replay.md), `?verify=1` opens RP-02 |
| MA-13 "Back to lobby" | `/play` |
| MA-15 "View profile" | `/profile/[username]` (the match continues) |

---

## 3. Flow

### 3.1 Opening `/match/[id]`

1. `GET matches/{id}`:
   - `you` null → spectator view (`live.md`). Stop.
   - `status` ≠ `active` → MA-14 finished summary. Stop.
   - `NOT_FOUND` → MA-14 "not found" variant.
2. **WebGL2 check.** Missing → MA-17 in place; nothing is downloaded.
3. MA-01 loader: download the 3D engine and the two players' themes with determinate progress.
4. **When to attach** (`match.sync`):
   - **First entry to a new match** (arrived from `match.found` or bot creation in this session): attach when the scene is ready. The opening roll waits for both players to attach, so the first roll never happens while this player can't see the board. The loader says "Your opponent is waiting for you" once the download passes 10 s.
   - **Any other entry** (return, reload, app reopen): attach immediately, in parallel with the download, so a running disconnect grace stops at once. Events that arrive before the scene is ready are applied to the store; the board renders the latest state when ready (no replay of animations).
5. On `match.state`: build the view (`game-core` `fromState`), then MA-02.

### 3.2 Layout regions (portrait `sm`, reference 390 × 844)

Top to bottom. Everything except the board is an HTML overlay on solid backgrounds (§11.1, P§13).

| Region | Height (approx.) | Content |
| --- | --- | --- |
| Top strip | 48 px + safe area | Start: "Leave" (back arrow, mirrors). Center: score «۲ – ۱» (self – opponent), "First to {n}", Crawford label when on, tournament label when known (§10 Q5). End: spectator count (eye + number, only when ≥ 1), menu button. |
| Opponent bar | 56 px (2 lines at `xs`) | Avatar, username (or "Bot · {level}"), level and ELO (not for bots), checker swatch with its marking, pip count (`sm`+), clock, time-bank value, cube chip when the opponent owns it, status overlays (disconnected, timeouts), reaction bubble anchor |
| Board | Remaining height | 3D canvas only: board, checkers, dice. Rotated 90° to fill the width (§11.1). Centered cube chip on the board's side edge (HTML overlay) in the cube variant. Captions (opening roll, forced move, no legal move) as an HTML overlay at the board center that never covers checkers being moved. |
| Own bar | 56 px | Same as the opponent bar, plus the persistent timeout warning (MA-12) |
| Action bar | 88 px + safe area | Dice chips row (remaining dice, used ones struck through and dimmed, with text) above three slots: **start** (Undo or Double), **center** (Roll or Confirm, primary, ≥ 56 px tall), **end** (Reactions). All within the bottom 40% of the screen. |

The player's own checkers are always at the bottom (near the own bar). Board orientation and numbering never mirror with the UI direction (§11.1, P§11).

### 3.3 Server events → UI

Applied in `seq` order through `game-core` `apply`. A gap in `seq` → `match.sync` with the last applied `seq` (automatic).

| Event (key payload) | Store change | UI (this player) | Screen |
| --- | --- | --- | --- |
| `match.state` (full) | Replaces the view | Redraw without animation; close sheets that no longer apply; rebuild the action bar from `phase`, `turn`, `legal`, `can_double`; reopen MA-07 if `phase = cube_offered` and this player decides | MA-02 |
| `game.started {game_no, crawford, score, position}` | New game, `phase: opening`, cube reset | Checkers reset (animated gather; instant under reduced motion). Caption "Game {n}". If `crawford`: banner "Crawford game: no doubling this game" for 3 s and the Crawford label in the top strip for the whole game. | MA-02 |
| `turn.rolled {opening: true, dice [A, B]}` | Starter set, or tie | Both dice thrown; each die labeled with its player ("You: ۵", "@x: ۳"). Tie → caption "Tie: rolling again". Otherwise caption "You start with ۵–۳" / "@x starts with ۵–۳"; if this player starts, the moving state begins with those dice (no Roll). | MA-02 |
| `turn.rolled {player, dice, throw_seed, legal, clock}` | `phase: move` | Dice throw (§11.1; lite: 300 ms fade). If this player: `legal.length > 1` → moving state; `= 1` → caption "Only one move is possible. Playing it…" and input locked; `= 0` → caption "No legal move. Your turn passes." Opponent's roll: dice shown, caption "@x rolled ۶–۳". | MA-02 |
| `turn.moved {player, moves, hits, position, auto, clock}` | Position, turn passes | Opponent's move animates step by step; hit checkers go to the bar with a "Hit" marker (shape + text). Last-move arrows stay until this player rolls. `auto: forced` → caption "Forced move"; `auto: timeout` → caption "Time ran out: a move was played automatically". This player's own echo → no re-animation. | MA-02 |
| `turn.passed {player, clock}` | Turn passes | Caption "@x has no legal move" / "No legal move for you" (1.5 s, already shown on the roll) | MA-02 |
| `turn.timeout {player, count, limit}` | `timeouts[player] = count` | This player: in-bar notice "Time ran out ({count} of {limit})"; at `count = limit − 1` the persistent warning (MA-12). Opponent: the same notice on their bar. | MA-12 |
| `cube.update {action: offer, player, value, clock}` | `phase: cube_offered` | Offered to this player → MA-07. Offered by this player → action bar "Waiting for @x to take or drop"; the opponent's clock runs. | MA-07 |
| `cube.update {action: take, value, owner}` | Cube value and owner | Cube chip moves to the owner's bar showing "×{value}"; caption "@x took. The cube is now ×{value}." / "You took. The cube is ×{value} and yours." | MA-02 |
| `cube.update {action: drop}` | — | Followed by `game.ended {reason: drop}` | MA-13a |
| `game.ended {game_no, winner, kind, cube, points, reason, score}` | Score, results | MA-13a game card (skipped when the same batch ends the match) | MA-13a |
| `react.recv {key, kind, sender}` | — | Bubble near the sender's bar (MA-06), rendered in this player's locale | MA-06 |
| `opponent.disconnected {player, grace_seconds}` | `players[p].connected = false` | Opponent: MA-11 countdown on their bar. (Never delivered to the disconnected player.) | MA-11 |
| `opponent.back {player}` | `connected = true` | Opponent back → clear MA-11, toast "@x is back". This player back (after own reconnect) → toast "Reconnected". | MA-10 / MA-11 |
| `spectators.count {count}` | `spectators` | Count in the top strip updates in place; not announced | MA-02 |
| `match.ended {winner, score, reason, seed, elo, xp, settlement}` | `phase: match_over`, `seed` | Close every sheet and dialog; MA-13b | MA-13b |
| `error {code, message_key, details}` | — | §3.16 | — |

Client-only signals: api-client socket status `reconnecting` → MA-10; `open` after `reconnecting` → re-sync (automatic).

### 3.4 Clock and time bank

Values from `clock` (corrected with `server_now`, `game-core` `timeLeft`):

- `remaining` = `deadline` − server now.
- `turnLeft` = max(0, `remaining` − `bank[actor]`); `bankLeft` = min(`bank[actor]`, `remaining`).

Display rules:

1. The bar of `clock.actor` shows a ring (fraction of `turn_seconds`) and `turnLeft` as mm:ss. The time bank shows as a separate labeled value: "Time bank ۰۱:۳۰" (`match.clock.bank`).
2. When `turnLeft` reaches 0, the ring switches to the time bank: icon + "Time bank" + `bankLeft` counting down.
3. The other bar shows only its time bank value, static.
4. `actor` null (forced move, pass, between games, opening): no ring anywhere.
5. Thresholds (P§7): `remaining` ≤ 10 s → warning style (icon + text "۱۰ s left"), haptic and tick if enabled; ≤ 5 s → one screen-reader announcement. Under reduced motion, the ring is a static bar plus text.
6. The client never ends a turn itself; at 0 it waits for `turn.timeout` or the next event.

### 3.5 Your turn: roll, move, undo, confirm

1. `phase: roll`, `turn` = this player → caption "Your turn" on the own bar; haptic and chime if enabled (P§8). Action bar: start = "Double to ×{2v}" (only when `canDouble`; §3.8), center = "Roll".
2. **Roll** (button, Space, or a tap on the dice area of the board): send `turn.roll`; the button shows a spinner; repeat taps are ignored. The dice appear on `turn.rolled`.
3. **Moving state** (`legal.length > 1`): action bar start = "Undo" (disabled until a step exists), center = "Confirm move" (disabled until complete), end = Reactions. Dice chips show the remaining dice; doubles show four chips.
4. **Tap-tap** (§11.1):
   1. Tap an own checker on a point with a legal step (`TurnBuilder.sources()`): the top checker lifts and gets an outline; its legal destinations (`targets(from)`) show a ring-and-dot marker with the die value ("۵"); a bear-off destination shows an "Off" tray marker.
   2. Tap a destination → the step is applied locally (`move(from, to)`), with a short animation (instant under reduced motion); the used die chip is struck through.
   3. Tap another movable checker → the selection switches. Tap the selected checker again or an empty area → deselect.
   4. Tap a checker that can't move → light double pulse (if enabled) and the caption "This checker can't move now" (1.5 s).
   5. When exactly one point has movable checkers (for example entering from the bar), it is selected automatically.
5. **Drag:** press and move more than 8 px → drag starts; destinations show the same markers; hover (mouse) shows them too. Drop on a destination → step applied. Drop elsewhere → the checker returns, with a double pulse and the destinations kept visible.
6. **Undo** (button, Ctrl+Z): reverts the last local step. Nothing is sent. Undo is available until Confirm (§5.3).
7. **Complete** (`TurnBuilder.complete`): Confirm becomes enabled. If dice remain that can't be used, the chips show them as "can't be used" (icon + text) and a caption "The ۵ can't be used".
8. **Confirm** (button, Enter): send `turn.move {moves}`; Confirm and Undo show in-flight state; board input is locked. The echoed `turn.moved` ends the turn. On an error the server also sends `match.state`; the board resets to it (§3.16).
9. **First match hint** (P§14, once per account): at the first moving state, a dismissible hint above the action bar: "Tap a checker, then tap where it goes, or drag it. You can undo until you confirm."
10. Legal-move highlights appear only for this player's own turn, never for the opponent's.

### 3.6 Opening roll, forced move, no legal move

1. Opening roll (§3.3 row). Captions stay 1.5 s. The player who starts moves immediately; there is no Roll button.
2. Forced move: caption and locked input for 1 s, then `turn.moved {auto: forced}` animates. Undo and Confirm are hidden, not disabled, so nothing looks broken.
3. No legal move: the dice stay visible with the caption for 1.5 s, then `turn.passed`.
4. The same captions appear for the opponent's turns ("@x has only one possible move", "@x has no legal move").

### 3.7 Timeouts (MA-12)

1. On `turn.timeout` for this player: in-bar notice "Time ran out ({count} of {limit}). A move was played for you." (4 s, polite announcement).
2. At `count = limit − 1`: persistent warning in the own bar "One more timeout ends the match" (icon + text), haptic, announcement. It stays until the player's next own action is echoed (`turn.rolled` by this player not preceded by `turn.timeout`, `turn.moved` with `auto: null`, or a `cube.update` by this player), which resets the count on the server.
3. Opponent timeouts: the same notice on their bar; the warning at `limit − 1` shows on their bar too.
4. A double left unanswered is taken at timeout (§10.3); MA-07 says so in advance.
5. After a full `match.state`, `timeouts[]` is known but `limit` is not (§10 Q1): the warning uses the last `limit` seen in this session, else it shows "{count} timeouts in a row" without the "one more" wording.

### 3.8 Doubling cube (standard_cube only)

1. **Cube chip:** centered on the board's side edge ("×۱", accessible name "Cube: ×1, centered"); when owned, it sits in the owner's bar ("×۴", "Your cube" / "@x's cube"). Hidden in other variants.
2. **Crawford game:** the chip shows "Crawford: no doubling" and the Double button is hidden; the top strip shows the Crawford label with a "?" to `/help/variants`.
3. **Offer:** "Double to ×{2v}" in the start slot before rolling, when `canDouble` (store) is true. One tap sends `cube.offer`. No confirmation (P§3); the label states the new value. In flight: spinner.
4. While waiting: action bar center "Waiting for @x to take or drop"; the opponent's clock runs on their bar.
5. **Offered to this player (MA-07):** a blocking dialog (P§1):

   | Part | Content |
   | --- | --- |
   | Title | "@x offers to double to ×{2v}" |
   | Take | "Play this game for ×{2v}. You'll own the cube." Button "Take (×{2v})" |
   | Drop | "Give up this game. @x gets {points} point(s)." Plus "Score would be {self} – {opp}", and "(@x would win the match)" when that reaches the match length. Button "Drop (lose {points})" |
   | Timer | This player's clock (ring + text) inside the dialog |
   | Note | "If time runs out, the double is taken automatically and counts as a timeout." |

   Both buttons have equal size and weight; Drop carries a text label, not color alone. Focus starts on the title. Sending → in flight; the dialog closes on `cube.update`. `points` = variant points for a single game × current cube value.
6. The dialog is never hidden by another sheet. If a sheet is open when the offer arrives, the sheet closes first (focus returns to the dialog).

### 3.9 Reactions (MA-05, MA-06)

1. The Reactions button (end slot, label "Reactions") opens MA-05: tabs "Emojis" and "Phrases". Items: the free keys plus keys from owned packs (§10 Q9). Phrases are shown in this player's locale; the receiver sees them in theirs.
2. Note at the top of the sheet: "Your opponent and spectators see what you send."
3. One tap sends (`react.send`) and closes the sheet. The button then shows a 3 s cooldown (ring + seconds as text; the ring does not mirror). Taps during the cooldown do nothing and show "Wait a moment".
4. Bubbles (MA-06): next to the sender's bar, 3 s, one per bar (a new one replaces the old). They never cover the board's playing area, the dice, or the action bar. Under reduced motion they appear and fade without movement.
5. Menu switch "Show opponent's reactions" (device-local, default on). Off → the opponent's bubbles are not shown or announced; sending still works.
6. `REACTION_REJECTED {reason: rate}` → restart the cooldown silently. `{reason: unknown}` → drop it and refresh the pack list.
7. Reactions stay available on the opponent's turn and while the opponent is disconnected. They are unavailable while MA-07, MA-10, or MA-13b is open.

### 3.10 This player disconnects (MA-10)

1. Trigger: api-client status `reconnecting` while `status = active`, or the browser goes offline. Any open sheet or dialog closes first (P§6.4).
2. Blocking overlay over the board (the board stays visible behind a scrim):
   - Title "Connection lost. Reconnecting…" and "Attempt {n}".
   - Countdown "{mm:ss} to reconnect before you forfeit the match", counted locally from `game.reconnect_grace_seconds` of this match (§10 Q1).
   - Turn line: "It's your turn and your timer is running." or "Your turn timer runs as usual when your turn comes."
   - "Retry now" (forces an immediate reconnect attempt).
   - "Leave match screen" (MA-09 wording; leaving doesn't stop the countdown).
3. Warnings at 30 s and 10 s: text change, icon, haptic if enabled, announcement (P§6.4).
4. Countdown reaches 0 without a connection: the overlay says "The time to reconnect has run out. We'll show the result when you're back online." and keeps retrying.
5. On reconnect: the api-client re-sends `match.sync {last_seq}`. Missed events apply quickly (≤ 150 ms each, instantly under reduced motion) or a full `match.state` replaces the view. The overlay closes; toast "Reconnected". If `match.ended` is among them → MA-13b.

### 3.11 Opponent disconnects (MA-11)

1. On `opponent.disconnected {player, grace_seconds}`: non-blocking overlay on the opponent's bar: "Disconnected · {mm:ss} until they forfeit" (icon + text), counting down from `grace_seconds` at receipt. Polite announcement.
2. Warnings at 30 s and 10 s (text + icon + announcement).
3. The board stays usable: if it's this player's turn, they play normally. Reactions and the menu stay available.
4. `opponent.back` → the overlay clears; toast "@x is back".
5. Expiry → `match.ended {reason: forfeit:disconnect}` → MA-13b "@x didn't reconnect in time. You win the match."
6. After this player's own re-sync, `players[p].connected = false` is known but the remaining grace is not (§10 Q2): show "Disconnected" without a countdown, plus "They forfeit if they don't return in time."

### 3.12 Waiting for the opponent to join; cancel match (MA-19)

1. Condition: `status = active`, `game_no = 1`, `phase = opening`, no `turn.rolled` yet, and the opponent's `connected = false` (human opponents only).
2. A card over the board center: "Waiting for @x to join", elapsed time since attach, and "If @x doesn't join, the match is cancelled and your entry is refunded in full." (entry sentence only when `entry` > 0).
3. Way out: "Cancel match" → confirmation sheet: "Cancel this match? Both entries are refunded in full, and the match is unrated." Primary "Cancel match", secondary "Keep waiting". Sends `match.resign {scope: match}`, which the server treats as an abort before the first roll (§10 Q4).
4. The card closes on the first `turn.rolled` (the server sends no "joined" event; the opening roll follows 1.5 s after both have attached).
5. Also opened from play.md PL-07 "Cancel this match" (found-after-cancel race).

### 3.13 Resign (MA-08)

1. From the menu or from MA-09 "Resign…". Sheet with two option cards; none selected; "Cancel" has default focus (P§3).

   | Option | Text | Available |
   | --- | --- | --- |
   | Resign this game | "@x gets {points} points ({kind}, cube ×{cube})." "Score after: {self} – {opp}." Plus "This ends the match: @x wins." when it reaches the match length. | Not in `game_over` (between games): disabled with "The next game is about to start." |
   | Resign the match | "@x wins the match." Coin table: "You lose your entry of {entry} coins; @x receives {payout}." Rated: "Your rating changes as for a loss." Bot: "Practice match: no coins or rating involved." | Always while active |

2. Before the first roll of the match, the match option is replaced by "Cancel match" with the MA-19 wording, because the server aborts and refunds.
3. **Points preview** (display only; the server decides): `kind` from the current position with the same rule as the engine's `loss_kind` (single if the resigner has borne off at least one checker; backgammon if none borne off and a checker is on the bar or in the opponent's home board; else gammon); `points` = variant points for `kind` × cube value. The traditional variant needs its point table from the server (§10 Q1).
4. The primary button appears after choosing: "Resign game" or "Resign match" (destructive style + icon + text). In flight: spinner; the sheet can't be dismissed; it closes on `game.ended` or `match.ended`.

### 3.14 Leaving the screen (MA-09)

1. Triggers: back gesture or button, the top-strip "Leave", the menu item, Esc (when no sheet is open).
2. Sheet: title "Leave the match screen?"; body "The match keeps going. Your turn timer runs while you're away." + "It's your turn now." when it is + "If time runs out, a move is played for you; {limit} timeouts in a row end the match."
3. Actions: "Stay" (primary, default focus), "Leave screen", "Resign…" (opens MA-08).
4. "Leave screen" → `/play`. The app shell keeps the socket attached to the match (no disconnect grace starts), shows PL-08, and delivers "Your turn" as a snackbar outside the match (P§1 exception: turn notices only). Closing the app or tab is a disconnect.
5. While a match is active, the page registers `beforeunload` so closing the tab on a desktop browser asks first (the browser's own prompt).

### 3.15 Game end and match end (MA-13)

**MA-13a Game ended (the match continues):**

1. A card over the board center (board visible), shown from `game.ended` until `game.started` (about 3 s):
   - "You won game {n}" / "@x won game {n}"
   - Kind and value: "Single / Gammon / Backgammon · cube ×{cube} · {points} point(s)" (+ / − sign and words, not color alone)
   - Reason: "by bearing off", "@x declined the double" / "You declined the double", "@x resigned the game" / "You resigned the game"
   - "Score: {self} – {opp} · First to {n}"
   - "Next game starting…"
2. No buttons; it does not block the menu. It's announced politely.

**MA-13b Match ended:**

1. A non-dismissible sheet (centered dialog at `md`/`lg`); only its buttons close it. For forfeits and cancellations the reason is the first line, which covers the P§1 "match ended by forfeit" dialog.
2. Content, top to bottom:

   | Part | Content |
   | --- | --- |
   | Headline | "You won the match" / "@x won the match" / "Match cancelled" (aborted) |
   | Reason | `points` → "Final score reached"; `resign` → "@x resigned the match" / "You resigned the match"; `forfeit:timeouts` → "@x ran out of time {limit} times in a row" / "You ran out of time {limit} times in a row"; `forfeit:disconnect` → "@x didn't reconnect in time" / "You were disconnected for too long"; `aborted:*` → "The match ended before the first roll." |
   | Score | Final «{self} – {opp}», and the game list (game n: winner, kind, points) from `results` |
   | Coins (coin table) | Win: "Entry −{entry}", "Pot {pot}", "Platform fee −{rake}", "You receive +{payout}", "Net +{payout − entry}". Loss: "Entry −{entry}", "Net −{entry}". Words and signs, equal visual weight for win and loss (P§9.2). |
   | Coins (aborted with entry) | "Your entry of {refund} coins was refunded." |
   | Rating | "Rating +{d}" / "Rating −{d}" with the word "up" / "down" (from `elo.a` or `elo.b`) |
   | XP | "+{xp} XP" |
   | Bot match | "Practice match: no rating, coin, or XP changes." instead of the three rows above |
   | Tournament match | "Tournament match: the bracket updates now." with "View bracket" (§10 Q5) instead of the coin rows |
   | Fair dice | "The match seed is now published. Anyone who played can check every roll." Seed (monospace, LTR, middle-truncated, copy button) and "Verify dice" → `/replay/[id]?verify=1` |
   | Privacy note | "Only you and @x can watch this replay." |

3. Actions:

   | Outcome | Primary | Secondary |
   | --- | --- | --- |
   | Coin table, won or lost | "Play again" → PL-03 with the same tier, variant, and length | "View replay", "Back to lobby" |
   | Coin table, lost, balance < entry | "Play again" disabled with "Not enough coins for this table"; below it the PL-05 `afterLoss` options (lower tiers, bot) inline. **No shop link.** | "View replay", "Back to lobby" |
   | Bot match | "Play again" (same level, variant, length; free, starts at once) | "View replay", "Back to lobby" |
   | Aborted | "Search again" → PL-03 | "Back to lobby" |
   | Tournament | "View bracket" | "View replay", "Back to lobby" |
   | Suspended account | "Play again" disabled with `account.suspended.actionBlocked` | as above |

4. Copy rules (P§9): no "win it back", no shop link, no purchase mention after a loss.

### 3.16 Errors (WebSocket and REST)

| Code / event | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `MATCH_ACTION_INVALID {reason: not_legal \| format \| range}` + `match.state` | `turn.move` | Board resets to the server state; toast "That move wasn't accepted. The board has been updated." | `errors.match.actionInvalid` | `match.error.moveRejected` |
| `MATCH_ACTION_INVALID {reason: phase \| turn \| must_move}` + `match.state` | any game action | Reset to state; toast "The game moved on. The board has been updated." | ← | `match.error.stale` |
| `MATCH_ACTION_INVALID {reason: cube}` + `match.state` | `cube.offer` | Toast "You can't double now." | ← | `match.error.cube` |
| `MATCH_ACTION_INVALID {reason: scope}` + `match.state` | `match.resign {game}` | MA-08 action error "The next game is about to start. You can resign the match instead." | ← | `match.error.resignScope` |
| `MATCH_ACTION_INVALID {reason: ended}` + `match.state` | any | Close sheets; show the ended state from `match.state` | ← | `match.error.ended` |
| `MATCH_ACTION_INVALID {reason: busy}` + `match.state` | any | Toast "The server is busy. Try again." Local steps are rebuilt from the state. | ← | `match.error.busy` |
| Stale `seq` (a `match.state` with no error) | game actions | Replace the view; if unsent local steps were discarded, toast `match.error.stale` | — | `match.error.stale` |
| `MATCH_NOT_A_PLAYER` | `match.sync` | Switch to the spectator view (`live.md`) without a reload | `errors.match.notAPlayer` | — |
| `MATCH_NOT_FOUND` | `match.sync` | MA-14 not-found variant | `errors.match.notFound` | `match.notFound.title` |
| `MATCH_NOT_ATTACHED` | any action | Re-send `match.sync`; drop the action; toast `match.error.stale` | `errors.match.notAttached` | — |
| `REACTION_REJECTED {reason: rate \| unknown}` | `react.send` | §3.9 step 6 | `errors.match.reactionRejected` | — |
| `BAD_MESSAGE` | any | Client bug: `errors.generic` + code | `errors.ws.badMessage` | — |
| Socket close 4008 (rate limit) or any close | — | MA-10 reconnect flow | — | `match.reconnect.title` |
| `NOT_FOUND` (404) | `GET matches/{id}` | MA-14 not-found variant | `errors.notFound` | `match.notFound.title` |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` | REST, ws-token | api-client refreshes once; else SY-08 after the match screen shows "Signed out" | `errors.unauthenticated` | — |
| `AUTH_BANNED` | REST, ws-token | `/login` with AU-14 | `errors.auth.banned` | — |
| Any other | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

---

## 4. Screen list

### MA-01 3D loading (in place on `/match/[id]`)

- Header: match summary ("@x · {variant} · First to {n}", or "Practice vs Bot ({level})"), opponent avatar.
- Determinate progress bar (mirrors), percent, "{mb} MB left" (from the build's asset manifest), rotating tips (at most every 5 s; static under reduced motion).
- Loads under 300 ms show nothing (no flash).
- No progress for 10 s → "This is taking longer than usual." + "Try again" + "Cancel".
- "Cancel": for a player in an active match, opens MA-09 (Stay / Leave screen / Resign) with the timer note; otherwise returns to the previous screen.
- First entry and download past 10 s: "Your opponent is waiting for you." (§3.1 step 4).

### MA-02 Game screen

- Regions as §3.2. Action bar states:

  | Phase / condition | Start slot | Center (primary) | End slot | Caption / dice chips |
  | --- | --- | --- | --- | --- |
  | `opening`, waiting for the opponent to join | — | — | Reactions | MA-19 card |
  | `opening`, both joined | — | — | Reactions | "Opening roll" |
  | `roll`, this player's turn | "Double to ×{2v}" (only when allowed) | "Roll" | Reactions | "Your turn" |
  | `roll`, opponent's turn | — | — (caption "@x's turn" in the slot) | Reactions | — |
  | `move`, this player, > 1 legal play | "Undo" | "Confirm move" | Reactions | Dice chips |
  | `move`, this player, 1 legal play | — | — | Reactions | "Only one move is possible. Playing it…" |
  | `move`, this player, 0 legal plays | — | — | Reactions | "No legal move. Your turn passes." |
  | `move`, opponent | — | — | Reactions | "@x is moving" (bots: "Bot is thinking") |
  | `cube_offered`, offered by this player | — | "Waiting for @x to take or drop" | Reactions | — |
  | `cube_offered`, offered to this player | MA-07 dialog | | | |
  | `game_over` | — | — | Reactions | MA-13a card |
  | `match_over` | MA-13b | | | |

- Legal destinations: ring-and-dot marker + die number. Movable sources: a thin ring marker at the start of the moving state. Selected checker: lift + outline. Last opponent move: arrow shapes. Hit: "Hit" marker. Checker ownership: each player's checkers carry a distinct rim marking, repeated as a swatch in that player's bar, so ownership never relies on color (§10 Q10).
- Bot opponent: "Bot" label (icon + text) and level in the bar; no ELO; no profile link.

### MA-03 Match menu (sheet; the start panel section at `lg`)

- Items: Match info (variant, length, entry and winner payout or "Practice", "Rated" or "Unrated", Crawford status, fair-dice commitment `seed_commit` with copy and "?" → `/help/fair-dice`), Spectators ("{n} watching. Spectators see the board and both players' reactions. You can't see who they are."), Move history (MA-04), Move entry by keyboard or screen reader (MA-18), Show opponent's reactions (switch), Sound (switch), Vibration (switch; hidden when unsupported), Lite graphics (switch), Help (`/help/variants`), Leave match screen (MA-09), Resign (MA-08).
- Settings switches write the same preferences as ST-01 (`PATCH me` prefs) and apply at once, without reloading the scene.

### MA-04 Move history and pip counts (sheet at `sm`; side panel at `md`/`lg`)

- Pip counts for both players at the top ("Your pips {n} · @x {m}").
- Per game (newest game first, collapsible): turns in order: "@x ۶–۳: 24/18, 13/10*" in the mover's own numbering (`*` = hit, with the word "hit" in the accessible name); markers "forced", "timeout", "no move"; cube actions ("doubled to ×2", "took", "declined"); game result line.
- Read-only. Tapping an entry does nothing during a live match.

### MA-05 Reactions picker (sheet at `sm`; popover at `md`; always-visible strip in the end panel at `lg`)

- As §3.9. Grid items ≥ 44 × 44 px; phrases as full-width rows.

### MA-06 Reaction bubble (overlay)

- As §3.9 step 4.

### MA-07 Double offered (dialog)

- As §3.8 step 5.

### MA-08 Resign (sheet; centered dialog at `md`/`lg`)

- As §3.13.

### MA-09 Leave match screen (sheet; centered dialog at `md`/`lg`)

- As §3.14.

### MA-10 Reconnecting, this player (blocking overlay)

- As §3.10.

### MA-11 Opponent disconnected (overlay on the opponent's bar)

- As §3.11.

### MA-12 Timeout notices and warning (in the bars)

- As §3.7.

### MA-13 Results: MA-13a game card, MA-13b match result sheet

- As §3.15.

### MA-14 Finished-match summary (`/match/[id]` when not active)

- Data: `GET matches/{id}`.
- Content: headline (won, lost, cancelled, voided), reason (from `end_reason`, same strings as MA-13b), final score, variant, length, table entry or "Practice vs Bot ({level})", date and time (Jalali in fa).
- Player: "Watch replay" (primary) → `/replay/[id]`, with the note "Only you and @x can watch this replay." No share or copy-link action.
- Non-player: the same summary without any replay link (`live.md` LV-07 rules).
- Rating, XP, and coin rows appear only when the API returns them (§10 Q6).
- Variants: "Match not found" ("Check the link, or open your match history.", actions "Match history", "Back to lobby"); "Match cancelled" ("The match ended before the first roll. Entries were refunded in full.").

### MA-15 Player peek (sheet from an avatar)

- Avatar, username, level, ELO, "View profile" (with "The match keeps going while you look." when it's this player's turn). Bot: "Bot ({level})", no profile link.

### MA-16 Lite-mode suggestion (snackbar)

- Frame rate below 30 fps for 10 s during play (not while loading), lite graphics off → snackbar at the top of the board (never over the action bar), 8 s: "The game is running slowly on this device." Action "Turn on lite graphics". Once per session. Never enabled automatically (§11.6).

### MA-17 Device not supported (in place, or `/unsupported`)

- Title "This device can't show the 3D board". Body: "The game needs WebGL 2. Update your browser or try another device." Requirements link → `/help/lite-mode`.
- For a player in an active match: "Your match is still running and your turn timer keeps running. Continue on another device, or resign." Actions: "Resign match" (MA-08, match option only), "Back to lobby".
- Otherwise: "Back".

### MA-18 Move entry by keyboard or screen reader (sheet at `sm`; start-panel section at `md`/`lg`)

- Opened from the menu, or by pressing Enter on the focused board region.
- Content: remaining dice; "Checkers you can move": a list of points in the player's own numbering ("Point 13, 5 checkers", "Bar, 1 checker"); choosing one lists its destinations ("To point 7, uses 6", "Bear off, uses 5"); choosing a destination makes the step. Undo and Confirm move buttons repeat the action bar ones.
- "Read the board" button: a text summary ("Your checkers: 6 ×5, 8 ×3, 13 ×5, 24 ×2. @x's checkers (your numbering): …; bar and borne-off counts").
- The opponent's last move is always available as text at the top.
- Spectators (`live.md`) get the read-only version: board summary and last move.

### MA-19 Waiting for the opponent to join (card on the board) and Cancel match (sheet)

- As §3.12.

---

## 5. States

| State | MA-01 / MA-02 | Sheets and dialogs | MA-13 / MA-14 |
| --- | --- | --- | --- |
| **Loading** | MA-01 with determinate progress, Cancel, and the slow state; repeat visits under 1 s from the service-worker cache | Pack list in MA-05: skeleton grid | MA-14: skeleton of the summary |
| **Empty** | n/a | MA-04 before the first move: "No moves yet." MA-05 phrases tab with only free phrases: normal | MA-14 with no games played (aborted): "Match cancelled" variant |
| **Error** | §3.16; the board always falls back to the last server state | Action errors inside MA-07 / MA-08 | MA-14 load error: screen error + Retry |
| **Offline** | Same as reconnecting (MA-10) | Sheets close; MA-10 on top | MA-14 from cache if visited; else `/offline` content |
| **Reconnecting** | MA-10 blocking overlay with the forfeit countdown (self); MA-11 on the opponent's bar (opponent) | Closed first, re-opened from state after sync (MA-07) | MA-13b shown after sync if the match ended |
| **Insufficient coins** | n/a | n/a | MA-13b "Play again" disabled with `match.result.playAgainUnaffordable` + PL-05 `afterLoss` options inline; no shop link |
| **Suspended** | The match plays to the end (§12.1); no banner in the immersive view | — | "Play again" / "Search again" disabled with `account.suspended.actionBlocked` + "Details"; replay and lobby work |
| **Banned** | The session ends on its next token refresh; the screen shows `match.signedOut` "You've been signed out." with "Log in" (→ AU-14) | — | — |
| **First-time user** | First-match hint (§3.5 step 9); captions for opening roll and forced moves always shown | "?" links in MA-03 and MA-07 | Verify-dice line explained in one sentence |
| **Bot match** | "Bot" label, "Bot is thinking" caption; no spectator count; no MA-19 | MA-08 without coins or rating text | "Practice match" rows |
| **Crawford game** | Label in the top strip; cube chip "Crawford: no doubling"; no Double button | MA-03 states it | — |
| **Lite mode** | Dice fade in over 300 ms at rest (no throw), simpler shadows and checker animation (§11.6) | Switch in MA-03 | — |
| **Reduced motion** | Checker and UI animations shortened; bubbles fade; no confetti or bounce; timers as static bars (P§8). Dice throw: see §10 Q11. | Sheets appear without slide | No celebration animation |
| **WebGL2 missing** | MA-17 | — | MA-14 works (no 3D) |

---

## 6. Responsive notes (§11.7)

| Viewport | Board and panels | Controls |
| --- | --- | --- |
| `xs` 320–359 | Portrait: board rotated to fill the width; 2-line bars; pip counts only in MA-04; top strip shows score and menu, the spectator count moves into MA-03 | Action bar slots keep ≥ 44 px; the Double label shortens to "×{2v}" with its full accessible name |
| `sm` 360 × 800, 390 × 844, 430 × 932 | Portrait as §3.2 | Everything primary within the bottom 40% (at 844 px height: below y = 506) |
| Landscape phones (height < 500 px) | Natural board orientation, centered; the opponent bar and own bar stack in the start column (opponent top, self bottom); the top-strip items move into the start column header | Action controls as a vertical column on the end edge, primary in the lower half; Reactions below the primary |
| `md` 768 × 1024 (portrait tablet) | Natural board orientation, full width (the rotated board would not fit the height); bars above and below; move history and reactions open as end-edge side sheets (max 360 px) over the board edge, not pushing it | Action bar at the bottom as on phones |
| `md` landscape (600–1023 wide) | Board plus one end panel (280–320 px) with tabs: Moves · Reactions · Match info | Action controls below the board, centered |
| `lg` 1024 × 768 | Board plus the end panel; the start panel is collapsed to a toggle so checkers keep a comfortable size (§10 Q12) | Below the board; keyboard shortcuts in tooltips |
| `lg` 1440 × 900 | Shell max 1280: start panel (move history, reactions log), board centered, end panel (match info, spectator count, reactions strip). Players never see a prediction pool. | Below the board; hover highlights legal destinations |

- Rotation and width changes re-frame the 3D camera without reloading the scene and keep: the local `TurnBuilder` steps, the selected checker, open sheets, the MA-07 dialog, and all timers (§11.7).
- `dvh`/`svh` only; the top strip and action bar respect `env(safe-area-inset-*)`.
- Keyboard on `m.` (§11.0): Space roll, Enter confirm, Ctrl+Z undo, D offer double, R reactions, M menu, Esc close sheet / open MA-09. Shortcuts are listed in MA-03. None act while a dialog is open, except its own buttons.
- Mouse: hover shows legal destinations for the checker under the pointer during this player's moving state.

---

## 7. RTL/LTR notes and i18n keys

- fa first. The UI (top strip, bars, action bar slots, sheets) mirrors: start is on the right in fa. The 3D board, checkers, dice, board numbering, the cube, and timer rings never mirror (§11.1, P§11).
- The Undo icon mirrors and always has its text label; the Leave (back) arrow mirrors.
- Score is always "self – opponent" in reading order, wrapped in `<bdi>`. Timers are `<bdi dir="ltr">` mm:ss in locale digits. Dice values in captions use locale digits («۶–۳»).
- Move notation (MA-04, MA-18) uses point numbers in locale digits, with `/` kept LTR inside `<bdi dir="ltr">`.
- The seed and `seed_commit` are hex, always LTR, Latin characters, monospace.
- Usernames are LTR-isolated with `@` in running text. Bots use `play.bot.name`, never the raw `bot_easy` username.
- Emoji names: `reactions.emoji.<key>`; phrases: the `GET phrases` text in the viewer's locale, with `reactions.phrase.<key>` as the fallback for the free set. Terms for gammon and backgammon in fa need native review (§10 Q13).

| Key | fa | en |
| --- | --- | --- |
| `match.leave` | خروج از صفحه‌ی مسابقه | Leave match screen |
| `match.menu` | منوی مسابقه | Match menu |
| `match.score` | {self} – {opp} | {self} – {opp} |
| `match.scoreLabel` | امتیاز: شما {self}، {username} {opp} | Score: you {self}, @{username} {opp} |
| `match.firstTo` | تا {n} امتیاز | First to {n} |
| `match.crawford.label` | دست کرافورد | Crawford game |
| `match.crawford.banner` | دست کرافورد: در این دست دوبل ممکن نیست. | Crawford game: no doubling this game. |
| `match.crawford.cube` | کرافورد: بدون دوبل | Crawford: no doubling |
| `match.spectators` | {count, plural, one {# نفر در حال تماشا} other {# نفر در حال تماشا}} | {count, plural, one {# watching} other {# watching}} |
| `match.spectators.detail` | {count, plural, one {# نفر} other {# نفر}} این مسابقه را تماشا می‌کنند. تماشاگران صفحه و واکنش‌های هر دو بازیکن را می‌بینند. شما نمی‌بینید چه کسانی هستند. | {count, plural, one {# person is} other {# people are}} watching. Spectators see the board and both players' reactions. You can't see who they are. |
| `match.bar.you` | شما | You |
| `match.bar.levelElo` | سطح {level} · امتیاز {elo} | Level {level} · Rating {elo} |
| `match.bar.pips` | پیپ {n} | Pips {n} |
| `match.bar.label` | {name}، {pips} پیپ، زمان {time}، زمان ذخیره {bank} | {name}, {pips} pips, time {time}, time bank {bank} |
| `match.clock.bank` | زمان ذخیره {time} | Time bank {time} |
| `match.clock.usingBank` | استفاده از زمان ذخیره | Using time bank |
| `match.clock.warning` | {seconds} ثانیه مانده | {seconds} s left |
| `match.clock.fiveLeft` | پنج ثانیه مانده است | Five seconds left |
| `match.turn.yours` | نوبت شما | Your turn |
| `match.turn.theirs` | نوبت {username} | @{username}'s turn |
| `match.turn.moving` | {username} در حال حرکت است | @{username} is moving |
| `match.turn.botThinking` | ربات در حال فکر کردن است | Bot is thinking |
| `match.action.roll` | انداختن تاس | Roll |
| `match.action.confirm` | تأیید حرکت | Confirm move |
| `match.action.undo` | برگشت حرکت | Undo |
| `match.action.double` | دوبل به ×{value} | Double to ×{value} |
| `match.action.doubleShort` | ×{value} | ×{value} |
| `match.action.reactions` | واکنش‌ها | Reactions |
| `match.action.waitingCube` | منتظر پاسخ {username} به دوبل | Waiting for @{username} to take or drop |
| `match.dice.label` | تاس‌ها: {a} و {b} | Dice: {a} and {b} |
| `match.dice.used` | {value} استفاده شد | {value} used |
| `match.dice.unusable` | {value} قابل استفاده نیست | The {value} can't be used |
| `match.game.number` | دست {n} | Game {n} |
| `match.opening.title` | پرتاب شروع | Opening roll |
| `match.opening.yourDie` | شما: {value} | You: {value} |
| `match.opening.theirDie` | {username}: {value} | @{username}: {value} |
| `match.opening.tie` | مساوی: دوباره انداخته می‌شود | Tie: rolling again |
| `match.opening.youStart` | شما با {a}–{b} شروع می‌کنید | You start with {a}–{b} |
| `match.opening.theyStart` | {username} با {a}–{b} شروع می‌کند | @{username} starts with {a}–{b} |
| `match.rolled.theirs` | {username} {a}–{b} آورد | @{username} rolled {a}–{b} |
| `match.forced.yours` | فقط یک حرکت ممکن است. در حال انجام… | Only one move is possible. Playing it… |
| `match.forced.theirs` | {username} فقط یک حرکت ممکن دارد | @{username} has only one possible move |
| `match.forced.done` | حرکت اجباری | Forced move |
| `match.noMove.yours` | حرکت مجازی ندارید. نوبت شما رد می‌شود. | No legal move. Your turn passes. |
| `match.noMove.theirs` | {username} حرکت مجازی ندارد | @{username} has no legal move |
| `match.auto.timeout` | زمان تمام شد: یک حرکت به‌طور خودکار انجام شد | Time ran out: a move was played automatically |
| `match.move.hit` | زده شد | Hit |
| `match.move.cantMove` | این مهره الان نمی‌تواند حرکت کند | This checker can't move now |
| `match.move.selected` | مهره‌ی خانه‌ی {point} انتخاب شد. مقصدهای ممکن: {targets} | Checker on point {point} selected. Possible destinations: {targets} |
| `match.move.target` | خانه‌ی {point} با تاس {die} | Point {point} with the {die} |
| `match.move.bearOff` | خارج کردن با تاس {die} | Bear off with the {die} |
| `match.move.off` | بیرون | Off |
| `match.move.summary` | {username} بازی کرد: {moves} | @{username} played {moves} |
| `match.hint.firstMove` | روی یک مهره بزنید و بعد روی مقصد آن، یا آن را بکشید. تا پیش از تأیید می‌توانید حرکت را برگردانید. | Tap a checker, then tap where it goes, or drag it. You can undo until you confirm. |
| `match.timeout.notice` | زمان تمام شد ({count} از {limit}). یک حرکت به جای شما انجام شد. | Time ran out ({count} of {limit}). A move was played for you. |
| `match.timeout.noticeTheirs` | زمان {username} تمام شد ({count} از {limit}) | @{username} ran out of time ({count} of {limit}) |
| `match.timeout.lastWarning` | یک وقت‌تمام‌شدن دیگر، مسابقه را تمام می‌کند | One more timeout ends the match |
| `match.timeout.countOnly` | {count} بار پشت سر هم زمان تمام شده است | {count} timeouts in a row |
| `match.cube.label` | مکعب دوبل ×{value} | Doubling cube ×{value} |
| `match.cube.centered` | مکعب: ×{value}، وسط | Cube: ×{value}, centered |
| `match.cube.yours` | مکعب شما | Your cube |
| `match.cube.theirs` | مکعب {username} | @{username}'s cube |
| `match.cube.tookTheirs` | {username} قبول کرد. مکعب الان ×{value} است. | @{username} took. The cube is now ×{value}. |
| `match.cube.tookYours` | قبول کردید. مکعب ×{value} و در اختیار شماست. | You took. The cube is ×{value} and yours. |
| `match.cube.offer.title` | {username} پیشنهاد دوبل به ×{value} می‌دهد | @{username} offers to double to ×{value} |
| `match.cube.offer.take` | این دست را با ×{value} ادامه دهید. مکعب در اختیار شما قرار می‌گیرد. | Play this game for ×{value}. You'll own the cube. |
| `match.cube.offer.drop` | این دست را واگذار کنید. {username} {points, plural, one {# امتیاز} other {# امتیاز}} می‌گیرد. | Give up this game. @{username} gets {points, plural, one {# point} other {# points}}. |
| `match.cube.offer.scoreAfter` | امتیاز می‌شود {self} – {opp} | Score would be {self} – {opp} |
| `match.cube.offer.wouldWin` | ({username} مسابقه را می‌برد) | (@{username} would win the match) |
| `match.cube.offer.takeCta` | قبول (×{value}) | Take (×{value}) |
| `match.cube.offer.dropCta` | رد (باخت {points}) | Drop (lose {points}) |
| `match.cube.offer.timeoutNote` | اگر زمان تمام شود، دوبل به‌طور خودکار قبول می‌شود و یک وقت‌تمام‌شدن حساب می‌شود. | If time runs out, the double is taken automatically and counts as a timeout. |
| `match.reactions.title` | واکنش‌ها | Reactions |
| `match.reactions.emojis` | شکلک‌ها | Emojis |
| `match.reactions.phrases` | جمله‌ها | Phrases |
| `match.reactions.note` | حریف و تماشاگران آنچه می‌فرستید را می‌بینند. | Your opponent and spectators see what you send. |
| `match.reactions.wait` | کمی صبر کنید | Wait a moment |
| `match.reactions.cooldown` | {seconds} ثانیه تا واکنش بعدی | {seconds} s until the next reaction |
| `match.reactions.received` | {username}: {text} | @{username}: {text} |
| `match.reactions.showOpponent` | نمایش واکنش‌های حریف | Show opponent's reactions |
| `match.reconnect.title` | اتصال قطع شد. در حال اتصال دوباره… | Connection lost. Reconnecting… |
| `match.reconnect.attempt` | تلاش {n} | Attempt {n} |
| `match.reconnect.countdown` | {time} برای اتصال دوباره پیش از باخت مسابقه | {time} to reconnect before you forfeit the match |
| `match.reconnect.yourTurn` | نوبت شماست و زمان شما در حال گذشتن است. | It's your turn and your timer is running. |
| `match.reconnect.notYourTurn` | وقتی نوبتتان برسد، زمان شما مثل همیشه می‌گذرد. | Your turn timer runs as usual when your turn comes. |
| `match.reconnect.retryNow` | تلاش دوباره | Retry now |
| `match.reconnect.warning30` | ۳۰ ثانیه تا باخت مسابقه | 30 seconds until you forfeit the match |
| `match.reconnect.warning10` | ۱۰ ثانیه تا باخت مسابقه | 10 seconds until you forfeit the match |
| `match.reconnect.expired` | زمان اتصال دوباره تمام شد. وقتی دوباره آنلاین شوید، نتیجه را نشان می‌دهیم. | The time to reconnect has run out. We'll show the result when you're back online. |
| `match.reconnect.done` | دوباره وصل شدید | Reconnected |
| `match.opponent.disconnected` | قطع شد · {time} تا باخت او | Disconnected · {time} until they forfeit |
| `match.opponent.disconnectedNoTime` | قطع شد. اگر به‌موقع برنگردد، مسابقه را می‌بازد. | Disconnected. They forfeit if they don't return in time. |
| `match.opponent.disconnectedAnnounce` | اتصال {username} قطع شد. {time} فرصت دارد برگردد. | @{username} disconnected. They have {time} to return. |
| `match.opponent.back` | {username} برگشت | @{username} is back |
| `match.join.waiting` | منتظر ورود {username} | Waiting for @{username} to join |
| `match.join.elapsed` | زمان انتظار: {time} | Waiting: {time} |
| `match.join.refundNote` | اگر {username} وارد نشود، مسابقه لغو و ورودی شما کامل برگردانده می‌شود. | If @{username} doesn't join, the match is cancelled and your entry is refunded in full. |
| `match.join.cancel` | لغو مسابقه | Cancel match |
| `match.join.cancelTitle` | این مسابقه لغو شود؟ | Cancel this match? |
| `match.join.cancelBody` | ورودی هر دو بازیکن کامل برگردانده می‌شود و مسابقه در رتبه‌بندی حساب نمی‌شود. | Both entries are refunded in full, and the match is unrated. |
| `match.join.keepWaiting` | منتظر می‌مانم | Keep waiting |
| `match.loading.title` | در حال آماده‌سازی صفحه‌ی بازی | Getting the board ready |
| `match.loading.progress` | {percent} · {size} مگابایت مانده | {percent} · {size} MB left |
| `match.loading.opponentWaiting` | حریف منتظر شماست. | Your opponent is waiting for you. |
| `match.loading.summary` | {username} · {variant} · تا {n} امتیاز | @{username} · {variant} · First to {n} |
| `match.loading.tip.undo` | تا پیش از تأیید حرکت، می‌توانید آن را برگردانید. | You can undo until you confirm your move. |
| `match.loading.tip.lite` | اگر بازی کند است، «گرافیک سبک» را در منوی مسابقه روشن کنید. | If the game feels slow, turn on lite graphics in the match menu. |
| `match.loading.tip.fairDice` | تاس‌ها از قبل تعیین شده‌اند و پس از مسابقه قابل بررسی هستند. | The dice are fixed in advance and can be checked after the match. |
| `match.menu.info` | اطلاعات مسابقه | Match info |
| `match.menu.entryPayout` | ورودی {entry} سکه · برنده {payout} سکه می‌گیرد | Entry {entry} coins · winner receives {payout} |
| `match.menu.rated` | رتبه‌ای | Rated |
| `match.menu.unrated` | بدون رتبه | Unrated |
| `match.menu.practice` | تمرینی | Practice |
| `match.menu.seedCommit` | تعهد تاس منصفانه | Fair-dice commitment |
| `match.menu.moves` | تاریخچه‌ی حرکت‌ها | Move history |
| `match.menu.moveEntry` | ورود حرکت با صفحه‌کلید یا صفحه‌خوان | Move entry by keyboard or screen reader |
| `match.menu.shortcuts` | میان‌برها: فاصله انداختن تاس، Enter تأیید، Ctrl+Z برگشت، D دوبل، R واکنش، M منو | Shortcuts: Space roll, Enter confirm, Ctrl+Z undo, D double, R reactions, M menu |
| `match.menu.resign` | واگذاری | Resign |
| `match.history.pips` | پیپ شما {self} · {username} {opp} | Your pips {self} · @{username} {opp} |
| `match.history.empty` | هنوز حرکتی انجام نشده است. | No moves yet. |
| `match.history.turn` | {username} {a}–{b}: {moves} | @{username} {a}–{b}: {moves} |
| `match.history.forced` | اجباری | forced |
| `match.history.timeout` | وقت تمام شد | timeout |
| `match.history.noMove` | بدون حرکت | no move |
| `match.history.doubled` | دوبل به ×{value} | doubled to ×{value} |
| `match.history.took` | قبول کرد | took |
| `match.history.dropped` | رد کرد | declined |
| `match.moveEntry.title` | ورود حرکت | Move entry |
| `match.moveEntry.sources` | مهره‌هایی که می‌توانند حرکت کنند | Checkers you can move |
| `match.moveEntry.source` | {point, select, 25 {بار} other {خانه‌ی {point}}}، {count, plural, one {# مهره} other {# مهره}} | {point, select, 25 {Bar} other {Point {point}}}, {count, plural, one {# checker} other {# checkers}} |
| `match.moveEntry.destination` | به خانه‌ی {point}، با تاس {die} | To point {point}, uses {die} |
| `match.moveEntry.bearOff` | خارج کردن، با تاس {die} | Bear off, uses {die} |
| `match.moveEntry.readBoard` | خواندن وضعیت صفحه | Read the board |
| `match.moveEntry.board` | مهره‌های شما: {mine}. مهره‌های {username} (با شماره‌گذاری شما): {theirs}. روی بار: شما {barSelf}، {username} {barOpp}. خارج‌شده: شما {offSelf}، {username} {offOpp}. | Your checkers: {mine}. @{username}'s checkers (your numbering): {theirs}. On the bar: you {barSelf}, @{username} {barOpp}. Borne off: you {offSelf}, @{username} {offOpp}. |
| `match.moveEntry.lastMove` | آخرین حرکت: {summary} | Last move: {summary} |
| `match.resign.title` | واگذاری | Resign |
| `match.resign.game` | واگذاری این دست | Resign this game |
| `match.resign.gameBody` | {username} {points, plural, one {# امتیاز} other {# امتیاز}} می‌گیرد ({kind}، مکعب ×{cube}). | @{username} gets {points, plural, one {# point} other {# points}} ({kind}, cube ×{cube}). |
| `match.resign.scoreAfter` | امتیاز پس از آن: {self} – {opp} | Score after: {self} – {opp} |
| `match.resign.endsMatch` | با این کار مسابقه تمام می‌شود و {username} برنده است. | This ends the match: @{username} wins. |
| `match.resign.gameUnavailable` | دست بعدی در حال شروع است. | The next game is about to start. |
| `match.resign.match` | واگذاری مسابقه | Resign the match |
| `match.resign.matchBody` | {username} مسابقه را می‌برد. | @{username} wins the match. |
| `match.resign.matchCoins` | ورودی {entry} سکه‌ای خود را از دست می‌دهید و {username} {payout} سکه می‌گیرد. | You lose your entry of {entry} coins; @{username} receives {payout}. |
| `match.resign.matchRated` | امتیاز رتبه‌ی شما مثل یک باخت تغییر می‌کند. | Your rating changes as for a loss. |
| `match.resign.practice` | مسابقه‌ی تمرینی: سکه و امتیاز رتبه در کار نیست. | Practice match: no coins or rating involved. |
| `match.resign.ctaGame` | واگذاری دست | Resign game |
| `match.resign.ctaMatch` | واگذاری مسابقه | Resign match |
| `match.kind.single` | برد ساده | Single |
| `match.kind.gammon` | مارس | Gammon |
| `match.kind.backgammon` | مارس کامل | Backgammon |
| `match.leaveSheet.title` | از صفحه‌ی مسابقه خارج می‌شوید؟ | Leave the match screen? |
| `match.leaveSheet.body` | مسابقه ادامه دارد و زمان نوبت شما در نبودتان می‌گذرد. | The match keeps going. Your turn timer runs while you're away. |
| `match.leaveSheet.yourTurn` | الان نوبت شماست. | It's your turn now. |
| `match.leaveSheet.timeouts` | اگر زمان تمام شود، یک حرکت به جای شما انجام می‌شود؛ {limit} وقت‌تمام‌شدن پشت سر هم مسابقه را تمام می‌کند. | If time runs out, a move is played for you; {limit} timeouts in a row end the match. |
| `match.leaveSheet.stay` | می‌مانم | Stay |
| `match.leaveSheet.leave` | خروج از صفحه | Leave screen |
| `match.leaveSheet.resign` | واگذاری… | Resign… |
| `match.yourTurnElsewhere` | نوبت شما در مسابقه است | It's your turn in your match |
| `match.gameEnded.youWon` | دست {n} را بردید | You won game {n} |
| `match.gameEnded.theyWon` | {username} دست {n} را برد | @{username} won game {n} |
| `match.gameEnded.value` | {kind} · مکعب ×{cube} · {points, plural, one {# امتیاز} other {# امتیاز}} | {kind} · cube ×{cube} · {points, plural, one {# point} other {# points}} |
| `match.gameEnded.reason.bear_off` | با خارج کردن همه‌ی مهره‌ها | by bearing off |
| `match.gameEnded.reason.dropTheirs` | {username} دوبل را رد کرد | @{username} declined the double |
| `match.gameEnded.reason.dropYours` | شما دوبل را رد کردید | You declined the double |
| `match.gameEnded.reason.resignTheirs` | {username} این دست را واگذار کرد | @{username} resigned the game |
| `match.gameEnded.reason.resignYours` | شما این دست را واگذار کردید | You resigned the game |
| `match.gameEnded.score` | امتیاز: {self} – {opp} · تا {n} امتیاز | Score: {self} – {opp} · First to {n} |
| `match.gameEnded.next` | دست بعدی در حال شروع… | Next game starting… |
| `match.result.youWon` | مسابقه را بردید | You won the match |
| `match.result.theyWon` | {username} مسابقه را برد | @{username} won the match |
| `match.result.cancelled` | مسابقه لغو شد | Match cancelled |
| `match.result.reason.points` | به امتیاز نهایی رسید | Final score reached |
| `match.result.reason.resignTheirs` | {username} مسابقه را واگذار کرد | @{username} resigned the match |
| `match.result.reason.resignYours` | شما مسابقه را واگذار کردید | You resigned the match |
| `match.result.reason.timeoutsTheirs` | زمان {username} {limit} بار پشت سر هم تمام شد | @{username} ran out of time {limit} times in a row |
| `match.result.reason.timeoutsYours` | زمان شما {limit} بار پشت سر هم تمام شد | You ran out of time {limit} times in a row |
| `match.result.reason.disconnectTheirs` | {username} به‌موقع برنگشت | @{username} didn't reconnect in time |
| `match.result.reason.disconnectYours` | اتصال شما بیش از حد مجاز قطع ماند | You were disconnected for too long |
| `match.result.reason.aborted` | مسابقه پیش از اولین پرتاب تاس تمام شد. | The match ended before the first roll. |
| `match.result.finalScore` | نتیجه‌ی نهایی {self} – {opp} | Final score {self} – {opp} |
| `match.result.gameLine` | دست {n}: {winner} · {kind} · {points} | Game {n}: {winner} · {kind} · {points} |
| `match.result.entry` | ورودی | Entry |
| `match.result.pot` | مجموع | Pot |
| `match.result.fee` | کارمزد سکو | Platform fee |
| `match.result.received` | دریافتی شما | You receive |
| `match.result.net` | نتیجه‌ی خالص | Net |
| `match.result.signWon` | +{amount} برد | +{amount} won |
| `match.result.signLost` | −{amount} باخت | −{amount} lost |
| `match.result.refunded` | ورودی {refund} سکه‌ای شما برگردانده شد. | Your entry of {refund} coins was refunded. |
| `match.result.eloUp` | امتیاز رتبه +{delta} (افزایش) | Rating +{delta} (up) |
| `match.result.eloDown` | امتیاز رتبه −{delta} (کاهش) | Rating −{delta} (down) |
| `match.result.eloSame` | امتیاز رتبه بدون تغییر | Rating unchanged |
| `match.result.xp` | +{xp} تجربه | +{xp} XP |
| `match.result.practice` | مسابقه‌ی تمرینی: امتیاز رتبه، سکه و تجربه تغییر نمی‌کند. | Practice match: no rating, coin, or XP changes. |
| `match.result.tournament` | مسابقه‌ی تورنمنت: جدول تورنمنت الان به‌روز می‌شود. | Tournament match: the bracket updates now. |
| `match.result.viewBracket` | دیدن جدول | View bracket |
| `match.result.seedTitle` | تاس منصفانه | Fair dice |
| `match.result.seedBody` | بذر این مسابقه الان منتشر شد. هر دو بازیکن می‌توانند همه‌ی پرتاب‌ها را بررسی کنند. | The match seed is now published. Anyone who played can check every roll. |
| `match.result.seedCopy` | کپی بذر | Copy seed |
| `match.result.verify` | بررسی تاس‌ها | Verify dice |
| `match.result.privacy` | فقط شما و {username} می‌توانید بازپخش این مسابقه را ببینید. | Only you and @{username} can watch this replay. |
| `match.result.playAgain` | بازی دوباره | Play again |
| `match.result.playAgainUnaffordable` | سکه برای این میز کافی نیست | Not enough coins for this table |
| `match.result.searchAgain` | جستجوی دوباره | Search again |
| `match.result.viewReplay` | دیدن بازپخش | View replay |
| `match.result.backToLobby` | بازگشت به لابی | Back to lobby |
| `match.summary.title` | خلاصه‌ی مسابقه | Match summary |
| `match.summary.won` | بردید | You won |
| `match.summary.lost` | باختید | You lost |
| `match.summary.voided` | مسابقه باطل شد | Match voided |
| `match.summary.cancelledBody` | مسابقه پیش از اولین پرتاب تاس تمام شد. ورودی‌ها کامل برگردانده شد. | The match ended before the first roll. Entries were refunded in full. |
| `match.summary.watchReplay` | تماشای بازپخش | Watch replay |
| `match.summary.practiceVsBot` | تمرین با ربات ({level}) | Practice vs Bot ({level}) |
| `match.notFound.title` | مسابقه پیدا نشد | Match not found |
| `match.notFound.body` | نشانی را بررسی کنید یا تاریخچه‌ی مسابقه‌های خود را باز کنید. | Check the link, or open your match history. |
| `match.notFound.history` | تاریخچه‌ی مسابقه‌ها | Match history |
| `match.peek.viewProfile` | دیدن نمایه | View profile |
| `match.peek.keepsGoing` | در این مدت مسابقه ادامه دارد. | The match keeps going while you look. |
| `match.lite.suggest` | بازی روی این دستگاه کند اجرا می‌شود. | The game is running slowly on this device. |
| `match.lite.turnOn` | روشن کردن گرافیک سبک | Turn on lite graphics |
| `match.unsupported.title` | این دستگاه نمی‌تواند صفحه‌ی سه‌بعدی بازی را نمایش دهد | This device can't show the 3D board |
| `match.unsupported.body` | بازی به WebGL 2 نیاز دارد. مرورگر خود را به‌روز کنید یا از دستگاه دیگری استفاده کنید. | The game needs WebGL 2. Update your browser or try another device. |
| `match.unsupported.inMatch` | مسابقه‌ی شما هنوز در جریان است و زمان نوبت شما می‌گذرد. روی دستگاه دیگری ادامه دهید یا واگذار کنید. | Your match is still running and your turn timer keeps running. Continue on another device, or resign. |
| `match.error.moveRejected` | این حرکت پذیرفته نشد. صفحه به‌روز شد. | That move wasn't accepted. The board has been updated. |
| `match.error.stale` | بازی جلو رفت. صفحه به‌روز شد. | The game moved on. The board has been updated. |
| `match.error.cube` | الان نمی‌توانید دوبل کنید. | You can't double now. |
| `match.error.resignScope` | دست بعدی در حال شروع است. می‌توانید مسابقه را واگذار کنید. | The next game is about to start. You can resign the match instead. |
| `match.error.ended` | این مسابقه تمام شده است. | This match has ended. |
| `match.error.busy` | سرور مشغول است. دوباره امتحان کنید. | The server is busy. Try again. |
| `match.signedOut` | از حساب خارج شدید. | You've been signed out. |

Shared keys used: `common.*` (back, close, retry, cancel, copy, copied, help, loadingSlow, errorCode), `play.variant.*`, `play.length.firstTo`, `play.bot.name`, `play.bot.label`, `play.bot.level.*`, `reactions.emoji.<key>`, `reactions.phrase.<key>` (free set; the backend lists `hello`, `good_luck`, `nice_move`, `well_played`, `thanks`, `oops`, `hurry`, `good_game` and emojis `smile`, `laugh`, `wow`, `sad`, `angry`, `thumbs_up`, `clap`, `fire`, `think`, `cool`), `settings.lite.label`, `settings.sound.label`, `settings.vibration.label`, `account.suspended.actionBlocked`, `account.suspended.details`, `net.offline`, `errors.match.*`, `errors.ws.badMessage`, `errors.generic`.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| MA-02 | Leave → score and match info → spectator count → menu → opponent bar (one stop, `match.bar.label`) → board region (one stop; Enter opens MA-18) → own bar → dice chips (read-only text) → action bar: start slot → center → end slot |
| MA-03 | Title (focused on open) → items in order. Close returns focus to the menu button. |
| MA-05 | Tabs (arrow keys) → grid (one tab stop, arrow keys move) → close |
| MA-07 | Title (focused) → take text → drop text → timer → Take → Drop (trapped) |
| MA-08 | Title → option cards (radio group) → primary (after choosing) → Cancel (default focus) |
| MA-09 | Title → body → Stay (default focus) → Leave screen → Resign… |
| MA-10 | Title (focused) → countdown → turn line → Retry now → Leave match screen |
| MA-13b | Headline (focused) → reason → score and games → coin rows → rating → XP → seed and Verify dice → privacy note → primary → secondary actions |
| MA-18 | Dice → last move → source list → destination list → Undo → Confirm move → Read the board |

**Labels**

- Every icon-only control has a label: Leave, menu, spectator count (`match.spectators`), reactions (`match.action.reactions`, cooldown `match.reactions.cooldown`), cube chip (`match.cube.label` + owner), copy seed.
- Buttons with icons keep visible text: Roll, Confirm move, Undo, Double to ×N.
- Bars: one accessible name each (`match.bar.label`), updated when values change but not announced.

**Live regions**

- Polite: your turn; dice values («۶ و ۳»); the opponent's move summary (`match.move.summary`); forced / no-move / auto captions; timeout notices; cube take; game result; opponent disconnected / back; reconnect status; reactions received (unless hidden).
- Assertive: none. MA-07, MA-10, and MA-13b move focus instead.
- Timers: only the P§7 thresholds (10 s visual + haptic, 5 s announcement) and the reconnect 30 s / 10 s warnings. No per-second announcements.

**Other rules**

- Not color alone: checker ownership (rim marking + bar swatch), legal destinations (ring-and-dot + die number), selected checker (lift + outline), last move (arrows), hits ("Hit" marker), cube owner (position + text), timer warnings (icon + text), win/loss (signs + words), used dice (strike-through + "used").
- Contrast: 4.5:1 for all text, including captions and bars over the 3D scene (solid backgrounds); markers 3:1 against the board theme (each board theme is checked, UI owns).
- Targets: every control ≥ 44 × 44 px; the primary ≥ 56 px tall; checkers ≥ 44 CSS px wide on a 360 px portrait screen (§11.1); legal-destination hit areas ≥ 44 px even when the marker is smaller.
- Motion: `animations.reduced` and `prefers-reduced-motion` shorten checker and UI animations and remove bounces; bubbles fade; the reconnect and timer rings become static bars.
- Text size 200%: bars wrap to 2 lines; the action bar keeps its three slots with labels wrapping to 2 lines; sheets scroll with sticky primaries.
- Haptics are optional feedback only; every haptic event also has a visual and a text equivalent.

---

## 9. Acceptance criteria

1. In portrait at 360 × 800, 390 × 844, and 430 × 932, Roll, Confirm move, Undo, and Double to ×N are fully inside the bottom 40% of the viewport; every target is ≥ 44 × 44 px.
2. The 3D canvas contains only the board, checkers, and dice; bars, timers, buttons, bubbles, captions, and the cube chip are HTML.
3. A first entry to a new match sends `match.sync` only after the scene is ready; a re-entry sends it immediately.
4. Opening roll: both dice are labeled by player; a tie shows "Tie: rolling again"; the starter moves without a Roll button.
5. Tap-tap and drag both work; legal destinations show a marker shape and the die number; an illegal drop returns the checker and keeps destinations visible; Undo reverts one step; Confirm is disabled until `TurnBuilder.complete`.
6. Confirm sends exactly one `turn.move` with the built list; double taps are ignored; an `error` + `match.state` resets the board and shows the mapped toast.
7. With one legal play, the caption appears and input is locked until `turn.moved {auto: forced}`; with none, the no-move caption appears before `turn.passed`.
8. The clock shows the turn ring, then the labeled time bank after `turn_seconds`; the 10 s warning has an icon and text; one announcement at 5 s.
9. `turn.timeout` shows "{count} of {limit}"; at `limit − 1` the persistent warning shows in the right bar and clears after the player's next own action.
10. Double to ×N appears only when `canDouble`; it's hidden in the Crawford game, where the label and cube chip say "no doubling".
11. MA-07 shows take and drop consequences, the score after a drop, the running clock, and the auto-take note; both buttons have equal weight; an open sheet closes first.
12. Reactions offer only free and owned keys; a second send within 3 s is blocked with a visible cooldown; bubbles never overlap the board playing area, dice, or action bar; the "Show opponent's reactions" switch hides them.
13. Socket loss during an active match shows MA-10 with a countdown to forfeit, the turn line, and "Retry now"; warnings at 30 s and 10 s; after reconnect the board catches up and "Reconnected" is shown.
14. `opponent.disconnected` shows the countdown on the opponent's bar, with warnings at 30 s and 10 s; the board stays usable; `opponent.back` clears it.
15. MA-19 shows while the human opponent hasn't joined before the first roll, with the refund sentence and "Cancel match".
16. MA-08 offers game and match resign with the exact points, kind, cube, and score after (game), and coin and rating consequences (match); "Cancel" has default focus; game resign is disabled between games.
17. Back, Esc, and "Leave" open MA-09 with the timer statement; "Leave screen" never resigns and keeps the socket attached; PL-08 appears.
18. `game.ended` shows MA-13a with winner, kind, cube, points, reason, and score until `game.started`; it's skipped when the match ends.
19. `match.ended` shows MA-13b with the reason, final score, game list, coin rows (win and loss with signs and words), rating and XP rows, the published seed with copy and "Verify dice", and the privacy note. Bot and tournament matches show their own rows.
20. After a loss, MA-13b contains no shop link or purchase copy; an unaffordable "Play again" is disabled with its reason and offers lower tiers and the bot.
21. The spectator count appears in the top strip when ≥ 1 and updates on `spectators.count`; MA-03 explains that spectators aren't identified.
22. With lite graphics on, dice fade in at rest over 300 ms; toggling lite mode in MA-03 applies without reloading the scene or losing state. The slow-frame snackbar appears at most once per session and never enables lite mode itself.
23. Without WebGL2, MA-17 shows and nothing is downloaded; for an active match it offers resign and states the timer.
24. MA-01 shows determinate progress with percent and MB left, the slow state after 10 s without progress, and Cancel → MA-09 for an active match.
25. MA-18 lets a keyboard-only user complete a full turn (source, destination, undo, confirm) and read the board as text.
26. MA-14 shows a replay link only to players, never to non-players, and no share or copy-link action exists anywhere in the match screens.
27. Rotation and width changes keep local steps, the selection, open sheets, and MA-07 without reloading the scene.
28. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape: no horizontal scroll, no clipped text at 200%.
29. Every event in §3.3 and every error in §3.16 has a mapped UI state; all strings come from i18n keys with fa and en.

---

## 10. Open questions and API gaps

For the main agent unless noted. Q1 and Q2 block parts of MA-10, MA-11, MA-12, and MA-08.

1. **The match rules aren't in `match.state`.** The client can't know `reconnect_grace_seconds` (MA-10 self countdown), `max_consecutive_timeouts` (MA-12 after a re-sync, MA-09 text), `timebank_seconds`, `table_rake_pct` (MA-03 payout line), or the variant's point table (MA-08 preview for `traditional`). Proposal: add `rules: {turn_seconds, timebank_seconds, reconnect_grace_seconds, max_consecutive_timeouts, points: {single, gammon, backgammon}, rake_pct}` to `MatchStateOut` (from the match's snapshot).
2. **Grace deadlines aren't in `match.state`.** After a re-sync, the opponent's disconnect countdown is lost, and the "opponent hasn't joined" grace is never sent. Proposal: `grace: [epoch_ms | null, epoch_ms | null]` in `MatchStateOut`.
3. **`match_event.actor` is wrong for player A.** `live._actor` uses `side or -1`, so side 0 maps to `system`. Player A's events are recorded with the wrong actor (affects the admin replay and anti-fraud evidence; the player replay uses payload fields).
4. **Resign before the first roll aborts the match.** `results.finish` treats any end before the first roll as an abort with refunds, so `match.resign {scope: match}` works as "cancel match". MA-19 and PL-07 rely on this. Please confirm it's intended, or add an explicit `match.abort` allowed only before the first roll. Either way the opponent is not penalised.
5. **Tournament context is missing.** `match.found` and `MatchStateOut` have no `tournament_id` or round, so the top strip can't show "Tournament · Round 2" and MA-13b can't link to the bracket. Proposal: `tournament: {id, name, round, rounds} | null`.
6. **Per-player outcome isn't stored in the summary.** `MatchSummary` has no rating change, XP, or coin movement, and no per-game `results`, so MA-14 (and history rows) can't show them after the live sheet is closed. Proposal: add `you_outcome: {elo_delta, xp, coins_net}` and `results[]` to `MatchSummary` for the requesting player.
7. **Level-up isn't signalled.** `match.ended.xp` gives the XP gained but not the new level. Proposal: `level: {a, b}` so MA-13b can say "Level {n} reached" (neutral, no reward pressure).
8. **Push before forfeit** (patterns.md Q10). If the OS kills the app, the player may forfeit without seeing MA-10. iOS often closes sockets of backgrounded PWAs within seconds. A server push "You've been disconnected. Return within {mm:ss}." is strongly recommended.
9. **Reaction packs.** The free keys live only in `backend/realtime/reactions.py`. Proposal: `GET reactions` returning the keys this user may send (free + owned), so MA-05 never offers a rejected key.
10. **Identical checker themes.** Each player sees their own board and the opponent's checker theme (§11.1). If both equip the same checker theme, the two sets look alike. For the UI specialist / `game3d`: the opponent set needs an alternate tint or a distinct rim marking always (this spec requires the marking in any case).
11. **Reduced motion and the dice throw** (patterns.md Q8). Recommended: reduced motion also uses the lite-mode fade for dice. Please decide.
12. **Two side panels at 1024 px.** §11.7 asks for two panels at `lg`; at 1024 × 768 that leaves the board too small for comfortable checkers. This spec collapses the start panel below 1280 px. Please confirm the deviation (UI specialist to validate with a checker-size measurement).
13. **Persian terminology.** Gammon «مارس», backgammon «مارس کامل», time bank «زمان ذخیره», pip «پیپ», Crawford «دست کرافورد» need a native backgammon player's review; local players may use other terms.
14. **Banned during a match.** §12.1 says banned users can't sign in, and the session ends on its next request. The WebSocket isn't closed on ban. Should the server close player sockets on ban, and does the match then run to a disconnect forfeit?
15. **`turn.rolled` for a bot turn** is followed by a 0.8–2.0 s delay (§9). No change needed; noted so the "Bot is thinking" caption covers it.
