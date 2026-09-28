# History and replay: match history, replay viewer, verify dice

Status: draft for UI build (CLAUDE.md §17 step 8).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 6, 13; §6; §10.2 (Matches); §11.1; §11.3; §11.6; §11.7; §12.1 (suspended users keep history and replays); §14 (`replay.retention_days`); §15 (`match_event`, `replay_view`); §20.1, §20.2; §21.2; ia.md §1–§3; patterns.md (P§) 1, 4.2, 5, 6, 8, 10, 11, 13, 14, 17; journeys.md J6; personas P3 Hamid, P1 Reza.
Related specs: `match.md` (MA-01 loader, MA-04 notation, MA-06 bubbles, MA-13b result sheet, MA-14 finished summary, reason strings), `play.md` (variant, length, bot labels), `live.md` (non-players never get a replay link), `profile.md` (AC-01 "Match history" row).

This spec merges the planned `history.md` and `replay.md`. Screen IDs follow screen-inventory.md §2.8 (HI-01, RP-01, RP-02); RP-03 (replay unavailable states) is new. The finished-match summary between the list and the replay is match.md MA-14.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET me/matches?cursor=` | `{results: MatchSummary[], next}`, newest first, 20 per page; `next` is the `created_at` of the last row. Includes active, finished, aborted, and voided matches, bot matches too. |
| `MatchSummary` | `id`, `variant`, `length`, `entry`, `status` (`active`, `finished`, `aborted`, `voided`), `is_bot`, `players[2]` (`username` (nullable), `avatar`, `elo`, `is_bot`, `bot_level`), `you` (0 or 1 in history), `winner` (side or null), `score [a, b]`, `end_reason`, `seed_commit`, `created_at`, `ended_at` |
| `GET matches/{id}` | `MatchSummary` with `you` for the caller (null for non-players). Any signed-in user can read it. |
| `GET matches/{id}/replay` | Players of the match only. `Replay` = `MatchSummary` (with `you: null`, §10 Q1) + `seed` (hex, null while active) + `events[]` (`ReplayEvent`: `seq`, `type`, `actor`, `payload`, `server_ts`). Anyone else → `403 FORBIDDEN` (`errors.forbidden`); unknown id → `404 NOT_FOUND`. Every successful call writes a `replay_view` row. |

Recorded event types (everything `live.emit` sends): `game.started`, `turn.rolled`, `turn.moved`, `turn.passed`, `turn.timeout`, `cube.update`, `game.ended`, `react.recv`, `opponent.disconnected`, `opponent.back`, `spectators.count`, `match.ended`. Payloads are the §10.3 shapes (see match.md §3.3). Spectator-only events are never recorded.

Server rules the UI relies on (`backend/game/views.py`, `backend/game/engine/dice.py`):

- **Access (§2 rule 13):** only the two players (and admins through the admin API). No public link exists, and none may be implied.
- **Fair dice (§6):** `seed_commit` = SHA-256 of the 32 seed bytes (hex). Roll `n` counts every `turn.rolled` event of the match in `seq` order from 0, opening rolls and opening ties included. For roll `n`: bytes of HMAC-SHA256(key = seed bytes, message = `"{match_id}:{n}:{k}"`) for k = 0, 1, …; accept a byte `b` only if `b < 252`; die = `b % 6 + 1`; stop at two dice. The recorded `dice` of that event must equal the two dice in order (for an opening roll: player A's die, then player B's). `throw_seed` = the first 4 bytes, big-endian, of HMAC-SHA256(seed, `"{match_id}:{n}:throw"`).
- **Bot matches** are recorded and replayable (§20.1).
- **Retention:** `replay.retention_days` (0 = forever) is not enforced yet; there is no "purged" response (§10 Q3).

---

## 1. Goal and user story

- As a competitive player (P3 Hamid), I want to find last night's match, replay it move by move at my own speed, jump to a game, and check that every roll came from the committed seed.
- As a regular (P1 Reza), I want a quick list of my recent results and a way back into a match that is still running.
- As any player, I want to be sure nobody outside the match can watch my replay.

Success means:
- The replay can be stepped both ways and jumped to any game without reloading.
- "Verify dice" runs entirely on the device and gives a clear yes or a precise list of mismatches.
- No screen offers sharing, public links, or "request access".

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Account hub "Match history" (profile.md AC-01) | HI-01 `/me/matches` |
| Empty `/me/matches` action "Play vs bot" | play.md PL-04 |
| HI-01 row (finished, aborted, voided) | match.md MA-14 `/match/[id]` (detail panel at `md`/`lg`) |
| HI-01 row (active) | `/match/[id]` player view (resume) |
| MA-14 "Watch replay"; MA-13b "View replay" | RP-01 `/replay/[id]` |
| MA-13b "Verify dice" | RP-01 `/replay/[id]?verify=1` (RP-02 opens after load) |
| Deep link to `/replay/[id]` (anyone) | RP-01, or RP-03 for non-players |
| Redirect from `app.` with path and query | Any of the above |

| Exit | Destination |
| --- | --- |
| Back from RP-01 | The previous screen (usually MA-14 or HI-01, with scroll and selection kept) |
| RP-03 "Return to match" (active) | `/match/[id]` |
| RP-03 "Watch live" (non-player, match live) | `live.md` spectator view |
| RP-02 "?" | `/help/fair-dice` |

---

## 3. Flow

### 3.1 Match history (HI-01)

1. `GET me/matches` (first page). Skeleton rows meanwhile.
2. Render rows newest first. "Show more" loads the next page (`next`); the button is hidden when `next` is null.
3. **Row content** (the viewer is `you`; the opponent is the other side):
   1. Opponent: avatar (32 px) and username (LTR-isolated); bots show the Bot label (icon + text) and level via `play.bot.name`; a null username shows `history.row.unknownPlayer`.
   2. Result chip (icon + text): Won, Lost, Cancelled (`aborted`), Voided, In progress (`active`).
   3. Score «{self} – {opp}» and "First to {n}".
   4. Meta: variant name · table ("{entry}-coin table", "Practice" for bots, "Tournament" when §10 Q6 allows it).
   5. Date: today and yesterday as relative words with the time; older rows as a Jalali date (fa) or Gregorian (en).
   6. Coin, rating, and XP changes: only when the API returns them (§10 Q2). Until then the row shows nothing about coins; it never guesses from the entry.
4. **Row tap:**
   - `active` → `/match/[id]` (player view, resume). The row also says "Return to match".
   - Otherwise → MA-14 (full screen at `sm`; detail panel at `md`/`lg`, URL updated).
5. Pull-to-refresh (and a Refresh button at `lg`) reloads the first page; loaded pages beyond it are dropped.
6. No filters in Phase 1 (§10 Q7).

### 3.2 Opening a replay (RP-01)

1. On `/replay/[id]`, in parallel: `GET matches/{id}/replay`, `GET matches/{id}` (for `you`, §10 Q1), and the WebGL2 check.
2. **Response handling:**

   | Result | Screen |
   | --- | --- |
   | `200`, `status` finished or voided, events include a `turn.rolled` | RP-01 |
   | `200`, `status` = `active` (`seed` null) | RP-03 "not yet available" |
   | `200`, `status` = `aborted`, or no `turn.rolled` event | RP-03 "nothing to replay" |
   | `403 FORBIDDEN` | RP-03 "players only" |
   | `404 NOT_FOUND` | RP-03 "not found" |
   | Network error | RP-03 "couldn't load" with Retry |
   | WebGL2 missing | match.md MA-17 content without the in-match text; RP-02 still works (it needs no 3D) and is offered as "Verify dice" |

3. For RP-01: the MA-01 loader in its replay variant ("Loading replay", determinate progress). Then the board shows the start of game 1 (or the game in `?game=N`), **paused**.
4. The perspective is the viewer's: their checkers at the bottom, their bar at the bottom (as in the match).
5. `?verify=1` → RP-02 opens after load.
6. First-replay hint (P§14, once per account): "You can check that every roll came from the dice fixed before the match." pointing at "Verify dice".
7. Once loaded, the replay works offline (events are in memory). Leaving and re-opening fetches again (and logs another view).

### 3.3 Replay model and controls

1. **Steps.** The client builds an ordered list of steps from `events` (by `seq`):

   | Event | Step | Shown as |
   | --- | --- | --- |
   | `game.started` | Yes (game start) | Checkers reset; "Game {n}"; Crawford label when `crawford` |
   | `turn.rolled` | Yes | Dice throw with the recorded `throw_seed` (§11.1; lite mode: 300 ms fade, §20.2); opening rolls labeled per player |
   | `turn.moved` | Yes | Checkers move; hits marked; `auto` shown as "forced" or "timeout" |
   | `turn.passed` | Yes | "No legal move" |
   | `cube.update` | Yes | "Doubled to ×{v}", "Took", "Declined" (cube chip moves as in the match) |
   | `game.ended` | Yes | Game result card (match.md MA-13a content, without "Next game starting") |
   | `match.ended` | Yes (last) | Final result card (§4 RP-01) |
   | `react.recv` | No | Bubble near the sender's bar when playback passes its position (MA-06 style), and an inline line in the move list |
   | `turn.timeout` | No | Note in the move list: "@x ran out of time ({count} of {limit})" |
   | `opponent.disconnected` / `opponent.back` | No | Note in the move list: "@x disconnected" / "@x returned" |
   | `spectators.count` | No | Ignored |

   Players see no timestamps, think times, device, or IP data; those are admin-only (§20.3). The match date appears once in the header.

2. **Play / pause** (center button, Space). Playback starts from the current step and advances automatically.
3. **Pacing** (not real time; think time is not replayed). At 1×: a roll step lasts about 1.2 s (the throw; 0.3 s in lite mode), a move step about 0.3 s per checker step plus a 0.4 s pause, and a game result card 2 s. Speed chips **0.5×, 1×, 2×, 4×** scale every duration. Default 1×; the choice is kept for the session.
4. **Step back / forward** (buttons, ← / →): one step. Forward animates the step (at the current speed); back jumps to the state before the previous step without animation. Stepping pauses playback.
5. **Scrubber:** a slider over all steps with tick marks and numbers at each game start (not color only). Dragging updates the board instantly (no animation); the label reads "Move {i} of {n} · Game {g}". Home / End jump to the start / end.
6. **Jump to game N:** a "Game {g} of {m}" selector opens a list: "Game 1 · you +2 (gammon)", "Game 2 · @x +1", …; choosing one jumps to that game's start, paused. Keys 1–9 jump to games 1–9.
7. **Reactions:** bubbles show for 2 s (scaled by speed, minimum 0.5 s) near the sender's bar, in the viewer's locale, never over the board playing area or the controls. Switch "Show reactions" in the replay menu (default on).
8. **End:** after `match.ended`, playback stops on the final result card: winner, final score, reason (match.md MA-13b strings), with "Replay from start", "Verify dice", and "Back".
9. **Move list** (sheet at `sm`; side panel at `md`/`lg`): every step and note in match.md MA-04 notation, grouped by game; the current step is marked (outline + "Now" label); tapping an entry jumps there, paused.
10. **Replay menu:** Show reactions (switch), Lite graphics (switch, same preference as ST-01), Sound (switch), Match info (variant, length, table, date, result, `seed_commit`), Help (`/help/replays`).
11. **Reduced motion:** no checker or dice animation; steps change instantly; playback holds each step for its paced duration.
12. **Orientation and width changes** re-frame the camera without reloading and keep the current step, speed, and play state.

### 3.4 Verify dice (RP-02)

1. Opened from the "Verify dice" chip, the replay menu, the final result card, or `?verify=1`.
2. Content before running:
   - Title "Verify dice".
   - Explanation (three short sentences): "Before the match, the server fixed a secret seed and showed both players its fingerprint (the commitment). Now the seed is published. Your device recomputes every roll from the seed and checks both."
   - Commitment (`seed_commit`) and seed (`seed`): monospace, LTR, Latin, wrapped into groups of 8 characters, each with a copy button.
   - "{n} rolls to check" (count of `turn.rolled` events).
   - Primary "Verify now".
3. Running (on the device only; no network; WebCrypto SHA-256 and HMAC-SHA-256):
   1. Check the commitment: SHA-256(seed bytes) == `seed_commit`.
   2. For each `turn.rolled` event in `seq` order with n = 0, 1, …: compute the two dice (§ Server rules) and compare them with the recorded `dice` in order.
   3. Progress: "Checking roll {i} of {n}" with a determinate bar; "Stop" cancels.
4. Results (icon + text, never color alone):

   | Outcome | Text |
   | --- | --- |
   | All good | "The seed matches the commitment shown before the match." and "All {n} rolls match the seed." |
   | Commitment mismatch | "The published seed doesn't match the commitment." |
   | Roll mismatches | "{k} of {n} rolls don't match." with a list: "Roll {i} · Game {g}: recorded {a}–{b}, computed {c}–{d}" |
   | Can't run (no WebCrypto / insecure context) | "This browser can't run the check. Try an up-to-date browser." |

   For either mismatch, add one neutral line: "This shouldn't happen. Please contact support with this reference: {match_id}." with a copy button. No accusation, no alarm styling beyond the icon.
5. "How to check it yourself" (collapsed by default): the exact algorithm in plain steps (the message format `match_id:n:k`, the 252 cut-off, `b % 6 + 1`, the roll counter including opening rolls and ties), plus the match id with a copy button, so a technical user can check with their own tool. Link "?" → `/help/fair-dice`.
6. The result is kept for the session; re-opening RP-02 shows it with "Verify again".

### 3.5 Replay unavailable (RP-03)

| Variant | Title | Body | Actions |
| --- | --- | --- | --- |
| Players only (`403`) | "This replay is private" | "This replay is only available to the two players of the match." | "Back". If `GET matches/{id}` shows the match is `active` and not a bot match: "Watch live" (secondary). No request-access action. |
| Not found (`404`) | "Replay not found" | "Check the link, or open your match history." | "Match history", "Back" |
| Not yet available (`active`) | "The match is still going" | "The replay will be available when the match ends." | "Return to match" (primary), "Back" |
| Nothing to replay (`aborted`) | "Nothing to replay" | "This match ended before the first roll." | "Match summary" (→ MA-14), "Back" |
| No longer available (purged, §10 Q3) | "This replay is no longer available" | "Old replays are removed after a while. The match result is still in your history." | "Match summary", "Back" |
| Couldn't load | "Couldn't load the replay" | `errors.network` wording | "Try again", "Back" |

No 3D is loaded for RP-03 (saves data on 4G).

### 3.6 Error map

| Code (HTTP) | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `FORBIDDEN` (403) | `GET matches/{id}/replay` | RP-03 players only | `errors.forbidden` | `replay.private.body` |
| `NOT_FOUND` (404) | replay, `GET matches/{id}` | RP-03 not found | `errors.notFound` | `replay.notFound.title` |
| `NETWORK` (client) | `GET me/matches` | HI-01 screen error + Retry (or a "Show more" inline error) | `errors.network` | `history.loadError` |
| `NETWORK` (client) | replay | RP-03 couldn't load | `errors.network` | `replay.loadError.title` |
| `VALIDATION` (400) | `GET me/matches?cursor=` (bad cursor) | Reload from the first page | `errors.validation` | — |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` (401) | all | api-client refreshes once; else SY-08 | `errors.unauthenticated` | — |
| `AUTH_BANNED` (403) | all | `/login` with AU-14 | `errors.auth.banned` | — |
| Any other / `HTTP_ERROR` | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

