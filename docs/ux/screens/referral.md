# Referral: invite link, rules, earnings

Status: draft for UI build (CLAUDE.md §17 step 11).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 2, 3, 11; §7.4; §7.9; §10.2 (Referral); §11.0 (routing; `ref` survives redirects); §11.3; §11.7; §12.1; §12.2 (`referral_farm`); §14 (`referral.*`); §18 (referral defaults); §21.2; ia.md §1–§3 (`?ref=`); patterns.md (P§) 4, 5, 9.2, 10, 11, 13, 14, 17, 18; journeys.md J1 (link capture); personas P4 Ali, P1 Reza.
Related specs: `auth.md` (AU-01 `ref` capture, AU-04 referrer field, `REFERRER_NOT_FOUND`), `profile.md` (AC-01 "Invite friends" row), `wallet.md` (ledger row `referral_commission`), `predictions.md` (the `referral` blocked reason).

Screen ID: RF-01 (screen-inventory.md §2.8). RF-02 (share sheet fallback) is new.

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET me/referral` | `ReferralSummary`: `code` (the user's **username**), `referees` (accounts that signed up with this user as referrer), `active_referees` (those currently earning), `earned` (coins paid, sum), `commissions` (count of paid commissions), `pct` (`referral.pct`), `base` (`referee_entry` or `pot`), `duration_days` (0 = no limit) |
| `GET me/referral/earnings?cursor=` | `{results: ReferralEarningRow[], next}`, newest first, 30 per page. Row: `id`, `referee` (username), `amount`, `match_id`, `created_at`. **Paid, held, and cancelled rows are all returned, with no status field** (§10 Q1). |
| Signup `POST auth/register {…, referrer?}` | `referrer` = a username (auth.md). Immutable after signup. |

Server rules the UI relies on (`backend/referrals/services.py`):

- **Commission** per coin-table match of a referred player: `floor(base × pct / 100)`, base = the referee's entry (default) or the pot. Paid from the platform fee, in the match's settlement, once per match per referee, never more than that match's fee. **Rounded down to whole coins**: at the defaults (1% of the entry), a 50-coin table pays 0 and a 100-coin table pays 1.
- **Active** only when the referee has a verified phone **and** a funded wallet (a coin purchase or a support top-up), and, when `duration_days` > 0, within that many days of the referee's signup.
- **Only coin tables** earn: bot matches, tournament matches (entry 0), and aborted matches pay nothing.
- **Anti-fraud (§12.2 `referral_farm`):** if the referrer and referee share a device or IP cluster, the commission is created as **held** and flagged; the review then pays it or cancels it.
- **Banned referrers** get nothing. Suspended referrers keep earning (earning is not spending).
- **Code = username:** changing the username (profile.md AC-03) changes the code; old links and codes stop working (§10 Q2).

---

## 1. Goal and user story

- As a budget player (P4 Ali), I want to share an invite link in one tap and understand exactly when and how much I earn.
- As a regular (P1 Reza), I want to see what each friend's games earned me, including commissions on hold.
- As an invited friend, I want the invite to be a normal signup, with no pressure.

Success means:
- The rule (percent, base, rounding, activation, duration) fits in plain sentences on the screen, using server values.
- Every earning row says whether it was paid, is on hold, or was not paid, without accusations.
- Nothing frames inviting as a pyramid, a race, or a guaranteed income.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Account hub "Invite friends" (profile.md AC-01) | RF-01 `/me/referral` |
| Help topic "Referral commission" "See your invite link" | RF-01 |
| Ledger row `referral_commission` in WA-02 (wallet.md) "Invite friends" link | RF-01 |
| Redirect from `app.` with path and query | RF-01 |

| Exit | Destination |
| --- | --- |
| Share | OS share sheet (Web Share API) or RF-02 |
| "?" | `/help/referral` |
| Back | `/me` |

Rows don't link anywhere: a friend's match belongs to them (§2 rule 13 spirit); the earning is visible in the wallet ledger.

---

## 3. Flow

### 3.1 Load (RF-01)

1. In parallel: `GET me/referral`, `GET me/referral/earnings` (first page).
2. Build the invite link from the **root** domain so it survives Phase 2 device routing (§11.0 rule 3): `https://<BASE_DOMAIN>/?ref=<code>` (§10 Q3: the client needs the domain or the full link from the API; until then, use the current origin).
3. `code` null (no username; should not happen after signup) → the invite card shows "Set a username to get your invite link" + "Edit profile" → `/me/edit`.

