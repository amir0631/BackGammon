# Admin panel: login, shell, and Settings (with SMS status)

Status: draft for UI build (CLAUDE.md §17 steps 1–2: the minimal admin area; the other §13 sections come in step 15).
Surface: `admin.x3d.ir` (`apps/admin`), desktop-first. fa by default, en switch. Not a player surface: no PWA, no bottom nav, no coins shown to the admin as a player.
Sources: CLAUDE.md §2 rules 7, 8, 12; §3 (admin cookies); §12.1 (TOTP, IP allowlist, roles); §13; §14; §18 (SMS provider); `sms.md` §3.3, §3.4, §4, §5; patterns.md (P§) 4, 10, 13.
API (implemented in `backend/adminapi`, all under `/api/v1/admin/`):

| Call | Notes used by this spec |
| --- | --- |
| `POST auth/login {username, password, totp}` | `401 ADMIN_INVALID_CREDENTIALS`, `429 ADMIN_LOCKED {retry_after}`, `403 ADMIN_FORBIDDEN {reason: host \| ip}`. The username is lowercased. Sets a host-only cookie; the session lasts 8 h. |
| `POST auth/logout` | `204` |
| `GET me` | `{username, role}`; `401 ADMIN_UNAUTHENTICATED` when the session has expired |
| `GET settings` | `results[] {key, group, kind, value, default, is_default, min, max, choices, description {fa, en}}`, readable by every admin role |
| `PATCH settings/{key} {value, reason}` | superadmin only; `SETTING_INVALID {key, reason: type \| min \| max \| choice \| check, …}`; `SETTING_UNKNOWN`; audited as `setting.update` |
| `DELETE settings/{key}` | Reset to default; superadmin only; audited as `setting.reset` (no reason field yet, open question 2) |
| `GET sms/status[?refresh=1]` | superadmin and finance. Returns `{provider, configured, credit_rial, low_credit, patterns {key: {code, status}}, error, checked_at}`, cached 60 s. |
| `GET audit` | superadmin; the latest 200 entries, not filterable yet (open question 4) |

Setting kinds from `settingsapp/registry.py`: `int`, `bool`, `str` (optionally with `choices`), `int_list`, `number_list`, `json`.

---

## 1. Goal and user story

- As a **superadmin**, I want to find any configurable value quickly, understand what it controls in my language, see its current value, default, and allowed range, and change it or reset it safely, with a confirmation that shows exactly what will change, so that a typo never changes the rake or breaks signups.
- As any admin, I want every change to be traceable (who, when, before, after, why).
- As a **superadmin or finance** admin, I want to see at a glance whether SMS works: the provider mode, the remaining credit in toman, and whether each SMS pattern is active or still pending approval at IPPanel.
- As a **support** or **finance** admin, I want to read settings (to answer players) without being able to change them.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| `https://admin.<domain>/` with no session | AD-01 `/login` |
| `/` with a session | `/settings` (the only section in this step; later the Dashboard) |
| Any admin route with an expired session | AD-01 with `next=<path>` |
| Request from a non-allowlisted IP | AD-09 access denied (no login form) |
| Deep link `/settings?q=<text>`, `/settings?group=<prefix>`, `/settings?key=<key>` | AD-03, filtered, or scrolled to the row with a focus highlight (icon + outline) |

| Exit | Destination |
| --- | --- |
| Log out (header menu) | `POST auth/logout` → AD-01 |
| Session expired mid-edit | AD-08 dialog → AD-01 with `next`. The unsaved edit is lost, and the dialog says so. |
| Switch to player app | None. The admin never links to `m.`; admin and player sessions are separate (§12.1). |

---

## 3. Flow

### 3.1 Admin login (AD-01)

1. The form has three fields: username, password, and a 6-digit authenticator code. A single form, so the server never reveals which factor failed.
2. "Sign in" is enabled when all three are non-empty and the code has 6 digits (Persian or Latin digits accepted, normalized). Enter submits.
3. `POST auth/login`:
   - `200` → `GET me` → `next` (same-origin admin path) or `/settings`.
   - `401 ADMIN_INVALID_CREDENTIALS` → action error "Username, password, or code is incorrect." The password and code are cleared, the username is kept, and focus moves to the password. After the first failure, a hint appears under the code field: "Codes change every 30 seconds. If codes keep failing, check that your phone's time is set automatically."
   - `429 ADMIN_LOCKED` → action error with a live countdown from `retry_after` (open question 5). "Sign in" is disabled until it ends.
   - `403 ADMIN_FORBIDDEN` with `reason: ip` or `host` → AD-09.
   - Network error → action error `errors.network` + Retry; entries kept except the code (it will have expired).
4. **No account, forgotten password, or lost authenticator:** there is no self-service. The static line "Access problems? Ask a superadmin." Accounts and TOTP enrollment are created with the `create_admin` command (open question 6).

### 3.2 Browse settings (AD-03)

1. `GET settings` → group rows by `group` in this fixed order (the order of the task and of §14):
   `game`, `table`, `referral`, `predict`, `tournament`, `bonus`, `coin`, `shop`, `transfer`, `withdraw`, `xp`, `elo`, `matchmaking`, `username`, `bot`, `live`, `replay`, `admin`, `sms`, `otp`, `auth`.
   An unknown group (a key added later) goes at the end under its raw prefix, never dropped.
2. Within a group, rows follow registry order (the API order).
3. **Search** matches the key, the fa description, and the en description, case- and digit-insensitive (Persian and Latin digits match each other). The search text and group filter sync to the URL.
4. **"Only changed" filter** shows rows where `is_default` is false. The count is shown in the filter label: "Changed from default (۴)".
5. **Group index** (side column at `lg`, dropdown below that): each group with its row count and a changed-count badge (number plus text, not color).
6. The **SMS group** starts with the AD-06 SMS status card, then its four rows.

### 3.3 Edit a setting (AD-04), superadmin only

1. "Edit" on a row → AD-04 dialog, **step 1 "Edit"**:
   - Title: the description in the current language. Subtitle: the key (monospace, LTR).
   - Current value, default, and allowed range (min/max, choices, or rule).
   - The editor for the kind (§4 AD-04), prefilled with the **current** value. Prefilling is correct here: the admin edits a value and doesn't make a purchase choice.
   - Inline validation mirrors the server: type, min/max, choices, and the known checks from §4 table B. Errors appear under the field as the admin types (after the first blur).
   - "Review change" is disabled, with a visible reason, while the value is invalid or equal to the current value: "The value hasn't changed."
2. "Review change" → **step 2 "Confirm"** (same dialog):
   - Before → after, both formatted with units (§4 table A), side by side. In RTL the arrow points left; it is a direction arrow and mirrors.
   - The default, for reference. If the new value equals the default, the note "This is the default value." (open question 3).
   - **Impact note** for the key (§4 table C), when defined.
   - **Consistency warnings** (§4 table B, non-blocking) when related settings would conflict, e.g. "Minimum transfer (۶٬۰۰۰) is higher than the daily transfer cap (۵٬۰۰۰)."
   - **Acknowledgment checkbox**, unchecked, required only for the keys marked "ack" in table C.
   - **Reason** (multiline, required, max 500 characters, counter shown). Placeholder-free label: "Reason for this change (saved in the audit log)". Required in the UI even though the API accepts it blank (open question 2).
   - Buttons: "Back to edit" and "Save change". "Save change" is disabled with a reason until the reason is filled and the acknowledgment (if any) is ticked.
