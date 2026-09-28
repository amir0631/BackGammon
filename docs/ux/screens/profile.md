# Profile: account hub, edit profile, username change, settings, sessions, public profile

Status: draft for UI build (CLAUDE.md §17 step 2; the username-change purchase flow activates in step 3).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 8 and 11, §11.3, §11.5, §11.6, §11.7, §12.1 (username rules, account status), §14 (`username.change_cost`, `username.change_cooldown_days`), §15 (`user`); ia.md §1–§4; patterns.md (P§) 1, 2, 3, 5, 9.1, 10, 11, 13, 16, 18; auth.md (AU-10, AU-12, AU-13).
API (step 2): `GET/PATCH me` (`lang`, `avatar`, prefs), `GET users/{username}`, `GET me/sessions`, `DELETE me/sessions` (all other sessions), `GET avatars`.

This spec also owns the step-2 base of `/settings` (ST-01): language and game preferences. Notifications and install items are added by `system.md` in step 17 (screen-inventory.md §1).

---

## 1. Goal and user story

- As a player, I want to pick an avatar and see my public identity (username, level, rating) the way others see it.
- As a player, I want to choose my language and set how the game looks, sounds, and vibrates, and have those choices follow me to any device I sign in on.
- As a player worried about account safety (P4 Ali, P2 Maryam), I want to see which devices are signed in and sign out all the others in one step.
- As a player, I want to know that I can change my username later, what it costs, and when. Until the wallet exists, the option must be visible and honest about when it becomes available, never a broken button.
- As any player, I want to open another player's public profile and never see anything private (phone number).

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Bottom nav "Account" (side rail at `md`/`lg`) | AC-01 `/me` |
| Profile card on AC-01 | AC-05 `/profile/[own username]` |
| "Edit profile" on AC-01 or on own AC-05 | AC-02 `/me/edit` |
| "Settings" on AC-01 | ST-01 `/settings` |
| "Signed-in devices" on AC-01 or ST-01 | AC-04 `/me/sessions` |
| Leaderboard rows, live list, player peek sheet in a match, bracket, transfer receipts (later steps) | AC-05 `/profile/[username]` |
| Direct link or redirect from `app.` | Any of the above (guests → `/login?next=`) |

| Exit | Destination |
| --- | --- |
| Back from a Tab 5 child | AC-01 (or the previous screen in the tab stack) |
| Back from AC-05 | The origin tab's previous screen. AC-05 is a child of the tab it was opened from (ia.md §2). |
| "Log out" | AU-12 dialog (auth.md) |
| "Change password" on ST-01 | Password reset flow AU-07 with the phone prefilled (auth.md open question 6) |
| "Send coins" on another player's AC-05 (step 3+) | `/wallet/transfer?to=<username>` (wallet.md TR-01) |

---

## 3. Flow

### 3.1 Change avatar (AC-02)

1. AC-02 shows the avatar picker with the current avatar checked. This is the current state, not a pre-selection of a new choice.
2. The user picks another avatar. The preview in the header updates, and a sticky "Save avatar" button appears (enabled only when the pick differs from the saved one).
3. "Save avatar" → `PATCH me {avatar}`.
   - Success → snackbar "Avatar updated", header and AC-01 card update.
   - Failure → action error above the button, with the pick kept and Retry.
4. Leaving with an unsaved pick: no dialog. The pick is discarded, since nothing is lost that can't be redone in one tap. The "Save" button shows the unsaved state in text: "Unsaved change".

### 3.2 Username change (AC-03)

The row on AC-02 has two modes, chosen by a capability signal from the backend (open question 1), not by the client guessing.

**Mode A: wallet not available yet (step 2).**
1. The Username row on AC-02 shows:
   - the current username (LTR, copyable)
   - the rules line "You can change your username once every {days} days for {cost} coins"
   - the status line "Username changes open when the coin wallet launches."
2. There is no button: nothing to tap that would fail. The status line has an info icon plus text, not a disabled control.
3. The rest of AC-02 works normally. This is not a dead end: the user can save an avatar, go back, or open Help ("?" → `/help/account`, when help ships).

**Mode B: wallet available (step 3+).**
1. The row shows the current username and "Change username" (text button, 44 px target). If a change was made within the cooldown, the button is replaced by "Next change available on {date}" (Jalali in fa).
2. Tap → AC-03 sheet, **step 1 "New username"**:
   - The input is empty (never prefilled with the current name).
   - Same rules and client checks as AU-04 (auth.md §4), including the English-letters hint.
   - "Continue" is disabled with a reason until the format is valid and differs from the current name (case-insensitive).