---

## 4. Screen list

### HI-01 Match history `/me/matches` (Tab 5 child)

- **App bar:** back (mirrors), title "Match history", balance chip.
- **Content:** intro line "Your matches, newest first."; rows (§3.1); "Show more".
- **Row:** one tap target (≥ 72 px tall), accessible name `history.row.label`.
- **Primary action:** tap a row. Empty-state action "Play vs bot".

### RP-01 Replay viewer `/replay/[id]` (immersive)

Regions in portrait `sm` (390 × 844), top to bottom:

| Region | Content |
| --- | --- |
| Top strip | Back (mirrors); title "Replay" + "@{opponent} · {date}"; lock icon + "Private" (tap → "Only you and @x can watch this replay."); replay menu button |
| Opponent bar | Avatar, username or Bot label, pip count, cube chip when owned. No clock. |
| Board | 3D board, checkers, dice (no legal-move highlights; no input) |
| Own bar | Same as the opponent bar |
| Controls (bottom 40%) | Row 1: scrubber with game ticks and "Move {i} of {n} · Game {g}". Row 2: step back · play/pause (center, ≥ 56 px) · step forward. Row 3 (chips): speed ("1×"), "Game {g} of {m}", "Verify dice", "Moves". |

- Final result card at the end (§3.3 step 8).
- **No share, copy-link, download, or export control exists.** The page sets `noindex`.
- **Primary action:** Play / pause.