3. "Save change" → `PATCH settings/{key} {value, reason}`:
   - The button shows a spinner. The dialog can't be dismissed (Esc and the scrim are ignored) while in flight. Repeat clicks are ignored.
   - `200` → close the dialog; the row updates from the response and flashes a static "Saved" label for 4 s (text, no animation under reduced motion); snackbar "Saved: {key} is now {value}." Focus returns to the row's Edit button.
   - `SETTING_INVALID` → back to step 1 with the field error mapped from `details.reason`. The reason text is kept.
   - `SETTING_UNKNOWN` → close; the screen error "This setting no longer exists. The list was refreshed."; reload the list.
   - `403 ADMIN_FORBIDDEN (role)` → close; switch the screen to read-only (the role changed); banner.
   - `401` → AD-08.
   - Network error or timeout → stay on step 2 with the action error "Couldn't save. Check your connection and try again." and a "Try again" button. The server may have applied the change, so "Try again" first re-reads the setting. If the value already equals the new value, show "Saved" instead of sending again (open question 7).
4. **Concurrent change:** if another admin changed the setting after the list loaded, the API currently overwrites silently (open question 7). Until the API supports a precondition, step 2 re-reads the setting right before showing the confirmation. If the current value differs from what the dialog opened with, step 2 shows "Changed by someone else while you were editing: now {value}" and requires going back to edit.

### 3.4 Reset to default (AD-05), superadmin only

1. "Reset" appears only on rows where `is_default` is false → AD-05 dialog: current → default, the impact note and acknowledgment (as for edit), and the reason (required in the UI; open question 2 for the API).
2. "Reset to default" → `DELETE settings/{key}` → the same success, error, and in-flight rules as §3.3.

### 3.5 Setting history (AD-07)

1. "History" on a row → side drawer (end side) listing the audit entries for that key, newest first: date and time, admin username, action (Changed / Reset), before → after, and reason.
2. It needs a filterable audit endpoint (open question 4). Until then, the drawer filters the latest 200 entries of `GET audit` client-side and states "Showing changes among the latest 200 admin actions."
3. Superadmin only (the API limits `GET audit`). Other roles don't see the History action.

### 3.6 SMS status (AD-06)

1. On opening `/settings`, for superadmin and finance, `GET sms/status` (the server caches it for 60 s).
2. "Check now" → `GET sms/status?refresh=1`. The button spinner runs, and the card keeps the last values visible while loading.
3. Card states and wording are in §4 AD-06. The OTP pattern not being `active` is the most important signal: it means players can't sign up or reset passwords.
4. When the admin edits `sms.pattern_otp` or `sms.pattern_withdrawal_paid`, step 2 of AD-04 shows the IPPanel status of the **new** code (open question 8). If the status isn't `active`, the acknowledgment checkbox is required: "I understand players won't receive these texts until this pattern is active."

### 3.7 Language switch

- In the header: «فارسی» / "English". The switch applies immediately (direction, digits, calendar) and is stored in a host-only cookie on `admin.`.
- Open dialogs keep their state across the switch.

---

## 4. Screen list

### AD-01 Admin login `/login`

- **Purpose:** authenticate with the three factors.
- **Content priority:**
  1. Product name + «پنل مدیریت» / "Admin panel"
  2. Username (`autocomplete="username"`, `dir="ltr"`, `autocapitalize="off"`)
  3. Password (`autocomplete="current-password"`, show/hide)
  4. Authenticator code (single input, `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength` 6 after normalization, `dir="ltr"`, drawn as one field with letter-spacing, not 6 boxes)
  5. Action error area
  6. "Sign in"
  7. "Access problems? Ask a superadmin."
  8. Language switch (top end)
- **Components:** centered card, max 400 px.
- **Primary action:** Sign in.

### AD-02 Admin shell

- **Header:**
  - Product name + «پنل مدیریت»
  - **Environment label**, if the backend exposes one (open question 9): text chip "Staging" or "Production", with a distinct icon (not color alone)
  - Language switch
  - Admin menu: username, role chip (`superadmin` / `finance` / `support`, localized), "Sign out"
- **Navigation (start side):** only the sections that exist. In this step: "Settings". Later sections of §13 are added in their steps; there are no placeholder links.
- **Read-only banner** (finance, support) at the top of the content: "You can view settings. Only a superadmin can change them."

### AD-03 Settings `/settings`

- **Purpose:** find, read, and change any registry setting.
- **Content priority:**
  1. Page title "Settings" and one line: "Changes take effect immediately, without a redeploy. Every change is saved in the audit log."
  2. Toolbar: search, "Only changed" filter, group selector (below `lg`)
  3. Group index (side column at `lg`)
  4. Group sections (heading = group label, table C group note if any)
  5. SMS card at the top of the SMS group
- **Row content (every row):**
  1. Description in the UI language (primary label, bold)
  2. Description in the other language (secondary line, with `lang` set)
  3. Key (monospace, LTR, copy button)
  4. Current value, formatted (table A); for lists, all items as chips; for `json`, a labelled summary ("Single ۱ · Gammon ۲ · Backgammon ۲")
  5. Default, formatted
  6. Allowed range: "۵ – ۳۰۰ ثانیه", or "at least ۱", or the choice labels, or the rule text from table B
  7. Status: "Default" or "Changed" chip (icon + text)
  8. Actions (superadmin): Edit, Reset (only if changed), History
- **Components:** data table at `lg`, card list below `md` (§6).
- **Primary action:** per row, Edit. There is no global Save; each change is its own confirmed, audited action.

**Table A: display units by key** (the registry has no `unit` field yet, open question 1)