3. "Continue" → availability check (open question 2). Taken or invalid → field error in step 1.
4. The sheet replaces itself with **step 2 "Confirm"**, the money confirmation of P§2.1:

   | Row | Value |
   | --- | --- |
   | Title | "Change username to @{new}" |
   | Summary | old `@{old}` → new `@{new}` (both LTR-isolated) |
   | Cost | `username.change_cost` from the server, plus the toman equivalent (P§2.1) |
   | Your balance | `wallet.balance` (available) |
   | Balance after | balance − cost |
   | Cooldown | "Your next change will be possible on {date}" (today + `username.change_cooldown_days`, Jalali in fa) |
   | Effects | "Your profile link changes. Your old username may become available to other players." (open question 3) |
   | Primary | "Pay {cost} coins and change" |
   | Secondary | Cancel |

5. Primary → the change request (endpoint TBD, open question 2) with `Idempotency-Key`. In-flight rules of P§2.2 apply: spinner, not dismissible, "Still working… Check status" after 10 s.
   - Success → sheet closes; snackbar "Username changed to @{new}"; the balance chip updates; the AC-02 row shows the cooldown date.
   - `USERNAME_TAKEN` (taken during confirmation) → back to step 1 with the error. Nothing charged; the sheet says so.
   - Cost or cooldown changed on the server → the sheet refreshes with a notice (P§2.2).
   - `WALLET_INSUFFICIENT` → insufficient state (below).
6. **Insufficient coins** (checked before step 2 opens, and again on the server): the P§9.1 sheet.
   - Title "Not enough coins", with cost, balance, and shortfall.
   - There are no cheaper alternatives for this action, so the options are "Get coins" (text-style secondary → `/shop/coins`) and "Close".
   - Neutral copy.
7. **Suspended account:** the button is disabled with `account.suspended.actionBlocked` and a "Details" link (auth.md AU-13). No sheet opens. (auth.md open question 13.)

### 3.3 Language and game preferences (ST-01)

1. ST-01 shows the current values from `me` (server) merged with device facts (OS reduced-motion setting, vibration support).
2. **Language:** two radio options, as in the AU-10 sheet (auth.md).
   - Choosing applies immediately (direction flips, strings swap) and sends `PATCH me {lang}`.
   - Scroll position and focus are kept on the language group.
   - Offline: the group is disabled with the reason "Connect to the internet to change the language." The other locale's strings may not be cached.
3. **Toggles** (lite graphics, reduced animations, sound, vibration) apply locally at once and sync with `PATCH me {prefs}`:
   - Success: silent (no snackbar for reversible settings, P§3).
   - Failure: the toggle stays at the new value on this device, with the inline note "Saved on this device. We'll sync it when you're back online." Retry on reconnect and on the next focus. After a server rejection (4xx), revert the toggle and show "Couldn't save this setting."
4. **Reduced animations and the OS setting:** when `prefers-reduced-motion: reduce` is on:
   - The toggle shows "on" and is disabled.
   - The note reads "Your device's reduce-motion setting is on, so animations are always reduced."
   - The stored app value is not changed.
5. **Vibration unsupported** (no `navigator.vibrate`, e.g., iOS Safari): the toggle is disabled with the reason "This device or browser doesn't support vibration." The stored value is not changed.
6. **Lite graphics:** description only. The in-match suggestion (§11.6) is specified in `match.md`. The setting is per account (§11.6); see open question 5.

### 3.4 Signed-in devices (AC-04)

1. `GET me/sessions` → list, with the current device first and marked "This device". Others follow, sorted by last active, newest first.
2. "Sign out other devices" (enabled only when there is at least one other session; otherwise the text "No other devices are signed in") opens the AC-06 dialog.
3. AC-06 → "Sign out other devices" → `DELETE me/sessions`.
   - Success → the list reloads showing only this device; snackbar "Signed out of {count} other devices" (ICU plural).
   - Failure → error inside the dialog, with Retry.
4. A safety line under the button: "Don't recognize a device? Sign out other devices, then change your password." "Change password" → AU-07.
5. There is no per-device sign-out (the API revokes all others at once). See open question 6.

### 3.5 Public profile (AC-05)

1. `GET users/{username}`. The URL is case-insensitive: `/profile/ALI_TBZ` shows `ali_tbz`. The canonical casing is displayed, and the URL is replaced (not pushed) with the canonical form.
2. **Own profile:** the same page others see, plus "Edit profile" and the line "This is how other players see you."
3. **Other player:**
   - Profile content, then the actions available in the current step:
     - Step 3+: "Send coins" (secondary, not primary; → `/wallet/transfer?to=`).
     - Step 8+: rank row → `/leaderboard`.
   - No action that doesn't exist yet is shown.