### 3.2 Share and copy

1. **Share** (primary): `navigator.share({title, text, url})` with `referral.share.text` ("Play backgammon with me on {app}: {url}") in the **sharer's** locale. Cancelled share → nothing happens (no error).
2. Web Share unavailable (many desktop browsers) → RF-02 sheet: the link (LTR, selectable), "Copy link", and "Copy code".
3. **Copy link** / **Copy code** buttons on the card itself (secondary): `CopyButton` with "Copied" for 4 s and a polite announcement.
4. No contact import, no SMS sending from the app, no "invite 5 friends" goals.

### 3.3 Rules block

Built from `pct`, `base`, `duration_days` (never hardcoded), always visible:

1. "You get {pct}% of your friend's table entry (base = `referee_entry`) / of the table's total pot (base = `pot`) each time they play a coin table. It's paid from the platform fee, so your friend pays nothing extra."
2. "Commissions start after your friend verifies their phone and adds coins for the first time (a purchase or a top-up by support)." (§10 Q5: the referee's verification state isn't visible.)
3. Duration: `0` → "There's no time limit." `> 0` → "You earn for {days} days after your friend signs up."
4. "Amounts are rounded down to whole coins, so small tables may earn nothing. Bot and tournament matches don't earn."
5. "Commissions for accounts that share a device or network are checked before they're paid."
6. "?" → `/help/referral`.

### 3.4 Summary

- "{referees} friends joined · {active_referees} earning now" (plural-aware).
- "Earned so far: {earned} coins from {commissions} matches" (paid only).
- On hold total when available (§10 Q1): "{held} coins on hold".

### 3.5 Earnings list

1. Newest first; "Show more" loads the next cursor page.
2. Row: friend `@{referee}` (LTR-isolated), date and time (Jalali in fa), amount, and a status chip (icon + text) from `status` (§10 Q1):

   | `status` | Chip | Amount | Secondary line |
   | --- | --- | --- | --- |
   | `paid` | "Paid" (check) | «+{amount}» | — |
   | `held` | "On hold" (clock) | «{amount}» (no sign) | "Being checked. It will be paid or cancelled after the review." |
   | `cancelled` | "Not paid" (×) | «{amount}» struck through plus the word "not paid" | "Not paid after review." |

   Until `status` exists, rows are shown without a chip and with «{amount}», and the summary's `earned` is the only paid total (§10 Q1: rows could mislead, see there).
3. Rows are grouped by local day like the wallet ledger ("Today", "Yesterday", Jalali date).
4. No totals per friend, no ranking of friends, no "your top referrer" framing.

---

## 4. Screen list

### RF-01 Invite friends `/me/referral` (Tab 5 child)

- **Purpose:** share the invite link; understand and track commissions.
- **App bar:** back (mirrors), title "Invite friends", balance chip.
- **Content priority:**
  1. Invite card: heading "Your invite link", the link (LTR, 1 line with middle truncation; full text in the accessible name), "Your code: {code}", primary "Share invite link", secondary "Copy link" and "Copy code".
  2. Rules block (§3.3).
  3. Summary (§3.4).
  4. Earnings heading and list (§3.5).
- **Components:** card, `CopyButton`, `InfoLine` list for rules, `SignedAmount`, status chips, day groups, "Show more".
- **Primary action:** Share invite link (thumb zone at `sm`: the invite card is first on screen and the button sits in its lower half; a sticky footer duplicate is **not** used, the page is short enough).