| Keys | Unit and display | Zero means |
| --- | --- | --- |
| `game.turn_seconds`, `game.timebank_seconds`, `game.reconnect_grace_seconds`, `matchmaking.widen_seconds`, `live.spectator_delay_seconds`, `otp.ttl_seconds`, `otp.rate_limit_window_seconds`, `auth.login_lock_seconds` | Seconds, plus a humanized form when ≥ 60: «۹۰۰ ثانیه (۱۵ دقیقه)» | `live.spectator_delay_seconds`: no delay |
| `game.max_consecutive_timeouts`, `otp.max_attempts`, `otp.rate_limit_count`, `auth.login_max_failures`, `predict.min_count_for_board`, `elo.new_threshold`, `live.max_spectators_per_match` | Count («۳ بار», «۳۰ مسابقه», «۵۰۰ تماشاگر») | `live.max_spectators_per_match`: open question 10 |
| `game.allowed_lengths` | List of points, as chips «۱ امتیازی» | — |
| `game.traditional_points` | Three labelled numbers: single, gammon, backgammon | — |
| `*.rake_pct`, `*.fee_pct`, `referral.pct` | Percent `Intl` percent style («٪۱۰» fa, "10%" en) | Fee 0 → "No fee" |
| `tournament.default_prize_split` | Ordered list of percents with place labels «نفر اول ٪۵۰» and the sum | — |
| `table.tiers`, `bonus.signup_coins`, `predict.min_table_entry`, `predict.max_stake_per_user`, `predict.max_pool_total`, `transfer.min_coins`, `transfer.daily_max_coins`, `withdraw.min_coins`, `withdraw.daily_max_coins`, `username.change_cost`, `admin.topup_max_amount` | Coins, plus the toman equivalent at the current `coin.price_toman` as secondary text («۱۰۰ سکه · ۱۰۰٬۰۰۰ تومان») | `admin.topup_max_amount`: no cap. `bonus.signup_coins`: no bonus. `username.change_cost`: free. |
| `transfer.daily_max_coins`, `withdraw.daily_max_coins` | As coins, with the rule text "within any rolling 24 hours" (§7.12, §7.13) | — |
| `coin.price_toman`, `shop.custom_min_toman`, `shop.custom_max_toman` | Toman | — |
| `sms.low_credit_alert_rial` | Rial as stored, **with toman as the primary display**: «۱۰۰٬۰۰۰ تومان (۱٬۰۰۰٬۰۰۰ ریال)». The editor input is in rial, with a live toman line under it (open question 11). | 0 → no alert |
| `referral.duration_days`, `username.change_cooldown_days`, `replay.retention_days` | Days | `referral.duration_days`: unlimited. `username.change_cooldown_days`: no waiting. `replay.retention_days`: keep forever. |
| `xp.per_match`, `xp.per_win` | XP | — |
| `elo.k_new`, `elo.k`, `matchmaking.elo_window`, `matchmaking.widen_step` | Plain number (ELO points) | — |
| `referral.base` | Choice label: `referee_entry` → «ورودی بازیکنِ معرفی‌شده» / "Referred player's entry"; `pot` → «کل پات میز» / "Table pot" | — |
| `predict.enabled`, `bot.entry_enabled`, `live.spectator_reactions_enabled` | «فعال» / «غیرفعال» with an icon (On / Off) | — |
| `sms.from_number` | E.164, LTR, Latin digits | — |
| `sms.pattern_otp`, `sms.pattern_withdrawal_paid` | Code in monospace, LTR, with the IPPanel status chip from AD-06 next to it | — |

Numbers use locale digits in display (fa `۱۰٬۰۰۰`). Keys, codes, and phone numbers always use Latin digits and LTR.

### AD-04 Edit setting dialog (two steps)

**Editors by kind**

| Kind | Editor |
| --- | --- |
| `int` | Number field (accepts Persian and Latin digits; grouping shown on blur), unit suffix, min/max helper, live humanized or toman line from table A |
| `bool` | Two radio options, "On" / "Off" (not a switch, so the change is an explicit choice that still goes through review) |
| `str` with `choices` | Radio group with the localized choice labels and the raw value in small monospace |
| `str` (free) | Text field, `dir="ltr"`, with the rule from table B as helper text |
| `int_list` | Chip editor: existing items as removable chips (each "Remove {value}" labelled), a number field plus "Add". Items are kept sorted, and duplicates are rejected inline. |
| `number_list` (prize split) | Ordered rows "Place {n}" with a percent field each, "Add place", "Remove", and a live "Total: ٪۱۰۰" line that shows an error unless the total is exactly 100 |
| `json` `game.traditional_points` | Three labelled integer fields (Single, Gammon, Backgammon), each 1–10 |
| `json` (any other, future) | Monospace JSON textarea with parse validation and the error line/column; fallback only |

**Table B: validation and consistency** (hard = blocks review; soft = warning in review)

| Key or pair | Rule | Type |
| --- | --- | --- |
| Every `int` / list item | Integer; within min/max from the API | hard |
| `game.allowed_lengths` | Not empty; odd numbers only (1–25) | hard (server `check`) |
| `table.tiers` | Not empty; ascending; no duplicates | hard (server `check`) |
| `tournament.default_prize_split` | Sums to exactly 100 | hard (server `check`) |
| `game.traditional_points` | Exactly single, gammon, backgammon; each 1–10 | hard (server `check`) |
| `sms.from_number` | `+` then 6–18 digits | hard (server `check`) |
| `sms.pattern_*` | 6–40 Latin letters or digits | hard (server `check`) |
| `shop.custom_min_toman` vs `shop.custom_max_toman` | min < max | soft (open question 12) |
| `shop.custom_*_toman` vs `coin.price_toman` | Each is a whole multiple of the coin price (§7.11) | soft |
| `transfer.min_coins` vs `transfer.daily_max_coins`; `withdraw.min_coins` vs `withdraw.daily_max_coins` | min ≤ daily max | soft |
| `predict.max_stake_per_user` vs `predict.max_pool_total` | stake cap ≤ pool cap | soft |
| `predict.min_table_entry` vs `table.tiers` | At least one tier ≥ the minimum, or no match will ever have a prediction pool | soft |
| `game.traditional_points` | gammon ≥ single; backgammon ≥ gammon | soft |

**Table C: impact notes and acknowledgment**

| Keys | Impact note (step 2) | Ack required |
| --- | --- | --- |
| `table.rake_pct`, `predict.rake_pct`, `tournament.rake_pct`, `referral.pct`, `transfer.fee_pct`, `withdraw.fee_pct` | "Changes what players pay or receive. Players see the new value on their next confirmation screen." Plus an example computed from the new value (e.g. "۱۰۰-coin table: winner receives ۱۸۰ → ۱۷۰"). Whether matches already running keep the old rate is open question 13. | No |
| `coin.price_toman` | "Changes every toman amount shown to players, new purchases, and new withdrawal requests. Pending withdrawals keep the rate from their request time (§7.12)." Example: "۱۰۰ coins: ۱۰۰٬۰۰۰ → {new} toman". | **Yes** |
| `bonus.signup_coins` | "Applies to accounts created from now on." | No |
| `transfer.*`, `withdraw.*` limits | "Limits count over any rolling 24 hours." | No |
| `game.*` timers, `matchmaking.*` | "Applies to new turns and new searches." (Running matches: open question 13.) | No |
| `table.tiers` | "Removing a tier removes it from the lobby. Players already searching in it: open question 13." | No |
| `predict.enabled` = Off | "New matches won't open prediction pools." (Open pools: open question 13.) | No |
| `replay.retention_days` set above 0, or lowered | "Replays older than {n} days will be permanently deleted by the cleanup job, except those linked to an open fraud flag or payment dispute (§20.1). This can't be undone." | **Yes** |
| `sms.pattern_otp`, `sms.pattern_withdrawal_paid` | The IPPanel status of the new code (§3.6) | **Yes, when the status isn't `active`** |
| `sms.from_number` | "The sender line must be allowed for the SMS patterns at IPPanel, or texts will fail." | No |
| `otp.*`, `auth.*` | "Protects player accounts against guessing and SMS abuse." For `auth.*`, also: "These values also apply to admin sign-in." (They do in `adminapi/views.py`.) | No |
| `admin.topup_max_amount` = 0 | "Removes the per-action cap on manual top-ups." | **Yes** |

### AD-05 Reset to default dialog

- Title "Reset {description} to default?"
- Content: current → default, the impact note and ack (table C), reason, and the buttons "Cancel" (initial focus) and "Reset to default".

### AD-06 SMS status card (top of the SMS group)