4. **Not found** (`404`, or a bot username, since bots have no profile page) → "No player with this username." Action: Back.
5. **Suspended or banned player:** see open question 7. Until decided, the page renders whatever the API returns, and no status is shown to others.

---

## 4. Screen list

### AC-01 Account hub `/me` (Tab 5 root)

- **Purpose:** one place for identity, account, and app settings.
- **Content priority:**
  1. **Profile card:** avatar, username, level, and ELO. Tap → own AC-05. Plus an "Edit profile" button.
  2. **Wallet row** (step 3+): available balance → `/wallet`
  3. **Activity group:** Match history (step 8), My predictions (step 12), Invite friends (step 11), Leaderboard (step 8)
  4. **Account group:** Signed-in devices, Settings
  5. **Support group:** Help (when `help-legal.md` ships), Install app (step 17), Terms, Privacy
  6. **Log out**: its own row at the bottom, neutral styling, with an icon plus text
- **Components:** app bar (logo, title, balance chip from step 3), profile card, grouped list rows (≥ 56 px tall, chevron mirrors in RTL), suspension banner when applicable.
- **Rows for features that haven't shipped are omitted.** No "coming soon" rows; the order above is fixed, so later steps insert rows without reshuffling.
- **Primary action:** none (hub). The most-used item is at the top.

### AC-02 Edit profile `/me/edit`

- **Purpose:** change the avatar; see and (later) change the username.
- **Content priority:**
  1. Preview header (large avatar and username)
  2. Avatar picker
  3. "Save avatar" (sticky, only when changed)
  4. Username section (Mode A or B, §3.2)
  5. Read-only line "Mobile number: 0912•••••34" (masked, owner only, P§18), with the note "Your number is never shown to other players."
- **Avatar picker:** a grid of preset avatars from `GET avatars`. It is a radio group: one tab stop, arrow keys move. Each option is at least 56 × 56 px with an 8 px gap. The selected option shows a check badge plus a thicker outline (not color alone). Each option has an accessible name (open question 8).
- **Primary action:** Save avatar.

### AC-03 Username change sheet

- Two steps inside one sheet (P§1: a sheet may replace itself). At `md`/`lg` it becomes a centered dialog, max 480 px.
- Step 1: title, field, rules, Continue. Step 2: the P§2.1 cost block (§3.2 table), primary and Cancel, and a "?" link to `/help/account`.

### ST-01 Settings `/settings`

- **Purpose:** app-wide preferences.
- **Sections, in order:**
  1. **Language:** radio group «فارسی» / "English", each in its own language with `lang` set.
  2. **Game:**
     - "Lite graphics": switch plus a two-line description.
     - "Reduced animations": switch plus description, plus the OS note when applicable.
     - "Sound": switch.
     - "Vibration": switch, or the unsupported reason.
  3. **Account:**
     - "Mobile number" (masked, read-only)
     - "Change password" → AU-07
     - "Signed-in devices" → AC-04
  4. Later steps add "Notifications" and "Install app" (step 17) after Game.
- **Components:** MUI list with switches. The whole row toggles the switch (single 44 px+ target), and the description is linked by `aria-describedby`.
- **Primary action:** none; every change applies immediately.

### AC-04 Signed-in devices `/me/sessions`

