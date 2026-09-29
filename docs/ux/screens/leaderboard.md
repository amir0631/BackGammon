# Leaderboard: all-time rating, weekly, monthly, prediction accuracy

Status: draft for UI build (CLAUDE.md §17 steps 8 and 12).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rule 11; §7.5; §8; §10.2 (Leaderboard); §11.3; §11.7; §12.1; §14 (`predict.min_count_for_board`, `elo.*`); §21.2; ia.md §1–§3 (`/leaderboard?scope=`); patterns.md (P§) 4, 5, 6.1, 10, 11, 13, 17; personas P3 Hamid, P2 Maryam.
Related specs: `play.md` (rank card and `lg` leaderboard snippet on PL-01), `profile.md` (AC-01 row, AC-05 public profile), `live.md` / `predictions.md` (prediction board empty state → Live).

Screen ID: PL-09 (screen-inventory.md §2.2). LB-01 (my-rank row) is a component of PL-09.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET leaderboard?scope=all\|weekly\|monthly` | `{scope, results: LeaderboardRow[], me: {rank, value} \| null}`. Top 50 only, no pagination. `LeaderboardRow`: `rank`, `username`, `avatar`, `level`, `value`. `all`: `value` = current ELO. `weekly` / `monthly`: `value` = sum of ELO changes in the period (can be negative). `me` is null when the caller has no rated match (all) or no rated match in the period. |
| `GET leaderboard?scope=predict` | `{scope: "predict", results: [...], me: null}`. Rows add `count` (settled predictions); `value` = accuracy percent (rounded). Only users with ≥ `predict.min_count_for_board` settled predictions. `me` is always null (§10 Q3). |
| `GET users/{username}` | Public profile for the row tap (profile.md AC-05) |
| `GET me` | Own `username`, `elo`, `level` for the my-rank row fallback |

Server rules the UI relies on (`backend/ranking/services.py`, `backend/predictions/services.py`):

- **Only human-vs-human matches are rated** (§8); bot matches never appear. Tournament matches are rated.
- **Periods:** weekly = ISO week (Monday 00:00 UTC start); monthly = Gregorian calendar month (UTC). Not the Iranian week (Saturday) or the Jalali month (§10 Q1).
- **Updates:** after each rated match (immediately) and a nightly full rebuild. Banned users are excluded from the displayed rows, but their positions still count, so ranks can skip a number (§10 Q4).
- **Ties:** no tie handling; equal values get consecutive ranks in server order.
- **Prediction accuracy:** counts every settled stake (not per match); a stake is "correct" when its payout > 0, so a winning stake whose share rounds down to 0 counts as wrong (predictions.md §10 Q2). Refunded and held pools don't count.

---

## 1. Goal and user story

- As a competitive player (P3 Hamid), I want to see the top players by rating, who climbed most this week and month, and where I stand, with my own row always visible.
- As a spectator who predicts (P2 Maryam), I want to see the most accurate predictors and understand how many predictions I need to appear.
- As any player, I want to open a top player's public profile.

Success means:
- The current scope, its period, and what the number means are always stated in words.
- My position is visible without scrolling, or it says clearly why I'm not ranked.
- Nothing on the board exposes private data (phone, balance, predictions' amounts).

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Rank card "Leaderboard" on PL-01 (play.md) | `/leaderboard` (scope `all`) |
| `lg` leaderboard snippet on PL-01 "See all" | `/leaderboard?scope=all` |
| Account hub "Leaderboard" (profile.md AC-01) | `/leaderboard` |
| Public profile rank row (profile.md AC-05) | `/leaderboard?scope=all` scrolled to the user if in the top 50 |
| My predictions "Accuracy board" link (predictions.md) | `/leaderboard?scope=predict` |
| Redirect from `app.` with path and query | Same |

| Exit | Destination |
| --- | --- |
| Row tap | `/profile/[username]` (AC-05) |
| Predict-scope empty state | `/live` |
| Not-ranked state "Play a rated match" | `/play` |
| Back | Previous screen (Tab 1 child: back to `/play` by default) |

---

## 3. Flow

1. Open `/leaderboard?scope=<s>`; a missing or unknown `scope` → `all` (URL replaced).
2. Scope tabs: **Rating** (`all`) · **This week** (`weekly`) · **This month** (`monthly`) · **Predictions** (`predict`). Switching writes `?scope=` (replace, not push, so Back leaves the screen) and loads that board. Each scope's result is cached for 60 s in the session.
3. Render the scope's explainer line (§4 item 2), then rows in server order.
4. **My-rank row (LB-01):**
   - `me` present and within the returned rows → that row is highlighted in the list ("You" badge + outline), and a sticky copy is **not** shown.
   - `me` present and outside the top 50 → a sticky row at the bottom of the list area (above the nav): "You · #{rank} · {value}".
   - `me` null → sticky row with the reason: all: "You'll be ranked after your first rated match." weekly/monthly: "No rated matches this week/month yet." predict: see step 5.
   - Rows are not paginated; there's no "jump to me" beyond the top 50 (§10 Q2).
5. **Predictions scope:**
   - Explainer: "Share of your settled predictions that won. At least {min} predictions to appear." (`min` from §10 Q3; until exposed, without the number: "…Players need enough settled predictions to appear.")
   - My row: `me` is null from the API; show "Your accuracy appears here once you're on the board." plus a link "My predictions" → `/me/predictions` (§10 Q3).
   - Each row shows accuracy and "{count} predictions".
6. **Refresh:** pull to refresh; when returning to the screen after 60 s; no timed polling (values change slowly).
7. **Row tap** → `/profile/[username]`. Rows with `username: null` (deleted or unavailable account) show "Player unavailable" and are not links.

---

## 4. Screen list

### PL-09 Leaderboard `/leaderboard` (Tab 1 child)

- **Purpose:** compare rankings; open profiles.
- **App bar:** back (mirrors), title "Leaderboard", balance chip.
- **Content priority:**
  1. Scope tabs (4, scrollable at xs).
  2. Explainer line per scope (secondary text, always visible):
     - Rating: "Rating (ELO) from rated matches against people. Bots don't count."
     - This week: "Rating gained this week (since Monday). Resets every Monday." (§10 Q1 wording follows the period decision)
     - This month: "Rating gained this month. Resets on the 1st." (Gregorian month; §10 Q1)
     - Predictions: step 5.
  3. Top 3 rows: same row layout with a rank medal shape (1, 2, 3 in a shaped badge: not color alone, the number is always visible). No podium animation, no confetti.
  4. Rows 4–50.
  5. Sticky my-rank row (LB-01) when applicable.
- **Row content (≥ 64 px):** rank number (locale digits, fixed-width column), avatar (40 px, decorative), username (LTR-isolated), level ("Level {n}"), value at the end edge:
  - Rating: "{elo}" with the label "rating" in the accessible name.
  - Weekly/monthly: signed «+۴۵» / «−۱۲» with the word "gained" / "lost" in the accessible name (P§10); zero shows «۰».
  - Predictions: «۶۸٪» and "{count} predictions" as a second line.
- **Primary action:** none (reference screen). Rows are links.

---

## 5. States

| State | PL-09 |
| --- | --- |
| **Loading** | Tabs render at once; 10 skeleton rows; my-rank row skeleton |
| **Empty** | Rating: "No rated matches yet." Weekly/monthly: "No rated matches this week/month yet." Predictions: "No one has enough predictions yet." + "Watch live matches" → `/live` (P§5) |
| **Error** | Screen error in the list area + Retry; tabs still work |
| **Offline** | Banner `net.offline`; cached board with `common.lastUpdated`; pull to refresh disabled with `net.offlineAction`; uncached scope → offline error state |
| **Reconnecting** | n/a (REST) |
| **Insufficient coins** | n/a (no spend) |
| **Suspended** | Works; suspension banner. A suspended user still appears on boards. |
| **Banned** | No session (AU-14). Banned users are not listed. |
| **First-time user** | My-rank row: "You'll be ranked after your first rated match." with "Play a rated match" → `/play`. No other hints. |
| **Not in top 50** | Sticky my-rank row with rank and value |

---

## 6. Responsive notes (§11.7)

| Breakpoint | Layout |
| --- | --- |
| `xs` 320–359 | Tabs scroll horizontally with overflow cue; rows: rank, avatar, name on line 1, level and value on line 2; nav icon-only |
| `sm` 360–599 (390 × 844) | Single row per player; sticky my-rank row directly above the bottom nav with the safe area |
| `md` 600–1023 | Side rail; list plus detail: row tap opens the public profile (AC-05) in the detail panel, URL `/profile/[username]` (ia.md §3.3 list-detail); tabs above the list |
| `lg` ≥ 1024 | Shell max 1280: list (max 720) plus the profile panel; a context column shows the explainer and "How ratings work" link (`/help/rating`) |

- **Landscape phones** (height < 500 px): side rail; the sticky my-rank row becomes an inline row at the top of the list so it doesn't take height.
- Width and orientation changes keep the scope and scroll.
- Keyboard: tabs with arrow keys; rows in order; Enter opens.

---

## 7. RTL/LTR notes and i18n keys

- fa first. Rank sits on the start edge, value on the end edge; both mirror. Numbers use locale digits; signed values use U+2212 minus and are isolated with `<bdi>`; percent via `Intl.NumberFormat` percent style.
- Usernames LTR-isolated. "#" before ranks is not used in fa; use «رتبه‌ی {rank}».

| Key | fa | en |
| --- | --- | --- |
| `leaderboard.title` | جدول رده‌بندی | Leaderboard |
| `leaderboard.scope.all` | امتیاز رتبه | Rating |
| `leaderboard.scope.weekly` | این هفته | This week |
| `leaderboard.scope.monthly` | این ماه | This month |
| `leaderboard.scope.predict` | پیش‌بینی | Predictions |
| `leaderboard.explain.all` | امتیاز رتبه (ELO) از مسابقه‌های رتبه‌ای با بازیکنان واقعی. بازی با ربات حساب نمی‌شود. | Rating (ELO) from rated matches against people. Bots don't count. |
| `leaderboard.explain.weekly` | امتیاز رتبه‌ی به‌دست‌آمده در این هفته (از دوشنبه). هر دوشنبه از نو شروع می‌شود. | Rating gained this week (since Monday). Resets every Monday. |
| `leaderboard.explain.monthly` | امتیاز رتبه‌ی به‌دست‌آمده در این ماه میلادی. اول هر ماه از نو شروع می‌شود. | Rating gained this month. Resets on the 1st. |
| `leaderboard.explain.predict` | درصد پیش‌بینی‌های تسویه‌شده‌ی شما که برنده شده‌اند. حداقل {min} پیش‌بینی برای نمایش لازم است. | Share of your settled predictions that won. At least {min} predictions to appear. |
| `leaderboard.explain.predictNoMin` | درصد پیش‌بینی‌های تسویه‌شده‌ی شما که برنده شده‌اند. برای نمایش، به تعداد کافی پیش‌بینی تسویه‌شده نیاز است. | Share of your settled predictions that won. Players need enough settled predictions to appear. |
| `leaderboard.row.rank` | رتبه‌ی {rank} | #{rank} |
| `leaderboard.row.level` | سطح {level} | Level {level} |
| `leaderboard.row.predictions` | {count, plural, one {# پیش‌بینی} other {# پیش‌بینی}} | {count, plural, one {# prediction} other {# predictions}} |
| `leaderboard.row.unavailable` | بازیکن در دسترس نیست | Player unavailable |
| `leaderboard.row.label.all` | رتبه‌ی {rank}، {username}، سطح {level}، امتیاز رتبه {value} | Rank {rank}, @{username}, level {level}, rating {value} |
| `leaderboard.row.label.gain` | رتبه‌ی {rank}، {username}، سطح {level}، {value, select, gained {{amount} امتیاز افزایش} lost {{amount} امتیاز کاهش} other {بدون تغییر}} | Rank {rank}, @{username}, level {level}, {value, select, gained {gained {amount}} lost {lost {amount}} other {no change}} |
| `leaderboard.row.label.predict` | رتبه‌ی {rank}، {username}، دقت {percent}، {count} پیش‌بینی | Rank {rank}, @{username}, accuracy {percent}, {count} predictions |
| `leaderboard.me.you` | شما | You |
| `leaderboard.me.row` | شما · رتبه‌ی {rank} · {value} | You · #{rank} · {value} |
| `leaderboard.me.unrated` | پس از اولین مسابقه‌ی رتبه‌ای‌تان رتبه می‌گیرید. | You'll be ranked after your first rated match. |
| `leaderboard.me.noWeek` | هنوز در این هفته مسابقه‌ی رتبه‌ای نداشته‌اید. | No rated matches this week yet. |
| `leaderboard.me.noMonth` | هنوز در این ماه مسابقه‌ی رتبه‌ای نداشته‌اید. | No rated matches this month yet. |
| `leaderboard.me.predict` | وقتی وارد جدول شوید، دقت شما اینجا نمایش داده می‌شود. | Your accuracy appears here once you're on the board. |
| `leaderboard.me.myPredictions` | پیش‌بینی‌های من | My predictions |
| `leaderboard.me.playRated` | یک مسابقه‌ی رتبه‌ای بازی کنید | Play a rated match |
| `leaderboard.empty.all` | هنوز مسابقه‌ی رتبه‌ای انجام نشده است. | No rated matches yet. |
| `leaderboard.empty.weekly` | هنوز در این هفته مسابقه‌ی رتبه‌ای انجام نشده است. | No rated matches this week yet. |
| `leaderboard.empty.monthly` | هنوز در این ماه مسابقه‌ی رتبه‌ای انجام نشده است. | No rated matches this month yet. |
| `leaderboard.empty.predict` | هنوز کسی به تعداد کافی پیش‌بینی نکرده است. | No one has enough predictions yet. |
| `leaderboard.empty.watchLive` | تماشای مسابقه‌های زنده | Watch live matches |
| `leaderboard.loadError` | جدول رده‌بندی بارگذاری نشد. | Couldn't load the leaderboard. |
| `leaderboard.howRatingsWork` | امتیاز رتبه چطور حساب می‌شود؟ | How ratings work |

Shared keys used: `common.back`, `common.retry`, `common.lastUpdated`, `net.offline`, `net.offlineAction`, `errors.validation`, `errors.network`, `errors.generic`, `play.rank.leaderboard`, `profile.hub.leaderboard`.

---

## 8. Accessibility

**Focus order:** suspension banner → app bar (back, title, balance chip) → scope tabs (one stop, arrows move, `role="tablist"`) → explainer → rows in rank order → sticky my-rank row → nav. The sticky row is placed after the list in the DOM, so it is read last, not first.

**Labels:** each row is one link with `leaderboard.row.label.*`; medal badges are decorative (the rank number is in the name). The list is an ordered list (`<ol>`) with `aria-label` = the scope name.

**Other rules:**
- Not color alone: own row ("You" badge + outline), top-3 badges (shape + number), gains/losses (sign + words).
- Contrast 4.5:1 for all text, including values on highlighted rows.
- Targets: rows ≥ 64 px tall; tabs ≥ 44 px.
- Motion: no rank-change animations; scope switch without transition under reduced motion.
- Text 200%: rows wrap to 2 lines; values never truncate.
- Scope change announces politely: "{scope} leaderboard, {n} players".

---

## 9. Acceptance criteria

1. `/leaderboard` without `scope` shows Rating; `?scope=weekly|monthly|predict` opens that tab; switching tabs updates `?scope=` with replace.
2. Each scope shows its explainer line in words, including what the number means and the reset rule for weekly and monthly.
3. Rows show rank, avatar, username, level, and value; weekly/monthly values are signed with U+2212 and read as "gained"/"lost"; prediction rows show percent and count.
4. The viewer's row is highlighted with "You" + outline when in the top 50; otherwise a sticky my-rank row shows rank and value; `me: null` shows the scope-specific reason.
5. Rows with a username link to `/profile/[username]`; null usernames are not links.
6. The predictions scope shows the minimum-count sentence (with the number once exposed) and links to My predictions from the my-rank row.
7. Empty, error, and offline states render per §5; the offline board shows "Last updated".
8. At `md`/`lg`, row taps open the public profile in the detail panel and update the URL.
9. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape; no horizontal scroll; no clipped text at 200%; targets ≥ 44 × 44 px.
10. Every string comes from an i18n key with fa and en.

---

## 10. Open questions and API gaps

1. **Periods don't match Iranian expectations.** Weekly uses ISO weeks (Monday, UTC) and monthly the Gregorian month. fa users expect a Saturday start and the Jalali month, in Tehran time. Proposal: compute periods in `Asia/Tehran` with a Saturday week and a locale-independent Jalali month (a product decision; both locales would share it), and return `period: {start, end}` so the UI can show "Since {date}" and "Resets {date}" without guessing.
2. **Top 50 only.** No pagination or "around me" window. Proposal: `me` rows include the two neighbors (`around: LeaderboardRow[]`), or cursor pagination.
3. **Predictions board lacks `me` and the minimum.** `me` is always null, and `predict.min_count_for_board` is not in `GET config`. Proposal: return `me: {rank, value, count} | {count, needed}` for the predict scope, so the user sees "{count} of {needed} predictions".
4. **Rank gaps.** Banned users are filtered out after ranks are assigned, so ranks can skip. Proposal: exclude them before ranking (Redis rebuild already does; the live update doesn't).
5. **Prediction accuracy definition.** Counts stakes, not matches (several stakes on one match count several times), and uses `payout > 0` as "correct" (a winning stake rounded down to 0 counts as wrong). Proposal: one entry per user per pool, correct = picked the winning side.
6. **`Leaderboard` TS type** declares `scope: "all" | "weekly" | "monthly"` and no `count`; the predict response doesn't match it. Please extend `packages/protocol`.
7. **Ties.** Equal values get different ranks. Acceptable? The alternative is shared ranks ("= 4").
8. **Help topic.** `/help/rating` isn't in help-legal.md's topic list yet.