- **Visible to:** superadmin and finance. Support sees the line "SMS status is visible to finance and superadmin roles."
- **Content priority:**
  1. **Overall line** (icon + text), the first matching rule wins:

     | Condition | Line |
     | --- | --- |
     | `provider` = `console` | «حالت آزمایشی: پیامک‌ها ارسال نمی‌شوند و فقط در لاگ سرور ثبت می‌شوند.» / "Test mode: texts are not sent; they're written to the server log." |
     | `configured` = false | "SMS isn't configured: the API key is missing on the server." |
     | `error` present | "Couldn't reach IPPanel." plus the mapped cause: `http_401` → "The API key is invalid." `http_422` → "IPPanel rejected the request." Otherwise → "Network or provider error." The raw `error` is shown in small monospace, for support. |
     | OTP pattern not `active` | "Players can't receive verification codes: signup and password reset won't work." |
     | `low_credit` = true | "SMS credit is low." |
     | Otherwise | "SMS is working." |

  2. **Credit:** `credit_rial` ÷ 10, shown as «۱۲۳٬۴۵۰ تومان», with the rial value as secondary text. When `low_credit`, add "Below the alert level of {threshold} toman", with a warning icon and text. "—" when unknown.
  3. **Patterns table**, one row per key in `patterns`:
     - Purpose ("Verification code (OTP)" / "Withdrawal paid notice")
     - Setting key
     - Code (monospace, LTR)
     - Status chip:
       - `active` → «فعال» / "Active" (check icon)
       - `pending` → «در انتظار تأیید IPPanel» / "Pending approval at IPPanel" (clock icon)
       - `unknown` → «نامشخص» / "Unknown"
       - Any other value → «غیرفعال» / "Not active" + the raw value
     - Consequence line for non-active rows: OTP → "Signup, password reset, and withdrawal codes won't be delivered." Withdrawal → "Players won't get an SMS when a withdrawal is paid."
  4. **Sender line:** the value of `sms.from_number`.
  5. **Checked at:** relative time plus absolute (Jalali in fa); "Check now" button.
- The API key is never displayed or editable here; it lives in the server environment (sms.md §2).
- There is no gift-credit line: the endpoint doesn't return it (sms.md §3.3 mentions `gift`; add it if wanted, open question 14).

### AD-07 History drawer

- End-side drawer, 400 px at `lg`, full-screen below `md`.
- Entries: date and time, admin, action, before → after (formatted as in table A, with raw JSON on expand), reason (or "No reason recorded").
- Empty: "No recorded changes for this setting."

### AD-08 Session expired dialog

- "Your admin session has ended. Sign in again to continue. Unsaved changes were not saved."
- Button: "Sign in" → AD-01 with `next`.

### AD-09 Access denied (IP or host)

- Full page without a form: "Access from this network isn't allowed. Connect from an approved network or contact a superadmin." For `reason: host`: "Open the admin panel at its own address."
- No retry loop; one "Try again" button reloads.

---

## 5. States

| State | AD-01 login | AD-03 settings | AD-04 / AD-05 dialogs | AD-06 SMS card | AD-07 history |
| --- | --- | --- | --- | --- | --- |
| **Loading** | "Signing in…" button spinner; fields read-only | Table skeleton (6 rows per visible group); toolbar usable | Save/Reset spinner; dialog locked | Card skeleton; on refresh, old values stay with a "Checking…" label | List skeleton |
| **Empty** | — | Search with no match: "No settings match "{q}"." + "Clear search". "Only changed" with none: "All settings use their default values." | — | No patterns returned: "No SMS patterns configured." | "No recorded changes for this setting." |
| **Error** | Invalid (generic), locked (countdown), network | Load failed: screen error + Retry (P§4.1) | §3.3 step 3 | §4 AD-06 overall line | "Couldn't load history." + Retry |
| **Offline** | Banner "You're offline"; Sign in disabled with the reason | Banner; cached list stays readable, marked "Last loaded {time}"; Edit/Reset disabled with the reason | Save disabled with the reason; the entered value and reason are kept | Last values stay, with the offline note | Disabled |
| **Reconnecting** | Not applicable (no socket). When the connection returns: reload the list; keep dialogs open. | ← | ← | ← | ← |
| **Insufficient coins** | Not applicable (admins spend no coins). | | | | |
| **Permission (role)** | — | finance/support: read-only banner, no Edit/Reset/History | Not reachable | Support: no-access line | Superadmin only |
| **Suspended / disabled admin** | An inactive admin gets the same generic invalid-credentials error. No enumeration. | Session revoked → AD-08 | ← | ← | ← |
| **IP not allowed** | AD-09 | AD-09 | AD-09 | AD-09 | AD-09 |
| **First-time admin** | Password and TOTP from the `create_admin` output; no in-app enrollment (open question 6) | No onboarding; the page intro line explains immediacy and audit | — | — | — |

---

## 6. Responsive notes

Desktop-first. Reviewed at 1440 × 900 (primary), 1280 × 800, 1024 × 768, 768 × 1024, and 390 × 844 (read and emergency edits on a phone). fa, then en.

| Width | Shell | Settings list | Dialogs |
| --- | --- | --- | --- |
| ≥ 1280 | Nav column (240 px) + content (max 1200 px) + group index column (220 px, sticky) | Table with columns: Setting (description, other language, key) · Current · Default · Allowed · Status · Actions | Centered, 560 px wide |
| 1024–1279 | Nav collapses to an icon rail with labels in tooltips | Group index becomes a dropdown in the toolbar; table columns: Setting · Current · Default/Allowed (stacked) · Status · Actions | 560 px |
| 600–1023 | Top bar with a menu button; nav in a drawer | Card per setting: description, key, current value (large), default and range (small), status chip, actions row | 90% width, max 560 px |
| < 600 | As above | Single-column cards; toolbar wraps; search full width | Full-screen dialogs with a sticky footer for the buttons |

- Landscape tablets use the 1024 layout by width. Nothing depends on orientation beyond width.
- The table never scrolls horizontally at ≥ 1024. Long list values wrap into chip rows.
- Survives 200% zoom: at 1440 px with 200% zoom, it falls back to the card layout (container queries on the content area, not the viewport).

---

## 7. RTL/LTR notes and i18n keys

- fa first (RTL). The nav is on the right in fa. Drawers open from the end side (left in fa).
- **Always LTR, Latin digits:** keys, SMS codes, phone numbers, raw JSON, raw error codes, and usernames of admins (`<bdi dir="ltr">`).
- **Formatted values:** locale digits and grouping; percent via `Intl`; dates Jalali in fa (`fa-IR-u-ca-persian`) with time «۵ مهر ۱۴۰۵، ۱۴:۳۰», Gregorian in en.
- The before → after arrow mirrors.
- Setting descriptions come from the registry (`description.fa` / `.en`), not from the i18n catalog. Everything else uses the keys below (catalog namespace `admin.*`, in `packages/i18n`).

