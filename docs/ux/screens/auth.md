# Auth: welcome, signup, login, password reset, logout

Status: draft for UI build (CLAUDE.md §17 step 2).
Surface: `m.` (Phase 1). Routes must be identical on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1, §2 rules 8 and 11, §3 (auth cookies), §10.1, §11.3, §11.7, §12.1, §15 (`user.age_confirmed_at`), §18 (18+ checkbox, SMS off switch); `sms.md` §1 (off switch); ia.md §1, §2, §3.5, §4; patterns.md (P§) 4, 6.3, 9.3, 10, 12, 13, 15, 17, 18; journeys.md J1, J2.
Screen IDs follow screen-inventory.md §2.1.

**Amendment 2026-09-28: SMS off switch.** While the `sms.enabled` setting is off, signup has no code step and password reset is unavailable. The behavior is specified in §3.5 (SMS off mode). The steps it changes are marked "SMS off: see §3.5" in §3–§5, and its keys, criteria, and questions are in §7, §9 (28–38), and §10 (14–18).

---

## 1. Goal and user story

- As a new player (P4 Ali on a 360 px Android, P2 Maryam on an iPhone), I want to create an account with my mobile number in under two minutes, confirm that I am 18 or older, and land in the app signed in.
- As a returning player (P1 Reza), I want to log in with my number and password in one screen, and recover my password by SMS if I forget it.
- As any player, I want to log out of this device, knowing what that does.

Success: a first-time user reaches a signed-in screen in one session without re-typing anything after a network drop, and never sees raw English or raw error codes in fa.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Guest opens `/` or any link (including `?ref=<username>`) | AU-01 Welcome |
| Guest opens any signed-in route | `/login?next=<path>` (ia.md §2) |
| "Create account" on AU-01 or AU-06 | AU-02 |
| "Log in" on AU-01, AU-02, or from the "number already registered" error | AU-06 |
| "Forgot password?" on AU-06, or the locked state on AU-06 | AU-07 |
| "Change password" in `/settings` (profile.md) | AU-07 with the phone prefilled (see open question 6) |
| Session expired dialog (SY-08, `system.md`) | AU-06 with `next` |
| "Log out" in the Account hub (profile.md AC-01) | AU-12 dialog |

| Exit | Destination |
| --- | --- |
| Signup complete (after AU-05) | `next` if present and same-origin, else `/play` |
| Login success, account `active` | `next` if present and same-origin, else `/play` |
| Login success, account `suspended` | AU-13 `/account/status` once per sign-in; its "Continue" goes to `next` or `/play`. A suspension banner then stays on every screen (§4 AU-13). |
| Login attempt, account `banned` | Stays on AU-06 with the banned panel (§4 AU-14). Banned users cannot sign in (§12.1). |
| Login success, a match in progress (step 5+) | `/match/[id]` (ia.md §4) |
| Password reset success | Signed in: `next` or `/play`, with a snackbar |
| Logout | `/` (AU-01) |
| Signed-in user opens a guest-only route (`/login`, `/signup*`, `/password/reset*`) | Redirect to `/play` (no flash of the auth form) |

Until the lobby exists (step 7–8), `/play` is a placeholder shell owned by the main agent. Auth screens do not change when it is replaced.

---

## 3. Flow

### 3.1 Signup (AU-01 → AU-02 → AU-03 → AU-04 → AU-05)