- **Purpose:** review and cut off other sessions.
- **Content priority:**
  1. Intro "Devices where you're signed in to your account"
  2. "Sign out other devices" button (at the top, so it's reachable without scrolling a long list)
  3. Safety line
  4. Session list
- **Each session row:**
  - Device label, e.g. "Chrome on Android", derived by the server or from the user agent (open question 6)
  - "This device" chip (icon plus text) on the current one
  - "Last active": relative time plus the absolute Jalali date and time in fa
  - "Signed in": date
- **Never shown:** full IP addresses, tokens, or other users' data.
- **Primary action:** Sign out other devices.

### AC-06 Sign out other devices dialog

- Title: "Sign out of all other devices?"
- Body: "You'll stay signed in on this device. Anyone using your account elsewhere will need your password to sign in again."
- Buttons: "Cancel" (initial focus), "Sign out other devices".

### AC-05 Public profile `/profile/[username]`

- **Purpose:** a player's public identity.
- **Content priority (show only what the API returns; open question 9):**
  1. Avatar, username (LTR-isolated), and a "Bot" label (never reached, since bots have no page)
  2. Level and ELO
  3. Rank (step 8+)
  4. Member since: month and year, Jalali in fa
  5. Stats: matches played, wins, and win rate, if provided
  6. Actions (own: Edit profile; other, step 3+: Send coins)
- **Never shown:** phone number, balance, sessions, referral relations, or account status of others.
- **Primary action:** own → Edit profile. Other → none in step 2. Send coins from step 3 is secondary styling, because a profile is not a payment screen.

---

## 5. States

| State | AC-01 | AC-02 / AC-03 | ST-01 | AC-04 / AC-06 | AC-05 |
| --- | --- | --- | --- | --- | --- |
| **Loading** | Card skeleton (circle and two lines); list rows render immediately (static) | Avatar grid skeleton; username row skeleton; AC-03 buttons show spinners in flight | Current values from the cached `me`; a thin progress bar while refreshing | List skeleton (3 rows); dialog button spinner | Header skeleton, stats skeleton |
| **Empty** | — | `GET avatars` returns none → "No avatars available right now" and Retry; the current avatar still shows | — | Only this device → list of one, button replaced by "No other devices are signed in" | — |
| **Error** | Card failed → inline "Couldn't load your profile" + Retry; rows still work | PATCH failed → action error + Retry. AC-03: field errors (taken, invalid), action errors (price changed, cooldown active) | Save failed → §3.3 rules | Load failed → screen error (P§4.1) + Retry. `DELETE` failed → error in the dialog | 404 → "No player with this username" + Back. Other errors → screen error + Retry |
| **Offline** | Banner `net.offline`; cached card shown; rows navigate to cached routes | Save disabled with `net.offlineAction`; AC-03 cannot open (the button is disabled with the reason) | Language disabled with the reason; toggles apply locally and sync later | Button disabled with the reason; cached list shown with "Last updated {time}" | Cached profile if available, with "Last updated {time}"; else the offline screen state |
| **Reconnecting** | Not applicable (no socket). When the connection returns, silently refetch `me` and drop the banner. | ← | Pending toggles sync; no snackbar on success | ← | ← |
| **Insufficient coins** | — | Mode B only: the P§9.1 sheet (§3.2 step 6). Never pressure copy. | — | — | — |
| **Suspended** | Suspension banner (auth.md AU-13); all rows available | Avatar: allowed. Username change: disabled with `account.suspended.actionBlocked` + Details | All allowed | All allowed | Viewing allowed. "Send coins" disabled with the suspended reason (transfers blocked, §12.1) |
| **Banned** | Not reachable: banned users have no session (auth.md AU-14) | ← | ← | ← | ← |
| **First-time user** | Card shows level 1 and ELO 1500 as returned; no extra hints | If the avatar was skipped at signup, the default avatar is shown checked, with the hint "Pick an avatar that others will see." | Defaults as returned by `me` (open question 4) | Usually one device | Own profile shows "This is how other players see you." |

---

## 6. Responsive notes (§11.7)

| Breakpoint | AC-01 hub | AC-02 edit | ST-01 settings | AC-04 sessions | AC-05 public profile |
| --- | --- | --- | --- | --- | --- |
| `xs` 320–359 | Card stacks avatar above text; ELO and level on the second line; nav icon-only | Avatar grid 4 columns (min 56 px each); preview header compact | Switch rows: label and description wrap; the switch stays at the end | Row: device label on line 1, dates on lines 2–3 | Header stacks; stats in a 2-column grid |
| `sm` 360–599 (390 × 844 reference) | Single column; card at the top; groups as inset lists | 4–5 columns; "Save avatar" sticky in the bottom 40% (thumb zone) | Single column | Single column; button at the top | Single column; actions in the bottom 40% as a sticky footer |
| `md` 600–1023 | Side rail. List-detail: the hub list on the start side, the selected child (edit, settings, sessions) in the detail panel. The URL updates (ia.md §3.3). | In the detail panel, max 560 px; grid 6 columns | Detail panel, max 560 px | Detail panel | Centered column, max 720 px: header on top, stats in 3 columns |
| `lg` ≥ 1024 | Shell max 1280 px: side rail, hub list (360 px), detail panel, and a context panel showing the own public profile preview when editing | Avatar grid 8 columns; the preview lives in the context panel | Detail panel; the context panel shows help text for the focused setting | Detail panel; the context panel shows the safety tips | Two columns: identity card (start) and stats (end); max 1040 px |

- **Landscape phones (height < 500 px):** side rail. Sticky footers become inline, so they don't take a third of the height. The AC-03 sheet takes up to 90% `dvh` and scrolls.
- Survives width changes at runtime: the list-detail layout collapses to single screens at < 600 px, keeping the current URL.
- Hover states on rows and avatar options at `lg`; keyboard access for everything.

---

## 7. RTL/LTR notes and i18n keys

- fa first; everything mirrors, including row chevrons and back arrows.
- Usernames are always LTR-isolated (`<bdi dir="ltr">`) and shown with `@` in running text.
- **Masked phone:** `0912•••••34` in `<bdi dir="ltr">` with locale digits (fa `۰۹۱۲•••••۳۴`).
- **Dates:**
  - Jalali in fa (`fa-IR-u-ca-persian`), e.g. «۵ مهر ۱۴۰۵، ۱۴:۳۰».
  - Gregorian in en.
  - Relative times via `Intl.RelativeTimeFormat`.
- **Numbers:** ELO, level, coins, and stats use locale digits and grouping.
- **Switches:** the thumb moves toward the end side when on (mirrored in RTL, following MUI RTL).
- **Language options:** always rendered in their own language, with `lang` set: «فارسی» in Vazirmatn and "English" in Inter, whatever the UI locale.

| Key | fa | en |
| --- | --- | --- |
| `nav.account` | (existing) حساب من | Account |
| `profile.hub.title` | حساب من | Account |
| `profile.hub.editProfile` | ویرایش پروفایل | Edit profile |
| `profile.hub.viewProfile` | مشاهده‌ی پروفایل عمومی | View public profile |
| `profile.hub.level` | سطح {level} | Level {level} |
| `profile.hub.elo` | امتیاز ELO: {elo} | ELO {elo} |
| `profile.hub.group.activity` | فعالیت | Activity |
| `profile.hub.group.account` | حساب | Account |
| `profile.hub.group.support` | پشتیبانی و قوانین | Support and legal |
| `profile.hub.wallet` | کیف پول | Wallet |
| `profile.hub.matches` | تاریخچه‌ی مسابقه‌ها | Match history |
| `profile.hub.predictions` | پیش‌بینی‌های من | My predictions |
| `profile.hub.referral` | دعوت از دوستان | Invite friends |
| `profile.hub.leaderboard` | جدول رده‌بندی | Leaderboard |
| `profile.hub.sessions` | دستگاه‌های واردشده | Signed-in devices |
| `profile.hub.settings` | تنظیمات | Settings |
| `profile.hub.help` | راهنما | Help |
| `profile.hub.install` | نصب برنامه | Install app |
| `profile.hub.terms` | قوانین استفاده | Terms of use |
| `profile.hub.privacy` | حریم خصوصی | Privacy policy |
| `profile.hub.loadError` | اطلاعات پروفایل بارگذاری نشد. | Couldn't load your profile. |
| `profile.edit.title` | ویرایش پروفایل | Edit profile |
| `profile.edit.avatarTitle` | چهره | Avatar |
| `profile.edit.avatarOption` | {name} | {name} |
| `profile.edit.avatarSelected` | انتخاب‌شده | selected |
| `profile.edit.pickHint` | چهره‌ای انتخاب کنید که بازیکنان دیگر می‌بینند. | Pick an avatar that others will see. |
| `profile.edit.save` | ذخیره‌ی چهره | Save avatar |
| `profile.edit.unsaved` | تغییر ذخیره نشده | Unsaved change |
| `profile.edit.saved` | چهره به‌روز شد. | Avatar updated. |
| `profile.edit.saveError` | چهره ذخیره نشد. دوباره تلاش کنید. | Couldn't save your avatar. Try again. |
| `profile.edit.noAvatars` | فعلاً چهره‌ای برای انتخاب نیست. | No avatars available right now. |
| `profile.edit.phone` | شماره موبایل: {phone} | Mobile number: {phone} |
| `profile.edit.phonePrivate` | شماره‌ی شما هرگز به بازیکنان دیگر نشان داده نمی‌شود. | Your number is never shown to other players. |
| `profile.username.title` | نام کاربری | Username |
| `profile.username.copy` | کپی نام کاربری | Copy username |
| `profile.username.copied` | نام کاربری کپی شد. | Username copied. |
| `profile.username.rules` | تغییر نام کاربری هر {days, plural, one {# روز} other {# روز}} یک بار و با {cost} سکه ممکن است. | You can change your username once every {days, plural, one {# day} other {# days}} for {cost} coins. |
| `profile.username.later` | امکان تغییر نام کاربری پس از راه‌اندازی کیف پول سکه فعال می‌شود. | Username changes open when the coin wallet launches. |
| `profile.username.change` | تغییر نام کاربری | Change username |
| `profile.username.nextDate` | تغییر بعدی از {date} ممکن است. | Next change available on {date}. |
| `profile.username.sheet.title` | نام کاربری جدید | New username |
| `profile.username.sheet.sameAsCurrent` | این همان نام کاربری فعلی شماست. | That's your current username. |
| `profile.username.sheet.continue` | ادامه | Continue |
| `profile.username.confirm.title` | تغییر نام کاربری به {username} | Change username to {username} |
| `profile.username.confirm.fromTo` | از {old} به {new} | From {old} to {new} |
| `profile.username.confirm.cooldown` | تغییر بعدی از {date} ممکن خواهد بود. | Your next change will be possible on {date}. |
| `profile.username.confirm.effects` | نشانی پروفایل شما تغییر می‌کند و نام کاربری قبلی ممکن است برای بازیکنان دیگر آزاد شود. | Your profile link changes, and your old username may become available to other players. |
| `profile.username.confirm.cta` | پرداخت {cost} سکه و تغییر نام | Pay {cost} coins and change |
| `profile.username.confirm.notCharged` | این نام کاربری همین حالا گرفته شد. هزینه‌ای کسر نشد؛ نام دیگری انتخاب کنید. | This username was just taken. Nothing was charged; choose another one. |
| `profile.username.done` | نام کاربری شما به {username} تغییر کرد. | Your username is now {username}. |
| `coins.insufficient.title` | سکه کافی نیست | Not enough coins |
| `coins.shortfall` | کسری | Shortfall |
| `coins.getCoins` | دریافت سکه | Get coins |
| `settings.title` | تنظیمات | Settings |
| `settings.language.title` | زبان | Language |
| `settings.language.offline` | برای تغییر زبان به اینترنت وصل شوید. | Connect to the internet to change the language. |
| `settings.game.title` | بازی | Game |
| `settings.lite.label` | گرافیک سبک | Lite graphics |
| `settings.lite.desc` | تاس‌ها بدون پرتاب فیزیکی ظاهر می‌شوند و سایه‌ها ساده‌تر است. مناسب گوشی‌های قدیمی‌تر و مصرف کمتر باتری. | Dice appear without the physics throw, and shadows are simpler. Good for older phones and saving battery. |
| `settings.reduced.label` | کاهش حرکت و انیمیشن | Reduced animations |
| `settings.reduced.desc` | حرکت مهره‌ها و جابه‌جایی صفحه‌ها کوتاه‌تر و آرام‌تر می‌شود. | Shortens checker and screen animations. |
| `settings.reduced.osOn` | تنظیم «کاهش حرکت» دستگاه شما روشن است؛ انیمیشن‌ها همیشه کاهش می‌یابند. | Your device's reduce-motion setting is on, so animations are always reduced. |
| `settings.sound.label` | صدا | Sound |
| `settings.sound.desc` | صدای تاس، مهره و اعلان نوبت شما | Dice, checker, and your-turn sounds |
| `settings.vibration.label` | لرزش | Vibration |
| `settings.vibration.desc` | لرزش در نوبت شما و هشدار زمان | Vibrate on your turn and for timer warnings |
| `settings.vibration.unsupported` | این دستگاه یا مرورگر از لرزش پشتیبانی نمی‌کند. | This device or browser doesn't support vibration. |
| `settings.savedLocally` | روی این دستگاه ذخیره شد و پس از اتصال همگام می‌شود. | Saved on this device. We'll sync it when you're back online. |
| `settings.saveFailed` | این تنظیم ذخیره نشد. | Couldn't save this setting. |
| `settings.account.title` | حساب | Account |
| `settings.account.phone` | شماره موبایل | Mobile number |
| `settings.account.changePassword` | تغییر رمز عبور | Change password |
| `sessions.title` | دستگاه‌های واردشده | Signed-in devices |
| `sessions.intro` | دستگاه‌هایی که با حساب شما وارد شده‌اند | Devices where you're signed in to your account |
| `sessions.thisDevice` | این دستگاه | This device |
| `sessions.lastActive` | آخرین فعالیت: {time} | Last active: {time} |
| `sessions.signedIn` | ورود: {date} | Signed in: {date} |
| `sessions.unknownDevice` | دستگاه ناشناخته | Unknown device |
| `sessions.signOutOthers` | خروج از دستگاه‌های دیگر | Sign out other devices |
| `sessions.noOthers` | دستگاه دیگری با حساب شما وارد نشده است. | No other devices are signed in. |
| `sessions.safety` | دستگاهی را نمی‌شناسید؟ از دستگاه‌های دیگر خارج شوید و رمز عبور را تغییر دهید. | Don't recognize a device? Sign out other devices, then change your password. |
| `sessions.dialog.title` | از همه‌ی دستگاه‌های دیگر خارج می‌شوید؟ | Sign out of all other devices? |
| `sessions.dialog.body` | در این دستگاه وارد می‌مانید. هر کسی که در جای دیگری از حساب شما استفاده می‌کند، برای ورود دوباره به رمز عبور نیاز دارد. | You'll stay signed in on this device. Anyone using your account elsewhere will need your password to sign in again. |
| `sessions.dialog.confirm` | خروج از دستگاه‌های دیگر | Sign out other devices |
| `sessions.done` | {count, plural, one {از # دستگاه دیگر خارج شدید.} other {از # دستگاه دیگر خارج شدید.}} | {count, plural, one {Signed out of # other device.} other {Signed out of # other devices.}} |
| `sessions.loadError` | فهرست دستگاه‌ها بارگذاری نشد. | Couldn't load your devices. |
| `common.lastUpdated` | آخرین به‌روزرسانی: {time} | Last updated: {time} |
| `publicProfile.self` | بازیکنان دیگر پروفایل شما را این‌طور می‌بینند. | This is how other players see you. |
| `publicProfile.memberSince` | عضو از {date} | Member since {date} |
| `publicProfile.stats.matches` | مسابقه‌ها | Matches |
| `publicProfile.stats.wins` | بردها | Wins |
| `publicProfile.stats.winRate` | درصد برد | Win rate |
| `publicProfile.sendCoins` | ارسال سکه | Send coins |
| `publicProfile.notFound` | بازیکنی با این نام کاربری وجود ندارد. | No player with this username. |
| `publicProfile.loadError` | پروفایل بارگذاری نشد. | Couldn't load this profile. |

Shared keys used: `common.back`, `common.cancel`, `common.retry`, `coins.cost`, `coins.tomanEquivalent`, `coins.balance`, `coins.balanceAfter`, `net.offline`, `net.offlineAction`, `account.suspended.*` (auth.md), `auth.logout.*` (auth.md), `auth.lang.*` (auth.md), `errors.username.*` (auth.md).

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| AC-01 | Suspension banner (if any) → app bar (title, balance chip from step 3) → profile card link → Edit profile → rows in visual order → Log out → nav |
| AC-02 | Back → heading → avatar radio group (one tab stop; arrows move; Space selects) → Save avatar (when present) → username copy → Change username / status text → masked phone |
| AC-03 | Step heading (focused on open) → field → Continue → Cancel. Step 2: heading → cost block (read as a list) → primary → Cancel → "?" link. Close returns focus to "Change username". |
| ST-01 | Back → heading → language radios → Lite → Reduced → Sound → Vibration → Change password → Signed-in devices |
| AC-04 | Back → heading → Sign out other devices → safety link → session list items (each a single focusable summary, not interactive) |
| AC-06 | Title → Cancel (initial) → confirm; focus trapped; Esc = Cancel; on close, focus returns to the trigger |
| AC-05 | Back → heading (username) → level/ELO → stats → actions |

**Labels**

- Balance chip (step 3): "Balance: {n} coins, open wallet".
- Copy username: `profile.username.copy`.
- Each avatar option: name plus "selected" state (`aria-checked`).
- Each switch: its label plus description via `aria-describedby`.
- "This device": chip text is read with the row.
- The chevron icon is decorative.

**Other rules**

- **Not color alone:**
  - Selected avatar: check badge plus outline.
  - "This device": chip with icon and text.
  - Disabled switches: the visible reason text.
  - Status lines: icon plus text.
- **Live regions (polite):** avatar saved, username changed, setting sync failure, sessions signed out, username copied.
- **Contrast:** 4.5:1 text, 3:1 switch tracks and outlines in both states and themes.
- **Motion:** the language switch re-renders without animation; switches use the standard short transition, removed under reduced motion.
- **Text size:** at 200%, rows grow in height; switches never overlap labels; the avatar grid drops columns, keeping 56 px targets.

---

## 9. Acceptance criteria

1. AC-01 shows only rows for shipped features, in the fixed order of §4; no row leads to a 404 or a "coming soon" page.
2. AC-02 in Mode A shows the current username, the rules line with `username.change_cost` and `username.change_cooldown_days` from the server, and the "opens when the wallet launches" line, with **no** button or disabled control.
3. AC-02 in Mode B shows "Change username"; AC-03 step 1 opens with an empty field; step 2 shows cost, balance, balance after, toman equivalent, and the Jalali next-change date before any charge. Nothing is pre-selected.
4. Entering the current username (any case) keeps Continue disabled with `profile.username.sheet.sameAsCurrent`.
5. Under cooldown, the button is replaced by `profile.username.nextDate` with the date from the server.
6. Insufficient balance opens the neutral P§9.1 sheet with "Get coins" as a text-style secondary action and no other upsell.
7. Double-tapping "Pay … and change" sends exactly one request with one `Idempotency-Key`.
8. Changing the avatar requires "Save avatar"; the avatar grid is a radio group operable by keyboard; the selected avatar is marked by a check badge and outline.
9. Switching to English on ST-01 flips direction and strings immediately without a full reload, and keeps focus on the language group. A new session on another device opens in English (`me.lang`).
10. Each game toggle takes effect immediately in the running app and persists via `PATCH me`. Offline, it applies locally and shows `settings.savedLocally`; on reconnect it syncs without a snackbar.
11. With OS reduced motion on, the "Reduced animations" switch is on, disabled, and explained. On iOS Safari, the vibration switch is disabled with `settings.vibration.unsupported`.
12. AC-04 lists the current device first with a "This device" chip. "Sign out other devices" asks for confirmation (focus on Cancel). After success, only this device remains, and a second browser is signed out on its next request.
13. With only one session, the button is replaced by `sessions.noOthers`.
14. `/profile/ALI_TBZ` renders `ali_tbz` and replaces the URL with the canonical casing. Unknown usernames and bot names show `publicProfile.notFound`.
15. No profile screen shows a phone number except the owner's own masked number on AC-02 and ST-01. The public profile API response is checked in a test to contain no phone field (§2 rule 11).
16. Suspended users: avatar, language, settings, and sessions work; username change and "Send coins" are disabled with `account.suspended.actionBlocked` and a Details link.
17. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape: no horizontal scroll, no clipped text at 200%, targets ≥ 44 × 44 px. At `md`/`lg`, the hub shows list-detail with URL updates.
18. All strings come from i18n keys, with fa and en present.

---

## 10. Open questions

1. **Capability signal for the username change.** How does the client know the wallet is live (Mode A vs B)? Proposed: `GET me` (or a public `GET config`) returns `features: {wallet: bool}` and `username_change: {cost, cooldown_days, next_allowed_at}`. The client must not infer it from missing endpoints.
2. **Username change endpoint.** Not in the step-2 API. Proposed: `POST me/username {username}` with `Idempotency-Key` (step 3), returning `USERNAME_TAKEN`, `USERNAME_INVALID`, `USERNAME_COOLDOWN` (`details.next_allowed_at`), `WALLET_INSUFFICIENT`. An availability check (auth.md open question 4) would also serve step 1 of AC-03.
3. **Old usernames.** After a change, is the old username released immediately, reserved for a period, or never reusable? Do old `/profile/<old>` links redirect? The confirmation copy depends on it; the current copy says "may become available".
4. **Preference schema and defaults.** What are the exact `prefs` field names in `me` (proposed: `graphics_lite`, `animations_reduced`, `sound`, `vibration`) and their defaults? Proposed defaults: lite off (§11.6), reduced off, sound on, vibration on.
5. **Lite graphics per device.** §11.6 stores `graphics.lite` in the profile, so turning it on for a weak phone also turns it on for a desktop browser. Proposed: keep the profile value as the default, and let the device override it locally. This needs a product decision, because it changes where the setting lives.
6. **Session fields and per-device sign-out.** What does `GET me/sessions` return (`id`, `is_current`, `created_at`, `last_seen_at`, device label or user agent)? Is a coarse location (city) available and wanted? A per-session `DELETE me/sessions/{id}` would let users remove one lost phone without signing out everywhere; is it in scope?
7. **Suspended and banned players on public profiles.** Should `/profile/<username>` of a banned player return 404, and should a suspended player look normal to others? Recommended: banned → 404; suspended → normal, no status shown.
8. **Avatar names.** `GET avatars` returns keys only. Screen readers need a name per avatar. Proposed: i18n keys `avatars.<key>` in fa and en (for example «شیر» / "Lion"), maintained with the avatar set in the admin Shop section.
9. **Public profile payload.** Which fields does `GET users/{username}` return: level, ELO, `created_at`, match count, wins, rank? The spec shows only what is returned; please confirm the list, and that it never includes `phone`, `status`, or `referrer`.