| Key | fa | en |
| --- | --- | --- |
| `admin.title` | (existing) پنل مدیریت | Admin panel |
| `admin.lang.fa` | فارسی | فارسی |
| `admin.lang.en` | English | English |
| `admin.login.title` | ورود به پنل مدیریت | Sign in to the admin panel |
| `admin.login.username` | نام کاربری | Username |
| `admin.login.password` | رمز عبور | Password |
| `admin.login.totp` | کد ۶ رقمی برنامه‌ی احراز هویت | 6-digit authenticator code |
| `admin.login.totpHelp` | کدها هر ۳۰ ثانیه عوض می‌شوند. اگر کدها مدام رد می‌شوند، مطمئن شوید ساعت گوشی شما خودکار تنظیم شده است. | Codes change every 30 seconds. If codes keep failing, check that your phone's time is set automatically. |
| `admin.login.cta` | ورود | Sign in |
| `admin.login.signingIn` | در حال ورود… | Signing in… |
| `admin.login.help` | مشکل دسترسی دارید؟ به یک مدیر ارشد اطلاع دهید. | Access problems? Ask a superadmin. |
| `admin.login.disabled` | هر سه فیلد را کامل کنید. | Fill in all three fields. |
| `errors.admin.invalidCredentials` | نام کاربری، رمز عبور یا کد درست نیست. | Username, password, or code is incorrect. |
| `errors.admin.locked` | به دلیل چند تلاش ناموفق، ورود تا {time} دیگر ممکن نیست. | Too many failed attempts. Try again in {time}. |
| `errors.admin.unauthenticated` | نشست شما پایان یافته است. دوباره وارد شوید. | Your session has ended. Sign in again. |
| `errors.admin.forbidden` | اجازه‌ی این کار را ندارید. | You don't have permission to do this. |
| `admin.denied.ip` | دسترسی از این شبکه مجاز نیست. از یک شبکه‌ی تأییدشده وصل شوید یا با مدیر ارشد تماس بگیرید. | Access from this network isn't allowed. Connect from an approved network or contact a superadmin. |
| `admin.denied.host` | پنل مدیریت را از نشانی مخصوص خودش باز کنید. | Open the admin panel at its own address. |
| `admin.shell.nav.settings` | تنظیمات | Settings |
| `admin.shell.signOut` | خروج | Sign out |
| `admin.shell.env.staging` | محیط آزمایشی | Staging |
| `admin.shell.env.production` | محیط اصلی | Production |
| `admin.role.superadmin` | مدیر ارشد | Superadmin |
| `admin.role.finance` | مالی | Finance |
| `admin.role.support` | پشتیبانی | Support |
| `admin.sessionExpired.body` | نشست مدیریت شما پایان یافته است. برای ادامه دوباره وارد شوید. تغییرات ذخیره‌نشده ثبت نشدند. | Your admin session has ended. Sign in again to continue. Unsaved changes were not saved. |
| `admin.sessionExpired.cta` | ورود دوباره | Sign in |
| `admin.offline` | اتصال برقرار نیست. | You're offline. |
| `admin.settings.title` | تنظیمات | Settings |
| `admin.settings.intro` | تغییرات بدون نیاز به استقرار دوباره، فوراً اعمال می‌شوند. همه‌ی تغییرات در گزارش ممیزی ثبت می‌شوند. | Changes take effect immediately, without a redeploy. Every change is saved in the audit log. |
| `admin.settings.readOnly` | می‌توانید تنظیمات را ببینید. فقط مدیر ارشد می‌تواند آن‌ها را تغییر دهد. | You can view settings. Only a superadmin can change them. |
| `admin.settings.search` | جستجو در تنظیمات | Search settings |
| `admin.settings.searchHelp` | با کلید یا توضیح فارسی یا انگلیسی جستجو کنید. | Search by key or by the Persian or English description. |
| `admin.settings.onlyChanged` | فقط تغییریافته‌ها ({count}) | Changed from default ({count}) |
| `admin.settings.groupIndex` | گروه‌ها | Groups |
| `admin.settings.col.setting` | تنظیم | Setting |
| `admin.settings.col.current` | مقدار فعلی | Current value |
| `admin.settings.col.default` | پیش‌فرض | Default |
| `admin.settings.col.allowed` | محدوده‌ی مجاز | Allowed |
| `admin.settings.col.status` | وضعیت | Status |
| `admin.settings.col.actions` | عملیات | Actions |
| `admin.settings.status.default` | پیش‌فرض | Default |
| `admin.settings.status.changed` | تغییریافته | Changed |
| `admin.settings.range.between` | {min} تا {max} | {min} to {max} |
| `admin.settings.range.atLeast` | دست‌کم {min} | At least {min} |
| `admin.settings.range.atMost` | حداکثر {max} | At most {max} |
| `admin.settings.range.any` | بدون محدودیت | Any value |
| `admin.settings.copyKey` | کپی کلید {key} | Copy key {key} |
| `admin.settings.edit` | ویرایش {name} | Edit {name} |
| `admin.settings.reset` | بازگشت {name} به پیش‌فرض | Reset {name} to default |
| `admin.settings.history` | تاریخچه‌ی {name} | History of {name} |
| `admin.settings.saved` | ذخیره شد | Saved |
| `admin.settings.savedToast` | ذخیره شد: {key} اکنون {value} است. | Saved: {key} is now {value}. |
| `admin.settings.empty.search` | تنظیمی با «{q}» پیدا نشد. | No settings match "{q}". |
| `admin.settings.empty.clear` | پاک کردن جستجو | Clear search |
| `admin.settings.empty.noneChanged` | همه‌ی تنظیمات روی مقدار پیش‌فرض هستند. | All settings use their default values. |
| `admin.settings.loadError` | تنظیمات بارگذاری نشد. | Couldn't load settings. |
| `admin.settings.lastLoaded` | آخرین بارگذاری: {time} | Last loaded: {time} |
| `admin.settings.unknown` | این تنظیم دیگر وجود ندارد. فهرست به‌روز شد. | This setting no longer exists. The list was refreshed. |
| `admin.settings.group.game` | بازی | Game |
| `admin.settings.group.table` | میزها | Tables |
| `admin.settings.group.referral` | معرفی دوستان | Referrals |
| `admin.settings.group.predict` | پیش‌بینی | Predictions |
| `admin.settings.group.tournament` | تورنمنت | Tournaments |
| `admin.settings.group.bonus` | هدیه‌ها | Bonuses |
| `admin.settings.group.coin` | سکه | Coin |
| `admin.settings.group.shop` | فروشگاه | Shop |
| `admin.settings.group.transfer` | انتقال سکه | Transfers |
| `admin.settings.group.withdraw` | برداشت | Withdrawals |
| `admin.settings.group.xp` | امتیاز تجربه | XP |
| `admin.settings.group.elo` | رتبه‌بندی ELO | ELO rating |
| `admin.settings.group.matchmaking` | جفت‌سازی حریف | Matchmaking |
| `admin.settings.group.username` | نام کاربری | Usernames |
| `admin.settings.group.bot` | ربات | Bot |
| `admin.settings.group.live` | پخش زنده | Live |
| `admin.settings.group.replay` | بازپخش | Replays |
| `admin.settings.group.admin` | مدیریت | Admin |
| `admin.settings.group.sms` | پیامک | SMS |
| `admin.settings.group.otp` | کد تأیید پیامکی | SMS codes (OTP) |
| `admin.settings.group.auth` | امنیت ورود | Login security |
| `admin.settings.value.on` | فعال | On |
| `admin.settings.value.off` | غیرفعال | Off |
| `admin.settings.value.seconds` | {n} ثانیه | {n} s |
| `admin.settings.value.humanized` | ({duration}) | ({duration}) |
| `admin.settings.value.coins` | {n} سکه | {n} coins |
| `admin.settings.value.toman` | {n} تومان | {n} toman |
| `admin.settings.value.rial` | {n} ریال | {n} rial |
| `admin.settings.value.days` | {n} روز | {n} days |
| `admin.settings.value.xp` | {n} امتیاز تجربه | {n} XP |
| `admin.settings.value.points` | {n} امتیازی | {n}-point |
| `admin.settings.value.place` | نفر {n} | Place {n} |
| `admin.settings.value.total` | جمع: {total} | Total: {total} |
| `admin.settings.value.rolling24h` | در هر ۲۴ ساعت متوالی | within any rolling 24 hours |
| `admin.settings.zero.noDelay` | بدون تأخیر | No delay |
| `admin.settings.zero.unlimited` | نامحدود | Unlimited |
| `admin.settings.zero.forever` | نگهداری برای همیشه | Keep forever |
| `admin.settings.zero.noCap` | بدون سقف | No cap |
| `admin.settings.zero.noFee` | بدون کارمزد | No fee |
| `admin.settings.zero.free` | رایگان | Free |
| `admin.settings.zero.noCooldown` | بدون فاصله‌ی انتظار | No waiting period |
| `admin.settings.zero.noBonus` | بدون هدیه | No bonus |
| `admin.settings.zero.noAlert` | بدون هشدار | No alert |
| `admin.settings.traditional.single` | برد ساده | Single |
| `admin.settings.traditional.gammon` | مارس | Gammon |
| `admin.settings.traditional.backgammon` | ترک‌مارس | Backgammon |
| `admin.settings.choice.referral.base.referee_entry` | ورودی بازیکنِ معرفی‌شده | Referred player's entry |
| `admin.settings.choice.referral.base.pot` | کل پات میز | Table pot |
| `admin.edit.step1` | ویرایش | Edit |
| `admin.edit.step2` | تأیید تغییر | Confirm change |
| `admin.edit.current` | مقدار فعلی | Current value |
| `admin.edit.new` | مقدار جدید | New value |
| `admin.edit.default` | پیش‌فرض | Default |
| `admin.edit.isDefault` | این مقدار پیش‌فرض است. | This is the default value. |
| `admin.edit.review` | بررسی تغییر | Review change |
| `admin.edit.unchanged` | مقدار تغییری نکرده است. | The value hasn't changed. |
| `admin.edit.invalid` | مقدار را اصلاح کنید. | Fix the value first. |
| `admin.edit.error.type` | نوع مقدار درست نیست. | This value has the wrong type. |
| `admin.edit.error.min` | مقدار باید دست‌کم {min} باشد. | The value must be at least {min}. |
| `admin.edit.error.max` | مقدار باید حداکثر {max} باشد. | The value must be at most {max}. |
| `admin.edit.error.choice` | یکی از گزینه‌های مجاز را انتخاب کنید. | Choose one of the allowed options. |
| `admin.edit.error.check` | مقدار با قاعده‌ی این تنظیم سازگار نیست: {rule} | The value doesn't meet this setting's rule: {rule} |
| `admin.edit.rule.oddLengths` | فقط اعداد فرد، و دست‌کم یک مقدار | Odd numbers only, at least one |
| `admin.edit.rule.ascendingUnique` | صعودی و بدون تکرار، و دست‌کم یک مقدار | Ascending with no duplicates, at least one |
| `admin.edit.rule.sum100` | جمع باید دقیقاً ٪۱۰۰ باشد | Must add up to exactly 100% |
| `admin.edit.rule.points` | هر سه مقدار بین ۱ و ۱۰ | All three values between 1 and 10 |
| `admin.edit.rule.e164` | با + شروع شود و ۶ تا ۱۸ رقم داشته باشد، مثل +983000505 | Starts with + and has 6–18 digits, e.g. +983000505 |
| `admin.edit.rule.patternCode` | ۶ تا ۴۰ حرف یا رقم لاتین | 6–40 Latin letters or digits |
| `admin.edit.list.add` | افزودن | Add |
| `admin.edit.list.remove` | حذف {value} | Remove {value} |
| `admin.edit.list.duplicate` | این مقدار در فهرست هست. | This value is already in the list. |
| `admin.edit.split.addPlace` | افزودن رتبه | Add place |
| `admin.edit.json.parseError` | JSON معتبر نیست (خط {line}، ستون {column}). | Invalid JSON (line {line}, column {column}). |
| `admin.edit.reason` | دلیل این تغییر (در گزارش ممیزی ثبت می‌شود) | Reason for this change (saved in the audit log) |
| `admin.edit.reasonRequired` | دلیل تغییر را بنویسید. | Enter a reason. |
| `admin.edit.reasonCounter` | {count} از ۵۰۰ نویسه | {count} of 500 characters |
| `admin.edit.ackRequired` | برای ادامه، تأیید بالا را علامت بزنید. | Tick the confirmation above to continue. |
| `admin.edit.back` | بازگشت به ویرایش | Back to edit |
| `admin.edit.save` | ذخیره‌ی تغییر | Save change |
| `admin.edit.saving` | در حال ذخیره… | Saving… |
| `admin.edit.saveFailed` | ذخیره نشد. اتصال را بررسی کنید و دوباره تلاش کنید. | Couldn't save. Check your connection and try again. |
| `admin.edit.tryAgain` | تلاش دوباره | Try again |
| `admin.edit.conflict` | در این فاصله، مدیر دیگری این تنظیم را تغییر داد: اکنون {value} است. | Changed by someone else while you were editing: now {value}. |
| `admin.edit.warning.title` | هشدار سازگاری | Consistency warning |
| `admin.edit.warning.minAboveMax` | {minName} ({min}) از {maxName} ({max}) بیشتر است. | {minName} ({min}) is higher than {maxName} ({max}). |
| `admin.edit.warning.notMultiple` | {name} ({value}) مضرب قیمت هر سکه ({price}) نیست. | {name} ({value}) isn't a multiple of the coin price ({price}). |
| `admin.edit.warning.noEligibleTier` | هیچ سطح میزی به حداقل ورودی پیش‌بینی ({min}) نمی‌رسد؛ هیچ مسابقه‌ای استخر پیش‌بینی نخواهد داشت. | No table tier reaches the prediction minimum ({min}); no match will have a prediction pool. |
| `admin.edit.warning.pointsOrder` | امتیاز مارس کمتر از برد ساده، یا ترک‌مارس کمتر از مارس است. | Gammon is lower than single, or backgammon is lower than gammon. |
| `admin.impact.money` | پرداختی یا دریافتی بازیکنان را تغییر می‌دهد. بازیکنان مقدار جدید را در صفحه‌ی تأیید بعدی می‌بینند. | Changes what players pay or receive. Players see the new value on their next confirmation screen. |
| `admin.impact.rakeExample` | میز {entry} سکه‌ای: دریافتی برنده {before} ← {after} | {entry}-coin table: winner receives {before} → {after} |
| `admin.impact.coinPrice` | همه‌ی مبالغ تومانی نمایش‌داده‌شده، خریدهای جدید و درخواست‌های برداشت جدید را تغییر می‌دهد. برداشت‌های در انتظار با نرخ زمان درخواست پرداخت می‌شوند. | Changes every toman amount shown to players, new purchases, and new withdrawal requests. Pending withdrawals keep the rate from their request time. |
| `admin.impact.coinPriceExample` | ۱۰۰ سکه: {before} ← {after} تومان | 100 coins: {before} → {after} toman |
| `admin.impact.signupBonus` | برای حساب‌هایی که از این پس ساخته می‌شوند اعمال می‌شود. | Applies to accounts created from now on. |
| `admin.impact.rolling` | سقف‌ها در هر ۲۴ ساعت متوالی حساب می‌شوند. | Limits count over any rolling 24 hours. |
| `admin.impact.gameTimers` | برای نوبت‌ها و جستجوهای جدید اعمال می‌شود. | Applies to new turns and new searches. |
| `admin.impact.tiers` | حذف یک سطح، آن را از لابی حذف می‌کند. | Removing a tier removes it from the lobby. |
| `admin.impact.predictOff` | مسابقه‌های جدید استخر پیش‌بینی نخواهند داشت. | New matches won't open prediction pools. |
| `admin.impact.retention` | بازپخش‌های قدیمی‌تر از {days} روز برای همیشه حذف می‌شوند، به‌جز موارد مرتبط با پرونده‌ی تقلب باز یا اختلاف پرداخت. این کار برگشت‌پذیر نیست. | Replays older than {days} days will be permanently deleted, except those linked to an open fraud flag or payment dispute. This can't be undone. |
| `admin.impact.retentionAck` | می‌دانم بازپخش‌های قدیمی برای همیشه حذف می‌شوند. | I understand old replays will be permanently deleted. |
| `admin.impact.coinPriceAck` | می‌دانم این تغییر همه‌ی قیمت‌های تومانی را عوض می‌کند. | I understand this changes every toman price. |
| `admin.impact.topupNoCapAck` | می‌دانم شارژ دستی کیف پول دیگر سقف ندارد. | I understand manual top-ups will have no cap. |
| `admin.impact.patternAck` | می‌دانم تا فعال شدن این الگو، بازیکنان این پیامک‌ها را دریافت نمی‌کنند. | I understand players won't receive these texts until this pattern is active. |
| `admin.impact.fromNumber` | خط فرستنده باید در IPPanel برای الگوهای پیامک مجاز باشد، وگرنه ارسال ناموفق می‌شود. | The sender line must be allowed for the SMS patterns at IPPanel, or texts will fail. |
| `admin.impact.security` | از حساب بازیکنان در برابر حدس رمز و سوءاستفاده از پیامک محافظت می‌کند. | Protects player accounts against guessing and SMS abuse. |
| `admin.impact.alsoAdmin` | این مقادیر برای ورود مدیران هم اعمال می‌شود. | These values also apply to admin sign-in. |
| `admin.impact.topupNoCap` | سقف هر بار شارژ دستی کیف پول برداشته می‌شود. | Removes the per-action cap on manual top-ups. |
| `admin.reset.title` | «{name}» به مقدار پیش‌فرض برگردد؟ | Reset "{name}" to default? |
| `admin.reset.cta` | بازگشت به پیش‌فرض | Reset to default |
| `admin.history.title` | تاریخچه‌ی تغییرات | Change history |
| `admin.history.updated` | تغییر داد | Changed |
| `admin.history.reset` | به پیش‌فرض برگرداند | Reset to default |
| `admin.history.noReason` | دلیلی ثبت نشده است | No reason recorded |
| `admin.history.empty` | تغییری برای این تنظیم ثبت نشده است. | No recorded changes for this setting. |
| `admin.history.partial` | نمایش تغییرات در میان ۲۰۰ اقدام اخیر مدیران. | Showing changes among the latest 200 admin actions. |
| `admin.history.loadError` | تاریخچه بارگذاری نشد. | Couldn't load history. |
| `admin.sms.title` | وضعیت پیامک | SMS status |
| `admin.sms.noAccess` | وضعیت پیامک فقط برای نقش‌های مالی و مدیر ارشد قابل مشاهده است. | SMS status is visible to finance and superadmin roles. |
| `admin.sms.testMode` | حالت آزمایشی: پیامک‌ها ارسال نمی‌شوند و فقط در لاگ سرور ثبت می‌شوند. | Test mode: texts are not sent; they're written to the server log. |
| `admin.sms.notConfigured` | پیامک پیکربندی نشده است: کلید API روی سرور تنظیم نشده. | SMS isn't configured: the API key is missing on the server. |
| `admin.sms.unreachable` | ارتباط با IPPanel برقرار نشد. | Couldn't reach IPPanel. |
| `admin.sms.cause.401` | کلید API نامعتبر است. | The API key is invalid. |
| `admin.sms.cause.422` | IPPanel درخواست را نپذیرفت. | IPPanel rejected the request. |
| `admin.sms.cause.other` | خطای شبکه یا سرویس‌دهنده. | Network or provider error. |
| `admin.sms.otpDown` | بازیکنان کد تأیید دریافت نمی‌کنند: ثبت‌نام و بازیابی رمز کار نمی‌کند. | Players can't receive verification codes: signup and password reset won't work. |
| `admin.sms.lowCredit` | اعتبار پیامک کم است. | SMS credit is low. |
| `admin.sms.ok` | پیامک کار می‌کند. | SMS is working. |
| `admin.sms.credit` | اعتبار | Credit |
| `admin.sms.creditRial` | ({rial} ریال) | ({rial} rial) |
| `admin.sms.belowThreshold` | کمتر از حد هشدار {threshold} تومان | Below the alert level of {threshold} toman |
| `admin.sms.patterns` | الگوهای پیامک | SMS patterns |
| `admin.sms.pattern.otp` | کد تأیید (OTP) | Verification code (OTP) |
| `admin.sms.pattern.withdrawalPaid` | اطلاع واریز برداشت | Withdrawal paid notice |
| `admin.sms.status.active` | فعال | Active |
| `admin.sms.status.pending` | در انتظار تأیید IPPanel | Pending approval at IPPanel |
| `admin.sms.status.unknown` | نامشخص | Unknown |
| `admin.sms.status.other` | غیرفعال ({raw}) | Not active ({raw}) |
| `admin.sms.consequence.otp` | کدهای ثبت‌نام، بازیابی رمز و برداشت ارسال نمی‌شوند. | Signup, password reset, and withdrawal codes won't be delivered. |
| `admin.sms.consequence.withdrawalPaid` | بازیکنان هنگام پرداخت برداشت پیامک دریافت نمی‌کنند. | Players won't get an SMS when a withdrawal is paid. |
| `admin.sms.sender` | خط فرستنده | Sender line |
| `admin.sms.checkedAt` | آخرین بررسی: {time} | Last checked: {time} |
| `admin.sms.checkNow` | بررسی دوباره | Check now |
| `admin.sms.checking` | در حال بررسی… | Checking… |
| `admin.sms.noPatterns` | الگوی پیامکی تنظیم نشده است. | No SMS patterns configured. |
| `admin.sms.newCodeStatus` | وضعیت این کد در IPPanel: {status} | This code's status at IPPanel: {status} |