### RF-02 Share fallback (sheet; centered dialog at `md`/`lg`)

- Title "Share your invite link"; the link in a read-only LTR field; "Copy link"; "Copy code"; Close.

---

## 5. States

| State | RF-01 |
| --- | --- |
| **Loading** | Invite card skeleton; rules render from the summary (skeleton lines until it arrives, since values come from the server); 5 skeleton rows |
| **Empty** | Earnings: `referral.empty` "No earnings yet. Commissions start after your friend's first coin top-up." with "Copy link" (P§5). Summary with 0 friends: "No friends have joined with your link yet." |
| **Error** | Summary failed → screen error + Retry (the link can't be built without `code`); earnings failed → inline error in the list + Retry |
| **Offline** | Banner; cached summary and list with `common.lastUpdated`; Share and Copy still work with the cached link; "Show more" disabled |
| **Reconnecting** | n/a (REST) |
| **Insufficient coins** | n/a (no spend) |
| **Suspended** | Works; suspension banner. A line under the summary: none needed (earning continues). |
| **Banned** | No session (AU-14) |
| **First-time user** | One-time hint (P§14): "Share your link. When friends play coin tables, you get a small share of the platform fee." |
| **Held commissions** | Rows with "On hold" (§3.5); summary "on hold" line when exposed |

---

## 6. Responsive notes (§11.7)

| Breakpoint | Layout |
| --- | --- |
| `xs` 320–359 | Single column; link truncates in the middle; Copy link and Copy code stack full width |
| `sm` 360–599 (390 × 844) | Single column; Share full width; Copy buttons side by side |
| `md` 600–1023 | Side rail; Tab 5 list-detail (profile.md `AccountLayout`): RF-01 in the detail panel. Two columns inside: invite card + rules (start), summary + earnings (end) when the panel is ≥ 44rem |
| `lg` ≥ 1024 | Same two columns in the shell max 1280 |

- **Landscape phones** (height < 500 px): side rail; single column.
- Keyboard: all buttons reachable; Enter/Space activate.

---

## 7. RTL/LTR notes and i18n keys

- fa first. The link and code are LTR-isolated (`<bdi dir="ltr">`), Latin characters.
- The share text is composed in the sharer's locale; the recipient opens the app in their own default (fa) and can switch.
- Amounts use locale digits; signed paid amounts use «+».

| Key | fa | en |
| --- | --- | --- |
| `referral.title` | دعوت از دوستان | Invite friends |
| `referral.link.heading` | لینک دعوت شما | Your invite link |
| `referral.link.label` | لینک دعوت: {url} | Invite link: {url} |
| `referral.code` | کد شما: {code} | Your code: {code} |
| `referral.share` | اشتراک‌گذاری لینک دعوت | Share invite link |
| `referral.copyLink` | کپی لینک | Copy link |
| `referral.copyCode` | کپی کد | Copy code |
| `referral.noCode` | برای دریافت لینک دعوت، یک نام کاربری انتخاب کنید. | Set a username to get your invite link. |
| `referral.share.title` | {app} | {app} |
| `referral.share.text` | با من در {app} تخته‌نرد بازی کن: {url} | Play backgammon with me on {app}: {url} |
| `referral.shareSheet.title` | اشتراک‌گذاری لینک دعوت | Share your invite link |
| `referral.rules.title` | چطور کار می‌کند | How it works |
| `referral.rules.entry` | هر بار که دوستتان در میز سکه‌ای بازی کند، {pct} از ورودی او به شما می‌رسد. این مبلغ از کارمزد سکو پرداخت می‌شود و دوستتان هزینه‌ی اضافه‌ای نمی‌دهد. | You get {pct} of your friend's table entry each time they play a coin table. It's paid from the platform fee, so your friend pays nothing extra. |
| `referral.rules.pot` | هر بار که دوستتان در میز سکه‌ای بازی کند، {pct} از مجموع مبلغ میز به شما می‌رسد. این مبلغ از کارمزد سکو پرداخت می‌شود و دوستتان هزینه‌ی اضافه‌ای نمی‌دهد. | You get {pct} of the table's total pot each time your friend plays a coin table. It's paid from the platform fee, so your friend pays nothing extra. |
| `referral.rules.activation` | پورسانت از وقتی شروع می‌شود که دوستتان شماره‌اش را تأیید کند و برای اولین بار سکه اضافه کند (خرید یا شارژ توسط پشتیبانی). | Commissions start after your friend verifies their phone and adds coins for the first time (a purchase or a top-up by support). |
| `referral.rules.noLimit` | محدودیت زمانی ندارد. | There's no time limit. |
| `referral.rules.days` | {days, plural, one {تا # روز پس از ثبت‌نام دوستتان پورسانت می‌گیرید.} other {تا # روز پس از ثبت‌نام دوستتان پورسانت می‌گیرید.}} | {days, plural, one {You earn for # day after your friend signs up.} other {You earn for # days after your friend signs up.}} |
| `referral.rules.rounding` | مبلغ‌ها به سکه‌ی کامل رو به پایین گرد می‌شوند، پس میزهای کوچک ممکن است پورسانتی نداشته باشند. مسابقه‌های ربات و تورنمنت پورسانت ندارند. | Amounts are rounded down to whole coins, so small tables may earn nothing. Bot and tournament matches don't earn. |
| `referral.rules.review` | پورسانت حساب‌هایی که دستگاه یا شبکه‌ی مشترک دارند، پیش از پرداخت بررسی می‌شود. | Commissions for accounts that share a device or network are checked before they're paid. |
| `referral.summary.friends` | {referees, plural, one {# دوست عضو شده} other {# دوست عضو شده‌اند}} · {active, plural, one {# نفر فعال} other {# نفر فعال}} | {referees, plural, one {# friend joined} other {# friends joined}} · {active} earning now |
| `referral.summary.noFriends` | هنوز کسی با لینک شما عضو نشده است. | No friends have joined with your link yet. |
| `referral.summary.earned` | تا حالا: {earned} سکه از {commissions, plural, one {# مسابقه} other {# مسابقه}} | Earned so far: {earned} coins from {commissions, plural, one {# match} other {# matches}} |
| `referral.summary.held` | {held} سکه در انتظار بررسی | {held} coins on hold |
| `referral.earnings.title` | درآمد از دعوت | Earnings |
| `referral.earnings.friend` | از بازی {username} | From @{username}'s match |
| `referral.status.paid` | پرداخت شد | Paid |
| `referral.status.held` | در انتظار بررسی | On hold |
| `referral.status.cancelled` | پرداخت نشد | Not paid |
| `referral.status.heldNote` | در حال بررسی است. پس از بررسی پرداخت یا لغو می‌شود. | Being checked. It will be paid or cancelled after the review. |
| `referral.status.cancelledNote` | پس از بررسی پرداخت نشد. | Not paid after review. |
| `referral.row.label` | {username}، {date}، {amount} سکه، {status} | @{username}, {date}, {amount} coins, {status} |
| `referral.empty` | هنوز درآمدی ندارید. پورسانت پس از اولین شارژ سکه‌ی دوستتان شروع می‌شود. | No earnings yet. Commissions start after your friend's first coin top-up. |
| `referral.hint.firstVisit` | لینکتان را به اشتراک بگذارید. وقتی دوستانتان در میزهای سکه‌ای بازی کنند، سهم کوچکی از کارمزد سکو به شما می‌رسد. | Share your link. When friends play coin tables, you get a small share of the platform fee. |
| `referral.loadError` | اطلاعات دعوت بارگذاری نشد. | Couldn't load your invite details. |
| `referral.earnings.loadError` | درآمدها بارگذاری نشد. | Couldn't load earnings. |

Shared keys used: `common.back`, `common.close`, `common.copy`, `common.copied`, `common.retry`, `common.showMore`, `common.lastUpdated`, `common.help`, `app.name`, `net.offline`, `net.offlineAction`, `profile.hub.referral`, `profile.hub.editProfile`, `wallet.tx.referral_commission`, `errors.network`, `errors.generic`.

---

## 8. Accessibility

**Focus order:** suspension banner → app bar → invite card heading → link (read-only, focusable) → Share → Copy link → Copy code → rules heading → rules list → "?" → summary → earnings heading → rows → Show more.

**Labels:** link: `referral.link.label` (full URL, not truncated); copy buttons have explicit labels ("Copy link", "Copy code"); rows: one accessible name `referral.row.label`; status chips icon + text; decorative icons `aria-hidden`.

**Other rules:**
- Not color alone: statuses (icon + text); cancelled amount (strike-through plus the words "not paid").
- Contrast 4.5:1; the link text on its card too.
- Targets ≥ 44 × 44; rows ≥ 56 px.
- Live regions (polite): "Copied", list loaded more.
- Text 200%: the link wraps (LTR, break anywhere) instead of truncating; buttons stack.

---

## 9. Acceptance criteria

1. RF-01 shows the invite link built from `code` and the code itself, both LTR-isolated, with Share, Copy link, and Copy code.
2. Share uses the Web Share API when available; otherwise RF-02 opens; a cancelled share shows no error.
3. The rules block uses `pct`, `base`, and `duration_days` from the API (no hardcoded 1%), includes activation, rounding-down, bot/tournament exclusion, and the review sentence.
4. The summary shows friends joined, earning now, and coins earned from N matches.
5. Earnings rows show the friend's username, Jalali date (fa), amount, and (once `status` exists) a status chip with icon + text; held and cancelled rows never show a «+» sign.
6. No row links to a friend's match or replay; no phone number appears anywhere.
7. Empty, error, and offline states render per §5; copy works offline with the cached link.
8. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape; no horizontal scroll; no clipped text at 200%; targets ≥ 44 × 44 px.
9. Every string comes from an i18n key with fa and en.

---

## 10. Open questions and API gaps

For the main agent unless noted. Q1 blocks the held/cancelled display.

1. **Earnings rows lack `status`.** Held and cancelled commissions come back looking exactly like paid ones, so the list overstates earnings (the summary `earned` is correct). Proposal: add `status` (`paid`, `held`, `cancelled`) to each row, and `held` (sum) to the summary. Until then, the list shows rows without a chip and the summary is the only total.
2. **Code = username.** A username change silently breaks every shared link and changes the code. Proposal: a stable referral code (`user.referral_code`, random 6–8 characters) accepted by `POST auth/register` alongside usernames, or keep old usernames as aliases for `ref`. At minimum, AC-03 (profile.md) must warn "Your invite link will change."
3. **Link base.** The client doesn't know `BASE_DOMAIN`. Proposal: `GET me/referral` returns `link` (`https://<BASE_DOMAIN>/?ref=<code>`), so Phase 2 routing works from the root domain.
4. **Tiny commissions.** At the defaults, 1% of a 50-coin entry is 0 and of 100 is 1 coin. The copy is honest about rounding; the product owner may want a different base or percent.
5. **Referee activation visibility.** The referrer can't see which friends are not yet active and why. That is intentional for privacy (their purchases are theirs). Confirm that only the counts are shown.
6. **Shown to the referee.** Should the invited player see "Invited by @x" anywhere (e.g., AC-01)? Not required; currently not in `GET me`.
7. **Held referral and predictions.** A referral relation blocks predictions on each other's matches (`predictions.md`, reason `referral`). The rules block could mention it; left out to keep the page short. Confirm.
