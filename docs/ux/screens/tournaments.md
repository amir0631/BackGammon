# Tournaments: list, detail, registration, bracket, prizes

Status: draft for UI build (CLAUDE.md §17 step 13).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 2–5, 10; §5.2; §5.4; §7.6; §8; §10.2 (Tournaments); §10.3 (`match.found`); §11.5 (push); §11.7; §12.1 (suspended); §14 (`tournament.*`, `game.reconnect_grace_seconds`); §20.4; §21.2; ia.md §1–§3; patterns.md (P§) 1, 2, 3, 4, 5, 6.2, 9, 10, 11, 13, 14, 15, 16, 17; journeys.md J4; personas P3 Hamid, P1 Reza.
Related specs: `play.md` (PL-05 insufficient sheet, PL-08 resume banner, `play.variant.*`, `play.length.*`), `match.md` (MA-01 loader, MA-13 result sheet tournament row, MA-19, §10 Q5 tournament context), `live.md` (tournament rows first, `?tournament=` filter, spectator view), `shop.md` (item prizes in the owned list), `wallet.md` (`wallet.tx.tournament_*` ledger rows), `system.md` (TO-07 push permission sheet, step 17).

Screen IDs follow screen-inventory.md §2.5. TO-08 (tournament match ready dialog) is new.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET tournaments?status=` | `{results: TournamentInfo[], next: null}`, at most 100, ordered by `starts_at`. No `status` → `scheduled` and `running`. `status` = `scheduled`, `running`, `finished`, or `cancelled` filters to one. |
| `TournamentInfo` | `id`, `name` (`{fa, en}`), `variant`, `length`, `entry` (0 = free), `capacity` (power of two, 2–64), `entries` (registered count), `starts_at` (ISO), `status`, `round` (current round, 0 before start), `rounds` (= log2 capacity), `prize_split` (percent per place, e.g. `[50, 25, 12.5, 12.5]`), `prizes` (coins per place when full), `joined` (caller registered), `cancel_reason` (`"not_filled"`, free admin text, or null) |
| `GET tournaments/{id}` | `TournamentInfo`; unknown id → `404 NOT_FOUND` |
| `POST tournaments/{id}/join` + `Idempotency-Key` | `201 TournamentInfo` (`joined: true`). A second call for the same player returns the existing entry and charges nothing. |
| `DELETE tournaments/{id}/join` | `200 TournamentInfo` (`joined: false`), full refund. Not registered → no-op. |
| `GET tournaments/{id}/bracket` | `{tournament: TournamentInfo, slots: BracketSlotInfo[]}`. `BracketSlotInfo`: `round`, `position`, `players [a, b]` (usernames or null), `winner` (username or null), `match_id`, `score [a, b]` or null, `live` (match active). Only slots that exist are returned: none before the start; later rounds appear when their first player is known. |
| WS `match.found` | Sent to both players when their bracket match is created: `{match_id, you, opponent, seed_commit, variant, length, entry: 0}`. No tournament field (§10 Q2). |
| `GET me/matches/active` | `{match_id, is_bot, opponent, score, your_turn}`: drives the resume banner (play.md PL-08) |
| `GET wallet` | `balance` for the cost block |

Server rules the UI relies on (`backend/tournaments/services.py`, `backend/game/results.py`, `backend/realtime/live.py`):

- **Format:** single elimination at `capacity` players. Seeded by ELO at the start (1 vs N, 2 vs N−1, seeds 1 and 2 in opposite halves). Bracket matches have no per-match entry, no prediction pool, and **are rated** (ELO and XP apply like any human match).
- **Registration:** open while `status = scheduled` and `now < starts_at`. Refused when full (`full`) or closed (`closed`). Joining twice is a no-op. Leaving is allowed while `status = scheduled` (a few seconds past `starts_at` until the start job runs) with a full refund.
- **Start:** a job checks every 5 s. At `starts_at`, if `entries < capacity` the tournament is **cancelled** with `cancel_reason = "not_filled"` and every entry is refunded in full. If full: seeds, round 1 matches are created at once, and each player gets `match.found`.
- **Money (§7.6):** `total = entry × capacity`; `rake = floor(total × rake_pct / 100)` (snapshotted at creation); each place gets `floor(pool × percent)`; dust to the platform. `prizes` already applies this. Item prizes per place are stored (`prize_items`) but **not exposed** (§10 Q4).
- **Places:** 1 = champion, 2 = runner-up, then the losers of each earlier round share the next places **ordered by seed**, not by play (3–4 for semi-final losers, 5–8 for quarter-final losers, …). If the split gives 3rd and 4th different amounts, the higher seed gets the larger one (§10 Q6).
- **No-show:** a player who never connects to their bracket match forfeits it after `game.reconnect_grace_seconds` (default 90) from match creation, exactly like a disconnect. There is no abort or refund in tournament matches: resigning or cancelling before the first roll is a loss (match.md MA-19 must not offer "cancel with refund" here).
- **Next rounds:** when both feeders of a slot have a winner, the next match is created at once and both players get `match.found`. There is no break between rounds.
- **Cancel by admin:** any time before `finished`; every entry refunded; `cancel_reason` is the admin's free text.
- **Suspended (§12.1):** `join` → `ACCOUNT_SUSPENDED`. Leaving is allowed (it refunds). What happens to a registered player suspended before the start is open (§10 Q10).

---

## 1. Goal and user story

- As a competitive player (P3 Hamid), I want to see upcoming tournaments with their format, entry, prizes, and start time, register in two taps with the cost shown, and follow my path through the bracket.
- As a regular (P1 Reza), I want to know exactly what happens to my entry if the tournament doesn't fill, is cancelled, or I change my mind.
- As a registered player, I never want to lose a round because I didn't know my match had started.

Success means:
- No entry is taken without the entry, the prizes, the balance, the balance after, and the refund rule on screen, and nothing pre-selected.
- A registered player sees the start time everywhere it matters and, when their match is ready, a blocking notice with the time left to join.
- Cancelled and not-filled tournaments always say that the entry was refunded, and how much.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Bottom nav "Tournaments" (side rail at `md`/`lg`) | TO-01 `/tournaments` (last segment kept for the session) |
| Deep link or push (step 17) `/tournaments/[id]` | TO-02 |
| Live row or LV-05 "Match info" of a tournament match (live.md) | TO-02 `?tab=bracket` |
| Match result sheet "View bracket" (match.md MA-13) | TO-03 |
| Announcement link to `/tournaments` or `/tournaments/[id]` (news.md) | TO-01 / TO-02 |
| Ledger row `tournament_*` in WA-02 (wallet.md) | TO-02 (when the row carries `ref_id`) |
| Redirect from `app.` with path and query | Same route |

| Exit | Destination |
| --- | --- |
| TO-08 "Go to match", resume banner, bracket slot "Play" (own live slot) | `/match/[id]` player view (MA-01 → MA-02) |
| Bracket slot "Watch" (other live slot) | `/match/[id]` spectator view (live.md LV-03) |
| "Live matches of this tournament" | `/live?tournament=<id>` |
| Player name in the bracket | `/profile/[username]` |
| Insufficient sheet "Get coins" | `/shop/coins` (shop.md) |
| "?" links | `/help/tournaments`, `/help/variants` |

---

## 3. Flow

### 3.1 List (TO-01)

1. Segments (tabs, URL `?segment=`): **Upcoming** (default), **Mine**, **In progress**, **Finished**.
   - Upcoming: `GET tournaments?status=scheduled`.
   - In progress: `GET tournaments?status=running`.
   - Finished: `GET tournaments?status=finished` and `?status=cancelled`, merged, newest `starts_at` first.
   - Mine: `joined = true` across the four calls (§10 Q3), grouped "Coming up", "Playing now", "Past".
2. Order: server order (`starts_at` ascending) for Upcoming and In progress. No sort control.
3. Refresh every 30 s while visible and online (counts and status only); pull to refresh; a card whose status changed moves only after refresh, never under the finger.
4. Card tap → `/tournaments/[id]` (full screen at `sm`, detail panel at `md`/`lg`, ia.md §3.3).

### 3.2 Detail (TO-02)

1. `GET tournaments/{id}` (and `GET wallet` for the cost block). Tabs Overview | Bracket (`?tab=`). Bracket is disabled with the reason `tournaments.bracket.notYet` while `scheduled`.
2. Overview content follows §4 TO-02. The primary action depends on state:

   | State | Primary | Secondary |
   | --- | --- | --- |
   | `scheduled`, not joined, places left, before `starts_at` | "Register · {entry} coins" (or "Register · free") → TO-04 | — |
   | `scheduled`, not joined, full | Disabled, reason "All places are taken" | "Other tournaments" → TO-01 |
   | `scheduled`, joined | None; status card "You're registered" | "Leave tournament" (text button) → TO-05 |
   | `scheduled`, `starts_at` passed (start job pending) | None; "Starting…" with a progress indicator | — |
   | `running`, joined, still in | Status card with the current state (§3.6) | "Bracket" |
   | `running`, not joined or eliminated | "View bracket" | "Live matches of this tournament" |
   | `finished` | Result card (§3.7) | "View bracket" |
   | `cancelled` | Cancelled card (§3.8) | "Other tournaments" |

3. Refresh every 15 s while `scheduled` and less than 10 minutes before the start, or while `running`; otherwise every 60 s. A status change re-renders the state table above in place and announces it politely.

### 3.3 Register (TO-04)

1. Client check first: `balance < entry` → insufficient sheet (§3.9). Suspended → the button is already disabled.
2. TO-04 sheet (P§2.1 anatomy; `CostConfirmation`):

   | Row | Value |
   | --- | --- |
   | Title | "Register for {name}" |
   | Summary | Variant, "First to {n}", "{capacity} players · single elimination", start date and time (Jalali in fa) plus relative ("in 3 hours") |
   | Entry | {entry} coins, with the toman equivalent (P§2.1). Free: row reads "Free", no toman line. |
   | Your balance / Balance after | balance, balance − entry (free: rows omitted) |
   | Prizes | The prize table (§4 TO-02 item 4), compact |
   | Refund rule | "If the tournament isn't full at the start time, or is cancelled, your entry is refunded in full. You can leave and get it back until it starts." |
   | Presence rule | "Your first match starts automatically at {time}. If you don't join a match within {grace}, you lose that match." (grace from §10 Q2; until exposed, the sentence without the number: "…within the joining time, you lose that match.") |
   | Rated | "Tournament matches are rated." (icon + text) |
   | Primary | "Pay {entry} coins and register" / free: "Register" |
   | Secondary | Cancel |
   | Help | "?" → `/help/tournaments` |

3. Primary → `POST tournaments/{id}/join` with a new `Idempotency-Key` created when the sheet opens. In-flight per P§2.2 (spinner, not dismissible, repeat taps ignored). No response in 10 s → "Still working…" + "Check status" = `GET tournaments/{id}`; `joined: true` → success; `false` → resend with the **same** key (safe: the server returns the existing entry).
4. Success: sheet closes; TO-02 shows "You're registered"; balance chip updates; snackbar "Registered for {name}". From step 17: the push explanation sheet (system.md TO-07) opens once, on this first registration only (P§15).
5. Errors → §3.10.

### 3.4 Leave (TO-05)

1. "Leave tournament" (only while `scheduled`) opens TO-05: "Leave {name}?", "{entry} coins go back to your balance." (free: "You can register again while places are left.").
2. Buttons: "Leave and get {entry} coins back" (destructive styling plus text) / "Stay registered" (initial focus, P§3).
3. `DELETE tournaments/{id}/join`. In flight: not dismissible. Success: TO-02 returns to the not-joined state; balance chip updates; snackbar "You left {name}. {entry} coins were refunded."
4. `TOURNAMENT_REFUSED {reason: closed}` → "The tournament has already started, so you can't leave now." TO-02 refreshes.

### 3.5 Before the start (TO-06 pre-start)

1. While the app is open and the user is registered in a `scheduled` tournament that starts within 15 minutes, a global banner shows on every non-immersive screen: "{name} starts in {mm:ss}. Your first match opens automatically." Action "Details" → TO-02. Not dismissible in the last 15 minutes. The countdown is computed from `starts_at` (client clock); at 0 it reads "Starting…".
2. TO-02 shows the same countdown in the status card from 60 minutes before.
3. Tournaments tab dot (ia.md §3.1) while a registered tournament starts within 15 minutes or a bracket match is ready.
4. No banner during a match, matchmaking, a payment, or a money task flow; it resumes after.
5. **Conflict warning:** if the user taps Play or Play vs bot (play.md) while registered in a tournament starting within 15 minutes, PL-02/PL-04 show an info line: "Your tournament {name} starts at {time}. A table match may still be running then." (§10 Q9). Nothing is blocked.

### 3.6 Match ready and between rounds (TO-08, TO-06)

1. **`match.found` with `entry: 0`, not a bot, received while not in the matchmaking overlay** is treated as a tournament match (§10 Q2 until a tournament field exists). Show **TO-08**, a blocking dialog (P§1: time-critical):
   - Title "Your tournament match is ready"
   - "{name} · Round {r} of {rounds}" (from the last loaded registered tournament; omitted if unknown)
   - Opponent card: avatar, username, level, ELO
   - Countdown: "Join within {mm:ss} or you lose this match" (from `join_deadline`, §10 Q2; until available, from the receipt time with the grace from §10 Q2; until that exists, the sentence without a countdown). Warning style (icon plus text) at 30 s and 10 s; polite announcement at those points.
   - Primary "Go to match" → `/match/[id]`. Secondary "Not now": closes the dialog; the resume banner (PL-08, tournament variant) stays with the same countdown until the player joins or the time runs out.
   - Never auto-navigate while the user is in a sheet or task flow; the dialog opens over it after the flow's in-flight request finishes.
2. If `match.found` arrives while the user is in another match: the in-match overlay shows a non-blocking notice "Your tournament match is ready. Join within {mm:ss}." with "Details" (opens TO-08 content in a sheet). Both matches' clocks run (§10 Q9).
3. If the user was offline at start, the next app open lands in the running match (ia.md §4) with MA-01; if the grace already expired, the match shows the MA-13 result "Lost: didn't join in time".
4. **After winning a round** (MA-13 tournament row → "View bracket"): TO-02 status card "You won round {r}. Next: {opponent or 'winner of @x vs @y'}. Your match opens automatically when they finish." with the running feeder match and a "Watch" link (P§6.2 wait: progress = the feeder match's score and game; way out = watch, or leave the screen).
5. **After losing:** "You're out in round {r}. Your final place is set when the tournament ends." No shop link, no "try another tournament" prompt on the result (P§9.1); TO-01 is reachable from the nav as always.
6. **Champion or runner-up is decided:** §3.7.

### 3.7 Finished (TO-02 result)

1. Result card for a player who took part: "You placed {place}" (1st: "You won {name}"), prize "+{prize} coins" with "won" (P§10 signed amounts), item prize name when present (§10 Q4) with "View in Shop" → the owned item in shop.md.
2. Place source: `place` and `prize` in the payload (§10 Q5). Until then: derive from the final slot (winner = 1, other finalist = 2); for earlier eliminations show "Out in round {r}" and the prize table without a personal place.
3. Everyone: champion and runner-up line, final bracket, prize table with the paid amounts.

### 3.8 Cancelled (TO-02, TO-01 card)

| `cancel_reason` | Card text |
| --- | --- |
| `not_filled` | "This tournament was cancelled because it wasn't full at the start time ({entries} of {capacity})." |
| Other (admin) | "This tournament was cancelled by the organizers." The admin's free text is **not** shown (it may be internal or single-language; §10 Q7). |

- If `joined`: second line "Your entry of {entry} coins was refunded to your wallet." (free: omitted) with "View wallet" → `/wallet`.
- Cancelled cards in Finished show a "Cancelled" chip (icon plus text), never styled as an error.

### 3.9 Insufficient coins

The shared PL-05 sheet (play.md §3.7, P§9.1) with the tournament variant:
- Rows: Entry, Your balance, Shortfall.
- Options in order: (1) other `scheduled` tournaments that are not full, with a lower entry the user can afford (at most 3 rows: name, entry, start time) → their TO-02; (2) "Get coins" (text-style) → `/shop/coins`; (3) Close.
- Never shown from a tournament result or after elimination.

### 3.10 Error map

| Code (HTTP) | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `TOURNAMENT_REFUSED {reason: full}` (409) | join | TO-04 action error; primary disabled; nothing charged; TO-02 refreshes to the full state | `errors.tournaments.refused` | `tournaments.error.full` |
| `TOURNAMENT_REFUSED {reason: closed}` (409) | join | TO-04 action error "Registration has closed."; TO-02 refreshes | ← | `tournaments.error.closedJoin` |
| `TOURNAMENT_REFUSED {reason: closed}` (409) | leave | TO-05 action error; TO-02 refreshes | ← | `tournaments.error.closedLeave` |
| `WALLET_INSUFFICIENT {balance, needed}` (409) | join | Close TO-04, open §3.9 with the server balance | `errors.wallet.insufficient` | `coins.insufficient.title` |
| `ACCOUNT_SUSPENDED` (403) | join | TO-04 action error; re-fetch `GET me`; TO-02 switches to the suspended state | `errors.wallet.accountSuspended` | `account.suspended.actionBlocked` |
| `IDEMPOTENCY_KEY_REQUIRED` (400) | join | Client bug: `errors.generic` + code; nothing charged | `errors.wallet.idempotencyKeyRequired` | — |
| `NOT_FOUND` (404) | detail, bracket | TO-02 not-found state: "This tournament doesn't exist." + "All tournaments" | `errors.notFound` | `tournaments.notFound` |
| `NETWORK` | reads | Screen error + Retry | `errors.network` | `tournaments.loadError` |
| `NETWORK` | join | "Still working… / Check status" (§3.3 step 3); never a new key | `errors.network` | `common.stillWorking` |
| `NETWORK` | leave | Action error + "Try again" (safe: leaving twice is a no-op) | `errors.network` | — |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` (401) | all | api-client refreshes once; else SY-08 | `errors.unauthenticated` | — |
| `AUTH_BANNED` (403) | all | `/login` with AU-14 | `errors.auth.banned` | — |
| Any other | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