### RP-02 Verify dice (sheet at `sm`; end side panel at `lg`; centered dialog at `md`)

- As §3.4.

### RP-03 Replay unavailable (in place on `/replay/[id]`)

- As §3.5.

---

## 5. States

| State | HI-01 | RP-01 | RP-02 | RP-03 |
| --- | --- | --- | --- | --- |
| **Loading** | 6 skeleton rows; "Show more" in-button spinner | MA-01 replay variant with determinate progress and Cancel (→ back); slow state after 10 s | Progress per roll; "Stop" | — (decided before 3D loads) |
| **Empty** | `history.empty` "You haven't played yet." + "Play vs bot" | A match with only an opening sequence still replays | "0 rolls to check" never occurs (RP-03 covers it) | — |
| **Error** | Screen error + Retry; "Show more" failure → inline "Couldn't load more" + Retry | Rendering failure mid-replay → keep the move list usable, toast `replay.renderError` | "Can't run" outcome | "Couldn't load" variant |
| **Offline** | Banner `net.offline`; cached pages readable with `common.lastUpdated`; "Show more" disabled with `net.offlineAction` | Works once loaded; before load → RP-03 couldn't load | Works (no network) | — |
| **Reconnecting** | n/a (REST) | n/a (no socket) | n/a | — |
| **Insufficient coins** | n/a (no spend) | n/a | n/a | n/a |
| **Suspended** | Works (§12.1); suspension banner shown | Works | Works | Works |
| **Banned** | No session (AU-14) | ← | ← | ← |
| **First-time user** | Empty state | Verify-dice hint once (P§14) | Explanation always shown | — |
| **Bot match** | Bot label and level; "Practice" | Bot label in the bar; replay works | Works | — |
| **Lite mode / reduced motion** | — | Lite: dice fade in 300 ms; reduced motion: no animation, paced holds | Progress bar static under reduced motion (text counter stays) | — |
| **WebGL2 missing** | Works | MA-17 content; "Verify dice" still offered | Works | — |