Shared keys used: `common.cancel`, `common.retry`, `errors.network`, `errors.generic`, `errors.settings.invalid`, `errors.settings.unknown` (existing).

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| AD-01 | Language switch → heading → username (focused on load) → password → show/hide → code → Sign in → help text |
| AD-02/03 | Skip link ("Skip to settings") → header (env label, language, admin menu) → nav → read-only banner → heading → search → "Only changed" → group index/selector → SMS card (when the SMS group is in view) → table rows (per row: key copy → Edit → Reset → History) |
| AD-04 | Step heading (focused on open) → current/default text → editor → Review change. Step 2: heading → before/after → warnings → ack checkbox → reason → Back to edit → Save change. Focus trapped. Esc = close only when not in flight. Closing returns focus to the row's Edit button. |
| AD-05 | Heading → content → ack → reason → Cancel (initial focus) → Reset to default |
| AD-06 | Card heading → overall line → credit → patterns table → Check now |
| AD-07 | Drawer heading (focused) → entries → Close; focus trapped while open |

**Other rules**

- **Table semantics:** a real `<table>`, with `<th scope="col">` and the Setting cell as `<th scope="row">`. Each action button's accessible name includes the setting ("Edit Turn time (s)"). Cards below `md` use a list with headings.
- **Status chips:** "Changed" / "Default" and the SMS statuses use icon plus text; color is secondary.
- **Live regions:**
  - Polite: save success, reset success, copy key, SMS check finished, list filtered ("{n} settings shown").
  - Assertive: only the step-2 save failure.