---

## 4. Screen list

### TO-01 Tournament list `/tournaments` (Tab 3 root)

- **Purpose:** find a tournament to join or follow.
- **App bar:** logo, title "Tournaments", balance chip.
- **Content priority:**
  1. Announcement banner if any (news.md NW-01).
  2. Pre-start banner (§3.5) when applicable.
  3. Segmented tabs: Upcoming · Mine · In progress · Finished.
  4. First-visit hint (P§14, once): "Tournaments start only when full. If one doesn't fill, everyone gets their entry back."
  5. Cards.
- **Card content, in order:**
  1. Name (current locale; fallback to the other locale with its `lang`, §7).
  2. Status chip (icon plus text): "Open for registration", "Full", "Starting…", "Round {r} of {rounds}", "Finished", "Cancelled". Plus "Registered" (check icon plus text) when `joined`.
  3. Variant name · "First to {n}".
  4. Entry with coin icon ("{entry} coins" or "Free") · "1st prize: {prizes[0]} coins" (omitted when 0).
  5. Start: Jalali date and time in fa + relative ("in 2 days"); running: "Started {relative}".
  6. Places: "{entries} of {capacity} registered" with a thin bar (bar is decorative; the text carries the value).
- **Primary action:** tap a card (whole card, ≥ 88 px tall). No buttons inside cards.