---

## 6. Responsive notes (§11.7)

| Breakpoint | HI-01 | RP-01 | RP-02 |
| --- | --- | --- | --- |
| `xs` 320–359 | Single column; the row meta wraps to 2 lines; date under the score | Portrait: board rotated to fill the width; controls row 3 scrolls horizontally (chips keep ≥ 44 px) | Bottom sheet up to 90% `dvh`; seed groups wrap |
| `sm` 360–599 (390 × 844) | Single column | As §4; every control within the bottom 40% | Bottom sheet |
| `md` 600–1023 | Side rail; list plus detail panel (MA-14 content, with "Watch replay") | Portrait 768 × 1024: natural board orientation, full width; move list as an end-edge side sheet. Landscape: board plus one end panel (move list). | Centered dialog, max 480 px |
| `lg` ≥ 1024 | Shell max 1280: side rail, list, detail panel | Board plus start panel (move list) and end panel (match info, verify dice). At 1024 × 768 the end panel collapses to a toggle (as match.md §10 Q12). Controls below the board. | End side panel |

- **Landscape phones** (height < 500 px): RP-01 uses the natural board orientation; controls move to a vertical column on the end edge (play/pause in the lower half), scrubber along the bottom edge under the board.
- `dvh`/`svh` only; `env(safe-area-inset-*)` respected by the top strip and controls.
- Keyboard on `m.`: Space play/pause, ← / → step, Home / End, 1–9 jump to a game, `+` / `-` speed, V verify dice, Esc closes sheets or goes back. Arrow keys follow the on-screen controls, which never mirror (P§11): → is always forward.