- **Keyboard:**
  - Everything works without a mouse.
  - Enter in step 1 fields triggers "Review change".
  - Enter never triggers "Save change" from the reason field (a textarea). The admin must activate the button.
- **Contrast:** 4.5:1 for text (including secondary descriptions and monospace keys); 3:1 for chip outlines and focus rings.
- **Motion:** no animation beyond ≤ 150 ms fades; none under `prefers-reduced-motion`.
- **Zoom:** 200% zoom works without horizontal scroll (the card layout via container queries).

---

## 9. Acceptance criteria

1. The login form has exactly three fields; a wrong factor of any kind shows the same `errors.admin.invalidCredentials` and clears the password and code.
2. `ADMIN_LOCKED` shows a live countdown and disables Sign in until it ends.
3. A request from a non-allowlisted IP shows AD-09 and no login form.
4. After sign-in, `/settings` lists **every** key returned by `GET settings` (the test compares counts), grouped in the fixed group order, with unknown prefixes at the end.
5. Each row shows the fa and en descriptions (the UI language first), the key (LTR, copyable), the formatted current value, the default, the allowed range, and a text status chip.
6. Search for `rake`, «کارمزد», or `۱۰` (Persian digits) finds the matching rows; the search text is in the URL; "Only changed" shows only `is_default: false` rows, with the count.
7. finance and support see no Edit, Reset, or History controls and see the read-only banner; the SMS card is visible to finance and hidden (with the no-access line) for support.
8. Editing requires two steps. "Review change" is disabled while the value is invalid or unchanged. "Save change" is disabled until the reason is filled and any required acknowledgment is ticked. No checkbox starts ticked.
9. Out-of-range, wrong-type, and rule-breaking values (even lengths, unsorted tiers, a prize split not totalling 100, a traditional-points object with a missing key) are blocked client-side with the table B message, and the server's `SETTING_INVALID` reasons map to the same messages.
10. Step 2 shows before → after formatted with units, the impact note from table C, and consistency warnings from table B.
11. A successful save sends exactly one `PATCH` with `value` and `reason`, updates the row from the response, shows the snackbar, and returns focus to the row's Edit button. The audit log contains an entry with before, after, reason, and admin.
12. "Reset" appears only on changed rows; it shows current → default and requires a reason; success turns the chip to "Default".
13. Setting `replay.retention_days` from 0 to 30, `coin.price_toman` to anything, `admin.topup_max_amount` to 0, or an SMS pattern to a code that isn't `active` requires the acknowledgment checkbox.
14. The SMS card shows the credit in toman (`credit_rial` ÷ 10, locale digits) with rial as secondary text; each pattern shows its code and a text status ("Active", "Pending approval at IPPanel", "Unknown", or "Not active (raw)"); a non-active OTP pattern shows `admin.sms.otpDown` as the overall line; console mode shows `admin.sms.testMode`. The API key is never displayed.
15. "Check now" calls `GET sms/status?refresh=1` and keeps the old values visible while loading.
16. A `401` during any action shows AD-08 and then returns to the same page after sign-in (`next`).
17. The language switch flips direction, digits, and calendar immediately, without losing an open dialog's state.
18. Layouts pass at 1440 × 900, 1280 × 800, 1024 × 768, 768 × 1024, and 390 × 844 in fa and en: no horizontal scroll at ≥ 1024 px, cards below 1024 px, full-screen dialogs below 600 px, and 200% zoom without clipping.
19. No UI string is hardcoded; all `admin.*` keys exist in fa and en.