### TO-02 Tournament detail `/tournaments/[id]` (Tab 3 child), Overview tab

- **App bar:** back (mirrors), name (truncates to 1 line, full name in the heading below), balance chip.
- **Content priority:**
  1. Heading: name, status chip, "Registered" chip.
  2. Status card (state-dependent: registered + countdown, starting, your current round, waiting, out, result, cancelled + refund).
  3. Key facts list:
     - Start: date, time, relative.
     - Format: "{capacity} players · single elimination · {rounds} rounds · seeded by rating".
     - Variant (with "?" → `/help/variants`) and "First to {n}".
     - Entry ("{entry} coins" + toman equivalent, or "Free").
     - Places: "{entries} of {capacity} registered".
     - "Rated: tournament matches change your rating."
  4. Prizes table: Place | Share | Prize. Rows from `prize_split` and `prizes` ("1st · 50% · 900 coins"). Places sharing a percent are listed separately (3rd, 4th). Item prizes appear as a second line in the row when exposed (§10 Q4). Under the table:
     - "Prize pool: {sum of prizes} coins from {entry × capacity} coins of entries, after the {rake_pct}% platform fee." (`rake_pct` §10 Q1; until exposed: "…after the platform fee.")
     - When two places below 2nd have different prizes: "Players knocked out in the same round are placed by their starting seed."
     - Free tournaments with no coin prizes: "No coin prizes." (items only, if any).
  5. Rules block (always visible, not collapsed): refund rule, leave rule, presence rule (§3.3), "Bots never play in tournaments.", "Predictions aren't offered on tournament matches."
  6. Links: "Live matches of this tournament" (running), "?" → `/help/tournaments`.