---

## 7. RTL/LTR notes and i18n keys

- fa first. The list, app bar, back arrows, chips, and sheets mirror.
- **Media controls never mirror** (P§11): play, pause, step back, step forward, speed, and the scrubber keep LTR direction in fa; step buttons carry text tooltips ("Previous move", "Next move"). The board, dice, and cube never mirror.
- Score is "self – opponent" in `<bdi>`. Move notation follows match.md §7.
- Dates: Jalali in fa (`fa-IR-u-ca-persian`), Gregorian in en; relative "today" / "yesterday" words.
- Seed, commitment, and match id: hex, LTR, Latin, monospace, in `<bdi dir="ltr">`.
- Speed labels use locale digits: «۰٫۵×», «۱×», «۲×», «۴×».

| Key | fa | en |
| --- | --- | --- |
| `history.title` | تاریخچه‌ی مسابقه‌ها | Match history |
| `history.intro` | مسابقه‌های شما، از جدیدترین | Your matches, newest first. |
| `history.row.result.won` | برد | Won |
| `history.row.result.lost` | باخت | Lost |
| `history.row.result.cancelled` | لغو شد | Cancelled |
| `history.row.result.voided` | باطل شد | Voided |
| `history.row.result.active` | در جریان | In progress |
| `history.row.returnToMatch` | بازگشت به مسابقه | Return to match |
| `history.row.table` | میز {entry} سکه‌ای | {entry}-coin table |
| `history.row.practice` | تمرینی | Practice |
| `history.row.tournament` | تورنمنت | Tournament |
| `history.row.today` | امروز، {time} | Today, {time} |
| `history.row.yesterday` | دیروز، {time} | Yesterday, {time} |
| `history.row.unknownPlayer` | بازیکن | Player |
| `history.row.label` | {result} در برابر {opponent}، {score}، {meta}، {date} | {result} against {opponent}, {score}, {meta}, {date} |
| `history.empty` | هنوز بازی نکرده‌اید. | You haven't played yet. |
| `history.emptyAction` | بازی با ربات | Play vs bot |
| `history.loadError` | تاریخچه بارگذاری نشد. | Couldn't load your match history. |
| `history.loadMoreError` | بقیه‌ی فهرست بارگذاری نشد. | Couldn't load more. |
| `replay.title` | بازپخش | Replay |
| `replay.subtitle` | {username} · {date} | @{username} · {date} |
| `replay.private` | خصوصی | Private |
| `replay.privateNote` | فقط شما و {username} می‌توانید این بازپخش را ببینید. | Only you and @{username} can watch this replay. |
| `replay.loading` | در حال بارگذاری بازپخش | Loading replay |
| `replay.menu` | منوی بازپخش | Replay menu |
| `replay.play` | پخش | Play |
| `replay.pause` | توقف | Pause |
| `replay.stepBack` | حرکت قبلی | Previous move |
| `replay.stepForward` | حرکت بعدی | Next move |
| `replay.speed` | سرعت {speed} | Speed {speed} |
| `replay.speedValue` | {value}× | {value}× |
| `replay.position` | حرکت {i} از {n} · دست {g} | Move {i} of {n} · Game {g} |
| `replay.scrubber` | موقعیت بازپخش | Replay position |
| `replay.game.selector` | دست {g} از {m} | Game {g} of {m} |
| `replay.game.itemYou` | دست {g} · شما +{points} ({kind}) | Game {g} · you +{points} ({kind}) |
| `replay.game.itemThem` | دست {g} · {username} +{points} ({kind}) | Game {g} · @{username} +{points} ({kind}) |
| `replay.moves` | حرکت‌ها | Moves |
| `replay.now` | الان | Now |
| `replay.note.timeout` | زمان {username} تمام شد ({count} از {limit}) | @{username} ran out of time ({count} of {limit}) |
| `replay.note.disconnected` | اتصال {username} قطع شد | @{username} disconnected |
| `replay.note.back` | {username} برگشت | @{username} returned |
| `replay.note.reaction` | {username}: {text} | @{username}: {text} |
| `replay.showReactions` | نمایش واکنش‌ها | Show reactions |
| `replay.end.again` | بازپخش از ابتدا | Replay from start |
| `replay.hint.verify` | می‌توانید بررسی کنید که همه‌ی پرتاب‌ها از تاس‌هایی آمده‌اند که پیش از مسابقه تعیین شده بودند. | You can check that every roll came from the dice fixed before the match. |
| `replay.renderError` | نمایش صفحه با مشکل روبه‌رو شد. فهرست حرکت‌ها هنوز در دسترس است. | The board couldn't be drawn. The move list is still available. |
| `replay.verify.title` | بررسی تاس‌ها | Verify dice |
| `replay.verify.explain` | پیش از مسابقه، سرور یک بذر مخفی تعیین کرد و اثر انگشت آن (تعهد) را به هر دو بازیکن نشان داد. حالا بذر منتشر شده است. دستگاه شما همه‌ی پرتاب‌ها را از روی بذر دوباره حساب می‌کند و هر دو را بررسی می‌کند. | Before the match, the server fixed a secret seed and showed both players its fingerprint (the commitment). Now the seed is published. Your device recomputes every roll from the seed and checks both. |
| `replay.verify.commit` | تعهد (پیش از مسابقه) | Commitment (before the match) |
| `replay.verify.seed` | بذر (پس از مسابقه) | Seed (after the match) |
| `replay.verify.count` | {n, plural, one {# پرتاب برای بررسی} other {# پرتاب برای بررسی}} | {n, plural, one {# roll to check} other {# rolls to check}} |
| `replay.verify.run` | بررسی کن | Verify now |
| `replay.verify.again` | بررسی دوباره | Verify again |
| `replay.verify.progress` | بررسی پرتاب {i} از {n} | Checking roll {i} of {n} |
| `replay.verify.stop` | توقف | Stop |
| `replay.verify.commitOk` | بذر با تعهدی که پیش از مسابقه نشان داده شد مطابقت دارد. | The seed matches the commitment shown before the match. |
| `replay.verify.commitBad` | بذر منتشرشده با تعهد مطابقت ندارد. | The published seed doesn't match the commitment. |
| `replay.verify.allOk` | {n, plural, one {پرتاب با بذر مطابقت دارد.} other {همه‌ی # پرتاب با بذر مطابقت دارند.}} | {n, plural, one {The roll matches the seed.} other {All # rolls match the seed.}} |
| `replay.verify.someBad` | {k} از {n} پرتاب مطابقت ندارد. | {k} of {n} rolls don't match. |
| `replay.verify.mismatchRow` | پرتاب {i} · دست {g}: ثبت‌شده {a}–{b}، محاسبه‌شده {c}–{d} | Roll {i} · Game {g}: recorded {a}–{b}, computed {c}–{d} |
| `replay.verify.support` | این نباید اتفاق بیفتد. لطفاً با این شناسه با پشتیبانی تماس بگیرید: {id} | This shouldn't happen. Please contact support with this reference: {id} |
| `replay.verify.unsupported` | این مرورگر نمی‌تواند بررسی را انجام دهد. از یک مرورگر به‌روز استفاده کنید. | This browser can't run the check. Try an up-to-date browser. |
| `replay.verify.howTitle` | خودتان بررسی کنید | How to check it yourself |
| `replay.verify.howSteps` | ۱. SHA-256 بایت‌های بذر باید برابر تعهد باشد. ۲. پرتاب‌ها از صفر شماره می‌خورند و پرتاب شروع و پرتاب‌های مساوی هم شمرده می‌شوند. ۳. برای پرتاب n، HMAC-SHA256 را با کلید بذر روی متن «match_id:n:k» برای k = 0، 1، … حساب کنید. ۴. هر بایت کمتر از ۲۵۲ را بپذیرید؛ عدد تاس = (بایت mod 6) + 1؛ دو تاس اول، پرتاب است. | 1. SHA-256 of the seed bytes must equal the commitment. 2. Rolls are numbered from 0, counting opening rolls and ties. 3. For roll n, compute HMAC-SHA256 keyed with the seed over the text "match_id:n:k" for k = 0, 1, …. 4. Accept each byte below 252; die = (byte mod 6) + 1; the first two dice are the roll. |
| `replay.verify.matchId` | شناسه‌ی مسابقه | Match id |
| `replay.private.title` | این بازپخش خصوصی است | This replay is private |
| `replay.private.body` | این بازپخش فقط برای دو بازیکن این مسابقه در دسترس است. | This replay is only available to the two players of the match. |
| `replay.private.watchLive` | تماشای زنده | Watch live |
| `replay.notFound.title` | بازپخش پیدا نشد | Replay not found |
| `replay.notFound.body` | نشانی را بررسی کنید یا تاریخچه‌ی مسابقه‌های خود را باز کنید. | Check the link, or open your match history. |
| `replay.active.title` | مسابقه هنوز در جریان است | The match is still going |
| `replay.active.body` | بازپخش پس از پایان مسابقه در دسترس است. | The replay will be available when the match ends. |
| `replay.aborted.title` | چیزی برای بازپخش نیست | Nothing to replay |
| `replay.aborted.body` | این مسابقه پیش از اولین پرتاب تاس تمام شد. | This match ended before the first roll. |
| `replay.purged.title` | این بازپخش دیگر در دسترس نیست | This replay is no longer available |
| `replay.purged.body` | بازپخش‌های قدیمی پس از مدتی حذف می‌شوند. نتیجه‌ی مسابقه هنوز در تاریخچه‌ی شما هست. | Old replays are removed after a while. The match result is still in your history. |
| `replay.loadError.title` | بازپخش بارگذاری نشد | Couldn't load the replay |
| `replay.matchSummary` | خلاصه‌ی مسابقه | Match summary |

Shared keys used: `common.back`, `common.retry`, `common.close`, `common.copy`, `common.copied`, `common.showMore`, `common.lastUpdated`, `common.errorCode`, `common.help`, `net.offline`, `net.offlineAction`, `play.variant.*`, `play.length.firstTo`, `play.bot.name`, `play.bot.label`, `match.kind.*`, `match.result.*` (reason strings), `match.gameEnded.*`, `match.history.*` (notation markers), `match.summary.*`, `match.notFound.history`, `reactions.emoji.<key>`, `reactions.phrase.<key>`, `settings.lite.label`, `settings.sound.label`, `errors.forbidden`, `errors.notFound`, `errors.network`, `errors.validation`, `errors.generic`.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| HI-01 | Suspension banner (if any) → app bar (back, title, balance chip) → intro → rows in order → Show more |
| RP-01 | Back → title → Private (button) → menu → opponent bar → board region (one stop; Enter reads the position as text, match.md MA-18 read-only) → own bar → scrubber → step back → play/pause → step forward → speed → game selector → Verify dice → Moves |
| RP-02 | Title (focused on open) → explanation → commitment + copy → seed + copy → count → Verify now → results (focused when done) → support line + copy → "How to check it yourself" → close |
| RP-03 | Title (focused) → body → primary → secondary |

**Labels and announcements**

- Media buttons: `replay.play` / `replay.pause` (toggles the name with the state), `replay.stepBack`, `replay.stepForward`, `replay.speed`.
- Scrubber: `role="slider"` with `aria-valuetext` = `replay.position`.
- Rows: one accessible name `history.row.label` (result word first).
- Polite live region: the current step's summary when stepping manually (dice values, move summary, cube action, game result). During continuous playback, only game results and the final result are announced (moves would be too chatty); pausing announces the current step.
- RP-02: progress announced at 25% steps; the final result announced once.

**Other rules**

- Not color alone: result chips (icon + text), the current move ("Now" label + outline), game ticks on the scrubber (numbers), verify outcomes (icon + text), the Private label (lock icon + text).
- Contrast: 4.5:1 for text over the scene (solid bars and control backgrounds); the seed text in monospace meets 4.5:1.
- Targets: all controls ≥ 44 × 44 px; play/pause ≥ 56 px; the scrubber thumb has a 44 px hit area.
- Motion: reduced motion removes checker and dice animation (§3.3 step 11).
- Text size 200%: the controls' chip row scrolls horizontally inside its container only (no page scroll); the seed wraps by groups; rows grow in height.

---

## 9. Acceptance criteria

1. HI-01 lists matches newest first with opponent (or Bot label and level), result chip (icon + text), score self – opponent, variant, length, table or "Practice", and a Jalali date in fa. "Show more" loads the next cursor page and hides when `next` is null.
2. An active row opens the player view; other rows open MA-14 (detail panel at `md`/`lg` with the URL updated).
3. No history row shows a coin, rating, or XP value unless the API returns it.
4. `/replay/[id]` for a non-player shows RP-03 "private" with no request-access and no share action; the replay API returned 403 and no 3D was loaded.
5. `404` shows "Replay not found"; an active match shows "not yet available" with "Return to match"; an aborted match shows "Nothing to replay".
6. RP-01 opens paused at the start of game 1 (or `?game=N`) with the viewer's checkers at the bottom.
7. Play advances automatically; Pause stops; step forward animates one step; step back restores the previous state instantly; the scrubber jumps to any step; the game selector and keys 1–9 jump to game starts.
8. Speeds 0.5×, 1×, 2×, 4× change the pacing of every step; 1× moves at about one turn per 2 s; think time is never replayed.
9. Dice throws in the replay use the recorded `throw_seed` and land on the recorded values; lite mode uses the 300 ms fade.
10. Reactions appear as bubbles at their position in the sequence and as lines in the move list; the "Show reactions" switch hides the bubbles.
11. Media controls and the scrubber keep LTR direction in fa; → is forward in both locales.
12. RP-02 checks the commitment and every `turn.rolled` event on the device with no network request, shows progress, and ends with "All {n} rolls match" or a list of mismatches with recorded and computed values and the support reference.
13. The roll counter includes opening rolls and ties; a test replay with a tie at the opening verifies as all matching.
14. `?verify=1` opens RP-02 after the replay loads.
15. No control on HI-01, MA-14, RP-01, RP-02, or RP-03 shares, copies a link to, downloads, or exports a replay; `/replay/[id]` sets `noindex`.
16. Suspended users can open history, replays, and verify dice.
17. In portrait at 360 × 800, 390 × 844, and 430 × 932, all RP-01 controls sit in the bottom 40% and every target is ≥ 44 × 44 px.
18. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape: no horizontal page scroll, no clipped text at 200%.
19. All strings come from i18n keys with fa and en; every error in §3.6 has a mapped state.

---

## 10. Open questions and API gaps

For the main agent unless noted.

1. **`you` is null in the replay payload.** `replay_payload` calls `match_summary(match)` without the viewer's side, so the viewer's perspective needs an extra `GET matches/{id}`. Proposal: pass the side (the view already has it from `side_of`).
2. **No per-player outcome in `MatchSummary`.** journeys.md J6 expects a coin change on each history row, and MA-14 needs rating and XP. Proposal (same as match.md Q6): `you_outcome: {coins_net, elo_delta, xp}` for the requester, plus per-game `results[]`.
3. **Retention isn't enforced and has no response.** `replay.retention_days` exists, but nothing purges events and there is no way to tell "purged" from "empty". When purging lands, please return `410 REPLAY_PURGED` (summary still readable) so RP-03 can show the right state.
4. **No replay player or dice verifier in shared code.** `packages/game-core` says it contains a replay player, but none exists, and nothing implements the §6 check in TypeScript. Proposal: `game-core` `buildReplay(events) → steps` with `seek(i)` (pure, testable, reused in Phase 2 and by the admin viewer) and `verifyDice(seed, seedCommit, matchId, rolls)` on WebCrypto, with a test against the backend's `fair.roll` vectors.
5. **Generic 403 code.** The replay 403 is `FORBIDDEN` / `errors.forbidden`. The UI maps it contextually, so this is optional; a `REPLAY_FORBIDDEN` code would make logs clearer.
6. **Tournament flag in `MatchSummary`.** Rows can't say "Tournament" (entry 0 and not a bot is only a guess). Proposal: `tournament_id` (and name) in `MatchSummary`.
7. **History filters.** No filter by opponent, variant, bot, or date exists. Not needed for launch; confirm.
8. **Replay of an active match.** The endpoint returns the events so far (with `seed: null`) for a running match. The UI doesn't use them (RP-03 "not yet available"). Consider returning `409` for active matches so the log isn't exposed early; players are the only callers, so this is low risk.
9. **`match_event.actor` for player A** is recorded as `system` (match.md Q3). The player replay derives the actor from payload fields (`player`, `sender`), so it isn't affected; the admin viewer is.
10. **History cursor.** The cursor is `created_at` only, with `created_at < cursor`; two matches created in the same microsecond could be skipped. Backend note: use `(created_at, id)`.
11. **Deleted or nameless players.** `MatchPlayerSummary.username` is nullable; this spec shows "Player". Confirm there is no account deletion flow that needs a different label.