---

## 10. Open questions

1. **Units in the registry.** Table A maps units by key. Adding `unit` (`seconds`, `coins`, `toman`, `rial`, `percent`, `days`, `count`, `xp`, `elo`) and `zero_label` to `SettingDef`, and returning them from `GET settings`, would keep the UI correct when keys are added.
2. **Reason on writes.** Rule 12 and this spec make the reason mandatory. The API currently has `reason` optional on `PATCH` and absent on `DELETE`. Please make it required on both (`DELETE` with a body, or `POST settings/{key}/reset {reason}`).
3. **Saving a value equal to the default.** `is_default` is computed as `value == default`. So an explicit override equal to today's default shows as "Default", but it won't follow a future change of the registry default. Should saving a value equal to the default perform a reset instead? Recommended: yes, and step 2 says so.
4. **Per-setting history.** `GET audit` returns the latest 200 entries unfiltered. Please add `?target_type=setting&target_id=<key>` and cursor pagination for AD-07.
5. **Lock countdown.** `ADMIN_LOCKED` returns `retry_after` = the full lock length even for later attempts during the lock, so the countdown restarts from 15:00. Please return the remaining seconds (cache TTL). Also, admin login uses the player settings `auth.login_max_failures` / `auth.login_lock_seconds`. Is sharing intended, or should admins have their own keys?
6. **Admin onboarding and password change.** `create_admin` prints a one-time password ("change it later") and the TOTP URI, but there is no endpoint to change an admin password or re-enroll TOTP. Is a "My account" screen (change password, re-enroll authenticator) in scope for step 2 or for step 15 (Access)?
7. **Idempotency and concurrency for setting writes.** A retried `PATCH` after a timeout is harmless (same value), but the audit gets two entries. There is also no protection against two admins overwriting each other. Proposal: accept an `expected` (current value or `updated_at`) and return `409 SETTING_CONFLICT` with the current value; add `updated_at` and `updated_by` to `GET settings` so rows can show "Last changed by … on …".
8. **Pattern status for a new code.** To warn before saving `sms.pattern_*`, the UI needs the IPPanel status of an arbitrary code. Proposal: `GET sms/patterns/{code}` (superadmin), returning `{status}`.
9. **Environment label.** Can `GET me` (admin) return `environment: "staging" | "production"`? It helps prevent editing production by mistake.
10. **`live.max_spectators_per_match` = 0.** The registry allows 0. Does it mean "spectating disabled" or "no cap"? The UI needs the label.
11. **`sms.low_credit_alert_rial` unit.** The UI shows toman everywhere else (§11.3). Renaming the setting to `sms.low_credit_alert_toman` would avoid mixing units for admins. If it stays in rial, the editor keeps rial input with a toman helper.
12. **Cross-setting validation.** Table B soft rules (custom min < max, min ≤ daily cap, custom amounts as coin-price multiples, stake cap ≤ pool cap, at least one tier eligible for predictions) are not enforced by the registry. Should some become hard server-side checks? Recommended: min/max pairs and the coin-price multiple.
13. **When changes apply.** Do running matches, open prediction pools, queued players, and started tournaments keep the values from their start (snapshot), or pick up new timers, rake, tiers, and `predict.enabled` immediately? The impact notes currently say only "new turns / next confirmation screen".
14. **Gift credit.** sms.md §3.3 mentions `data.gift`; the status endpoint doesn't return it. Should the card show gift credit separately?