- **Primary action:** per §3.2 table, in a sticky footer (thumb zone) at `sm`.

### TO-03 Bracket `/tournaments/[id]?tab=bracket`

- **Purpose:** see who plays whom, results, and live matches.
- **Structure:**
  - Rounds named from the end: "Final", "Semi-finals", "Quarter-finals", else "Round {r}" (`r` = 1-based). Slots for every round are drawn from `rounds` and `capacity`; missing slots are placeholders "To be decided".
  - Slot card: two player rows (avatar placeholder, username LTR-isolated; "To be decided" when null), score per row when a match exists (`score[a]`, `score[b]`), winner row marked with a check icon, bold weight, and the visually hidden word "winner" (not color alone). Live slot: "Live" chip (icon plus text) and a "Watch" action (or "Play" for the viewer's own slot).
  - Your path: slots containing the viewer's username get a "You" badge (text) and a thicker outline. A "Jump to my match" button scrolls to the current or last one.
- **Layout:** §6. Before the start: empty state "The bracket is drawn when the tournament starts. Players are seeded by rating."
- **Refresh:** every 15 s while `running` and visible; values update in place.
- **Primary action:** none; "Watch"/"Play" on live slots.

### TO-04 Registration confirmation (sheet; centered dialog at `md`/`lg`)

- As §3.3.

### TO-05 Leave registration (sheet; centered dialog at `md`/`lg`)

- As §3.4.

### TO-06 Pre-start banner and between-rounds status

- Banner: §3.5 (global, `Banner` severity `info`, `role="status"`).
- Between rounds: status card on TO-02 and a line in the resume area: §3.6 steps 4–5.

### TO-07 Push permission explanation

- Owned by `system.md` (step 17). Triggered once after the first successful registration (§3.3 step 4).

### TO-08 Tournament match ready (dialog)

- As §3.6 step 1. Focus on the title; initial focus on "Go to match". Not dismissible by scrim; "Not now" is explicit.

---

## 5. States

| State | TO-01 | TO-02 | TO-03 | TO-04 / TO-05 | TO-08 / banners |
| --- | --- | --- | --- | --- | --- |
| **Loading** | 3 skeleton cards; tabs render at once | Heading and facts skeleton; footer button hidden until loaded | Skeleton columns (one per round) | Button spinner in flight | — |
| **Empty** | Upcoming: `tournaments.empty.upcoming` "No tournaments scheduled yet." (no action, P§5). Mine: "You haven't registered for a tournament yet." + "See upcoming". In progress: "No tournament is running right now." Finished: "No finished tournaments yet." | — | Before start: `tournaments.bracket.notYet` | — | — |
| **Error** | Screen error + Retry | Screen error + Retry; 404 → not-found state | Inline error + Retry (Overview still works) | Per §3.10 | — |
| **Offline** | Banner `net.offline`; cached list with `common.lastUpdated`; refresh paused | Cached detail; Register and Leave disabled with `net.offlineAction` | Cached bracket; "Watch" disabled | Primary disabled with `net.offlineAction` | Pre-start countdown keeps running (local); TO-08 can't arrive (socket down); on reconnect the resume banner appears if a match exists |
| **Reconnecting** | n/a (REST) | n/a | n/a | — | Socket reconnect re-reads `GET me/matches/active` so a missed `match.found` still shows the resume banner |
| **Insufficient coins** | Card unchanged (no "can't afford" labels in the list) | Register opens §3.9 | — | §3.9 | — |
| **Suspended** | Suspension banner (AU-13); browsing works | Register disabled with `account.suspended.actionBlocked` + "Details"; Leave works | Works | `ACCOUNT_SUSPENDED` → action error | §10 Q10 |
| **Banned** | No session (AU-14) | ← | ← | ← | ← |
| **First-time user** | One-time hint (§4 TO-01) | One-time hint above the prizes: "Prizes are paid when the tournament ends. If it doesn't fill, everyone gets their entry back." | — | Full rules and refund text | — |
| **Registered** | "Registered" chip | Status card + countdown; Leave | — | — | Pre-start banner (last 15 min); TO-08 at start |
| **Cancelled / refunded** | "Cancelled" chip in Finished; in Mine with "Refunded" line | §3.8 | Hidden (tab disabled: "This tournament was cancelled.") | — | Banner removed; if the user is on TO-02 when it flips, polite announcement "Tournament cancelled. Your entry was refunded." |

---

## 6. Responsive notes (§11.7)

| Breakpoint | TO-01 | TO-02 | TO-03 bracket | Sheets / TO-08 |
| --- | --- | --- | --- | --- |
| `xs` 320–359 | Single column; tabs scroll horizontally with visible overflow cue; nav icon-only | Facts stack label over value; prize table becomes a list ("1st — 900 coins · 50%") | **Round picker**: one round at a time (chips "Round 1 · Quarter-finals · Semi-finals · Final"), slots in a vertical list; "Next round" / "Previous round" buttons; no horizontal scroll | Bottom sheet ≤ 90% `dvh`; TO-08 full-width dialog with the countdown on its own line |
| `sm` 360–599 (390 × 844) | As `xs` with labels | Sticky footer primary in the bottom 40% | As `xs` | Bottom sheet; TO-08 dialog, primary in the thumb zone |
| `md` 600–1023 | Side rail; list plus detail panel (TO-02 in the panel; URL follows) | In the detail panel; tabs Overview/Bracket inside | Two rounds side by side with connector lines; round picker for the rest | Centered dialogs max 480 |
| `lg` ≥ 1024 | Shell max 1280: list, detail panel, context panel (running tournament's live matches, up to 5, each with "Watch") | Detail panel; prizes and rules in two columns | Full bracket horizontally, all rounds, connectors; horizontal scroll inside the bracket region only (never the page) for 64 players | As `md` |

- **Landscape phones** (height < 500 px): side rail; TO-02 footer becomes inline; the bracket uses the `md` two-round layout.
- **Bracket direction:** rounds progress in reading direction (fa: round 1 on the right, final on the left; en: the reverse). Connectors mirror. Scores inside a slot follow the row order, not direction.
- Width and orientation changes keep the tab, segment, selected round, and any open sheet.
- `dvh`/`svh` only; footers respect `env(safe-area-inset-bottom)`.
- Keyboard: Tab through cards; Enter opens; in the bracket, arrow keys move between slots in a round and Left/Right between rounds (mirrored in RTL).

---

## 7. RTL/LTR notes and i18n keys

- fa first. Layout, tabs, chevrons, back arrow, bracket progression and connectors mirror. Timers and countdown rings don't.
- Tournament names: `name[locale]`; if empty, `name[other]` rendered with `lang` and `dir` of that locale; if both empty, `tournaments.unnamed` "Tournament #{id}".
- Usernames LTR-isolated with `@` in running text. Places use ordinals via ICU `selectordinal` in en; fa uses «اول، دوم، سوم، چهارم» for 1–4 and «{n}ام» after that.
- Dates: Jalali in fa (`fa-IR-u-ca-persian`), Gregorian in en; times in Tehran time with no zone label (§10 Q8).
- Reused: `play.variant.*`, `play.length.firstTo`, `coins.*`, `common.*`, `net.*`, `account.suspended.*`, `errors.*`.

| Key | fa | en |
| --- | --- | --- |
| `tournaments.title` | تورنمنت‌ها | Tournaments |
| `tournaments.segment.upcoming` | پیش رو | Upcoming |
| `tournaments.segment.mine` | تورنمنت‌های من | Mine |
| `tournaments.segment.running` | در حال برگزاری | In progress |
| `tournaments.segment.finished` | تمام‌شده | Finished |
| `tournaments.mine.comingUp` | پیش رو | Coming up |
| `tournaments.mine.playing` | در حال بازی | Playing now |
| `tournaments.mine.past` | گذشته | Past |
| `tournaments.hint.firstVisit` | تورنمنت‌ها فقط با تکمیل ظرفیت شروع می‌شوند. اگر ظرفیت پر نشود، ورودی همه برگردانده می‌شود. | Tournaments start only when full. If one doesn't fill, everyone gets their entry back. |
| `tournaments.unnamed` | تورنمنت {id} | Tournament #{id} |
| `tournaments.status.open` | ثبت‌نام باز است | Open for registration |
| `tournaments.status.full` | ظرفیت تکمیل | Full |
| `tournaments.status.starting` | در حال شروع… | Starting… |
| `tournaments.status.round` | دور {round} از {rounds} | Round {round} of {rounds} |
| `tournaments.status.finished` | تمام شد | Finished |
| `tournaments.status.cancelled` | لغو شد | Cancelled |
| `tournaments.registered` | ثبت‌نام کرده‌اید | Registered |
| `tournaments.card.entry` | ورودی: {count, plural, one {# سکه} other {# سکه}} | Entry: {count, plural, one {# coin} other {# coins}} |
| `tournaments.card.free` | رایگان | Free |
| `tournaments.card.firstPrize` | جایزه‌ی اول: {amount} سکه | 1st prize: {amount} coins |
| `tournaments.card.starts` | شروع: {date} ({relative}) | Starts {date} ({relative}) |
| `tournaments.card.started` | شروع شده: {relative} | Started {relative} |
| `tournaments.card.places` | {entries} از {capacity} نفر ثبت‌نام کرده‌اند | {entries} of {capacity} registered |
| `tournaments.card.label` | {name}، {status}، {variant}، {entry}، {start}، {places} | {name}, {status}, {variant}, {entry}, {start}, {places} |
| `tournaments.empty.upcoming` | هنوز تورنمنتی برنامه‌ریزی نشده است. | No tournaments scheduled yet. |
| `tournaments.empty.mine` | هنوز در تورنمنتی ثبت‌نام نکرده‌اید. | You haven't registered for a tournament yet. |
| `tournaments.empty.mineAction` | دیدن تورنمنت‌های پیش رو | See upcoming |
| `tournaments.empty.running` | الان تورنمنتی در حال برگزاری نیست. | No tournament is running right now. |
| `tournaments.empty.finished` | هنوز تورنمنتی تمام نشده است. | No finished tournaments yet. |
| `tournaments.loadError` | تورنمنت‌ها بارگذاری نشد. | Couldn't load tournaments. |
| `tournaments.notFound` | این تورنمنت وجود ندارد. | This tournament doesn't exist. |
| `tournaments.all` | همه‌ی تورنمنت‌ها | All tournaments |
| `tournaments.tab.overview` | خلاصه | Overview |
| `tournaments.tab.bracket` | جدول | Bracket |
| `tournaments.facts.start` | زمان شروع | Start |
| `tournaments.facts.format` | {capacity} بازیکن · حذفی · {rounds} دور · ترتیب بر اساس امتیاز رتبه | {capacity} players · single elimination · {rounds} rounds · seeded by rating |
| `tournaments.facts.variant` | نوع بازی | Variant |
| `tournaments.facts.entry` | ورودی | Entry |
| `tournaments.facts.places` | ظرفیت | Places |
| `tournaments.facts.rated` | مسابقه‌های تورنمنت امتیاز رتبه‌ی شما را تغییر می‌دهند. | Rated: tournament matches change your rating. |
| `tournaments.prizes.title` | جایزه‌ها | Prizes |
| `tournaments.prizes.place` | رتبه | Place |
| `tournaments.prizes.share` | سهم | Share |
| `tournaments.prizes.prize` | جایزه | Prize |
| `tournaments.prizes.placeN` | {place, select, 1 {اول} 2 {دوم} 3 {سوم} 4 {چهارم} other {{place}ام}} | {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} |
| `tournaments.prizes.row` | {place} · {share} · {amount} سکه | {place} · {share} · {amount} coins |
| `tournaments.prizes.pool` | مجموع جایزه‌ها: {pool} سکه از {total} سکه ورودی، پس از کسر {pct} کارمزد سکو. | Prize pool: {pool} coins from {total} coins of entries, after the {pct} platform fee. |
| `tournaments.prizes.poolNoPct` | مجموع جایزه‌ها: {pool} سکه از {total} سکه ورودی، پس از کسر کارمزد سکو. | Prize pool: {pool} coins from {total} coins of entries, after the platform fee. |
| `tournaments.prizes.seedOrder` | بازیکنانی که در یک دور حذف می‌شوند، بر اساس ترتیب شروع (امتیاز رتبه) رتبه‌بندی می‌شوند. | Players knocked out in the same round are placed by their starting seed. |
| `tournaments.prizes.none` | جایزه‌ی سکه‌ای ندارد. | No coin prizes. |
| `tournaments.prizes.item` | جایزه‌ی اضافه: {item} | Bonus prize: {item} |
| `tournaments.rules.title` | قوانین | Rules |
| `tournaments.rules.refund` | اگر تورنمنت تا زمان شروع تکمیل نشود یا لغو شود، ورودی شما کامل برگردانده می‌شود. | If the tournament isn't full at the start time, or is cancelled, your entry is refunded in full. |
| `tournaments.rules.leave` | تا پیش از شروع می‌توانید انصراف دهید و ورودی را پس بگیرید. | You can leave and get your entry back until it starts. |
| `tournaments.rules.presence` | اولین مسابقه‌ی شما ساعت {time} خودکار شروع می‌شود. اگر ظرف {grace} وارد مسابقه نشوید، آن مسابقه را می‌بازید. | Your first match starts automatically at {time}. If you don't join a match within {grace}, you lose that match. |
| `tournaments.rules.presenceNoGrace` | اولین مسابقه‌ی شما ساعت {time} خودکار شروع می‌شود. اگر در زمان تعیین‌شده وارد مسابقه نشوید، آن مسابقه را می‌بازید. | Your first match starts automatically at {time}. If you don't join a match within the joining time, you lose that match. |
| `tournaments.rules.noBots` | ربات‌ها هرگز در تورنمنت بازی نمی‌کنند. | Bots never play in tournaments. |
| `tournaments.rules.noPredictions` | روی مسابقه‌های تورنمنت پیش‌بینی ارائه نمی‌شود. | Predictions aren't offered on tournament matches. |
| `tournaments.liveMatches` | مسابقه‌های زنده‌ی این تورنمنت | Live matches of this tournament |
| `tournaments.register.cta` | ثبت‌نام · {count, plural, one {# سکه} other {# سکه}} | Register · {count, plural, one {# coin} other {# coins}} |
| `tournaments.register.ctaFree` | ثبت‌نام · رایگان | Register · free |
| `tournaments.register.fullReason` | همه‌ی جاها پر شده است | All places are taken |
| `tournaments.register.others` | تورنمنت‌های دیگر | Other tournaments |
| `tournaments.register.title` | ثبت‌نام در {name} | Register for {name} |
| `tournaments.register.summary` | {variant} · تا {n} امتیاز · {capacity} بازیکن، حذفی | {variant} · First to {n} · {capacity} players, single elimination |
| `tournaments.register.rated` | مسابقه‌های تورنمنت رتبه‌ای هستند. | Tournament matches are rated. |
| `tournaments.register.pay` | پرداخت {entry} سکه و ثبت‌نام | Pay {entry} coins and register |
| `tournaments.register.payFree` | ثبت‌نام | Register |
| `tournaments.register.paying` | در حال ثبت‌نام… | Registering… |
| `tournaments.register.done` | در {name} ثبت‌نام کردید | Registered for {name} |
| `tournaments.status.registeredCard` | ثبت‌نام کرده‌اید. شروع: {date} | You're registered. Starts {date} |
| `tournaments.status.countdown` | {time} تا شروع | Starts in {time} |
| `tournaments.status.startingNow` | در حال شروع… اولین مسابقه‌ی شما خودکار باز می‌شود. | Starting… Your first match opens automatically. |
| `tournaments.leave.button` | انصراف از تورنمنت | Leave tournament |
| `tournaments.leave.title` | از {name} انصراف می‌دهید؟ | Leave {name}? |
| `tournaments.leave.body` | {entry} سکه به موجودی شما برمی‌گردد. | {entry} coins go back to your balance. |
| `tournaments.leave.bodyFree` | تا وقتی جا باشد می‌توانید دوباره ثبت‌نام کنید. | You can register again while places are left. |
| `tournaments.leave.confirm` | انصراف و بازگشت {entry} سکه | Leave and get {entry} coins back |
| `tournaments.leave.confirmFree` | انصراف | Leave |
| `tournaments.leave.keep` | ثبت‌نام بماند | Stay registered |
| `tournaments.leave.done` | از {name} انصراف دادید. {entry} سکه برگشت داده شد. | You left {name}. {entry} coins were refunded. |
| `tournaments.leave.doneFree` | از {name} انصراف دادید. | You left {name}. |
| `tournaments.prestart.banner` | {name} تا {time} دیگر شروع می‌شود. اولین مسابقه‌ی شما خودکار باز می‌شود. | {name} starts in {time}. Your first match opens automatically. |
| `tournaments.prestart.details` | جزئیات | Details |
| `tournaments.prestart.conflict` | تورنمنت {name} ساعت {time} شروع می‌شود. ممکن است در آن زمان هنوز مسابقه‌ی میز شما در جریان باشد. | Your tournament {name} starts at {time}. A table match may still be running then. |
| `tournaments.ready.title` | مسابقه‌ی تورنمنت شما آماده است | Your tournament match is ready |
| `tournaments.ready.round` | {name} · دور {round} از {rounds} | {name} · Round {round} of {rounds} |
| `tournaments.ready.countdown` | ظرف {time} وارد شوید، وگرنه این مسابقه را می‌بازید | Join within {time} or you lose this match |
| `tournaments.ready.noCountdown` | همین حالا وارد شوید؛ اگر به‌موقع وارد نشوید، این مسابقه را می‌بازید. | Join now. If you don't join in time, you lose this match. |
| `tournaments.ready.go` | رفتن به مسابقه | Go to match |
| `tournaments.ready.notNow` | بعداً | Not now |
| `tournaments.ready.inMatch` | مسابقه‌ی تورنمنت شما آماده است. ظرف {time} وارد شوید. | Your tournament match is ready. Join within {time}. |
| `tournaments.resume.tournament` | مسابقه‌ی تورنمنت · ظرف {time} وارد شوید | Tournament match · join within {time} |
| `tournaments.wait.won` | دور {round} را بردید. حریف بعدی: {opponent}. مسابقه‌ی شما پس از پایان آن‌ها خودکار باز می‌شود. | You won round {round}. Next: {opponent}. Your match opens automatically when they finish. |
| `tournaments.wait.winnerOf` | برنده‌ی {a} و {b} | the winner of @{a} vs @{b} |
| `tournaments.wait.watch` | تماشا | Watch |
| `tournaments.wait.out` | در دور {round} حذف شدید. رتبه‌ی نهایی شما در پایان تورنمنت مشخص می‌شود. | You're out in round {round}. Your final place is set when the tournament ends. |
| `tournaments.result.won` | قهرمان {name} شدید | You won {name} |
| `tournaments.result.place` | رتبه‌ی شما: {place} | You placed {place} |
| `tournaments.result.outInRound` | حذف در دور {round} | Out in round {round} |
| `tournaments.result.prize` | +{amount} سکه جایزه | +{amount} coins won |
| `tournaments.result.itemPrize` | جایزه: {item} | Prize: {item} |
| `tournaments.result.viewInShop` | مشاهده در فروشگاه | View in Shop |
| `tournaments.result.champion` | قهرمان: {winner} · نایب‌قهرمان: {runnerUp} | Champion: @{winner} · Runner-up: @{runnerUp} |
| `tournaments.cancelled.notFilled` | این تورنمنت لغو شد، چون تا زمان شروع تکمیل نشد ({entries} از {capacity}). | This tournament was cancelled because it wasn't full at the start time ({entries} of {capacity}). |
| `tournaments.cancelled.admin` | این تورنمنت توسط برگزارکنندگان لغو شد. | This tournament was cancelled by the organizers. |
| `tournaments.cancelled.refunded` | ورودی {entry} سکه‌ای شما به کیف پولتان برگشت. | Your entry of {entry} coins was refunded to your wallet. |
| `tournaments.cancelled.announce` | تورنمنت لغو شد. ورودی شما برگشت داده شد. | Tournament cancelled. Your entry was refunded. |
| `tournaments.cancelled.viewWallet` | مشاهده‌ی کیف پول | View wallet |
| `tournaments.bracket.notYet` | جدول هنگام شروع تورنمنت چیده می‌شود. بازیکنان بر اساس امتیاز رتبه مرتب می‌شوند. | The bracket is drawn when the tournament starts. Players are seeded by rating. |
| `tournaments.bracket.cancelled` | این تورنمنت لغو شد. | This tournament was cancelled. |
| `tournaments.bracket.round` | دور {round} | Round {round} |
| `tournaments.bracket.final` | فینال | Final |
| `tournaments.bracket.semi` | نیمه‌نهایی | Semi-finals |
| `tournaments.bracket.quarter` | یک‌چهارم نهایی | Quarter-finals |
| `tournaments.bracket.tbd` | مشخص نشده | To be decided |
| `tournaments.bracket.winner` | برنده | winner |
| `tournaments.bracket.live` | زنده | Live |
| `tournaments.bracket.watch` | تماشا | Watch |
| `tournaments.bracket.play` | بازی | Play |
| `tournaments.bracket.you` | شما | You |
| `tournaments.bracket.jumpToMine` | رفتن به مسابقه‌ی من | Jump to my match |
| `tournaments.bracket.next` | دور بعد | Next round |
| `tournaments.bracket.previous` | دور قبل | Previous round |
| `tournaments.bracket.slotLabel` | {round}، مسابقه‌ی {n}: {a} {scoreA}، {b} {scoreB}، {status} | {round}, match {n}: @{a} {scoreA}, @{b} {scoreB}, {status} |
| `tournaments.bracket.loadError` | جدول بارگذاری نشد. | Couldn't load the bracket. |
| `tournaments.hint.detail` | جایزه‌ها در پایان تورنمنت پرداخت می‌شوند. اگر تورنمنت تکمیل نشود، ورودی همه برگردانده می‌شود. | Prizes are paid when the tournament ends. If it doesn't fill, everyone gets their entry back. |
| `tournaments.insufficient.other` | {name} · ورودی {entry} سکه · {date} | {name} · entry {entry} coins · {date} |
| `tournaments.error.full` | ظرفیت همین حالا پر شد. هیچ سکه‌ای کسر نشد. | The last place was just taken. Nothing was charged. |
| `tournaments.error.closedJoin` | ثبت‌نام بسته شده است. هیچ سکه‌ای کسر نشد. | Registration has closed. Nothing was charged. |
| `tournaments.error.closedLeave` | تورنمنت شروع شده است و دیگر نمی‌توانید انصراف دهید. | The tournament has already started, so you can't leave now. |
| `nav.badge.tournament` | مسابقه‌ی تورنمنت شما آماده است یا به‌زودی شروع می‌شود | Your tournament match is ready or starting soon |
| `wallet.tx.tournament_entry` / `_prize` / `_refund` | (existing, wallet.md) | (existing, wallet.md) |

Shared keys used: `common.back`, `common.cancel`, `common.close`, `common.retry`, `common.stillWorking`, `common.checkStatus`, `common.errorCode`, `common.lastUpdated`, `common.help`, `coins.cost`, `coins.tomanEquivalent`, `coins.balance`, `coins.balanceAfter`, `coins.shortfall`, `coins.insufficient.title`, `coins.getCoins`, `net.offline`, `net.offlineAction`, `account.suspended.actionBlocked`, `account.suspended.details`, `play.variant.*`, `play.length.firstTo`, `errors.tournaments.refused`, `errors.wallet.*`, `errors.notFound`, `errors.network`, `errors.generic`, `nav.tournaments`.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| TO-01 | Suspension banner → announcement banner → pre-start banner → app bar (title, balance chip) → segment tabs (one tab stop, arrows move) → hint (dismiss) → cards in order → nav |
| TO-02 | Back → heading → status card (and its action) → tabs → facts → prizes table → rules → links → footer primary / Leave |
| TO-03 | Round picker (xs/sm) or first round heading → "Jump to my match" → slots in round order, top to bottom → next round |
| TO-04 | Title (focused on open) → summary → cost block (list) → prizes → rules → "?" → primary → Cancel |
| TO-05 | Title → body → "Stay registered" (initial focus) → Leave |
| TO-08 | Title (focused) → round line → opponent card → countdown text → "Go to match" (initial focus) → "Not now" |

**Labels and announcements**

- Card: one accessible name `tournaments.card.label`.
- Bracket slot: `tournaments.bracket.slotLabel`; "Live", "You", and "winner" are in the name, not only visual.
- Prize table: a real `<table>` with header cells; at xs the list keeps "place, share, prize" order in text.
- Countdowns (`CountdownText`): announced at start, at 5 min (pre-start), 30 s and 10 s (TO-08), and 0; never per second.
- Polite live region: registered, left, status changes (started, cancelled, your match ready, round won, out).
- TO-08 uses `role="alertdialog"`.

**Other rules**

- Not color alone: status chips (icon + text), "Registered", "Cancelled", winner (check + bold + text), your path ("You" badge + outline), live slots ("Live" text).
- Contrast 4.5:1 for text, including connector labels; bracket connectors and slot borders 3:1.
- Targets ≥ 44 × 44: cards, tabs, slot actions, round chips; slot cards ≥ 72 px tall.
- Motion: no confetti or animated trophies for the champion; under reduced motion the bracket "jump" scrolls instantly.
- Text 200%: slot cards grow; the bracket switches to the round picker when a round column would be narrower than 16rem; the prize table becomes a list.

---

## 9. Acceptance criteria

1. TO-01 shows four segments; Upcoming lists `scheduled` tournaments in `starts_at` order with name, status chip (icon + text), variant, length, entry or "Free", 1st prize, Jalali start (fa) and relative time, and "{entries} of {capacity} registered".
2. A tournament with `joined: true` shows "Registered" on its card and appears in Mine.
3. TO-02 shows the format, entry with toman equivalent, the prize table from `prize_split` and `prizes`, the pool sentence, the refund, leave, and presence rules, all visible without expanding anything.
4. TO-04 shows entry, toman equivalent, balance, balance after, prizes, the refund rule, and the presence rule before any charge; the primary label contains the entry; nothing is pre-selected.
5. Double-tapping the TO-04 primary sends one `POST tournaments/{id}/join`; "Check status" after 10 s re-reads the tournament and never sends a request with a new key.
6. `TOURNAMENT_REFUSED {reason: full}` and `{reason: closed}` show their messages with "Nothing was charged", and TO-02 refreshes.
7. Insufficient balance opens the PL-05 tournament variant: affordable open tournaments first, "Get coins" as a text action, Close.
8. Leave is offered only while `scheduled`; TO-05 states the refund amount; initial focus is on "Stay registered"; success shows the refund snackbar and updates the balance chip.
9. With a registered tournament starting within 15 minutes, a non-dismissible pre-start banner with a countdown shows on every non-immersive screen except during matches, matchmaking, payments, and money task flows.
10. A `match.found` with `entry: 0` for a human opponent outside matchmaking opens TO-08 with the opponent, "Go to match", "Not now", and a join countdown (or the no-countdown sentence while §10 Q2 is open); "Not now" leaves the resume banner with the countdown.
11. Cancelled tournaments show the not-filled or organizer text (never the raw admin reason) and, for registered users, the refunded amount with a link to the wallet.
12. TO-03 draws every round from `rounds`, fills known slots, shows placeholders for unknown players, marks winners with icon + bold + text, marks the viewer's slots with "You", and offers "Watch" on live slots (or "Play" on the viewer's own).
13. At xs/sm the bracket shows one round at a time with no horizontal page scroll; at lg it shows all rounds with scrolling confined to the bracket region.
14. Bracket progression and connectors mirror in fa; timers and scores do not.
15. Suspended users can browse, view brackets, and leave; Register is disabled with `account.suspended.actionBlocked` + "Details".
16. No result, elimination, or cancellation state links to the shop or suggests buying.
17. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape; no horizontal page scroll; no clipped text at 200%; all targets ≥ 44 × 44 px.
18. Every error in §3.10 has a mapped state; every string comes from an i18n key with fa and en.

---

## 10. Open questions and API gaps

For the main agent unless noted. Q2 is a fairness issue (non-negotiable: never lose without a warning).

1. **`rake_pct` not exposed.** `TournamentInfo` has `prizes` but not the snapshotted `rake_pct`, so the pool sentence can't state the fee percent. Proposal: add `rake_pct` (and `pool`).
2. **No-show rule without data or notice.** A bracket match forfeits after `game.reconnect_grace_seconds` from creation, but (a) `match.found` carries no `tournament` context and no `join_deadline`, (b) `GET config` has no grace value, and (c) push (§11.5) isn't implemented, so a player who isn't in the app at the start loses round 1 with no warning. Proposals: `match.found.tournament: {id, name, round, rounds}` and `join_deadline` (ISO); `config.reconnect_grace_seconds`; Web Push "Your tournament match is ready" (step 17). Product decision: consider a check-in window (e.g., "Confirm you're here" in the last 10 minutes; unconfirmed players are refunded and replaced or the tournament shrinks) or a longer join grace for round 1.
3. **"Mine" needs four calls.** Proposal: `GET tournaments?joined=1` (all statuses) or `GET me/tournaments`.
4. **Item prizes not exposed.** `prize_items` is stored but not in the payload, so the prize table can't show "Bonus prize: {item}". Proposal: `prize_items: [{id, kind, name} | null]`.
5. **Personal result not exposed.** `place`, `prize`, and `eliminated_round` for the caller are not returned. Proposal: `me: {seed, place, prize, eliminated_round} | null` in `TournamentInfo`.
6. **Places by seed.** Losers of the same round are ranked by seed, so with an unequal split (e.g., 3rd 15%, 4th 5%) the higher-rated loser earns more without playing for it. Confirm this is intended, or require equal percentages for places decided in the same round (the default split already does).
7. **Admin cancel reason.** Free text, single language, possibly internal. This spec never shows it. Confirm, or add a bilingual `cancel_reason_i18n` for public display.
8. **Time zone.** Start times are shown in the device's zone. Should they always be Tehran time (with a label for users abroad)?
9. **Two matches at once.** A registered player can be in a coin table (or searching) when the tournament starts; the server creates the tournament match anyway, and both clocks run. Proposal: block `queue.join` for players registered in a tournament starting within N minutes, or delay their bracket match until the other ends. At minimum, confirm the UI warning in §3.5 step 5 is acceptable.
10. **Suspended after registering.** If a registered player is suspended before the start, is their entry refunded and the place freed, or do they play (§12.1 only covers matches already in progress)?
11. **Participants before the start.** There is no list of registered players. Should TO-02 show it (usernames, ratings)? Not required for Phase 1.
12. **Bracket seeds and avatars.** `BracketSlotInfo.players` has usernames only. Seeds, avatars, and ELO would make the bracket easier to read. Proposal: `players: [{username, avatar, seed} | null, …]`.
13. **Ledger rows.** Confirm `tournament_*` ledger entries expose `ref_id` to the client so WA-02 can link to TO-02.