1. **AU-01 Welcome.** If the URL has `ref`, store it locally (localStorage, key `bg.ref`, with the capture time). The value is a referrer **username** (the API takes `referrer: username`). User taps "Create account".
2. **AU-02 Phone, 18+, terms.** User enters the mobile number and ticks both checkboxes (both start unticked). "Get code" stays disabled, with a visible reason, until the number is valid and both boxes are ticked.
3. On "Get code" (labelled "Continue" when the SMS mode isn't known, §3.5.1): normalize the phone (§6.2), then `POST auth/otp {phone, purpose: "register"}`.
   - `202 {sms: true, expires_in, resend_after}` → go to AU-03. Start the validity countdown from `expires_in` and the resend wait from `resend_after`.
   - `200 {sms: false, verification_token}` → SMS off: skip AU-03 and go straight to AU-04 with the token. See §3.5.2.
   - `409 AUTH_PHONE_TAKEN` → field error on the phone: "This number is already registered", with the action "Log in with this number". The action opens AU-06 with the phone prefilled from in-memory state, **not** from the URL.
   - `429 AUTH_OTP_RATE_LIMITED` → action error with a live countdown from `details.retry_after`. "Get code" stays disabled until it reaches 0. If a code was sent earlier in this tab and its validity hasn't run out, also show the link "I already have a code", which opens AU-03.
   - `503 SMS_UNAVAILABLE`: the current API doesn't return this for signup, since SMS off returns a token instead. If it does appear, show the action error `errors.auth.smsUnavailable` with retry enabled.
   - Invalid phone from the server (`400`) → the same field error as client validation.
   - Offline → "Get code" is disabled with the reason `net.offlineAction`.
4. **AU-03 SMS code.** The code field is focused. The code auto-submits on the 5th digit via `POST auth/otp/verify {phone, purpose: "register", code}`.
   - Success → keep `verification_token` in memory and in this tab's sessionStorage (valid 10 min), then go to AU-04.
   - `AUTH_OTP_INVALID` with `attempts_left > 0` → field error with the tries left. The field is cleared and refocused.
   - `AUTH_OTP_INVALID` with `attempts_left = 0` → the code is dead. The field is disabled, with the message "No tries left for this code", and "Get a new code" is the only action.
   - `AUTH_OTP_EXPIRED`, or the countdown reaches 0 → the field is disabled with the message "This code has expired", and "Get a new code" is the only action.
   - "Resend code" is enabled when the resend wait ends (open question 1). It calls `POST auth/otp` again and handles `429` as in step 3. On success: new countdown, field cleared, polite announcement "A new code was sent".
   - "Change number" → AU-02 with the phone and both checkboxes kept, focus on the phone field. No SMS is sent until "Get code".
   - "Didn't get the code?" (expandable, shown from the start) → tips (§4, AU-03).
5. **AU-04 Account details.** Username (empty), password (empty), and referrer (prefilled from `bg.ref` if present, editable and clearable). "Create account" calls `POST auth/register {verification_token, username, password, age_confirmed: true, referrer?}`. `referrer` is omitted when the field is empty.
   - Success → cookies are set and `me` is returned. Clear `bg.ref`, the token, and the signup sessionStorage. If the current UI locale differs from `me.lang`, `PATCH me {lang}` (open question 3). Go to AU-05.
   - `USERNAME_TAKEN` → field error on the username.
   - `USERNAME_INVALID` → field error on the username. Pick the message by `details.reason` if provided (open question 4); otherwise use the generic invalid message.
   - `PASSWORD_WEAK` → field error on the password. The requirement checklist stays visible.
   - `REFERRER_NOT_FOUND` → field error on the referrer: "No player with this username. Fix it or clear it", with a "Clear" button. Signup is never blocked by the referrer: clearing the field and submitting again works.
   - Verification token expired or invalid (error code TBD, open question 5) → action error "Your number verification has expired", with the button "Send a new code". It calls `POST auth/otp` and opens AU-03. After verifying, return to AU-04 with the username and referrer kept and the password cleared.
   - `AUTH_PHONE_TAKEN` (race: the number was registered in another tab or device) → action error with "Log in".
   - `AGE_NOT_CONFIRMED` (should not happen) → go to AU-02, with the 18+ checkbox showing its field error.
   - When the server returns more than one problem, the first field in focus order gets focus.
6. **AU-05 Avatar.** Show the preset avatars from `GET avatars`. None is pre-selected. "Continue" is disabled until one is picked. "Skip for now" is always enabled.
   - Continue → `PATCH me {avatar}` → exit (§2).
   - Skip → the server default avatar stays → exit.
   - PATCH failure → snackbar "Couldn't save your avatar. You can change it later in your profile." Then exit anyway (never trap the user).
7. The signup-bonus notice on `/play` belongs to step 3 (`onboarding.md`, AU-11). Auth screens do not mention coins except the username-change cost note.

### 3.2 Login (AU-06)

1. User enters phone and password. Tap "Log in", or press Enter in either field → `POST auth/login {phone, password}`.
2. Success → apply `me.lang` if it differs from the current UI locale (the account preference wins), then route per §2 exits.
3. `AUTH_INVALID_CREDENTIALS` → action error above the button: "The mobile number or password is incorrect." The password is cleared, the phone kept, focus on the password. The message never says which part was wrong.
4. `AUTH_LOCKED` → action error with a live countdown from `details.retry_after` and the link "Reset password". "Log in" is disabled until the countdown ends. The countdown survives a reload (store the unlock time in sessionStorage).
5. Banned account (`ACCOUNT_BANNED`, code name to confirm, open question 7) → the form is replaced by the AU-14 banned panel. The UI must never reveal "banned" before a correct password; the backend returns the code only after the password matches.
6. Suspended account → login succeeds → AU-13 (§2).
7. Signed-in user who gets banned or suspended mid-session:
   - Any API call or token refresh returning `ACCOUNT_BANNED` → clear client user data → `/login` showing the AU-14 panel.
   - `me.status` changing to `suspended` (seen on the next `GET me`, on focus or on refresh) → AU-13 once, then the banner.
8. Offline → "Log in" is disabled with the reason.

### 3.3 Password reset (AU-07 → AU-08 → AU-09)

1. **AU-07.** Phone (prefilled if the user typed one on AU-06 or came from settings) → "Get code" → `POST auth/otp {phone, purpose: "password_reset"}`.
   - `202` always (no enumeration) → AU-08.
   - `429` → countdown, as in signup.
   - `503 SMS_UNAVAILABLE` → the form is replaced by the "reset unavailable" panel (AU-07U). No dead end: support contact and "Back to log in". See §3.5.3.
2. **AU-08.** Same code component as AU-03, with **neutral copy**: "If an account exists for {phone}, we've texted it a 5-digit code." It also shows the link "No account? Create one" (to AU-02 with the phone kept). Verify → `POST auth/otp/verify {…, purpose: "password_reset"}` → token → AU-09. Errors are handled as in AU-03.
3. **AU-09.** New password, with the requirement checklist visible before typing. A note before the button: "After you change it, you'll be signed in here and signed out on all other devices." "Save password and log in" → `POST auth/password/reset {verification_token, new_password}`.
   - Success → signed in on this device, and every other session is revoked (§12.1, confirmed) → exit per §2, with the snackbar "Password changed. Other devices were signed out." A suspended account goes to AU-13 first.
   - `PASSWORD_WEAK` → field error.
   - Token expired → action error with "Send a new code" (as in AU-04).
   - Banned account → the AU-14 banned panel on AU-09, and no sign-in. Which step returns `ACCOUNT_BANNED` is open question 7; the UI never reveals it before the code is verified, so AU-07 and AU-08 stay neutral.

### 3.4 Logout (AU-12)

1. The Account hub row "Log out" opens the AU-12 dialog: title, body, and, from step 5 on, the match-in-progress note if the user is a player in a running match. Default focus is on "Cancel".
2. "Log out" → `POST auth/logout` (in-button spinner, dialog not dismissible while in flight).
   - Success → clear client caches of user data (query cache, `bg.*` sessionStorage, and any user-scoped service worker data, see open question 8) → `/` with a polite announcement "You've logged out".
   - Network failure → the dialog stays open with the action error "Couldn't log out. Check your connection and try again." It never pretends to have logged out, because the HttpOnly cookies can't be cleared by the client.
3. Logout never resigns or leaves a match, never cancels withdrawals, and never touches other devices. "Sign out other devices" lives in `/me/sessions` (profile.md).

### 3.5 SMS off mode (amendment 2026-09-28; CLAUDE.md §18 "SMS off switch", `sms.md` §1)

The product owner decided that no SMS is sent until the sender line and patterns are approved. The admin setting `sms.enabled` (default `false`) controls this. The switch can change at any time, so the client never assumes a mode. It follows the server response for each request.

| | SMS on (`sms.enabled` true) | SMS off (`sms.enabled` false) |
| --- | --- | --- |
| `POST auth/otp` purpose `register` | `202 {sms: true, expires_in, resend_after}` → AU-03 | `200 {sms: false, verification_token}` → AU-04 directly. No code is sent. The phone is **not** verified. |
| Signup steps | AU-02 → AU-03 → AU-04 ("Step n of 3") | AU-02 → AU-04 ("Step n of 2") |
| `AUTH_PHONE_TAKEN`, `AUTH_OTP_RATE_LIMITED` on signup | As §3.1 step 3 | Same handling. The rate limit (3 per 10 min per phone and per IP) still applies, but there is no resend cooldown. |
| `POST auth/otp` purpose `password_reset` | `202` → AU-08 | `503 SMS_UNAVAILABLE` (`errors.auth.smsUnavailable`) for every number (no enumeration) → AU-07U panel |
| Login, logout, suspended, banned | Unchanged | Unchanged |

#### 3.5.1 Knowing the mode before the first request

- There is no public flag for the mode yet (open question 14). Until one exists, AU-02 and AU-07 use **mode-neutral** copy:
  - AU-02 note: `auth.signup.phoneNote` "You'll log in with this number. Make sure it's correct."
  - AU-02 button: `auth.signup.ctaNeutral` "Continue"
  - Stepper: `auth.stepNoTotal` "Step 1", with no total
- AU-03 and AU-04 always know the mode from the response, so they show the exact total ("Step 2 of 3", or "Step 2 of 2" when SMS is off).
- **If the public flag ships**, AU-02 switches to mode-specific copy:
  - SMS on: the existing `auth.signup.smsNote`, `auth.signup.cta` "Get code", and "Step 1 of 3".
  - SMS off: `auth.signup.phoneNote`, "Continue", and "Step 1 of 2".
  - AU-07 shows AU-07U at once, without asking for a phone number.
- Never write "we'll text you" or "we sent a code" unless the response said `sms: true`.

#### 3.5.2 Signup with SMS off (AU-02 → AU-04)

1. AU-02 is unchanged: phone, the 18+ checkbox, the terms checkbox (both unticked), and the same disabled reasons.
2. "Continue" → `POST auth/otp {phone, purpose: "register"}` → `200 {sms: false, verification_token}`.
   - Store the token, the normalized phone, and the time it was issued in this tab's sessionStorage (same key and 10-minute life as the SMS-on token, §3.1 step 4).
   - Go to AU-04 (a normal navigation push, so Back from AU-04 returns to AU-02).
   - There is no interstitial and no "number verified" message: nothing was verified.
3. **AU-04 in SMS off mode** shows the same fields plus one read-only line above the username field:
   - «شماره موبایل: ۰۹۱۲ ۳۴۵ ۶۷۸۹» / "Mobile number: 0912 345 6789" (full number, `<bdi dir="ltr">`), then the helper `auth.account.phoneCheck` "You'll log in with this number. Check that it's correct."
   - Next to it, the "Change" text button (`auth.account.changePhone`) → AU-02 with the phone and both checkboxes kept.
   - Why: without a code step, a typo becomes the login ID and can't be recovered while password reset is off.
   - Stepper: "Step 2 of 2".
4. "Create account" → `POST auth/register` exactly as §3.1 step 5. Every error is handled the same way, except:
   - **`AUTH_VERIFICATION_INVALID`** (`details.reason`: `expired`, `invalid`, or `used`) → action error `auth.verification.expiredNoSms` "This signup session has expired. Tap Continue to try again; what you entered is kept."
     - Button `auth.verification.renew` "Continue".
     - One tap calls `POST auth/otp` again. On `200 {sms: false}` it stores the new token and re-submits `POST auth/register` with the same entries. This is one explicit tap for the action the user already chose; nothing is submitted without a tap.
     - If that call returns `202 {sms: true}` (SMS was switched on meanwhile), go to AU-03. After verification, return to AU-04 with the username and referrer kept and the password cleared, as in §3.1 step 5.
     - If it returns `409` or `429`, show those errors on AU-04 as action errors with their normal actions ("Log in with this number"; countdown).
5. **Back or "Change" from AU-04 → AU-02**:
   - If the phone is unchanged and the stored token is less than 10 minutes old, "Continue" goes straight to AU-04 **without** a new request (saves the rate limit).
   - If the phone changed, the old token is discarded and "Continue" requests a new one.
6. AU-05 (avatar) and the exits (§2) are unchanged.
7. **Direct opens:**
   - `/signup/verify` without an SMS-on code state in this tab → redirect to `/signup/account` if a valid SMS-off token exists, else to `/signup`.
   - `/password/reset/verify` and `/password/reset/new` without state → redirect to `/password/reset`.
8. **The mode changes mid-flow.**
   - A user holding an SMS-off token when SMS is switched on can still register with it until it expires (the server accepts it).
   - A user on AU-03 when SMS is switched off: the code they received still verifies until it expires. If it has expired, "Get a new code" returns `200 {sms: false}` → go to AU-04 with the new token. No error is shown.

#### 3.5.3 Password reset with SMS off (AU-07U)

1. AU-07 → "Get code" → `503 SMS_UNAVAILABLE`.
2. The form is replaced in place by the **AU-07U "Reset unavailable" panel** (same route `/password/reset`; `role="region"` with a heading; focus moves to the heading):
   1. Title `auth.reset.unavailable.title` "Password reset is unavailable right now"
   2. Body `auth.reset.unavailable.body` "We can't send verification codes by text at the moment, so passwords can't be reset in the app."
   3. `auth.reset.unavailable.remember` "If you remember your password, you can log in as usual."
   4. `auth.reset.unavailable.support` "Can't log in? Contact support: {channel}", with the channel (`support.contact.channel`) as a link or copyable text
   5. Safety line `auth.reset.unavailable.safety` "Support will never ask for your password."
   6. Primary button: "Back to log in" (`auth.reset.backToLogin`) → AU-06, with the phone prefilled from memory (never from the URL)
   7. Secondary text button: "Try again" (`common.retry`). It repeats `POST auth/otp`; when SMS is back on, the flow continues to AU-08. It never auto-retries.
3. The panel is neutral: it never says whether the number has an account, and it looks the same for every number.
4. Every entry point to AU-07 ends here while SMS is off:
   - "Forgot password?" on AU-06
   - The "Reset password" link in the `AUTH_LOCKED` state
   - "Change password" in `/settings`
   The links stay visible: they lead to this explanation and the support contact, which is better than hiding the only route to help.
5. The panel is not stored. Each visit to AU-07 starts with the form, until the public mode flag exists (§3.5.1).

#### 3.5.4 API alignment noted while amending

- **Open question 1 resolved:** the `202` body has `expires_in` and `resend_after` (`otp.ttl_seconds`, `otp.resend_cooldown_seconds`, default 120 s and 60 s). A resend inside the cooldown returns `429 AUTH_OTP_RATE_LIMITED` with `details.reason: "cooldown"` and `retry_after`.
- **Open question 5 resolved:** an expired, invalid, or reused token returns `AUTH_VERIFICATION_INVALID` (`errors.auth.verificationInvalid`), with `details.reason` of `expired`, `invalid`, or `used`. The UI treats all three the same (§3.1 step 5, §3.5.2 step 4).
- **Open question 7 resolved:** the banned code is `AUTH_BANNED` (`errors.auth.banned`), not `ACCOUNT_BANNED`. Read `ACCOUNT_BANNED` in this spec as `AUTH_BANNED`.
- **Message key for `SMS_UNAVAILABLE`:** the backend key is `errors.auth.smsUnavailable`. The older `errors.sms.unavailable` key (sms.md §4) is kept in the catalog for provider failures shown elsewhere; both have copy in §7.

---

## 4. Screen list

Common layout for all auth screens: no bottom nav, no balance chip. The top bar has back (mirrors in RTL) on steps 2+, the app logo on AU-01 and AU-06, and a language button (globe icon + current language name) at the end. Forms are a single column. The primary button sits in a sticky footer above the keyboard when the viewport height is ≥ 600 px; otherwise it sits inline after the last field, so it never covers the focused input.

### AU-01 Welcome `/`

- **Purpose:** choose between creating an account and logging in.
- **Content priority:**
  1. App name and tagline (`app.name`, `app.tagline`)
  2. Decorative static board art (`alt=""`; no 3D and no WebGL on this route)
  3. "Create account" (primary)
  4. "Log in" (secondary, outlined, equal width)
  5. "For ages 18 and over" line
  6. Terms and Privacy links
- **Components:** app bar with language button, hero art, two full-width buttons, footer links.
- **Primary action:** Create account. **Secondary:** Log in, change language.
- No install banner on auth screens (P§15; J1 step 1).

### AU-02 Signup: phone, 18+, terms `/signup`

- **Purpose:** collect the number and the two consents, and send the code (or, with SMS off, get the signup token; §3.5).
- **Content priority:**
  1. Title and "Step 1 of 3" ("Step 1" while the SMS mode is unknown; §3.5.1)
  2. Phone field
  3. SMS note (`auth.signup.phoneNote` while the SMS mode is unknown or off)
  4. 18+ checkbox
  5. Terms/privacy checkbox (inline links)
  6. "Get code"
  7. "Already have an account? Log in"
- **Components:** stepper text, phone field (P§12), two separate checkboxes (not combined, so each consent is explicit and has its own error), sticky CTA, disabled-reason text.
- Terms and Privacy links open `/terms` and `/privacy` as full routes. Back returns with every entry kept (sessionStorage).
- **Primary action:** Get code ("Continue" while the SMS mode is unknown or off; §3.5.1).

### AU-03 Signup: SMS code `/signup/verify`

SMS off: this screen is skipped (§3.5.2).

- **Purpose:** prove ownership of the number.
- **Content priority:**
  1. Title and "Step 2 of 3"
  2. "We sent a 5-digit code to 0912 345 6789" (full number, so a typo is visible; see §7 note)
  3. Code input
  4. Validity countdown
  5. Resend (with its wait)
  6. "Change number"
  7. "Didn't get the code?" tips
- **Components:** 5-box code input (a single `<input>`, P§12), countdown text, text buttons, expandable help.
- **Primary action:** none needed (auto-submit). A "Verify" button appears only if auto-submit is off (e.g., after an error when the user retypes 5 digits, it submits again automatically; the button is kept for keyboard users and is always present at the end of the form).
- **Tips content:** check the number shown (with "Change number"); an SMS can take up to a minute; check blocked or spam messages; still nothing → support channel `support.contact.channel`.
- **Direct open without state** (no phone in this tab) → redirect to `/signup`.

### AU-04 Signup: account details `/signup/account`

- **Purpose:** create the account.
- **Content priority:**
  1. Title and "Step 3 of 3" ("Step 2 of 2" with SMS off). With SMS off only, the read-only mobile number line with "Change" and `auth.account.phoneCheck` follows the title (§3.5.2 step 3).
  2. Username field
  3. Password field with the requirement checklist
  4. Referrer field (optional)
  5. "Create account"
- **Components:**
  - **Username:** `dir="ltr"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`, `autocomplete="username"`. Helper with the rules, plus the cost note from `username.change_cost` (fetched with the public config, open question 9). Live client-side format check after the first blur. The availability check runs on submit only, until an availability endpoint exists (open question 4). If a Persian or Arabic letter is typed, show the hint "Usernames use English letters" right away. Do not transliterate.
  - **Password:** `autocomplete="new-password"`, show/hide toggle, checklist of three rules visible before typing, each with an icon plus text and a "met" state for screen readers.
  - **Referrer:** `dir="ltr"`. Helper "If a friend invited you, enter their username. This can't be changed later." Clear (×) button when filled.
- **Primary action:** Create account.
- **Direct open without a valid token** → redirect to `/signup`.

### AU-05 Avatar `/signup/avatar`

- **Purpose:** personalize, optional.
- **Content priority:**
  1. Title and helper "You can change it anytime in your profile"
  2. Avatar grid
  3. "Continue"
  4. "Skip for now"
- **Components:** the same avatar picker component as profile.md AC-02 (radio group semantics).
- Not counted in "Step N of 3": it is shown after the account exists and says so.
- **Primary action:** Continue (disabled until a pick, with reason "Pick an avatar or skip"). **Secondary:** Skip for now.

### AU-06 Login `/login`

- **Purpose:** sign in.
- **Content priority:**
  1. Title
  2. Phone
  3. Password (show/hide)
  4. Action error area
  5. "Log in"
  6. "Forgot password?"
  7. "New here? Create account"
- **Components:** phone field (`autocomplete="tel"`), password field (`autocomplete="current-password"`), countdown for the locked state.
- **Primary action:** Log in.

### AU-07 Reset: phone `/password/reset`

- **Purpose:** start recovery.
- **Content:** title, one-line intro, phone field, "Get code", "Back to log in".
- **Primary action:** Get code.

### AU-07U Reset unavailable panel (on `/password/reset`, SMS off)

- **Shown when:** `POST auth/otp {purpose: "password_reset"}` returns `503 SMS_UNAVAILABLE` (§3.5.3). It replaces the AU-07 form in place.
- **Purpose:** explain that reset can't happen in the app right now, and give a way forward. Never a dead end.
- **Content priority:**
  1. Title
  2. Body
  3. "If you remember your password" line
  4. Support contact
  5. Safety line
  6. "Back to log in" (primary)
  7. "Try again" (text button)
- **Components:** an info panel (info icon plus text, not error styling, because this isn't the user's fault), the support channel as a link or copyable text, and two buttons.
- **Primary action:** Back to log in.

### AU-08 Reset: SMS code `/password/reset/verify`

- As AU-03, with neutral copy and the "No account? Create one" link. Step text "Step 2 of 3" (reset has 3 steps).

### AU-09 Reset: new password `/password/reset/new`

- **Content:** title, new password with checklist, the "signed out on other devices" note, "Save password and log in".
- **Primary action:** Save password and log in.

### AU-10 Language sheet

- Opened by the language button on every auth screen (and by `/settings`, profile.md).
- Two radio options, each written in its own language: «فارسی» (`lang="fa"`) and "English" (`lang="en"`). The current one is checked (this is the current state, not a pre-selection of a choice).
- Choosing applies immediately (direction flips, `<html lang dir>` updates), keeps every form entry, and closes the sheet.
- Guests: stored in the locale cookie. Signed-in users: also `PATCH me {lang}`.

### AU-12 Logout dialog

- **Content:** title, body, match note (conditional), "Cancel", "Log out". Neutral styling: logging out is not destructive.

### AU-13 Account suspended `/account/status` (signed in; SY-03 route, specified here for step 2)

Suspended users can sign in and use part of the app (§12.1).

- **Purpose:** tell the user plainly what happened, what still works, and how to get help, without accusing them.
- **Content priority:**
  1. Title "Your account is suspended"
  2. Until when:
     - "Until {date}", in Jalali for fa, with relative time ("in 3 days")
     - or "Until further notice" when there is no end date
  3. Reason category, if the API provides one (open question 12). Never evidence, flags, or other accounts.
  4. **"You can still"** list, each item with an icon plus text:
     - Watch live matches
     - See your match history and replays
     - See your predictions
     - Request a withdrawal of your coins
     - Edit your avatar and settings
  5. **"Not available while suspended"** list:
     - Playing matches (tables, queue, bot)
     - Making predictions
     - Entering tournaments
     - Buying coins or items
     - Sending coins
  6. Support contact (`support.contact.channel`)
  7. "Continue" (primary)
- **When it shows:**
  - Once after each sign-in, or when the status first changes to suspended during a session.
  - Afterwards, it stays reachable from the banner.
- **Suspension banner (global, all non-immersive screens):**
  - Text: "Account suspended until {date}. Some actions are unavailable."
  - Link: "Details" → `/account/status`.
  - Not dismissible. It disappears when the status returns to `active`.
  - It sits below the app bar, pushes content down, and never covers controls.
- **Blocked actions in other features:**
  - Show the control disabled, with the shared reason `account.suspended.actionBlocked` and a "Details" link.
  - Never hide the control silently.
  - Never show an insufficient-coins or shop prompt instead.
- Items in the "can still" list that don't exist yet (live, history, predictions, withdrawals before their steps ship) are omitted, not shown as links to 404s.

### AU-14 Banned panel (on AU-06 or AU-09, signed out)

- **Shown when:**
  - Login or password reset returns `ACCOUNT_BANNED`, or
  - A signed-in session is ended by `ACCOUNT_BANNED`.
- **Content:**
  1. Title "This account has been closed"
  2. "You can't sign in to this account."
  3. "If you had a pending withdrawal, it is on hold until our team reviews it." This line is shown always; the client doesn't know whether a withdrawal exists (§12.1).
  4. Support contact
  5. "Back": returns to the empty login form.
- No reason detail and no accusation. The panel is a `role="alert"` region inside the page, not a dialog.

---

## 5. States

| State | AU-01 | AU-02 | AU-03 / AU-08 | AU-04 | AU-05 | AU-06 | AU-07 | AU-09 | AU-12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Loading** | Static; no data | Button spinner on "Get code" ("Sending code…") | Spinner inside the code field while verifying; input read-only | Button spinner ("Creating account…"); all fields read-only | Avatar grid skeleton (circles) | Button spinner ("Logging in…") | Button spinner | Button spinner ("Saving…") | Button spinner |
| **Empty** | — | — | — | — | Avatars fail to load: "Couldn't load avatars" + Retry; "Skip for now" stays enabled | — | — | — | — |
| **Error** | — | Field: invalid phone, taken. Action: rate-limited (countdown), SMS unavailable | Wrong code (tries left), dead code, expired, resend rate-limited | Field: username taken/invalid, weak password, referrer not found. Action: verification expired, phone taken | Save failed → snackbar, continue | Invalid credentials, locked (countdown) | Rate-limited | Weak password, verification expired | Logout failed (stay in dialog) |
| **Offline** | Banner `net.offline`; buttons still navigate (routes are cached) | Banner; "Get code" disabled with reason `net.offlineAction`; entries kept | Banner; auto-submit waits and submits when back online (the code stays in the field); resend disabled with reason | Banner; submit disabled with reason; entries kept | Continue disabled with reason; Skip enabled | Banner; "Log in" disabled with reason | As AU-02 | As AU-04 | "Log out" disabled with reason |
| **Reconnecting** | Not applicable (no socket on auth routes). A request in flight that loses the network → action error `errors.network` with Retry; entries kept. | ← | ← | ← | ← | ← | ← | ← | ← |
| **Insufficient coins** | Not applicable: auth spends no coins. | | | | | | | | |
| **Suspended / banned** | — | Phone of a suspended/banned account → `AUTH_PHONE_TAKEN` like any other; "Log in with this number" then leads to the normal outcome | — | — | — | Suspended → sign-in succeeds → AU-13. Banned → AU-14 panel, no sign-in | Neutral as always | Suspended → signed in → AU-13. Banned → AU-14 panel, no sign-in | Suspended users can log out normally |
| **First-time user** | Default state: fa, language button visible | Both boxes unticked | Tips visible as a collapsed "Didn't get the code?" | Referrer prefilled only from `ref` | — | — | — | — | — |
| **Already signed in** | Redirect to `/play` | Redirect | Redirect | Redirect | Allowed (signed-in route) | Redirect | Redirect | Redirect | — |
| **SMS off (§3.5)** | Unchanged | Neutral note and "Continue" (§3.5.1); `200 {sms: false}` → AU-04 | Skipped; direct open redirects (§3.5.2 step 7) | "Step 2 of 2"; phone line with "Change"; expired token → "Continue" renews and re-submits | Unchanged | Unchanged; "Forgot password?" still shown (leads to AU-07U) | "Get code" → `503` → AU-07U panel | Unreachable; direct open → `/password/reset` | Unchanged |

Timing rules:
- Countdowns (validity, resend, lock, rate limit) use the server value and the local clock, and display mm:ss in `<bdi dir="ltr">`.
- They announce to screen readers only at start and when they reach 0 (no per-second announcements).
- A countdown that reaches 0 enables the blocked action and updates its text; it never auto-submits anything.

---

## 6. Responsive and input notes

### 6.1 Breakpoints (§11.7)

| Breakpoint | Portrait | Landscape |
| --- | --- | --- |
| `xs` 320–359 | Single column, 16 px side padding. Code boxes shrink to fit 5 boxes in 288 px (min 44 px wide each, 8 px gaps); if they can't fit at 200% text, the boxes become a single plain field. Checkbox labels wrap; the tap target is the whole row. Hero art on AU-01 at most 30% of the height. | Height < 500 px: no hero art, CTA inline (not sticky), title shrinks to one line. |
| `sm` 360–599 (reference 390 × 844) | Single column. Sticky CTA above the keyboard, respecting `env(safe-area-inset-bottom)`. AU-01 hero art at most 40% of the height; both buttons in the bottom 40%. | As `xs` landscape. |
| `md` 600–1023 | Centered card, max 480 px wide. No side rail on auth routes. AU-01: art above the card. | Two panes: decorative art pane (start side) and form card (end side, max 480 px). The art pane is hidden when height < 500 px. |
| `lg` ≥ 1024 | Centered shell, max 1280 px: art pane (start, 50%) and form card (end, max 480 px, vertically centered). Mouse and keyboard: Enter submits, Tab order as §8. Hover states on links and buttons. | Same. |

- Use `dvh`/`svh`, never `100vh`.
- When the on-screen keyboard opens, the focused field and the CTA must both be visible (scroll the field into view; `visualViewport` resize handling).
- Survives runtime width changes (foldables, split screen) without losing entries.

### 6.2 Phone input normalization (client, before sending)

- Accept: `09xxxxxxxxx`, `9xxxxxxxxx`, `+989xxxxxxxxx`, `00989xxxxxxxxx`, `989xxxxxxxxx`.
- Accept Persian (۰–۹) and Arabic-Indic (٠–٩) digits, and ignore spaces, dashes, and parentheses.
- Paste of any of these works.
- Valid only if the result is an Iranian mobile number: `09` followed by 9 digits. The server remains authoritative.
- **Display:**
  - The field is `dir="ltr"`, aligned to the start of the form (right in fa).
  - Digits are shown as typed; the UI never converts digits under the user's cursor.
  - Grouping `0912 345 6789` is applied on blur.
  - `inputmode="tel"`, `autocomplete="tel"`.
- **Validation timing:** the field validates on blur and on submit, not on every keystroke.

### 6.3 Code input

- One `<input>`: `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength` 5 after normalization, `dir="ltr"`, drawn as 5 boxes.
- Paste of Persian digits, or of a full SMS line, extracts the 5 digits.
- Android WebOTP: if the SMS pattern carries the `@m.<domain> #code` line (sms.md §5), call `navigator.credentials.get({otp})` while AU-03/AU-08 is open, fill the field, and auto-submit. Abort on leaving the screen.
- The SMS text says «این کد را به کسی ندهید.»; AU-03 repeats it in a small line: "Never share this code with anyone, including support."

---

## 7. RTL/LTR notes and i18n keys

- fa first. The whole form mirrors in fa. Back arrows mirror. The language button's globe icon does not.
- Phone, code, username, referrer, and password fields are always `dir="ltr"`, because their content is Latin or numeric. Labels and helper text follow the UI direction.
- Numbers in running text use locale digits (fa `۰۹۱۲ ۳۴۵ ۶۷۸۹`, en `0912 345 6789`), wrapped in `<bdi>`.
- Usernames inside fa sentences are wrapped in `<bdi dir="ltr">`.
- **Phone display on AU-03 and AU-08:** the full number, not the masked form of P§18. The user just typed it on this device and needs to catch typos. The masked form stays for step-up checks such as withdrawal, where the number comes from the account (deviation from P§18, stated).
- Durations use ICU plurals and `Intl` formatting. Countdowns are mm:ss.

| Key | fa | en |
| --- | --- | --- |
| `app.name` | (existing) تخته نرد | (existing) |
| `app.tagline` | (existing) تخته نرد آنلاین سه‌بعدی | 3D online backgammon |
| `auth.lang.button` | زبان: {language} | Language: {language} |
| `auth.lang.sheetTitle` | انتخاب زبان | Choose language |
| `auth.lang.fa` | فارسی | فارسی |
| `auth.lang.en` | English | English |
| `auth.welcome.signup` | ساخت حساب | Create account |
| `auth.welcome.login` | ورود | Log in |
| `auth.welcome.ageNote` | فقط برای افراد ۱۸ سال به بالا | For ages 18 and over |
| `auth.links.terms` | قوانین استفاده | Terms of use |
| `auth.links.privacy` | حریم خصوصی | Privacy policy |
| `auth.step` | مرحله {current} از {total} | Step {current} of {total} |
| `auth.signup.title` | ساخت حساب | Create account |
| `auth.phone.label` | شماره موبایل | Mobile number |
| `auth.phone.helper` | شماره موبایل ایران، مثل ۰۹۱۲ ۳۴۵ ۶۷۸۹ | Iranian mobile number, e.g. 0912 345 6789 |
| `auth.phone.error.invalid` | یک شماره موبایل ایرانی وارد کنید که با ۰۹ شروع شود. | Enter an Iranian mobile number starting with 09. |
| `auth.phone.error.required` | شماره موبایل را وارد کنید. | Enter your mobile number. |
| `auth.signup.smsNote` | یک کد ۵ رقمی به این شماره پیامک می‌کنیم. | We'll text a 5-digit code to this number. |
| `auth.signup.age` | ۱۸ سال یا بیشتر سن دارم. | I am 18 or older. |
| `auth.signup.age.error` | برای ساخت حساب باید ۱۸ سال یا بیشتر داشته باشید. | You must be 18 or older to create an account. |
| `auth.signup.terms` | {terms} و {privacy} را خوانده‌ام و می‌پذیرم. | I have read and accept the {terms} and {privacy}. |
| `auth.signup.cta` | دریافت کد | Get code |
| `auth.signup.disabled.phone` | شماره موبایل معتبر وارد کنید. | Enter a valid mobile number. |
| `auth.signup.disabled.checks` | برای ادامه، هر دو گزینه را تأیید کنید. | Tick both boxes to continue. |
| `auth.signup.haveAccount` | حساب دارید؟ {login} | Already have an account? {login} |
| `auth.signup.loginWithNumber` | ورود با این شماره | Log in with this number |
| `auth.signup.haveCode` | کد را قبلاً دریافت کرده‌ام | I already have a code |
| `auth.verify.title` | کد تأیید | Enter the code |
| `auth.verify.sentTo` | کد ۵ رقمی به {phone} پیامک شد. | We sent a 5-digit code to {phone}. |
| `auth.verify.codeLabel` | کد تأیید ۵ رقمی | 5-digit verification code |
| `auth.verify.expiresIn` | اعتبار کد: {time} | Code expires in {time} |
| `auth.verify.expired` | کد منقضی شد. یک کد جدید بگیرید. | This code has expired. Get a new code. |
| `auth.verify.noAttempts` | تعداد تلاش‌ها برای این کد تمام شد. یک کد جدید بگیرید. | No tries left for this code. Get a new code. |
| `auth.verify.newCode` | دریافت کد جدید | Get a new code |
| `auth.verify.resend` | ارسال دوباره کد | Resend code |
| `auth.verify.resendIn` | ارسال دوباره تا {time} | Resend in {time} |
| `auth.verify.resent` | کد جدید فرستاده شد. | A new code was sent. |
| `auth.verify.changeNumber` | تغییر شماره | Change number |
| `auth.verify.cta` | تأیید | Verify |
| `auth.verify.verifying` | در حال بررسی کد… | Checking the code… |
| `auth.verify.neverShare` | این کد را به هیچ‌کس، حتی پشتیبانی، ندهید. | Never share this code with anyone, including support. |
| `auth.verify.help.title` | کد نرسید؟ | Didn't get the code? |
| `auth.verify.help.checkNumber` | شماره را بررسی کنید: {phone} | Check the number: {phone} |
| `auth.verify.help.wait` | رسیدن پیامک ممکن است تا یک دقیقه طول بکشد. | A text can take up to a minute to arrive. |
| `auth.verify.help.blocked` | اگر پیامک‌های ناشناس را مسدود کرده‌اید، پوشه‌ی پیامک‌های مسدودشده را ببینید. | If you block unknown senders, check your blocked or spam messages. |
| `auth.verify.help.support` | هنوز نرسیده؟ با پشتیبانی تماس بگیرید: {channel} | Still nothing? Contact support: {channel} |
| `auth.account.title` | اطلاعات حساب | Set up your account |
| `auth.username.label` | نام کاربری | Username |
| `auth.username.helper` | ۳ تا ۲۰ نویسه با حروف انگلیسی، عدد یا _ ؛ با یک حرف شروع شود. دیگران شما را با این نام می‌بینند. | 3–20 characters: English letters, numbers, or _, starting with a letter. Other players see this name. |
| `auth.username.costNote` | تغییر نام کاربری در آینده {cost} سکه هزینه دارد. | Changing it later costs {cost} coins. |
| `auth.username.latinHint` | نام کاربری با حروف انگلیسی نوشته می‌شود. | Usernames use English letters. |
| `errors.username.taken` | این نام کاربری گرفته شده است. | This username is taken. |
| `errors.username.invalid` | این نام کاربری معتبر نیست. قوانین زیر فیلد را ببینید. | This username isn't valid. See the rules below the field. |
| `errors.username.invalid.length` | نام کاربری باید ۳ تا ۲۰ نویسه باشد. | Use 3 to 20 characters. |
| `errors.username.invalid.chars` | فقط حروف انگلیسی، عدد و _ مجاز است. | Use only English letters, numbers, and _. |
| `errors.username.invalid.start` | نام کاربری باید با یک حرف انگلیسی شروع شود. | Start with an English letter. |
| `errors.username.invalid.notAllowed` | این نام کاربری مجاز نیست. نام دیگری انتخاب کنید. | This username isn't allowed. Try another one. |
| `auth.password.label` | رمز عبور | Password |
| `auth.password.newLabel` | رمز عبور جدید | New password |
| `auth.password.show` | نمایش رمز | Show password |
| `auth.password.hide` | پنهان کردن رمز | Hide password |
| `auth.password.rules.title` | رمز عبور باید: | Your password must: |
| `auth.password.rules.length` | دست‌کم ۸ نویسه باشد | Have at least 8 characters |
| `auth.password.rules.notDigits` | فقط از عدد تشکیل نشده باشد | Not be only numbers |
| `auth.password.rules.notCommon` | رمز رایج و ساده نباشد | Not be a common password |
| `auth.password.rules.met` | رعایت شده | done |
| `auth.password.rules.unmet` | هنوز رعایت نشده | not yet |
| `errors.password.weak` | این رمز ساده است و به‌راحتی حدس زده می‌شود. رمز قوی‌تری انتخاب کنید. | This password is too easy to guess. Choose a stronger one. |
| `auth.referrer.label` | نام کاربری معرف (اختیاری) | Referrer's username (optional) |
| `auth.referrer.helper` | اگر دوستی شما را دعوت کرده، نام کاربری او را وارد کنید. بعداً قابل تغییر نیست. | If a friend invited you, enter their username. This can't be changed later. |
| `auth.referrer.clear` | پاک کردن معرف | Clear referrer |
| `errors.referral.notFound` | بازیکنی با این نام کاربری پیدا نشد. آن را اصلاح یا پاک کنید. | No player with this username. Fix it or clear it. |
| `auth.account.cta` | ساخت حساب | Create account |
| `auth.account.creating` | در حال ساخت حساب… | Creating account… |
| `auth.verification.expired` | زمان تأیید شماره گذشته است. یک کد جدید بگیرید؛ اطلاعاتی که وارد کرده‌اید حفظ می‌شود. | Your number verification has expired. Get a new code; what you entered is kept. |
| `auth.verification.sendNew` | ارسال کد جدید | Send a new code |
| `auth.avatar.title` | یک چهره انتخاب کنید | Pick an avatar |
| `auth.avatar.helper` | بعداً هم از پروفایل قابل تغییر است. | You can change it anytime in your profile. |
| `auth.avatar.cta` | ادامه | Continue |
| `auth.avatar.disabled` | یک چهره انتخاب کنید یا از این مرحله بگذرید. | Pick an avatar or skip. |
| `auth.avatar.skip` | فعلاً نه | Skip for now |
| `auth.avatar.loadError` | چهره‌ها بارگذاری نشدند. | Couldn't load avatars. |
| `auth.avatar.saveError` | چهره ذخیره نشد. بعداً از پروفایل می‌توانید آن را تغییر دهید. | Couldn't save your avatar. You can change it later in your profile. |
| `auth.login.title` | ورود | Log in |
| `auth.login.cta` | ورود | Log in |
| `auth.login.loggingIn` | در حال ورود… | Logging in… |
| `auth.login.forgot` | رمز را فراموش کرده‌اید؟ | Forgot password? |
| `auth.login.noAccount` | حساب ندارید؟ {signup} | New here? {signup} |
| `errors.auth.invalidCredentials` | شماره موبایل یا رمز عبور درست نیست. | The mobile number or password is incorrect. |
| `errors.auth.locked` | به دلیل چند ورود ناموفق، ورود با این شماره تا {time} دیگر ممکن نیست. | Too many failed attempts. You can try again in {time}. |
| `auth.login.lockedReset` | بازیابی رمز عبور | Reset password |
| `auth.reset.title` | بازیابی رمز عبور | Reset password |
| `auth.reset.intro` | شماره موبایل حساب خود را وارد کنید تا کد تأیید برایتان پیامک کنیم. | Enter your account's mobile number and we'll text you a code. |
| `auth.reset.backToLogin` | بازگشت به ورود | Back to log in |
| `auth.reset.sentTo` | اگر حسابی با شماره {phone} وجود داشته باشد، یک کد ۵ رقمی برای آن پیامک شد. | If an account exists for {phone}, we've texted it a 5-digit code. |
| `auth.reset.noAccount` | حساب ندارید؟ {signup} | No account? {signup} |
| `auth.reset.new.title` | رمز عبور جدید | New password |
| `auth.reset.new.note` | پس از تغییر رمز، در این دستگاه وارد می‌شوید و از همه‌ی دستگاه‌های دیگر خارج می‌شوید. | After you change it, you'll be signed in here and signed out on all other devices. |
| `auth.reset.new.cta` | ذخیره رمز و ورود | Save password and log in |
| `auth.reset.new.saving` | در حال ذخیره… | Saving… |
| `auth.reset.done` | رمز عبور تغییر کرد. از دستگاه‌های دیگر خارج شدید. | Password changed. Other devices were signed out. |
| `errors.auth.otpRateLimited` | درخواست کد بیش از حد مجاز شد. {time} دیگر دوباره تلاش کنید. | Too many code requests. Try again in {time}. |
| `errors.auth.phoneTaken` | این شماره قبلاً ثبت شده است. | This number is already registered. |
| `errors.auth.otpInvalid` | کد درست نیست. {attempts, plural, one {# تلاش دیگر دارید.} other {# تلاش دیگر دارید.}} | That code isn't right. {attempts, plural, one {# try left.} other {# tries left.}} |
| `errors.auth.otpExpired` | کد منقضی شده است. یک کد جدید بگیرید. | This code has expired. Get a new code. |
| `errors.auth.ageNotConfirmed` | برای ساخت حساب، تأیید سن لازم است. | Please confirm your age to create an account. |
| `errors.sms.unavailable` | ارسال پیامک الان ممکن نیست. چند دقیقه‌ی دیگر دوباره تلاش کنید. | We can't send texts right now. Please try again in a few minutes. |
| `net.offlineAction` | اتصال اینترنت برقرار نیست. پس از اتصال دوباره تلاش کنید. | You're offline. Try again when you're connected. |
| `auth.logout.item` | خروج از حساب | Log out |
| `auth.logout.title` | از حساب خارج می‌شوید؟ | Log out? |
| `auth.logout.body` | برای ورود دوباره، به شماره موبایل و رمز عبور نیاز دارید. | You'll need your mobile number and password to log back in. |
| `auth.logout.matchNote` | یک مسابقه‌ی در جریان دارید. خروج از حساب مسابقه را واگذار نمی‌کند، اما زمان نوبت شما ادامه دارد. | You have a match in progress. Logging out doesn't resign it, but your turn timer keeps running. |
| `auth.logout.confirm` | خروج | Log out |
| `auth.logout.loggingOut` | در حال خروج… | Logging out… |
| `auth.logout.failed` | خروج انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید. | Couldn't log out. Check your connection and try again. |
| `auth.logout.done` | از حساب خارج شدید. | You've logged out. |
| `account.suspended.title` | حساب شما تعلیق شده است | Your account is suspended |
| `account.suspended.until` | تا {date} ({relative}) | Until {date} ({relative}) |
| `account.suspended.indefinite` | تا اطلاع بعدی | Until further notice |
| `account.suspended.reason` | دلیل: {reason} | Reason: {reason} |
| `account.suspended.canTitle` | همچنان می‌توانید: | You can still: |
| `account.suspended.can.live` | مسابقه‌های زنده را تماشا کنید | Watch live matches |
| `account.suspended.can.history` | تاریخچه و بازپخش مسابقه‌های خود را ببینید | See your match history and replays |
| `account.suspended.can.predictions` | پیش‌بینی‌های خود را ببینید | See your predictions |
| `account.suspended.can.withdraw` | درخواست برداشت سکه ثبت کنید | Request a withdrawal of your coins |
| `account.suspended.can.profile` | چهره و تنظیمات خود را تغییر دهید | Edit your avatar and settings |
| `account.suspended.cannotTitle` | در زمان تعلیق در دسترس نیست: | Not available while suspended: |
| `account.suspended.cannot.play` | بازی (میز سکه‌ای، جستجوی حریف، بازی با ربات) | Playing matches (tables, matchmaking, bot) |
| `account.suspended.cannot.predict` | ثبت پیش‌بینی | Making predictions |
| `account.suspended.cannot.tournaments` | شرکت در تورنمنت | Entering tournaments |
| `account.suspended.cannot.buy` | خرید سکه یا آیتم | Buying coins or items |
| `account.suspended.cannot.transfer` | ارسال سکه | Sending coins |
| `account.suspended.support` | سؤالی دارید؟ با پشتیبانی تماس بگیرید: {channel} | Questions? Contact support: {channel} |
| `account.suspended.continue` | ادامه | Continue |
| `account.suspended.banner` | حساب شما تا {date} تعلیق است. برخی امکانات در دسترس نیست. | Account suspended until {date}. Some actions are unavailable. |
| `account.suspended.bannerIndefinite` | حساب شما تعلیق است. برخی امکانات در دسترس نیست. | Your account is suspended. Some actions are unavailable. |
| `account.suspended.details` | جزئیات | Details |
| `account.suspended.actionBlocked` | در زمان تعلیق حساب، این کار ممکن نیست. | Not available while your account is suspended. |
| `account.banned.title` | این حساب بسته شده است | This account has been closed |
| `account.banned.body` | امکان ورود به این حساب وجود ندارد. | You can't sign in to this account. |
| `account.banned.withdrawals` | اگر درخواست برداشت در انتظار داشته‌اید، تا بررسی تیم ما نگه داشته می‌شود. | If you had a pending withdrawal, it is on hold until our team reviews it. |
| `account.banned.support` | برای پیگیری با پشتیبانی تماس بگیرید: {channel} | To follow up, contact support: {channel} |

**Keys added by the SMS off amendment (§3.5)**

| Key | fa | en |
| --- | --- | --- |
| `auth.stepNoTotal` | مرحله {current} | Step {current} |
| `auth.signup.phoneNote` | با این شماره وارد حساب می‌شوید. مطمئن شوید درست است. | You'll log in with this number. Make sure it's correct. |
| `auth.signup.ctaNeutral` | ادامه | Continue |
| `auth.account.phoneLine` | شماره موبایل: {phone} | Mobile number: {phone} |
| `auth.account.phoneCheck` | با این شماره وارد حساب می‌شوید. درستی آن را بررسی کنید. | You'll log in with this number. Check that it's correct. |
| `auth.account.changePhone` | تغییر شماره | Change |
| `auth.account.changePhoneLabel` | تغییر شماره موبایل | Change mobile number |
| `auth.verification.expiredNoSms` | زمان این مرحله‌ی ثبت‌نام گذشته است. برای ادامه «ادامه» را بزنید؛ اطلاعاتی که وارد کرده‌اید حفظ می‌شود. | This signup session has expired. Tap Continue to try again; what you entered is kept. |
| `auth.verification.renew` | ادامه | Continue |
| `auth.reset.unavailable.title` | بازیابی رمز عبور فعلاً در دسترس نیست | Password reset is unavailable right now |
| `auth.reset.unavailable.body` | در حال حاضر امکان ارسال کد تأیید با پیامک نداریم؛ برای همین بازیابی رمز در برنامه ممکن نیست. | We can't send verification codes by text at the moment, so passwords can't be reset in the app. |
| `auth.reset.unavailable.remember` | اگر رمز خود را به خاطر دارید، مثل همیشه وارد شوید. | If you remember your password, you can log in as usual. |
| `auth.reset.unavailable.support` | نمی‌توانید وارد شوید؟ با پشتیبانی تماس بگیرید: {channel} | Can't log in? Contact support: {channel} |
| `auth.reset.unavailable.safety` | پشتیبانی هرگز رمز عبور شما را نمی‌پرسد. | Support will never ask for your password. |
| `errors.auth.smsUnavailable` | ارسال پیامک در حال حاضر ممکن نیست. | We can't send text messages right now. |
| `errors.auth.verificationInvalid` | زمان تأیید شماره گذشته است. دوباره تلاش کنید. | Your number verification has expired. Please try again. |
| `errors.auth.banned` | امکان ورود به این حساب وجود ندارد. | You can't sign in to this account. |

`errors.auth.verificationInvalid` and `errors.auth.banned` are the backend `message_key` values (§3.5.4). The screens show the contextual keys (`auth.verification.expired`, `auth.verification.expiredNoSms`, `account.banned.*`). The `errors.*` entries are the catalog fallback, so an unmapped context still shows correct text.

Existing shared keys used: `common.cancel`, `common.back`, `common.retry`, `errors.network`, `errors.generic`, `errors.throttled`, `net.offline`, `support.contact.channel`.

The backend `message_key` values for the auth error codes must equal the `errors.*` keys above (§2 rule 8). The main agent owns keeping them aligned.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| AU-01 | Skip link → logo → language button → Create account → Log in → Terms → Privacy |
| AU-02 | Back → language → heading (focused on load) → phone → 18+ checkbox → terms checkbox → Terms link → Privacy link → Get code → Log in link |
| AU-03 / AU-08 | Back → language → heading → code field (focused on load, after the heading is announced) → Verify → Resend → Change number → "Didn't get the code?" toggle |
| AU-04 | Back → language → heading → username → password → show/hide → referrer → clear referrer → Create account |
| AU-05 | Heading → avatar radio group (arrow keys move within, one tab stop) → Continue → Skip |
| AU-06 | Logo → language → heading → phone → password → show/hide → Log in → Forgot password → Create account |
| AU-07 | Back → language → heading → phone → Get code → Back to log in |
| AU-07U | Panel heading (focus moves here when the panel replaces the form; announced politely, not as an alert) → body → support link → Back to log in → Try again |
| AU-04 (SMS off) | Back → language → heading → mobile number line → Change → username → … (as AU-04) |
| AU-09 | Back → language → heading → new password → show/hide → Save password and log in |
| AU-12 | Title (announced) → Cancel (initial focus) → Log out; focus trapped; Esc = Cancel |
| AU-13 | Heading (focused on load) → until/reason text → "can still" list → "not available" list → support link → Continue |
| AU-14 | Panel title (focus moves here when the panel appears; announced as an alert) → support link → Back |
| Suspension banner | First element after the app bar in every screen's tab order; "Details" is its only control |

**Other rules**

- **On submit error:** focus moves to the first invalid field, and its error is announced (`aria-describedby` + `aria-invalid`). Action errors sit in a `role="alert"` region above the button.
- **Labels:** show/hide password (`auth.password.show` / `.hide`, `aria-pressed`), clear referrer, language button, and back (`common.back`). Each code box is decorative; the single input carries `auth.verify.codeLabel`.
- **Checkboxes:** real `<input type="checkbox">` with the full sentence as the label. Links inside the label are separate focusable elements, and activating a link does not toggle the box.
- **Disabled primary buttons:** use `aria-disabled="true"` (still focusable), with the visible reason linked by `aria-describedby`.
- **Live regions (polite):** code sent/resent, countdown reaching 0, lock ended, logout done, the password checklist state (announced on blur, not per keystroke).
- **Contrast:** 4.5:1 for all text, including helper text, disabled reasons, and text over the hero art (the art sits behind a solid surface; no text on the image).
- **Motion:** step transitions are a cross-fade ≤ 200 ms; none under `prefers-reduced-motion`.
- **Not color alone:** error text carries an icon and the words; met password rules show a check icon plus "done" for screen readers.
- **Text size:** at 200% text, fields and checkbox rows wrap; nothing clips; no horizontal scroll at 320 px.
- **Autofill:** password managers must work: correct `autocomplete` values, and the login form is a real `<form>` with a submit button.

---

## 9. Acceptance criteria

1. `/` for a guest shows Create account and Log in with equal width. A signed-in user opening `/`, `/login`, `/signup*`, or `/password/reset*` is redirected to `/play` without rendering the form.
2. `/?ref=ali_tbz` stores `ali_tbz`; AU-04 shows it prefilled in the referrer field; it is cleared after a successful registration.
3. On AU-02 both checkboxes render unticked. "Get code" is `aria-disabled` with a visible reason until the phone is valid **and** both are ticked.
4. Phone inputs `۰۹۱۲۳۴۵۶۷۸۹`, `+989123456789`, `00989123456789`, `9123456789`, and `0912-345-6789` are all sent as the same normalized number. `0212345678` shows `auth.phone.error.invalid` and sends no request.
5. `AUTH_PHONE_TAKEN` shows the field error and a "Log in with this number" action; the phone never appears in any URL.
6. `AUTH_OTP_RATE_LIMITED` with `retry_after: 125` shows a countdown starting at `۰۲:۰۵` (fa) / `02:05` (en), and "Get code" becomes enabled at 0 without a reload.
7. On AU-03, pasting `کد: ۴۸۲۱۳` fills `48213` and submits once. A wrong code shows the tries left from `details.attempts_left` and clears the field. `attempts_left: 0` disables the field and shows only "Get a new code".
8. The validity countdown reaching 0 disables the code field and shows `auth.verify.expired`. Nothing auto-submits or auto-resends.
9. "Change number" returns to AU-02 with the phone and both checkboxes kept, and sends no SMS.
10. Reloading AU-04 within 10 minutes of verification keeps the user on AU-04 (token restored from sessionStorage). The password field is empty after reload.
11. `POST auth/register` sends `age_confirmed: true` only when the 18+ box was ticked, and omits `referrer` when the field is empty.
12. `REFERRER_NOT_FOUND` puts the error on the referrer field; clearing it and submitting again succeeds.
13. Typing a Persian letter in the username field shows `auth.username.latinHint` immediately. Server `USERNAME_TAKEN` and `USERNAME_INVALID` errors appear under the username field with focus moved there.
14. The password rules are visible before typing, each with an icon and text; the checklist updates without relying on color.
15. The avatar grid has no avatar selected on load; Continue is disabled with a reason; Skip always works; a failed PATCH still exits to `/play` with a snackbar.
16. Login with wrong credentials shows exactly `errors.auth.invalidCredentials`, clears only the password, and focuses it.
17. `AUTH_LOCKED` shows a live countdown and a "Reset password" link; reloading the page keeps the countdown.
18. The password reset request shows the same next screen and the same neutral copy for a registered and an unregistered number.
19. A successful reset signs the user in, shows `auth.reset.done`, and lands on `next` or `/play`.
20. Logout asks for confirmation with focus on Cancel; success lands on `/` and a back navigation does not reveal signed-in content from cache; a network failure keeps the dialog open with `auth.logout.failed`.
21. Offline on any auth step: the offline banner shows, the primary action is disabled with `net.offlineAction`, and all entries (except passwords and codes, per P§3.5) are kept when the connection returns.
22. Every screen passes at 360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, and 1440 × 900 in fa and en, portrait and landscape: no horizontal scroll, no clipped text at 200%, all targets ≥ 44 × 44 px, and the focused field plus the primary button are visible with the keyboard open.
23. A suspended account signs in successfully, sees AU-13 once (with the Jalali end date in fa), then lands on `next` or `/play` with a non-dismissible suspension banner on every non-immersive screen. Avatar, language, settings, sessions, and logout still work.
24. A banned account never gets a session: login and password reset show the AU-14 panel. A session that receives `ACCOUNT_BANNED` from any call ends on `/login` with AU-14. For a wrong password, the response and UI are identical for banned and non-banned accounts.
25. A successful password reset revokes every other session: a second signed-in browser is signed out on its next request (session expired dialog, SY-08).
26. No string on these screens is hardcoded; every string has an fa and en entry; no raw API `message` or English text appears in fa.
27. Contrast of all text ≥ 4.5:1 in both color themes (automated check).

**SMS off mode (§3.5).** Run with `sms.enabled` false, and criteria 3–12 and 18–19 again with it true.

28. With SMS off, AU-02 → "Continue" → `200 {sms: false, verification_token}` lands on AU-04 without rendering AU-03. No screen or announcement says a code was sent or a number was verified.
29. With SMS off, AU-04 shows "Step 2 of 2", the full mobile number in `<bdi dir="ltr">`, `auth.account.phoneCheck`, and a "Change" button. Change and Back return to AU-02 with the phone and both checkboxes kept.
30. Back to AU-02 and "Continue" again with the same phone within 10 minutes of the token goes to AU-04 **without** a new `POST auth/otp` (network log). A changed phone sends a new request.
31. With SMS off, `AUTH_PHONE_TAKEN` and `AUTH_OTP_RATE_LIMITED` on AU-02 behave exactly as with SMS on (criteria 5 and 6).
32. With SMS off, `AUTH_VERIFICATION_INVALID` on register shows `auth.verification.expiredNoSms`. One tap on "Continue" sends `POST auth/otp` then `POST auth/register` with the same username, password, and referrer, and nothing is sent without that tap.
33. If SMS is switched on between AU-02 and a token renewal, the renewal's `202` routes to AU-03, and after verification AU-04 keeps the username and referrer with the password cleared.
34. Opening `/signup/verify` directly with SMS off redirects to `/signup/account` when a valid token is in this tab, else to `/signup`. `/password/reset/verify` and `/password/reset/new` without state redirect to `/password/reset`.
35. With SMS off, AU-07 "Get code" → `503 SMS_UNAVAILABLE` replaces the form with AU-07U. Focus moves to its heading. It shows the support channel, "Back to log in" (phone kept, not in the URL), and "Try again". The response and panel are identical for registered and unregistered numbers.
36. "Forgot password?" on AU-06, the `AUTH_LOCKED` "Reset password" link, and "Change password" in `/settings` all reach AU-07U while SMS is off. None of them is hidden or disabled.
37. AU-02 while the mode is unknown shows `auth.signup.phoneNote`, "Continue", and "Step 1", never "We'll text a code".
38. All added keys (§7, SMS off amendment) exist in fa and en. `SMS_UNAVAILABLE` never shows raw text or the English message in fa.

---

## 10. Open questions

1. **Countdown values.** Please return `expires_in` (seconds) and `resend_after` (seconds) in the `202` body of `POST auth/otp`. Without `resend_after`, the UI allows resend only after the code expires (120 s), which is slow when an SMS is lost. Recommended `resend_after`: 60 s, as a setting.
2. **SMS failure visibility.** Sending runs in Celery (sms.md §6), so `POST auth/otp` returns `202` even when IPPanel fails. Should the endpoint fail fast with `errors.sms.unavailable` when the provider is known to be down (e.g., the last N sends failed, or credit is below the threshold)? Otherwise users wait for a code that never comes, and the only help is the "Didn't get the code?" tips.
3. **Language at registration.** `POST auth/register` has no `lang`. Recommended: accept an optional `lang` (the UI locale at signup), so the first SMS and admin views use it. Until then, the client sends `PATCH me {lang}` right after registering.
4. **Username feedback.** (a) Can `USERNAME_INVALID` include `details.reason` (`length`, `chars`, `start`, `not_allowed`)? The UI then shows a specific fix. (b) Can an availability endpoint be added (e.g., `GET auth/username-available?username=`, rate-limited)? P§12 asks for a live check, and `USERNAME_TAKEN` on submit forces a retry loop. (c) Is there a suggestion list when a name is taken (J1 edge case)?
5. **Expired verification token.** Which error code does `POST auth/register` or `POST auth/password/reset` return when `verification_token` is expired or invalid (e.g., `AUTH_VERIFICATION_EXPIRED`)? The UI needs a stable code.
6. **Change password while signed in.** No endpoint exists for a signed-in password change. Proposal: allow the reset flow (AU-07 to AU-09) for signed-in users, with the phone prefilled from `me`, so `/settings` → "Change password" works. The IA marks these routes guest-only today; this would relax that rule for these three routes.
7. **Banned error code (decided: banned users cannot sign in, §12.1).** Today `User.is_active` is false for banned users, so Django authentication would fail with `AUTH_INVALID_CREDENTIALS`. The banned user would then think they forgot their password and loop through reset. Please:
   - Return a distinct code (proposed `ACCOUNT_BANNED`, `message_key` `account.banned.body`) **only after the password matches**.
   - Return the same code from `POST auth/password/reset` for a banned account (after the code is verified), and from `POST auth/refresh` and authenticated calls when a user is banned mid-session.
8. **Logout scope.** Does `POST auth/logout` revoke only this session's refresh token? What user-scoped data does the service worker cache (for example API responses), so logout can clear it on shared devices?
9. **Public config for guests.** AU-04 needs `username.change_cost` before sign-in. Is there (or can there be) a public, cacheable `GET config` returning the client-visible settings (e.g., `username.change_cost`, `otp.ttl_seconds`)?
10. **Referral link format.** The API takes a referrer **username**, while journeys.md J1 shows a code (`?ref=AB12CD`). This spec treats `ref` as a username. Is that final? If users change their username (profile.md), old referral links break; a stable referral code would avoid that.
11. **Lock and reset.** Does a successful password reset clear the 15-minute login lock? The locked state links to reset, so the answer changes the copy.
12. **Suspension details in `me`.** AU-13 needs `status`, `suspended_until` (null = indefinite), and optionally a reason category key (e.g., `fair_play`, `payment`, `terms`) mapped to i18n. Can `GET me` return these? Free-text admin reasons must not be shown to users.
13. **Username change and shop items while suspended.** §12.1 blocks "buy". Does that include coin spends that aren't purchases (username change, shop items)? This spec and profile.md treat every coin spend as blocked while suspended; please confirm.

Open questions 1, 5, and 7 are answered by the current API (§3.5.4). Questions 14–18 come from the SMS off amendment.

14. **Public SMS-mode flag.** The client only learns the mode from `POST auth/otp`, so AU-02 must use neutral copy and AU-07 asks for a phone number before saying reset is unavailable. Please expose it before sign-in, for example `GET config` → `{sms_enabled: bool}` (this could be the same public config as open question 9). Then AU-02 shows exact copy and steps, and AU-07 opens directly on AU-07U.
15. **Support can't restore access.** With SMS off, AU-07U sends locked-out users to support, but the admin API has no way to reset a player's password or issue a one-time reset. Is a support tool planned (for example, an admin-issued reset link with audit)? Otherwise the support route is a dead end in practice.
16. **Unverified numbers and squatting.** With SMS off, anyone can register any number. The real owner then gets `AUTH_PHONE_TAKEN` and can't reset. Also, the signup bonus is granted to unverified numbers, keyed by phone (§7.10 says "once its phone is verified"). Options: hold the bonus until the phone is verified; mark accounts `phone_verified: false` and ask them to verify when SMS turns on; or allow a verified owner to reclaim a number. Please decide. The UI can add a "Verify your number" step to `/me` once there is an endpoint and a flag in `me`.
17. **Mode flips mid-flow.** The UI relies on the server honoring an SMS-off token after SMS is switched on, and an SMS-on code after it is switched off (§3.5.2 step 8). Please confirm both remain valid until they expire, and add a test.
18. **Login lock while reset is off.** With SMS off, a locked user's only way forward is waiting 15 minutes. Is that acceptable for launch, or should the lock be shorter while `sms.enabled` is false?
