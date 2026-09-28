# Predictions: prediction panel, confirmation, results, my predictions

Status: draft for UI build (CLAUDE.md §17 step 12).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 2–5; §7.5; §8 (accuracy board); §10.2 (Predictions); §10.3 (`pool.update`, `turn.rolled`, `match.ended`); §11.7; §12.1 (suspended); §12.2 (`chip_dumping`, `prediction_collusion`, links); §14 (`predict.*`); §20.4; §21.2; patterns.md (P§) 2, 2.4, 4, 5, 9, 10, 13, 16, 17; journeys.md J5; personas P2 Maryam.
Related specs: **`live.md`** (spectator view LV-03 that hosts the panel; its §3.4–§3.9 first specified PR-01 to PR-04), `play.md` (PL-05 shared insufficient sheet), `leaderboard.md` (accuracy board), `referral.md` (referral relation), `wallet.md` (ledger rows `prediction_*`).

**Relationship to live.md.** live.md §3.4–§3.9, §4 (PR-01 to PR-04), and the `predict.*` keys in its §7 remain the base. This spec owns PR-01 to PR-04 from now on: it restates the rules that matter, and **adds or changes** the items marked **(new)** below. Where the two differ, this spec wins. Everything about the spectator view itself (joining, board, reactions, match end card LV-07) stays in live.md.

**API (implemented; field names are the contract):**

| Call / event | Response / notes |
| --- | --- |
| `GET predictions/open` | `{results: OpenPool[]}` (≤ 100). `OpenPool`: `match_id`, `players [a, b]`, `entry`, `total_a`, `total_b`, `open`, `max_stake_per_user`, `blocked`. **`blocked` values: `"player"`, `"review"`, `"linked"`, `"referral"`, or null** (the TS type lacks `"review"`, §10 Q1). |
| `POST predictions {match_id, side, amount}` + `Idempotency-Key` | `201 PredictionRow`. Same key → original row, nothing moved. Refusals: `409 PREDICTION_REFUSED {reason}` with `closed`, `player`, `review`, `linked`, `referral`, `other_side`, `max_stake {remaining}`, `pool_full`; `403 ACCOUNT_SUSPENDED`; `400 AMOUNT_INVALID`; `409 WALLET_INSUFFICIENT {balance, needed}`. |
| `GET me/predictions?cursor=` | `{results: PredictionRow[], next}`, newest first, 30 per page. `PredictionRow`: `id`, `match_id`, `side`, `amount`, `payout` (null until settled/refunded), `pool_status` (`open`, `closed`, `held`, `settled`, `refunded`), `created_at` |
| WS `pool.update` (spectators) | `{total_a, total_b, open}` after each stake and at close |
| WS `turn.rolled` with `opening: true` | The first roll: the pool closes |
| `GET matches/{id}` | `MatchSummary` (players, `status`, `winner`, `end_reason`) for results and history rows |
| `GET config` | `predictions_enabled` |

Server rules (`backend/predictions/services.py`):

- **Eligibility (§7.5):** `predict.enabled`, human vs human, random pairing, not a tournament match, entry ≥ `predict.min_table_entry`. Opens at match creation, closes at the first roll.
- **Blocked viewers:** a player of the match (`player`); an account with an open `chip_dumping` flag (`review`, all pools); an account antifraud links to either player (`linked`); a referrer or referee of either player (`referral`). Checked in that order.
- **Limits:** per user per pool `max_stake_per_user` (total of all their stakes); pool total `max_pool_total`; one side per user (`other_side`).
- **Settlement:** `rake = floor(pool × rake_pct / 100)`; `payout_i = floor(stake_i × (pool − rake) / winning_side_total)`; dust to the platform. One side empty, or match aborted/voided → full refund, no fee. Held pools (antifraud) wait for an admin: settle or refund everyone.
- **Consequences of the formula the UI must be honest about (new):**
  - A **winning** stake can return **less than the stake** when the losing side is small (the fee is larger than the losing side's total). Example: A 1,000, B 10 → pool 1,010, fee 101, winners share 909: a 1,000 stake on A gets 909.
  - A tiny winning stake can round down to **0** coins.

---

## 1. Goal and user story

- As a spectator (P2 Maryam), I want to predict the winner with a small stake, understand in one sentence how the pool pays, see both totals and my likely return (including when it would be less than my stake) before I pay, and find the result later.
- As any viewer who can't predict, I want a short, respectful reason, without being accused of anything.

Success means:
- No coin leaves the wallet without the stake, balance, balance after, the rule sentence, both totals, and the estimate on screen.
- A viewer never sees an estimate that hides a net loss on a winning pick.
- Results say what happened (won, not won, won but less than the stake, refunded, under review) with signs and words.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| "Predict" / "Your prediction" in the spectator view (live.md LV-03) | PR-01 (sheet at `sm`, side panel at `md`/`lg`) |
| Live row "Predictions open" chip (live.md LV-01) | LV-03, PR-01 available |
| Account hub "My predictions" (profile.md AC-01) | PR-04 `/me/predictions` |
| Leaderboard predict-scope my-rank row (leaderboard.md) | PR-04 |

| Exit | Destination |
| --- | --- |
| PR-04 row | `/match/[id]` (LV-03 while live; non-player summary MA-14 after the end). Never a replay. |
| PR-04 "Accuracy board" | `/leaderboard?scope=predict` |
| Insufficient sheet "Get coins" | `/shop/coins` |
| "?" | `/help/predictions` |

---

## 3. Flow

### 3.1 Panel state (PR-01)

Data and the state table are live.md §3.4, with this complete **blocked reasons** table (new: `review`, and the refusal reasons as states):

| Source | Reason | Panel state | Text (key) | Actions |
| --- | --- | --- | --- | --- |
| `OpenPool.blocked` | `player` | Not reachable in the spectator view; hidden | `predict.blocked.player` (only if ever reached) | — |
| `OpenPool.blocked` | `review` **(new)** | Blocked, account-level | `predict.blocked.review` "Predictions aren't available for your account right now. Contact support if you think this is a mistake." | Support link |
| `OpenPool.blocked` | `linked` | Blocked, this match | `predict.blocked.linked` "Predictions on this match aren't available for your account." | — |
| `OpenPool.blocked` | `referral` | Blocked, this match | `predict.blocked.referral` (invitation relation) | "?" → `/help/predictions` |
| `open: false` / opening roll / `PREDICTION_REFUSED closed` | `closed` | Closed (with own stake: totals + "Your prediction"; without: hidden after a short notice) | `predict.closed` / `predict.error.closed` | — |
| Own stake on the other side / `PREDICTION_REFUSED other_side` | `other_side` | Open; the other card disabled | `predict.otherSideLocked` / `predict.error.otherSide` | Add to own side |
| Own stakes = `max_stake_per_user` / `PREDICTION_REFUSED max_stake {remaining: 0}` | `max_stake` | Staked, no "add more" field | `predict.error.maxStakeReached` | — |
| `PREDICTION_REFUSED pool_full` | `pool_full` | Open for others, but this stake refused; field keeps the value | `predict.error.poolFull` | Lower the stake |
| `me.status = suspended` | suspended | Open, read-only | `account.suspended.actionBlocked` | "Details" |
| `config.predictions_enabled` false | disabled | Hidden; existing rows still settle | — | — |

Rules:
- Never name devices, IPs, flags, or "fraud". `review` and `linked` read as availability, not accusation.
- Blocked states still show the two totals and the rule sentence (read-only), so the viewer understands the pool, but no stake field.
- A blocked reason arriving as a refusal on `POST` switches the panel to that state and says "Nothing was charged."

### 3.2 Placing a prediction (PR-01 open → PR-02)

As live.md §3.5, with these changes:

1. **Estimate below the stake (new).** When the computed estimate for the entered stake is less than the viewer's total stake on that side (`own + s`), the estimate line changes to: "If @{player} wins, you'd get about {estimate} coins back, less than your {total} stake, because the other side's total is small." (`predict.estimateBelowStake`), with a warning icon (icon + text, not color). Same line in PR-02.
2. **Estimate of 0 (new).** If the estimate is 0: "At the current totals, this stake would pay 0 coins even if @{player} wins." (`predict.estimateZero`). Continue stays enabled (it's the user's choice), and the line is repeated in PR-02 above the primary.
3. **One-sided pool.** Unchanged: "If nobody predicts on @{other}, every stake is refunded."
4. **Rule sentence** `predict.howItWorks` uses the pool's `rake_pct` (§10 Q2; until exposed, `config`-less fallback sentence `predict.howItWorksNoPct` without the number).
5. **Quick-pick chips**: 10%, 25%, 50% of `max_stake_per_user`, none active; no "max" chip (live.md) — unchanged.
6. **PR-02 rows** as live.md §3.5 step 4, plus the estimate warnings above when they apply.
7. Idempotency, "Check status", and pool-closing-mid-entry rules: live.md §3.5 steps 5–7 unchanged.

### 3.3 Results (PR-03)

As live.md §3.6, with the outcome computed from the **match winner and the row's side**, not from `payout > 0` (new):

| Data | Outcome | Text | Signed amount (net = total payout − total stake on this match) |
| --- | --- | --- | --- |
| `settled`, side = winner, payout ≥ stake | Won | "@{player} won. You get {payout} coins." | «+{net}» "won" plus secondary "Stake {amount} · Paid {payout}" |
| `settled`, side = winner, 0 < payout < stake **(new)** | Won, less than stake | "@{player} won. Your share was {payout} coins, less than your {amount} stake, because the other side's total was small." | «−{loss}» "net" plus "Stake {amount} · Paid {payout}" |
| `settled`, side = winner, payout = 0 **(new)** | Won, rounded to 0 | "@{player} won, but your share rounded down to 0 coins." | «−{amount}» "net" |
| `settled`, side ≠ winner | Not won | "@{player} didn't win. Your stake of {amount} coins went to the winning side." | «−{amount}» |
| `refunded`, match `aborted` / `voided` | Refunded | `predict.result.refundedCancelled` | «+{amount}» "refunded" (net 0; show "Returned in full") |
| `refunded`, otherwise | Refunded | `predict.result.refundedOneSided` | as above |
| `held` | Under review | `predict.result.held` | «{amount}» staked, no sign |

- Several stakes on one match are added up for the result card (the history still lists each stake).
- Match winner: `match.ended.winner` in the spectator view, or `GET matches/{id}.winner` elsewhere (§10 Q3: add it to the row).
- Equal visual weight for wins and losses; no shop link, no "predict again", no loss-chasing copy (P§9).

### 3.4 My predictions (PR-04)

As live.md §3.9, with these changes (new):

1. **Group by match:** one card per match (stakes on the same match are always on the same side): "@{a} vs @{b}", date (first stake), "Your pick: @{player}", total stake, and the outcome chip from §3.3. Expanding the card lists the individual stakes (time, amount). The API returns stakes; grouping is client-side within the loaded pages (a group split across pages merges when the next page loads).
2. **Status chips** (icon + text): Open · Waiting for result · Under review · Won · Won, less than stake · Not won · Refunded.
3. **Amount column:** net for settled matches (sign + word), stake for open/closed/held, "Returned in full" for refunded.
4. **Header links:** "Accuracy board" → `/leaderboard?scope=predict`. No totals, no profit banner, no streaks (unchanged).
5. Row tap → `/match/[id]` (never a replay).

### 3.5 Error map

live.md §3.8 applies unchanged, plus:

| Code | Where | What the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `PREDICTION_REFUSED {reason: review}` (409) **(new)** | `POST predictions` | PR-01 blocked (review); "Nothing was charged." | `errors.predictions.refused` | `predict.blocked.review` |
| Unknown `blocked` value | `GET predictions/open` | Treat as `linked` (generic, this match) | — | `predict.blocked.linked` |

---

## 4. Screen list

### PR-01 Prediction panel (sheet at `sm`; side panel at `md`/`lg`)

- Content order: live.md §3.5 step 1 (title, status line, rule sentence + "?", side cards with totals, stake field + helper, chips, estimate line, Continue), or the §3.1 blocked/closed/staked content. "Your balance: {balance}" at the top of the stake section (no balance chip in the immersive view).
- Primary: Continue (open) · none (blocked, closed, result).

### PR-02 Prediction confirmation (sheet step; centered dialog at `md`/`lg`)

- live.md §3.5 step 4 rows, plus §3.2 warnings.

### PR-03 Prediction result (inside PR-01 and live.md LV-07)

- §3.3.

### PR-04 My predictions `/me/predictions` (Tab 5 child)

- App bar: back, "My predictions", balance chip. Intro line, "Accuracy board" link, match cards (§3.4), "Show more".

---

## 5. States

| State | PR-01 / PR-02 / PR-03 | PR-04 |
| --- | --- | --- |
| **Loading** | Skeleton side cards; in-button spinner in flight | 5 skeleton cards; name slots skeleton until `GET matches/{id}` returns (live.md §10 Q7) |
| **Empty** | Hidden when there is no pool and no own prediction | "No predictions yet." + "Watch live matches" |
| **Error** | Inline `predict.loadError` + Retry; action errors per §3.5 | Screen error + Retry; per-card name failure → "Match #{short id}" |
| **Offline** | Place disabled with `net.offlineAction`; entries kept | Cached list with `common.lastUpdated`; "Show more" disabled |
| **Reconnecting** | Totals frozen with "Reconnecting…"; re-read `GET predictions/open` after the rejoin (live.md) | — |
| **Insufficient coins** | PL-05 prediction variant: "Change stake" first, "Get coins" (text), Close; never after a result | — |
| **Suspended** | Open pool read-only, Predict disabled + "Details"; existing stakes settle normally | Works |
| **Banned** | No session | ← |
| **Blocked** | §3.1 table | Works (own history) |
| **First-time user** | One-time hint "You can predict the winner until the first roll." (live.md) | Empty state |

---

## 6. Responsive notes (§11.7)

As live.md §6 for PR-01/PR-02 (bottom sheet at `xs`/`sm` with side cards stacked at `xs`; persistent side panel tab at `md`; end panel at `lg`; PR-02 always a centered dialog at `md`/`lg`; landscape phones: end-edge side sheet max 50% width). PR-04:

| Breakpoint | PR-04 |
| --- | --- |
| `xs` 320–359 | Single column; card: players line 1, pick + chip line 2, amount line 3 |
| `sm` 360–599 | Single column; amount at the end edge of line 1 |
| `md` 600–1023 | Tab 5 list-detail: the selected card's match summary (MA-14 content, non-player) in the detail panel |
| `lg` ≥ 1024 | As `md` in the 1280 shell |

The estimate warnings wrap under the estimate line at every width; they are never truncated.

---

## 7. RTL/LTR notes and i18n keys

- As live.md §7 (usernames LTR-isolated, score A – B, locale digits, U+2212 for minus, Jalali dates in fa).
- All `predict.*` keys listed in live.md §7 remain in use with the same wording. New and changed keys:

| Key | fa | en |
| --- | --- | --- |
| `predict.howItWorksNoPct` | برندگان کل مبلغ را پس از کسر کارمزد سکو، به نسبت مبلغ پیش‌بینی خود تقسیم می‌کنند؛ اگر کسی روی یک طرف پیش‌بینی نکند، همه مبلغ خود را پس می‌گیرند. | Winners split the whole pool, minus a platform fee, in proportion to their stakes. If nobody picks one side, everyone gets their stake back. |
| `predict.blocked.review` | پیش‌بینی فعلاً برای حساب شما در دسترس نیست. اگر فکر می‌کنید اشتباهی رخ داده، با پشتیبانی تماس بگیرید. | Predictions aren't available for your account right now. Contact support if you think this is a mistake. |
| `predict.blocked.nothingCharged` | هیچ سکه‌ای کسر نشد. | Nothing was charged. |
| `predict.estimateBelowStake` | اگر {username} ببرد، حدود {estimate} سکه برمی‌گردد که از {total} سکه‌ی پیش‌بینی شما کمتر است، چون مجموع طرف مقابل کم است. | If @{username} wins, you'd get about {estimate} coins back, less than your {total} stake, because the other side's total is small. |
| `predict.estimateZero` | با مجموع فعلی، این مبلغ حتی اگر {username} ببرد، ۰ سکه برمی‌گرداند. | At the current totals, this stake would pay 0 coins even if @{username} wins. |
| `predict.result.wonLess` | {username} برد. سهم شما {payout} سکه بود که از {amount} سکه‌ی پیش‌بینی شما کمتر است، چون مجموع طرف مقابل کم بود. | @{username} won. Your share was {payout} coins, less than your {amount} stake, because the other side's total was small. |
| `predict.result.wonZero` | {username} برد، اما سهم شما به ۰ سکه گرد شد. | @{username} won, but your share rounded down to 0 coins. |
| `predict.result.stakePaid` | پیش‌بینی {amount} · دریافتی {payout} | Stake {amount} · Paid {payout} |
| `predict.result.signNet` | {sign}{amount} خالص | {sign}{amount} net |
| `predict.result.returnedInFull` | کامل برگشت داده شد | Returned in full |
| `predict.mine.status.wonLess` | برد، کمتر از مبلغ پیش‌بینی | Won, less than stake |
| `predict.mine.stakes` | {count, plural, one {# پیش‌بینی} other {# پیش‌بینی}} روی این مسابقه | {count, plural, one {# stake} other {# stakes}} on this match |
| `predict.mine.stakeRow` | {time} · {amount} سکه | {time} · {amount} coins |
| `predict.mine.total` | مجموع پیش‌بینی: {amount} سکه | Total stake: {amount} coins |
| `predict.mine.accuracyBoard` | جدول دقت پیش‌بینی | Accuracy board |
| `predict.mine.cardLabel` | {a} در برابر {b}، انتخاب شما {pick}، {status}، {amount} | @{a} vs @{b}, your pick @{pick}, {status}, {amount} |

Shared keys used: as live.md §7, plus `support.contact.channel`, `leaderboard.scope.predict`.

---

## 8. Accessibility

- Focus order and labels for PR-01 to PR-04: live.md §8, with PR-04 cards as one link each (`predict.mine.cardLabel`) and an expand button ("{count} stakes on this match", `aria-expanded`).
- Estimate warnings are part of the estimate's polite announcement (read once after the stake settles for 1 s, not per keystroke).
- Not color alone: warnings (icon + text), outcome chips (icon + text), net amounts (sign + word).
- Blocked texts are plain paragraphs, focusable as the panel's first content after the title.

---

## 9. Acceptance criteria

live.md §9 criteria 10–20 apply to PR-01 to PR-04. In addition:

1. `blocked: "review"` shows `predict.blocked.review` with a support link, the totals and rule sentence read-only, and no stake field; the text never mentions flags, devices, IPs, or fraud.
2. Each `PREDICTION_REFUSED` reason (`closed`, `player`, `review`, `linked`, `referral`, `other_side`, `max_stake`, `pool_full`) maps to the §3.1 state and says nothing was charged.
3. When the estimate is below the viewer's total stake on that side, PR-01 and PR-02 show `predict.estimateBelowStake` with an icon; when it is 0, `predict.estimateZero` shows above the PR-02 primary.
4. Results use the match winner and the row side: a winning stake paid less than the stake shows "Won, less than stake" with a negative net; a winning stake paid 0 shows `predict.result.wonZero`; neither is shown as "Not won".
5. PR-04 groups stakes by match, shows one outcome per match with net amounts for settled matches, and expands to individual stakes.
6. PR-04 links to the accuracy board and never to a replay.
7. Every screen passes the six §11.7 viewports in fa and en; every string comes from an i18n key with fa and en.

---

## 10. Open questions and API gaps

live.md §10 Q1–Q4, Q7, Q11 still apply (pool `pool` field in the live list, per-match pool state, the seconds-long prediction window, `rake_pct` not exposed, match context in rows, tournament matches excluded). The prediction window (live.md Q3) is the biggest product risk: without a pre-roll delay, PR-01 is almost never reachable. New:

1. **`OpenPool.blocked` type.** The backend returns `"review"`; `packages/protocol` declares only `"player" | "linked" | "referral" | null`. Please add it.
2. **`rake_pct` per pool.** Needed for `predict.howItWorks` and the estimate (live.md Q4). Until then the estimate can't be computed exactly; the UI hides the estimate line (not the warnings' logic) rather than guess the fee. Confirm this fallback or expose the value.
3. **Result needs the winner.** `PredictionRow` has no `winner_side` (or `won` flag), so the client must fetch `GET matches/{id}` to tell "won, rounded to 0" from "not won". Proposal: add `winner_side` and `players` to `PredictionRow` (with live.md Q7).
4. **Winning stakes that lose money.** The pool formula lets a winning pick return less than its stake, or 0. The UI now warns, but product may prefer a rule (e.g., winners always get at least their stake back when the losing side is smaller than the fee, taking less rake). Decision for the product owner.
5. **Accuracy board counts `payout > 0`** as correct (leaderboard.md §10 Q5): a winning stake rounded to 0 counts as wrong. Align with the result logic here.
6. **`review` is account-wide.** A `chip_dumping` flag blocks every pool, not only matches involving the flagged pair. Is that intended (§12.2 says "block both from prediction pools")? If so, `GET predictions/open` could return a top-level `blocked: "review"` instead of per pool.
