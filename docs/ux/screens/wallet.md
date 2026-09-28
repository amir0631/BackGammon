# Wallet: balance, history, get coins, transfer, bank account, withdrawal

Status: draft for UI build (CLAUDE.md §17 step 3).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §2 rules 2–5, 8, 11; §7.1, §7.2, §7.9–§7.13; §10.1, §10.2 (Wallet); §11.3; §11.7; §12.1 (suspended, banned); §14 (`transfer.*`, `withdraw.*`, `coin.price_toman`, `bonus.signup_coins`); §18 (SMS off switch); §21.2; `sms.md` §1; ia.md §1–§3; patterns.md (P§) 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 16, 17, 18; journeys.md J3a, J7, J8; auth.md (AU-03 code input, AU-13 suspension); profile.md (AC-01 wallet row, AC-05 "Send coins").
Screen IDs follow screen-inventory.md §2.7. This spec replaces the planned `transfer.md` and `withdrawal.md`: the wallet, transfer, and withdrawal screens ship together in step 3 and share one error map (§3.9).

**API (implemented; field names are the contract):**

| Call | Response / notes used by this spec |
| --- | --- |
| `GET wallet` | `WalletSummary`: `balance` (available coins), `locked` (coins in pending withdrawals, already out of `balance`), `bonus_locked`, `withdrawable`, `transferable`, `transfer` and `withdraw` (`RollingWindow`: `daily_max`, `used_24h`, `remaining`, `next_available_at`, `min`, `fee_pct`), `withdraw.confirm` (`"sms"` or `"password"`), `coin_price_toman` |
| `GET wallet/ledger?cursor=` | `{results: LedgerRow[], next}`, newest first, 30 per page. `LedgerRow`: `id`, `type`, `amount` (signed, for this user), `created_at`, `counterparty` (username, transfers only), `ref_type`, `ref_id` |
| `GET users/{username}` | `PublicUser` (`username`, `avatar`, `elo`, `level`, `created_at`). Case-insensitive. Banned users → `404`. Used for the recipient card. |
| `POST wallet/transfer {username, amount, password}` + `Idempotency-Key` | `TransferResult {tx_id, balance, fee, received}`. A retry with the same key returns the original result and moves nothing. |
| `GET me/bank-accounts` | `{results: [BankAccountInfo] or [], next: null}`. `BankAccountInfo`: `id`, `iban` (masked `IR82******************9002`), `bank_code`, `bank {fa, en}` |
| `POST me/bank-accounts {iban}` | `201 BankAccountInfo`. Creates or **replaces** the only account. |
| `DELETE me/bank-accounts/{id}` | `204` |
| `POST wallet/withdrawals/otp` | `202 {expires_in, resend_after}`. SMS mode only. |
| `POST wallet/withdrawals {amount, code}` or `{amount, password}` + `Idempotency-Key` | `201 Withdrawal`. The same key again → `200` with the existing request. |
| `GET wallet/withdrawals` | `{results: Withdrawal[], next: null}`: the latest 100, newest first, not paginated |
| `GET wallet/withdrawals/{id}` | `Withdrawal`: `id`, `amount`, `fee`, `payout_toman`, `status` (`pending`, `paid`, `rejected`, `cancelled`), `expected_by` (date `YYYY-MM-DD`), `bank` (`BankAccountInfo`, masked), `bank_reference`, `reject_reason`, `created_at`, `decided_at` |
| `DELETE wallet/withdrawals/{id}` | `200 Withdrawal` with `status: cancelled` |

Server rules the UI relies on (from `backend/wallet/services.py`):

- **Welcome-coin lock:** `bonus_locked` = min(`balance`, signup-bonus coins) until the account has any `purchase` or `admin_topup` credit; then 0. `withdrawable` = `transferable` = `balance` − `bonus_locked`.
- **Transfer fee:** `fee` = floor(`amount` × `transfer.fee_pct` / 100). The sender pays `amount`, and the recipient receives `amount` − `fee`.
- **Withdrawal fee and payout:** `fee` = floor(`amount` × `withdraw.fee_pct` / 100), and `payout_toman` = (`amount` − `fee`) × `coin_price_toman`. The rate is fixed at request time.
- **Rolling windows:**
  - The transfer window counts sent transfers in the last 24 hours.
  - The withdrawal window counts pending and paid requests in the last 24 hours (cancelled and rejected ones don't count).
  - `next_available_at` is when the oldest counted item leaves the window.
- **`expected_by`:** the next Iranian working day after the request. Fridays are skipped; official holidays are not modelled yet (open question 3).
- **Suspended accounts:**
  - Can't transfer (`ACCOUNT_SUSPENDED`).
  - Can add, change, or remove the bank account, request withdrawals, and cancel them (§12.1).
- **Password confirmation (transfer, and withdrawal while SMS is off):**
  - A wrong password returns `401 AUTH_INVALID_CREDENTIALS`.
  - After `auth.login_max_failures` wrong passwords, the next attempt returns `429 AUTH_LOCKED {retry_after}`.
  - The counter is separate per action (`transfer`, `withdraw`) and separate from the login lock.

---

## 1. Goal and user story

- As a player (P1 Reza, P4 Ali), I want to see at a glance how many coins I can use, how many are on hold, and how many I can send or withdraw, with a plain reason when those numbers differ.
- As a player, I want a complete, readable history of every coin movement, including who sent me coins (by username, never by phone).
- As a new player, I want to know how to get coins while online purchase isn't available: through support, which tops up my account.
- As a player, I want to send coins to a friend by username, see the fee and exactly what they receive before confirming, and be protected from sending to the wrong person or sending by accident.
- As a player, I want to cash out to my bank account: register my Sheba once, request an amount, see the toman I will receive and when, confirm safely, follow the status, and cancel while it's pending.

Success means:
- No coin movement happens without the user seeing the amount, the fee, and the balance after.
- No error leaves the user without a next step.
- Withdrawing is never harder than getting coins (P§9.2).

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Balance chip (every signed-in, non-immersive screen) | WA-01 `/wallet` |
| Account hub wallet row (profile.md AC-01) | WA-01 |
| "Send coins" on another player's public profile (profile.md AC-05) | TR-01 `/wallet/transfer?to=<username>` |
| WA-01 actions: Get coins · Send coins · Withdraw | WA-04 sheet · TR-01 · WD-02 (or WD-01 when not eligible) |
| WA-01 links: Withdrawal requests · Bank account | WD-06 `/wallet/withdrawals` · WD-08 `/wallet/bank-accounts` |
| Account hub (bank account row) | WD-08 |
| "Get coins" in the insufficient-coins sheet (play.md PL-05, later steps) | WA-04 in step 3; `/shop/coins` once `coins-purchase.md` ships (step 9) |
| Withdrawal SMS or Account-tab dot (withdrawal status changed) | WD-07 `/wallet/withdrawals/[id]` |
| Guest opening any route here | `/login?next=<path>` |

| Exit | Destination |
| --- | --- |
| Back from WA-01 | The previous screen in the Account tab stack (or AC-01) |
| Close (×) in a task flow with no input | WA-01 (or the origin, e.g. the public profile for `?to=`) |
| Close (×) or Back from step 1 with input entered | TR-05 / WD-10 "Discard?" dialog |
| Transfer receipt "Done" | WA-01 |
| Withdrawal submitted | WD-07 for the new request (replaces the flow in history, so Back goes to WA-01, never into the flow) |
| Back after a completed transfer or withdrawal | WA-01; never re-submits (ia.md §3.5) |

---

## 3. Flow

### 3.1 Wallet home load and refresh (WA-01)

1. Open `/wallet` → `GET wallet` and `GET wallet/ledger` in parallel. Also `GET wallet/withdrawals` (for the pending summary) and `GET me/bank-accounts` (for the bank row); both are small.
2. **Refresh triggers:** opening `/wallet`, the app regaining focus (`visibilitychange`), the connection coming back online, pull-to-refresh (touch), and returning from any flow in this spec. There is no polling timer.
3. The balance chip always shows `balance` (available). It updates in place from `GET wallet` or `TransferResult.balance` and announces the change once (ia.md §3.2). It never animates to attract attention (P§8).
4. The WA-01 summary shows server values only:

   | Line | Shown when | Source |
   | --- | --- | --- |
   | Available (large) | Always | `balance`, plus the toman equivalent `balance × coin_price_toman` as secondary text |
   | On hold for withdrawals | `locked` > 0 | `locked`, with a link to WD-06 |
   | Welcome coins (can't be sent or withdrawn yet) | `bonus_locked` > 0 | `bonus_locked`, with an expandable explanation (§4 WA-01) |
   | Can be sent or withdrawn | `bonus_locked` > 0 and `transferable` = `withdrawable` | that value |
   | Can be sent now / Withdrawable now (two lines) | the two differ (not possible today; future-proof) | `transferable`, `withdrawable` |

5. When `bonus_locked` is 0 and `locked` is 0, only "Available" is shown. There are no redundant zero rows.

### 3.2 History and transaction detail (WA-01 list, WA-02)

1. The first page comes from `GET wallet/ledger`. Rows are grouped by local calendar day: "Today", "Yesterday", then the date (Jalali in fa).
2. At the end of the list, a "Show more" button calls `GET wallet/ledger?cursor=<next>`. It appends rows, and focus stays on the first new row. There is no infinite auto-load (predictable for keyboard and screen-reader users, and cheap on weak 4G). When `next` is null, show `wallet.history.end`.
3. **Row content:**
   - Type icon (decorative)
   - Type label (§7 `wallet.tx.*`). For transfers, the label includes the counterparty: «ارسال به @ali_tbz» / «دریافت از @ali_tbz». The direction comes from the sign of `amount`.
   - Time
   - Signed amount: «+۲۰۰» or «−۱۰۰», with a coin icon
   - The sign plus the label carries the meaning, never color alone (P§13)
4. Tap a row → **WA-02** transaction detail (sheet at `sm`; side panel at `md`/`lg`). It shows:
   - Type label, signed amount, and the date and time
   - Counterparty username (transfers), linking to `/profile/[username]`
   - A plain one-line note for the types that need one (§7 `wallet.detail.note.*`)
   - A link to the related object, by `ref_type`:

     | `ref_type` | Link |
     | --- | --- |
     | `withdrawal` | `/wallet/withdrawals/[ref_id]` |
     | `user` on a transfer | The counterparty's profile |
     | `match`, `tournament`, `prediction` | Their screens, once those features ship (steps 8, 12, 13). Until then, no link. |
     | `admin` and any other value | No link, and `ref_id` is never displayed (it is an admin id; open question 12) |

   - **Reference:** the ledger row `id`, copyable, labelled "Reference" for support conversations.
5. **Unknown type** (a type added later that the catalog doesn't know) → the label `wallet.tx.unknown` "Transaction", with the raw type in small monospace text. It is never hidden.

### 3.3 Get coins while online purchase is unavailable (WA-04)

1. "Get coins" on WA-01 opens the **WA-04 sheet** (step 3). The gateway doesn't exist yet (§7.11, §18). This is the step-3 home of the "support top-up" content from journeys.md J3a. When `coins-purchase.md` ships (step 9), "Get coins" navigates to `/shop/coins` instead, whose CO-02 state reuses the same content component.
2. The sheet content, in order (J3a):
   1. Status line: online purchase isn't available yet
   2. Rate: 1 coin = {`coin_price_toman`} toman
   3. How to get coins now: contact support (`support.contact.channel`); support can add coins to your account
   4. What to tell support: your username (shown, with a copy button) and the number of coins you want. The phone number is never shown or asked for here.
   5. Other ways to get coins: only those that exist in the current step. In step 3 that is "a friend can send you coins". Winning matches and level rewards are added when those features ship.
   6. Safety: support never asks for your password or SMS code
   7. Close
3. Neutral copy only. No urgency, no amounts suggested, no pre-selected package (P§9).
4. **Suspended:** "Get coins" is disabled on WA-01, with `account.suspended.actionBlocked` and "Details" (AU-13 lists "Buying coins" as unavailable).

### 3.4 Transfer (TR-00 → TR-01 → TR-02 → TR-03 → TR-04)

The task flow is at `/wallet/transfer`. The nav is hidden; there is a close (×) button and "Step n of 3" (P§1).

0. **Eligibility check** on entry, from a fresh `GET wallet` and `me.status`. If any row below matches, show **TR-00** instead of step 1:

   | Condition | TR-00 variant |
   | --- | --- |
   | `me.status` = `suspended` | Suspended: `transfer.unavailable.suspended.*` + "Details" → `/account/status` |
   | `transferable` < `transfer.min` and `bonus_locked` > 0 | Nothing sendable yet (welcome coins): `transfer.unavailable.bonus.*` + "?" → `/help/transfers` |
   | `transferable` < `transfer.min` otherwise | Below the minimum: `transfer.unavailable.belowMin.*` (the minimum and what you have) |
   | `transfer.remaining` < `transfer.min` | 24-hour limit reached: `transfer.unavailable.limit.*` with `next_available_at` |

   TR-00 has one action: "Back to wallet". It never suggests buying coins (P§9.1).
1. **TR-01 Recipient.**
   1. The username field starts empty, or holds `?to=` (the lookup then runs at once). The amount is never prefilled (ia.md §2).
   2. After typing stops for 400 ms, if the value has 3–20 characters → `GET users/{username}`. Before sending, the client trims spaces and strips one leading `@`.
      - `200` → the **recipient card**: avatar, canonical username, and level, under the heading "Check the recipient" with `transfer.recipient.checkBody`.
      - `404` → field error `transfer.recipient.notFound`.
      - The lowercased value equals `me.username` → field error `transfer.recipient.self`, and no request is sent.
      - Network error → field error `transfer.recipient.lookupError` with Retry.
   3. The primary button "Yes, this is the right person" is enabled only while a card is shown for the current text. Editing the field clears the card.
   4. There is no autocomplete and no list of users (P§12, anti-enumeration).
2. **TR-02 Amount.**
   1. The field starts empty (P§2.2). The helper lines are shown before typing:
      - Minimum: `transfer.min`
      - Left in the last 24 hours: `transfer.remaining` of `transfer.daily_max`
      - Can be sent now: `transferable`
   2. **Live preview** once the value is a valid integer:
      - Fee = floor(amount × `transfer.fee_pct` / 100)
      - Recipient receives = amount − fee
      - Toman equivalent of the amount (open question 13)
   3. **Client checks**, in this order, on blur and on Continue:
      1. Empty → `transfer.amount.error.required`
      2. Not a whole number above 0 → `.invalid`
      3. Below `min` → `.belowMin`
      4. Above `balance` → `.aboveBalance`. No shop link (P§9.1).
      5. Above `transferable` → `.notTransferable`, with the welcome-coin reason
      6. Above `remaining` → `.limit` + `.limitNext` (`next_available_at`)
   4. Continue is disabled with a visible reason until the value passes.
3. **TR-03 Review and password.**
   1. Cost block (P§2.1), all rows always shown:

      | Row | Value |
      | --- | --- |
      | Recipient | The recipient card (compact) |
      | Amount | Coins, plus the toman equivalent as secondary text |
      | Fee | Shown even when 0 |
      | Recipient receives | amount − fee |
      | Your balance | `balance` |
      | Balance after | `balance` − amount |

   2. Notes: `transfer.review.irreversible` and `transfer.review.safety`.
   3. The password field (empty, `autocomplete="current-password"`) sits directly above the button (P§2.6).
   4. The button reads "Send {amount} coins", disabled with the reason "Enter your password" until the field is filled.
   5. A **new `Idempotency-Key`** is created when TR-03 is first shown for a given recipient and amount. It is kept for every retry of that exact action and replaced only when the recipient or amount changes.
   6. Submit → `POST wallet/transfer`. In-flight: spinner, the step can't be left, and repeat taps are ignored (P§2.2).
   7. **Success** → TR-04, with the balance chip set from `result.balance`.
   8. Errors → §3.9.
   9. **No response in 10 s** → "Still working…" + "Check status".
      - "Check status" re-sends the **same** request with the **same** key and the password still held in memory. The server returns the original result if the transfer was posted, or performs it exactly once if not. It can't create a second transfer.
      - Until a definite answer (success or a coded error) arrives, Back, Close, and editing are disabled, with the reason "Checking your transfer…".
4. **TR-04 Receipt.**
   - Title "Sent"
   - "{amount} coins sent to @user"
   - Fee and "recipient received" (`result.fee`, `result.received`)
   - New balance (`result.balance`)
   - Time: the local time the success arrived, formatted Jalali in fa (open question 7)
   - Transaction ID (`tx_id`, copyable)
   - "Done" → WA-01
   - The password and the key are discarded.
   - Back from TR-04 goes to WA-01.
5. **Discard** (TR-05): Close or Back on step 1 after typing, or Close on steps 2–3 → dialog "Discard this transfer? Nothing has been sent or charged." Choices: "Discard" or "Keep going" (initial focus). Back on steps 2–3 goes to the previous step with entries kept and the password cleared (ia.md §3.5).

### 3.5 Bank account (WD-08, and inside WD-02)

One Sheba per user (§7.12). The same form component is used on `/wallet/bank-accounts` and inline in withdrawal step 1.

1. `GET me/bank-accounts`:
   - Empty → the empty state (P§5) with the add form.
   - One → the account card:
     - Bank name in the UI language (`bank.fa` / `bank.en`)
     - The masked Sheba: `*` rendered as `•`, grouped in 4s, LTR: `IR82 •••• •••• •••• •••• ••90 02`
     - Actions: "Change" and "Remove"
2. **Add or change form:**
   - A fixed `IR` prefix plus an input for 24 digits (`inputmode="numeric"`, `dir="ltr"`, grouped in 4s on display).
   - Paste works with or without `IR`, with spaces or dashes, and with Persian or Arabic-Indic digits (P§12).
   - Client validation on blur and on Save, in order:
     1. Length → `bank.error.format`
     2. ISO 13616 mod-97 checksum → `bank.error.checksum`
     3. Known bank code → `bank.error.bank`, only if the client has the bank list (open question 10)
   - When valid and the bank is known, show "Bank: {name}" under the field, as a check the user can confirm at a glance.
   - Helper: `bank.field.helper`. There is no holder-name field and no "verifying" state: the declared Sheba is accepted as the user's own.
3. **Save:**
   - **No account yet** → `POST me/bank-accounts {iban}` → `201` → card + snackbar `bank.saved`.
   - **Replacing an account** → first a confirmation dialog `bank.change.*` showing the old masked Sheba, then `POST`. The API replaces the account in place.
   - Errors:
     - `IBAN_INVALID {reason: format|checksum|bank}` → the matching field error.
     - `BANK_ACCOUNT_LOCKED` → the locked state below.
     - Network error → action error + Retry. Retry re-reads `GET me/bank-accounts` first; if the new account is already saved, show it as saved.
4. **Remove** → dialog `bank.remove.*` → `DELETE me/bank-accounts/{id}` → `204` → empty state + snackbar `bank.removed`. `BANK_ACCOUNT_LOCKED` → locked state.
5. **Locked while a withdrawal is pending:**
   - "Change" and "Remove" are disabled (still focusable), with `bank.locked` and the link "View pending request" to the oldest pending WD-07.
   - Known from `GET wallet/withdrawals` (any `pending`) before the user tries, and from `BANK_ACCOUNT_LOCKED` if a race happens.
6. Suspended accounts can add, change, and remove (§12.1: withdrawals are allowed).

### 3.6 Withdrawal request (WD-01 → WD-02 → WD-03 → WD-04 → [WD-05] → WD-07)

The task flow is at `/wallet/withdraw`. The nav is hidden; there is a close (×) button.
- **SMS mode** (`withdraw.confirm` = `"sms"`): "Step n of 4" (bank, amount, review, code).
- **Password mode** (`"password"`, while `sms.enabled` is off): "Step n of 3" (bank, amount, review with password).

0. **Eligibility check** on entry, from a fresh `GET wallet`. If any row matches, show **WD-01** instead of step 1:

   | Condition | WD-01 variant |
   | --- | --- |
   | `withdrawable` < `withdraw.min` and `bonus_locked` > 0 | Nothing withdrawable yet: "Withdrawable now: {withdrawable} of {balance}", the welcome-coin reason, "?" → `/help/withdrawals` (P§2.5) |
   | `withdrawable` < `withdraw.min` otherwise | Below the minimum: `withdraw.unavailable.belowMin` (the minimum and what you have). If `locked` > 0, add "Coins on hold for pending withdrawals aren't counted." |
   | `withdraw.remaining` < `withdraw.min` | 24-hour limit reached, with `next_available_at`. Cancelling a pending request frees its share of the limit: link to WD-06. |
   | Account blocked by antifraud | Not implemented yet (step 14); future error code (open question 9). Copy is ready: `withdraw.unavailable.blocked`. |

   WD-01 has one action: "Back to wallet". It never shows a shop link.
   A suspended account passes this check: withdrawals are allowed (§12.1), and the suspension banner stays visible.
1. **First-time hint** (P§14), shown once per account on step 1 and dismissible:
   - `withdraw.hint.body` (manual payment within one working day; cancel while pending)
   - Plus `withdraw.hint.sms` only in SMS mode. With SMS off there is no paid SMS (§18), so the UI never promises one.
2. **WD-02 Bank account.**
   - None registered → the add form inline (§3.5), with "Save and continue".
   - Registered → the card with "Change" (the inline form, then the replace confirmation) and "Continue".
   - There is no choice between accounts; there is only one.
   - Change blocked while a withdrawal is pending → the §3.5 step 5 locked state. The user can still continue with the current account.
3. **WD-03 Amount.**
   1. The field starts empty. The helper lines are shown before typing:
      - Minimum: `withdraw.min`
      - Left in the last 24 hours: `withdraw.remaining` of `withdraw.daily_max`
      - Withdrawable now: `withdrawable`
   2. Quick chip "Maximum ({n})", where n = min(`withdrawable`, `withdraw.remaining`). It is not active by default (P§2.2) and fills the field when tapped.
   3. **Live preview:**
      - Fee = floor(amount × `withdraw.fee_pct` / 100) coins
      - Paid to your bank = (amount − fee) × `coin_price_toman`, in toman
   4. **Client checks**, in order:
      1. Required
      2. Whole number above 0
      3. Below `min`
      4. Above `balance` → `.aboveBalance`
      5. Above `withdrawable` → `.notWithdrawable`, with the welcome-coin reason when `bonus_locked` > 0
      6. Above `remaining` → `.limit` + `.limitNext`
4. **WD-04 Review.**
   1. Cost block (P§2.1, P§2.5):

      | Row | Value |
      | --- | --- |
      | Amount | Coins |
      | Fee | Coins, shown even when 0 |
      | Paid to your bank | Toman, with `withdraw.review.rate` ("at today's rate … fixed when you submit") |
      | Bank card | Masked |
      | Your balance | `balance` |
      | Balance after | `balance` − amount |

   2. **Timing:** `withdraw.review.timing`. The server doesn't yet return an expected date before submitting (open question 3), so the review states the rule and says the exact date appears after submitting. It never computes a date on the client.
   3. Notes:
      - `withdraw.review.cancelNote`
      - The notify line: `withdraw.review.notifySms` in SMS mode, `withdraw.review.notifyApp` in password mode
      - `withdraw.review.safety`
   4. A **new `Idempotency-Key`** is created when WD-04 is first shown for a given amount. It is kept across retries and code resends, and replaced only when the amount changes.
   5. **Password mode:**
      - The password field sits above the button.
      - Button: "Request withdrawal of {amount} coins" → `POST wallet/withdrawals {amount, password}`.
   6. **SMS mode:**
      - Button: "Send confirmation code".
      - **First**, re-validate: `GET wallet`, then check the amount against the fresh `withdrawable`, `remaining`, and `min`. If it no longer passes, go back to WD-03 with the field error, and no code is sent. Reason: the server checks the code **before** the limits and consumes it (open question 1).
      - Then `POST wallet/withdrawals/otp` → `202` → WD-05.
      - Errors:
        - `429 AUTH_OTP_RATE_LIMITED` → action error with a countdown from `retry_after`.
        - `503 SMS_UNAVAILABLE` → re-fetch `GET wallet`. If `withdraw.confirm` is now `"password"`, switch the review to password mode in place, with the notice `withdraw.review.smsOff`. Otherwise show `errors.auth.smsUnavailable` with Retry.
5. **WD-05 SMS code** (SMS mode only).
   - The same code component as auth.md AU-03 (§6.3 there): 5 boxes, auto-submit on the 5th digit, paste and WebOTP.
   - Copy: "We sent a 5-digit code to {masked phone}" (P§18: `0912•••••89`, derived from `me.phone`), then `withdraw.code.nothingHeld`.
   - The validity countdown uses `expires_in`. Resend becomes available after `resend_after`.
   - Submit → `POST wallet/withdrawals {amount, code}` with the WD-04 key.
   - "Back to review" returns to WD-04 without holding anything. The code is cleared.
   - Code errors:
     - `AUTH_OTP_INVALID {attempts_left}` → field error with the tries left; the field is cleared.
     - `attempts_left` = 0, or `AUTH_OTP_EXPIRED` → field disabled, with "Get a new code" as the only action.
6. **Success** (`201`, or `200` when the key was already used) → `history.replace` to **WD-07** `/wallet/withdrawals/[id]`, with the banner `withdrawals.detail.submitted`, status Pending, and "Expected by {expected_by}". The balance chip refreshes from `GET wallet`.
7. **Errors after the code or password was accepted** (SMS mode: the code is now used up):
   - `WITHDRAW_BELOW_MIN`, `WITHDRAW_LIMIT`, `WITHDRAW_NOT_WITHDRAWABLE`, `AMOUNT_INVALID` → WD-03 with the field error. In SMS mode, also `withdraw.code.used`.
   - `NO_BANK_ACCOUNT` → WD-02 with `errors.wallet.noBankAccount`.
   - The whole map is in §3.9.
8. **No response in 10 s** → "Still working…" + "Check status". This re-sends the same body with the same key: the server returns the existing request if one was created (it checks the key before the code). Back and Close are disabled until the answer is definite.
9. **Confirmation mode changed between GET wallet and submit** (`VALIDATION` with `details.fields.code` or `details.fields.password`) → re-fetch `GET wallet`, switch WD-04 to the current mode with `withdraw.review.modeChanged`, and keep the amount.
10. **Discard** (WD-10): the same rule and copy as TR-05: "Nothing has been held or charged."

### 3.7 Withdrawal requests, detail, and cancel (WD-06, WD-07, WD-09)

1. **WD-06** `/wallet/withdrawals`: `GET wallet/withdrawals`, newest first. Each row shows:
   - Amount (coins)
   - "Paid to your bank" (toman)
   - Status chip (icon plus text)
   - Requested date
   - For pending rows: "Expected by {date}"
   When 100 rows are returned, a footer says only the latest 100 are shown (open question 5).
2. **WD-07** `/wallet/withdrawals/[id]`: `GET wallet/withdrawals/{id}`.
   - **Status timeline** (P§6.2):
     1. Requested: `created_at`
     2. Waiting for payment: "expected by {expected_by}"
     3. One of: Paid (`decided_at`, `bank_reference` copyable), Rejected (`decided_at`, `reject_reason`), or Cancelled (`decided_at`)
   - **Facts:** amount, fee, paid to your bank (toman, fixed at request time), and the bank card (masked).
   - **Pending past the expected date:** when today's date in Asia/Tehran is after `expected_by`, add the neutral note `withdrawals.detail.late` (P§2.5). No alarm styling.
   - **Rejected:** `reject_reason` is shown as written, labelled "Reason", with the line `withdrawals.detail.returned`. The reason is admin free text and may not be in the user's language (open question 11).
   - **Pending:** "Cancel request" (secondary, not destructive red; text plus icon).
   - `404` → screen error `withdrawals.notFound` with "Back to requests".
3. **Cancel** → **WD-09** sheet `withdrawals.cancel.*` ("{amount} coins go back to your balance"). Buttons: "Cancel withdrawal" and "Keep request" (initial focus).
   - `DELETE wallet/withdrawals/{id}` → `200` → WD-07 shows Cancelled + snackbar `withdrawals.cancel.done`; the balance chip refreshes.
   - `WITHDRAWAL_NOT_PENDING {status}` → close the sheet and re-fetch. Show the current status with `withdrawals.cancel.alreadyPaid`, `.alreadyRejected`, or `.alreadyCancelled` (journeys.md J8).
   - In flight: the sheet can't be dismissed. After 10 s with no response, "Check status" re-fetches `GET wallet/withdrawals/{id}`.
4. On `md`/`lg`, WD-06 and WD-07 are list plus detail (ia.md §3.3). The URL follows the selection.

### 3.8 Incoming coins and status notices (WA-03, Account dot)

1. The client stores the newest ledger `id` it has shown, per account, in localStorage (`bg.wallet.lastSeenLedgerId.{userId}`). On the first load for an account, it only records the value and shows nothing.
2. On any §3.1 refresh where `balance` or `locked` changed, fetch the first ledger page and look at rows newer than the stored id:
   - One positive `transfer` → snackbar `wallet.notice.transferIn` "@{username} sent you {amount} coins", with "View" (opens WA-02).
   - `admin_topup` → `wallet.notice.topup`.
   - `withdrawal_refund` → `wallet.notice.refund`.
   - More than one qualifying row → a single snackbar `wallet.notice.many` ("{count} new transactions") with "View" (→ WA-01).
   - Other types (match payouts and so on) get their feedback in their own feature; no snackbar here.
3. **Withdrawal decisions:** when a request the client last saw as pending is now `paid` or `rejected`, the Account tab shows a dot (ia.md §3.1) until WD-07 of that request is opened. The dot's screen-reader label is `nav.badge.withdrawal`.
4. Snackbars never appear during a match or a task flow; they wait until the user is on a regular screen (P§1). No sound and no haptics (P§8).

### 3.9 Error map (every code the wallet endpoints return)

The catalog key is the backend `message_key` (fallback text). The screen uses the contextual key when one is given. Unknown codes → `errors.generic` plus the code in small text (P§4.2).

| Code (HTTP) | Endpoint | Where and what the UI does | Catalog key | Contextual key |
| --- | --- | --- | --- | --- |
| `ACCOUNT_SUSPENDED` (403) | transfer | Switch to TR-00 suspended; re-fetch `GET me` so the banner appears | `errors.wallet.accountSuspended` | `transfer.unavailable.suspended.title` |
| `AMOUNT_INVALID` (400) | transfer, withdrawals | Back to the amount step, field error | `errors.wallet.amountInvalid` | `transfer.amount.error.invalid` / `withdraw.amount.error.invalid` |
| `AUTH_INVALID_CREDENTIALS` (**401**) | transfer, withdrawals (password mode) | Field error on the password; the field is cleared and focused. **Not** a session error: the global 401 handler must only act on `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` (open question 4). | `errors.auth.invalidCredentials` (login wording; never shown here) | `wallet.password.wrong` |
| `AUTH_LOCKED {retry_after}` (429) | transfer, withdrawals (password mode) | Action error with a live countdown; the button is disabled until 0. The unlock time is kept in sessionStorage per action. | `errors.auth.locked` | `wallet.password.locked` |
| `TRANSFER_RECIPIENT_NOT_FOUND` (404) | transfer | Action error on TR-03 `transfer.review.recipientGone` + "Change recipient" (→ TR-01, amount kept) | `errors.wallet.transferRecipientNotFound` | `transfer.review.recipientGone` |
| `TRANSFER_SELF` (400) | transfer | TR-01 field error (normally caught before sending) | `errors.wallet.transferSelf` | `transfer.recipient.self` |
| `TRANSFER_BELOW_MIN {min}` (400) | transfer | TR-02 field error with the server `min`; re-fetch `GET wallet` | `errors.wallet.transferBelowMin` | `transfer.amount.error.belowMin` |
| `TRANSFER_NOT_TRANSFERABLE {transferable, bonus_locked}` (409) | transfer | TR-02 field error with both values; re-fetch `GET wallet` | `errors.wallet.transferNotTransferable` | `transfer.amount.error.notTransferable` |
| `TRANSFER_LIMIT {remaining, next_available_at}` (409) | transfer | TR-02 field error with `remaining` and the time | `errors.wallet.transferLimit` | `transfer.amount.error.limit` + `.limitNext` |
| `WALLET_INSUFFICIENT {balance, needed}` (409) | transfer | TR-02 field error with the new `balance`; no shop link (P§9.1) | `errors.wallet.insufficient` | `transfer.amount.error.aboveBalance` |
| `IDEMPOTENCY_KEY_REQUIRED` (400) | transfer, withdrawals | Client bug: action error `errors.generic` + code; nothing moved | `errors.wallet.idempotencyKeyRequired` | — |
| `VALIDATION {fields}` (400) | all writes | `fields.code` / `fields.password` on withdrawals → mode changed (§3.6 step 9). `fields.iban` → `bank.error.format`. Otherwise → action error `errors.validation`. | `errors.validation` | `withdraw.review.modeChanged` |
| `IBAN_INVALID {reason}` (400) | bank POST | Field error by `reason`: `format`, `checksum`, `bank` | `errors.wallet.ibanInvalid` | `bank.error.format` / `.checksum` / `.bank` |
| `BANK_ACCOUNT_LOCKED` (409) | bank POST, DELETE | Locked state (§3.5 step 5) | `errors.wallet.bankAccountLocked` | `bank.locked` |
| `NO_BANK_ACCOUNT` (409) | withdrawals | Back to WD-02 with the message | `errors.wallet.noBankAccount` | — |
| `AUTH_OTP_RATE_LIMITED {retry_after, reason?}` (429) | withdrawals/otp | Countdown on "Send confirmation code" (WD-04) or "Resend" (WD-05) | `errors.auth.otpRateLimited` | `auth.verify.resendIn` when `reason` = `cooldown` |
| `SMS_UNAVAILABLE` (503) | withdrawals/otp | Re-fetch and switch to password mode, or error + Retry (§3.6 step 4) | `errors.auth.smsUnavailable` | `withdraw.review.smsOff` |
| `AUTH_OTP_INVALID {attempts_left}` (400) | withdrawals (SMS) | WD-05 field error; 0 left → dead code | `errors.auth.otpInvalid` | `auth.verify.noAttempts` when 0 |
| `AUTH_OTP_EXPIRED` (400) | withdrawals (SMS) | WD-05 expired state | `errors.auth.otpExpired` | `auth.verify.expired` |
| `AUTH_VERIFICATION_INVALID` (400) | withdrawals (SMS, rare) | WD-05 dead-code state: "Get a new code" | `errors.auth.verificationInvalid` | `auth.verify.expired` |
| `WITHDRAW_BELOW_MIN {min}` (400) | withdrawals | WD-03 field error; + `withdraw.code.used` in SMS mode | `errors.wallet.withdrawBelowMin` | `withdraw.amount.error.belowMin` |
| `WITHDRAW_LIMIT {remaining, next_available_at}` (409) | withdrawals | WD-03 field error with the time; + `withdraw.code.used` in SMS mode | `errors.wallet.withdrawLimit` | `withdraw.amount.error.limit` + `.limitNext` |
| `WITHDRAW_NOT_WITHDRAWABLE {withdrawable}` (409) | withdrawals | WD-03 field error with `withdrawable`; + `withdraw.code.used` in SMS mode | `errors.wallet.withdrawNotWithdrawable` | `withdraw.amount.error.notWithdrawable` |
| `WITHDRAWAL_NOT_PENDING {status}` (409) | withdrawal DELETE | Show the current status + `withdrawals.cancel.already*` | `errors.wallet.withdrawalNotPending` | `withdrawals.cancel.alreadyPaid` / `…Rejected` / `…Cancelled` |
| `NOT_FOUND` (404) | users/{username}, withdrawal GET/DELETE, bank DELETE | Recipient: field error. Withdrawal: screen error. Bank: re-fetch (already removed). | `errors.notFound` | `transfer.recipient.notFound` / `withdrawals.notFound` |
| `AUTH_SESSION_INVALID` / `UNAUTHENTICATED` (401) | all | api-client refreshes once. On failure → session expired dialog (SY-08). Task-flow entries except passwords and codes are kept in sessionStorage for `next`. | `errors.unauthenticated` | — |
| `AUTH_BANNED` (403) | refresh, any | End the session → `/login` with the AU-14 panel (auth.md) | `errors.auth.banned` | `account.banned.*` |
| `NETWORK` (client) | all | Reads: screen or inline error + Retry. Writes: "Still working…" / "Check status" as specified per flow; never a blind retry. | `errors.network` | — |
| Any other / `HTTP_ERROR` | all | `errors.generic` + `common.errorCode` | `errors.generic` | — |

---

## 4. Screen list

Common to all signed-in screens here: app bar with back (mirrors in RTL) or close (task flows), the title, and the balance chip (hidden inside task flows, where the cost block shows the balance instead).

### WA-01 Wallet `/wallet`

- **Purpose:** see what you have, what you can do with it, and what happened.
- **Content priority:**
  1. **Balance card:**
     - "Available" with the amount (large, coin icon) and the toman equivalent
     - Then, only when they apply: on hold for withdrawals (link), welcome coins (with an expandable "Why?" that reveals `wallet.bonusLocked.explain` and a "?" link to `/help/signup-bonus`), and can be sent or withdrawn
  2. **Actions:** Get coins · Send coins · Withdraw
     - Three equal buttons: same size, same style (tonal), icon plus label (P§9.2, screen-inventory WA-01).
     - None is primary; there is no visual emphasis on Get coins.
  3. **Pending withdrawals summary** (if any pending): «۱ درخواست برداشت در انتظار · واریز تا ۷ مهر» → WD-06 (or WD-07 if exactly one)
  4. **Links:** Withdrawal requests · Bank account (shows the bank name and the last 4 digits when registered)
  5. **History:** date-grouped ledger rows, then "Show more"
- **Components:** balance card, three equal action buttons, list rows (≥ 56 px, chevrons mirror), a disclosure for the welcome-coin explanation, skeletons.
- **Disabled actions:**
  - Suspended → Send coins and Get coins are disabled (`aria-disabled`, focusable), with `account.suspended.actionBlocked` + "Details" under the action row. Withdraw stays enabled.
  - Offline → all three are disabled with `net.offlineAction`.
- **Primary action:** none (hub). The three actions have equal weight.

### WA-02 Transaction detail (sheet; side panel at `md`/`lg`)

- **Content:** type label and icon; signed amount (large) with the words "added" or "deducted" for screen readers; date and time (Jalali in fa, with seconds omitted); counterparty (transfers); type note; related link; reference (row id) with copy.
- **Actions:** the related link (if any), Copy reference, Close.

### WA-03 Received-coins notice (snackbar)

- As §3.8. 8 s with "View"; it pauses on hover or focus; it is never shown over a task flow or a match.

### WA-04 Get coins (sheet; centered dialog at `md`/`lg`)

- **Content:** §3.3 step 2. The username row uses a copy button with the label `shop.coins.supportTopup.copyUsername` and the polite announcement "Copied".
- **Primary action:** none. The support channel is a link when it is a URL or phone link, otherwise text with copy. "Close" is at the bottom.

### TR-00 Transfer not available (in place of step 1)

- **Content:** icon; title and body per the §3.4 step 0 variant; "?" help link; "Back to wallet".
- No stepper (nothing has started).

### TR-01 Transfer step 1: recipient

- **Content priority:** "Step 1 of 3"; title "Who are you sending to?"; username field (`dir="ltr"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`, `autocomplete="off"`); lookup status; recipient card; "Yes, this is the right person".
- **Primary action:** Yes, this is the right person.

### TR-02 Transfer step 2: amount

- **Content priority:** "Step 2 of 3"; title; compact recipient line "To @user" with "Change" (→ TR-01); amount field with the helper lines; live fee and receives line; Continue.
- **Primary action:** Continue.

### TR-03 Transfer step 3: review and password

- **Content priority:** "Step 3 of 3"; title "Review and confirm"; cost block (§3.4 step 3); irreversibility note; safety note; password field; "Send {amount} coins"; action error area directly above the button.
- The edit links "Change recipient" and "Change amount" sit next to their rows.
- **Primary action:** Send {amount} coins.

### TR-04 Transfer receipt

- **Content:** success icon (plus text, not color alone); "{amount} coins sent to @user"; fee; recipient received; new balance; time; transaction ID with copy; "Done".
- **Primary action:** Done.

### TR-05 Discard transfer (dialog)

- Title, body "Nothing has been sent or charged.", "Keep going" (initial focus), "Discard".

### WD-01 Withdrawal not available (in place of step 1)

- **Content:** title and body per the §3.6 step 0 variant; for the welcome-coin case, the "Withdrawable now: X of Y" line; help link; link to WD-06 for the limit case; "Back to wallet".

### WD-02 Withdraw step 1: bank account

- **Content priority:** stepper; title "Where to pay"; first-time hint (once); bank card with "Change", or the add form; locked note when applicable; Continue / "Save and continue".
- **Primary action:** Continue.

### WD-03 Withdraw step 2: amount

- **Content priority:** stepper; title; amount field with the helper lines; "Maximum" chip; live fee and toman line; Continue.
- **Primary action:** Continue.

### WD-04 Withdraw step 3: review (+ password in password mode)

- **Content priority:** stepper; title; cost block; rate line; timing; cancel note; notify line; safety note; password field (password mode); action error area; primary button.
- **Primary action:** "Request withdrawal of {amount} coins" (password mode) or "Send confirmation code" (SMS mode).

### WD-05 Withdraw step 4: SMS code (SMS mode only)

- **Content priority:** "Step 4 of 4"; title; "sent to {masked phone}"; code input; validity countdown; resend; "Nothing is held until you enter the code"; "Never share this code"; "Back to review".
- **Primary action:** none needed (auto-submit). A "Confirm withdrawal" button stays at the end of the form for keyboard users, as on AU-03.

### WD-06 Withdrawal requests `/wallet/withdrawals`

- **Content:** title; list rows (§3.7 step 1); empty state `withdrawals.empty` (no action, P§5); cap footer.

### WD-07 Withdrawal detail `/wallet/withdrawals/[id]`

- **Content priority:** submitted banner (just after submitting); status chip; amount and payout; expected-by line or decision line; timeline; late note; reason (rejected); bank reference (paid); facts; "Cancel request" (pending).
- **Primary action:** none, or "Cancel request" while pending (secondary styling).

### WD-08 Bank account `/wallet/bank-accounts`

- **Content priority:** title; intro `bank.intro`; card or empty state with the form; locked note; Change / Remove.
- Includes the replace confirmation dialog (`bank.change.*`).

### WD-09 Cancel withdrawal (sheet)

- Title, body with the amount, "Keep request" (initial focus), "Cancel withdrawal". Not dismissible while in flight.

### WD-10 Discard withdrawal (dialog)

- As TR-05, with `withdraw.discard.*`.

### WD-11 Remove bank account (dialog)

- Title, body `bank.remove.body`, "Cancel" (initial focus), "Remove".

---

## 5. States

| State | WA-01 / WA-02 | WA-04 | Transfer TR-01…TR-04 | Bank WD-08 | Withdraw WD-02…WD-05 | WD-06 / WD-07 / WD-09 |
| --- | --- | --- | --- | --- | --- | --- |
| **Loading** | Balance card skeleton (numbers never shown as 0 while loading); list skeleton (6 rows); "Show more" → in-button spinner | Static content; the username comes from `me` | Eligibility: one skeleton card. Lookup: "Looking up…" inside the field. Submit: in-button spinner "Sending…" | Card skeleton. Save: in-button spinner | Eligibility skeleton. "Sending code…" and "Submitting…" spinners; code field read-only while verifying | List and detail skeletons. Cancel: in-button spinner |
| **Empty** | No ledger rows: `wallet.history.empty`, no action (P§5). Welcome coins normally give one row. | — | — | No account: `bank.empty` + the form | — | `withdrawals.empty` |
| **Error** | Wallet load failed: screen error `wallet.loadError` + Retry. Ledger failed: inline `wallet.history.loadError` + Retry, and the balance card still shows. | — | §3.9 per code | IBAN reasons, locked, network | §3.9 per code | Not found; load failed + Retry; cancel races |
| **Offline** | Offline banner; cached values stay readable with `wallet.lastUpdated`; all three actions disabled with `net.offlineAction` | Readable; copy works | Banner; lookup and submit disabled with the reason; entries kept (not the password) | Save and Remove disabled with the reason; entries kept | As transfer; an OTP countdown keeps running | Readable from cache; Cancel disabled with the reason |
| **Reconnecting** | Not applicable (no socket). When online again: §3.1 refresh. | ← | A write in flight when the network drops → "Still working…" / "Check status" (§3.4 step 3) | ← | ← (§3.6 step 8) | ← |
| **Insufficient coins** | Not a state here. "Get coins" is always one of the three equal actions; no prompts. | — | Above balance: inline field error, **no** shop link (P§9.1) | — | Above balance: inline field error, no shop link | — |
| **Suspended** | Banner (AU-13). Send coins and Get coins disabled with the reason and "Details". Withdraw, the bank account, the requests list, and history all work. | Not reachable (Get coins disabled) | TR-00 suspended; server `ACCOUNT_SUSPENDED` has the same result | Allowed | Allowed (§12.1) | Allowed, including cancel |
| **Banned** | No session: the next request ends on `/login` with AU-14 ("pending withdrawals are held for review") | ← | ← | ← | ← | ← |
| **First-time user** | Balance = signup bonus, with the welcome-coins line and its explanation; one history row «هدیه‌ی ثبت‌نام» | As designed | Standard | Empty state + form | First-time hint on WD-02 | Empty |
| **SMS off** (`withdraw.confirm` = `password`) | — | Safety line unchanged | Unchanged (transfers always use the password) | Unchanged | 3 steps; password on WD-04; `withdraw.review.notifyApp`; no SMS promise anywhere | The timeline never mentions an SMS |
| **Pending withdrawal exists** | On-hold line + summary row | — | — | Change and Remove locked, with a link | Allowed; new requests are separate | — |

Timing rules (as auth.md §5):
- Countdowns (password lock, OTP validity, resend, rate limit) use server seconds and the local clock. They display mm:ss in `<bdi dir="ltr">` and are announced only at start and at 0.
- `next_available_at` is shown as a date and time: Jalali date with a 24-hour time in fa, e.g. «۷ مهر، ۱۴:۳۰». When it is within 24 hours, the relative time is added in parentheses: «(۳ ساعت دیگر)».

---

## 6. Responsive notes (§11.7)

| Breakpoint | WA-01 | Task flows (TR, WD) | WD-06 / WD-07 | Sheets and dialogs |
| --- | --- | --- | --- | --- |
| `xs` 320–359 | Single column, 12 px padding. Actions in a 3-column grid: icon above a label that can wrap to 2 lines. At 200% text, the actions stack as full-width rows. | Single column. Sticky primary button when height ≥ 600 px, else inline. The cost block stacks label over value (P§13). | Full-screen list, then full-screen detail | Bottom sheets, full width |
| `sm` 360–599 (design 390 × 844) | Balance card, then the action row (all in the upper 55% of the screen at 390 × 844), links, history | Sticky footer button in the thumb zone, respecting `env(safe-area-inset-bottom)` and the keyboard (`visualViewport`) | As `xs` | Bottom sheets; WA-02 up to 90% `dvh` |
| `md` 600–1023 | Side rail. Two columns: start column (balance card, actions, pending, links; 320–360 px), end column history. Selecting a row opens WA-02 as a **side panel** replacing the empty-state panel "Select a transaction to see its details". | Centered single column, max 560 px, sticky button inside the column | List plus detail panel; the URL follows the selection (ia.md §3.3) | WA-04, TR-05, WD-09, WD-10, WD-11 → centered dialogs, max 480 px |
| `lg` ≥ 1024 | Centered shell, max 1280: summary column · history · detail panel (three columns). Hover states on rows and buttons. | As `md` | As `md`; detail panel wider | As `md` |

- **Landscape phones** (height < 500 px): side rail (ia.md §3.3). WA-01 balance card collapses to one line (available plus the on-hold figure). Task-flow buttons are inline, not sticky. The OTP boxes follow auth.md §6.1.
- **Orientation or width changes** keep all entries, the current step, the idempotency key, and running countdowns.
- Use `dvh`/`svh` only, never `100vh`. Container queries for WA-02 (sheet vs side panel) and the recipient card.
- **Mouse and keyboard on `m.`:**
  - Enter submits the current step (never from a textarea).
  - Esc closes sheets and dialogs, except while in flight.
- **Thumb reach:**
  - Task-flow primary buttons sit in the bottom 40% in portrait.
  - WA-01 actions are within a comfortable one-hand reach at 390 × 844 (top of the lower half after the balance card). The balance card must not grow so tall that the actions move above 45% of the height; at `xs`, the toman line wraps under the amount rather than growing the card.

---

## 7. RTL/LTR notes and i18n keys

- fa first. The layout mirrors: chevrons, back arrows, the "Send coins" arrow icon (P§11), the stepper, and the timeline.
- **Not mirrored:**
  - Clock and countdown icons
  - Sheba numbers, transaction IDs, bank references, usernames, and amounts inside inputs: always LTR in `<bdi dir="ltr">`
  - The username and amount input fields are `dir="ltr"`, while their labels follow the UI direction
- **Digits:**
  - Amounts in text use locale digits and grouping («۱٬۲۵۰»).
  - Sheba, references, and transaction IDs keep Latin digits (P§10).
  - Inputs accept Persian, Arabic-Indic, and Latin digits and never convert digits under the cursor.
- **Signs:** «+۲۰۰» and «−۱۰۰» use U+2212 minus. The sign sits at the start of the number in reading order, and the number is isolated with `<bdi>`.
- **Dates:** Jalali for fa (`fa-IR-u-ca-persian`), Gregorian for en. `expected_by` is a date only: «تا ۷ مهر ۱۴۰۵» / "by 29 September 2026".
- **Bank names:** `bank.fa` in fa and `bank.en` in en, straight from the API.
- **Plurals:** ICU through next-intl. fa uses the same form for all counts. The en `coins.value` plural already exists.

| Key | fa | en |
| --- | --- | --- |
| `wallet.title` | کیف پول | Wallet |
| `wallet.available` | موجودی قابل استفاده | Available |
| `wallet.onHold` | در انتظار برداشت: {amount} سکه | On hold for withdrawals: {amount} coins |
| `wallet.onHoldLink` | مشاهده‌ی درخواست‌ها | View requests |
| `wallet.bonusLocked.line` | {amount} سکه‌ی هدیه‌ی ثبت‌نام (هنوز قابل ارسال و برداشت نیست) | {amount} welcome coins (can't be sent or withdrawn yet) |
| `wallet.bonusLocked.why` | چرا؟ | Why? |
| `wallet.bonusLocked.explain` | سکه‌های هدیه‌ی ثبت‌نام را می‌توانید در بازی خرج کنید. پس از اولین خرید سکه یا شارژ توسط پشتیبانی، قابل ارسال و برداشت می‌شوند. | You can spend welcome coins in games. They become sendable and withdrawable after your first coin purchase or top-up by support. |
| `wallet.movable` | قابل ارسال و برداشت: {amount} سکه | Can be sent or withdrawn: {amount} coins |
| `wallet.transferable` | قابل ارسال: {amount} سکه | Can be sent now: {amount} coins |
| `wallet.withdrawable` | قابل برداشت: {amount} سکه | Withdrawable now: {amount} coins |
| `wallet.actions.getCoins` | دریافت سکه | Get coins |
| `wallet.actions.send` | ارسال سکه | Send coins |
| `wallet.actions.withdraw` | برداشت | Withdraw |
| `wallet.pending.summary` | {count} درخواست برداشت در انتظار · واریز تا {date} | {count, plural, one {# pending withdrawal} other {# pending withdrawals}} · expected by {date} |
| `wallet.links.withdrawals` | درخواست‌های برداشت | Withdrawal requests |
| `wallet.links.bankAccount` | حساب بانکی | Bank account |
| `wallet.links.bankAccountValue` | {bank}، منتهی به {last4} | {bank}, ending {last4} |
| `wallet.history.title` | تراکنش‌ها | Transactions |
| `wallet.history.today` | امروز | Today |
| `wallet.history.yesterday` | دیروز | Yesterday |
| `wallet.history.empty` | هنوز تراکنشی ندارید. | No transactions yet. |
| `wallet.history.more` | نمایش بیشتر | Show more |
| `wallet.history.end` | همه‌ی تراکنش‌ها نمایش داده شد. | That's all your transactions. |
| `wallet.history.loadError` | تراکنش‌ها بارگذاری نشد. | Couldn't load transactions. |
| `wallet.loadError` | کیف پول بارگذاری نشد. | Couldn't load your wallet. |
| `wallet.lastUpdated` | آخرین به‌روزرسانی: {time} | Last updated: {time} |
| `wallet.amount.in` | +{amount} | +{amount} |
| `wallet.amount.out` | −{amount} | −{amount} |
| `wallet.amount.a11yIn` | {amount} سکه اضافه شد | {amount} coins added |
| `wallet.amount.a11yOut` | {amount} سکه کم شد | {amount} coins deducted |
| `wallet.row.a11y` | {type}، {amount}، {time} | {type}, {amount}, {time} |
| `wallet.tx.purchase` | خرید سکه | Coin purchase |
| `wallet.tx.match_entry` | ورودی مسابقه | Match entry |
| `wallet.tx.match_payout` | جایزه‌ی مسابقه | Match winnings |
| `wallet.tx.match_refund` | بازگشت ورودی مسابقه | Match entry refund |
| `wallet.tx.rake` | کارمزد | Platform fee |
| `wallet.tx.referral_commission` | پورسانت معرفی دوستان | Referral commission |
| `wallet.tx.prediction_stake` | ثبت پیش‌بینی | Prediction stake |
| `wallet.tx.prediction_payout` | برد پیش‌بینی | Prediction winnings |
| `wallet.tx.prediction_refund` | بازگشت مبلغ پیش‌بینی | Prediction refund |
| `wallet.tx.tournament_entry` | ورودی تورنمنت | Tournament entry |
| `wallet.tx.tournament_prize` | جایزه‌ی تورنمنت | Tournament prize |
| `wallet.tx.tournament_refund` | بازگشت ورودی تورنمنت | Tournament entry refund |
| `wallet.tx.signup_bonus` | هدیه‌ی ثبت‌نام | Welcome coins |
| `wallet.tx.level_reward` | جایزه‌ی سطح | Level reward |
| `wallet.tx.achievement_reward` | جایزه‌ی دستاورد | Achievement reward |
| `wallet.tx.shop_purchase` | خرید از فروشگاه | Shop purchase |
| `wallet.tx.username_change` | تغییر نام کاربری | Username change |
| `wallet.tx.admin_adjustment` | اصلاح موجودی توسط پشتیبانی | Balance correction by support |
| `wallet.tx.admin_topup` | شارژ توسط پشتیبانی | Top-up by support |
| `wallet.tx.withdrawal_hold` | درخواست برداشت | Withdrawal request |
| `wallet.tx.withdrawal_payout` | واریز برداشت | Withdrawal paid |
| `wallet.tx.withdrawal_refund` | بازگشت سکه‌ی برداشت | Withdrawal returned |
| `wallet.tx.transfer.out` | ارسال به {username} | Sent to {username} |
| `wallet.tx.transfer.in` | دریافت از {username} | Received from {username} |
| `wallet.tx.transfer.unknownParty` | انتقال سکه | Coin transfer |
| `wallet.tx.unknown` | تراکنش | Transaction |
| `wallet.detail.title` | جزئیات تراکنش | Transaction details |
| `wallet.detail.type` | نوع | Type |
| `wallet.detail.amount` | مبلغ | Amount |
| `wallet.detail.date` | زمان | Date and time |
| `wallet.detail.counterparty` | طرف مقابل | Other player |
| `wallet.detail.reference` | شماره‌ی پیگیری | Reference |
| `wallet.detail.copyReference` | کپی شماره‌ی پیگیری | Copy reference |
| `wallet.detail.copied` | کپی شد | Copied |
| `wallet.detail.open.withdrawal` | مشاهده‌ی درخواست برداشت | View withdrawal request |
| `wallet.detail.open.profile` | مشاهده‌ی پروفایل | View profile |
| `wallet.detail.note.withdrawal_hold` | این سکه‌ها تا واریز یا لغو درخواست نگه داشته می‌شوند. | These coins are held until the request is paid or cancelled. |
| `wallet.detail.note.withdrawal_refund` | سکه‌های یک درخواست برداشتِ لغوشده یا ردشده به موجودی شما برگشت. | Coins from a cancelled or rejected withdrawal came back to your balance. |
| `wallet.detail.note.admin_topup` | پشتیبانی این سکه‌ها را به حساب شما اضافه کرد. | Support added these coins to your account. |
| `wallet.detail.note.signup_bonus` | هدیه‌ی خوش‌آمد. پس از اولین خرید یا شارژ، قابل ارسال و برداشت می‌شود. | A welcome gift. It becomes sendable and withdrawable after your first purchase or top-up. |
| `wallet.detail.note.transfer` | انتقال سکه قابل بازگشت نیست. | Transfers can't be undone. |
| `wallet.notice.transferIn` | {username} برای شما {amount} سکه فرستاد. | {username} sent you {amount} coins. |
| `wallet.notice.topup` | {amount} سکه به کیف پول شما اضافه شد. | {amount} coins were added to your wallet. |
| `wallet.notice.refund` | {amount} سکه به موجودی شما برگشت. | {amount} coins came back to your balance. |
| `wallet.notice.many` | {count} تراکنش جدید | {count, plural, one {# new transaction} other {# new transactions}} |
| `wallet.notice.view` | مشاهده | View |
| `wallet.flow.step` | مرحله {current} از {total} | Step {current} of {total} |
| `wallet.flow.close` | بستن | Close |
| `wallet.flow.checking` | در حال بررسی وضعیت… | Checking the status… |
| `wallet.password.wrong` | رمز عبور درست نیست. | That password isn't right. |
| `wallet.password.locked` | به دلیل چند رمز اشتباه، تأیید با رمز تا {time} دیگر ممکن نیست. | Too many wrong passwords. You can try again in {time}. |
| `wallet.password.show` | نمایش رمز | Show password |
| `wallet.password.hide` | پنهان کردن رمز | Hide password |
| `wallet.backToWallet` | بازگشت به کیف پول | Back to wallet |
| `nav.badge.withdrawal` | وضعیت یک درخواست برداشت تغییر کرده است | A withdrawal request has an update |
| `shop.coins.supportTopup.title` | دریافت سکه | Get coins |
| `shop.coins.supportTopup.status` | خرید آنلاین سکه هنوز فعال نیست. | Buying coins online isn't available yet. |
| `shop.coins.supportTopup.rate` | هر سکه = {price} تومان | 1 coin = {price} toman |
| `shop.coins.supportTopup.how` | فعلاً پشتیبانی می‌تواند به حساب شما سکه اضافه کند. با پشتیبانی تماس بگیرید: {channel} | For now, support can add coins to your account. Contact support: {channel} |
| `shop.coins.supportTopup.tell` | نام کاربری‌تان و تعداد سکه‌ی موردنظر را به پشتیبانی بگویید. | Tell support your username and how many coins you want. |
| `shop.coins.supportTopup.username` | نام کاربری شما: {username} | Your username: {username} |
| `shop.coins.supportTopup.copyUsername` | کپی نام کاربری | Copy username |
| `shop.coins.supportTopup.otherTitle` | راه‌های دیگر | Other ways |
| `shop.coins.supportTopup.other.transfer` | یک دوست می‌تواند برایتان سکه بفرستد. | A friend can send you coins. |
| `shop.coins.supportTopup.other.win` | برد در مسابقه‌ها | Winning matches |
| `shop.coins.supportTopup.other.level` | جایزه‌ی بالا رفتن سطح | Level-up rewards |
| `shop.coins.supportTopup.safety` | پشتیبانی هرگز رمز عبور یا کد پیامکی شما را نمی‌پرسد. | Support will never ask for your password or SMS code. |
| `transfer.title` | ارسال سکه | Send coins |
| `transfer.unavailable.suspended.title` | ارسال سکه در زمان تعلیق حساب ممکن نیست | You can't send coins while your account is suspended |
| `transfer.unavailable.bonus.title` | فعلاً سکه‌ی قابل ارسال ندارید | You have no coins you can send yet |
| `transfer.unavailable.bonus.body` | سکه‌های هدیه‌ی ثبت‌نام پس از اولین خرید سکه یا شارژ توسط پشتیبانی قابل ارسال می‌شوند. | Welcome coins become sendable after your first coin purchase or top-up by support. |
| `transfer.unavailable.belowMin.title` | سکه‌ی کافی برای ارسال ندارید | Not enough coins to send |
| `transfer.unavailable.belowMin.body` | حداقل ارسال {min} سکه است. سکه‌ی قابل ارسال شما: {amount}. | The minimum transfer is {min} coins. You can send {amount}. |
| `transfer.unavailable.limit.title` | به سقف ارسال ۲۴ ساعت رسیده‌اید | You've reached the 24-hour sending limit |
| `transfer.unavailable.limit.body` | از {time} دوباره می‌توانید سکه بفرستید. | You can send coins again from {time}. |
| `transfer.unavailable.help` | درباره‌ی ارسال سکه | About sending coins |
| `transfer.recipient.title` | به چه کسی می‌فرستید؟ | Who are you sending to? |
| `transfer.recipient.label` | نام کاربری گیرنده | Recipient's username |
| `transfer.recipient.helper` | نام کاربری را دقیق وارد کنید. | Enter the exact username. |
| `transfer.recipient.searching` | در حال جستجو… | Looking up… |
| `transfer.recipient.notFound` | بازیکنی با این نام کاربری پیدا نشد. | No player with this username. |
| `transfer.recipient.self` | نمی‌توانید به خودتان سکه بفرستید. | You can't send coins to yourself. |
| `transfer.recipient.lookupError` | جستجو انجام نشد. دوباره تلاش کنید. | Couldn't look up this username. Try again. |
| `transfer.recipient.checkTitle` | گیرنده را بررسی کنید | Check the recipient |
| `transfer.recipient.checkBody` | مطمئن شوید این همان کسی است که می‌خواهید برایش سکه بفرستید. انتقال قابل بازگشت نیست. | Make sure this is the person you want to send coins to. Transfers can't be undone. |
| `transfer.recipient.level` | سطح {level} | Level {level} |
| `transfer.recipient.confirm` | بله، همین شخص است | Yes, this is the right person |
| `transfer.recipient.disabled` | نام کاربری گیرنده را وارد کنید تا کارت او نمایش داده شود. | Enter the recipient's username to see their card. |
| `transfer.amount.title` | چند سکه می‌فرستید؟ | How many coins? |
| `transfer.amount.to` | به {username} | To {username} |
| `transfer.amount.change` | تغییر | Change |
| `transfer.amount.label` | تعداد سکه | Number of coins |
| `transfer.amount.helperMin` | حداقل: {min} سکه | Minimum: {min} coins |
| `transfer.amount.helperWindow` | باقی‌مانده در ۲۴ ساعت اخیر: {remaining} از {max} سکه | Left in the last 24 hours: {remaining} of {max} coins |
| `transfer.amount.helperSendable` | قابل ارسال: {amount} سکه | Can be sent now: {amount} coins |
| `transfer.amount.preview` | کارمزد: {fee} سکه · دریافتی گیرنده: {received} سکه | Fee: {fee} coins · Recipient receives: {received} coins |
| `transfer.amount.error.required` | تعداد سکه را وارد کنید. | Enter an amount. |
| `transfer.amount.error.invalid` | یک عدد صحیح بزرگ‌تر از صفر وارد کنید. | Enter a whole number above zero. |
| `transfer.amount.error.belowMin` | حداقل ارسال {min} سکه است. | The minimum is {min} coins. |
| `transfer.amount.error.aboveBalance` | بیشتر از موجودی شماست ({balance} سکه). | More than your balance ({balance} coins). |
| `transfer.amount.error.notTransferable` | فقط {transferable} سکه قابل ارسال است؛ {bonus} سکه‌ی هدیه‌ی ثبت‌نام تا اولین خرید یا شارژ قابل ارسال نیست. | Only {transferable} coins can be sent; {bonus} welcome coins can't be sent until your first purchase or top-up. |
| `transfer.amount.error.limit` | در حال حاضر حداکثر {remaining} سکه‌ی دیگر می‌توانید بفرستید (سقف: {max} سکه در هر ۲۴ ساعت). | You can send up to {remaining} more coins right now (limit: {max} coins in any 24 hours). |
| `transfer.amount.error.limitNext` | سقف از {time} دوباره آزاد می‌شود. | More becomes available from {time}. |
| `transfer.amount.cta` | ادامه | Continue |
| `transfer.amount.disabled` | یک مبلغ معتبر وارد کنید. | Enter a valid amount. |
| `transfer.review.title` | بررسی و تأیید | Review and confirm |
| `transfer.review.recipient` | گیرنده | Recipient |
| `transfer.review.changeRecipient` | تغییر گیرنده | Change recipient |
| `transfer.review.changeAmount` | تغییر مبلغ | Change amount |
| `transfer.review.irreversible` | انتقال سکه قابل بازگشت نیست. | Transfers can't be undone. |
| `transfer.review.safety` | پشتیبانی هرگز از شما نمی‌خواهد سکه بفرستید یا رمز عبورتان را بگویید. | Support will never ask you to send coins or share your password. |
| `transfer.review.password` | رمز عبور حساب | Your account password |
| `transfer.review.passwordHelper` | برای تأیید ارسال، رمز عبور خود را وارد کنید. | Enter your password to confirm this transfer. |
| `transfer.review.cta` | ارسال {amount} سکه | Send {amount} coins |
| `transfer.review.sending` | در حال ارسال… | Sending… |
| `transfer.review.disabled` | رمز عبور را وارد کنید. | Enter your password. |
| `transfer.review.recipientGone` | این گیرنده دیگر در دسترس نیست. چیزی از موجودی شما کم نشد. | This recipient is no longer available. Nothing was taken from your balance. |
| `transfer.receipt.title` | ارسال شد | Sent |
| `transfer.receipt.body` | {amount} سکه برای {username} فرستاده شد. | {amount} coins sent to {username}. |
| `transfer.receipt.received` | دریافتی گیرنده: {amount} سکه | Recipient received: {amount} coins |
| `transfer.receipt.newBalance` | موجودی جدید: {amount} سکه | New balance: {amount} coins |
| `transfer.receipt.time` | زمان: {time} | Time: {time} |
| `transfer.receipt.txId` | شناسه‌ی تراکنش | Transaction ID |
| `transfer.receipt.copyTx` | کپی شناسه‌ی تراکنش | Copy transaction ID |
| `transfer.discard.title` | ارسال لغو شود؟ | Discard this transfer? |
| `transfer.discard.body` | چیزی ارسال یا از حساب شما کم نشده است. | Nothing has been sent or charged. |
| `transfer.discard.confirm` | لغو ارسال | Discard |
| `transfer.discard.keep` | ادامه‌ی ارسال | Keep going |
| `withdraw.title` | برداشت | Withdraw |
| `withdraw.unavailable.bonus.title` | فعلاً سکه‌ی قابل برداشت ندارید | You have nothing to withdraw yet |
| `withdraw.unavailable.bonus.line` | قابل برداشت: {withdrawable} از {balance} سکه | Withdrawable now: {withdrawable} of {balance} coins |
| `withdraw.unavailable.bonus.body` | سکه‌های هدیه‌ی ثبت‌نام پس از اولین خرید سکه یا شارژ توسط پشتیبانی قابل برداشت می‌شوند. | Welcome coins become withdrawable after your first coin purchase or top-up by support. |
| `withdraw.unavailable.belowMin.title` | سکه‌ی کافی برای برداشت ندارید | Not enough coins to withdraw |
| `withdraw.unavailable.belowMin.body` | حداقل برداشت {min} سکه است. سکه‌ی قابل برداشت شما: {amount}. | The minimum withdrawal is {min} coins. You can withdraw {amount}. |
| `withdraw.unavailable.onHoldNote` | سکه‌هایی که در انتظار برداشت هستند حساب نمی‌شوند. | Coins on hold for pending withdrawals aren't counted. |
| `withdraw.unavailable.limit.title` | به سقف برداشت ۲۴ ساعت رسیده‌اید | You've reached the 24-hour withdrawal limit |
| `withdraw.unavailable.limit.body` | از {time} دوباره می‌توانید برداشت کنید. لغو یک درخواست در انتظار، سهم آن را از سقف آزاد می‌کند. | You can withdraw again from {time}. Cancelling a pending request frees its share of the limit. |
| `withdraw.unavailable.blocked` | برداشت برای حساب شما فعلاً در دسترس نیست. با پشتیبانی تماس بگیرید. | Withdrawals aren't available for your account right now. Contact support. |
| `withdraw.unavailable.help` | درباره‌ی برداشت | About withdrawals |
| `withdraw.hint.title` | برداشت چطور انجام می‌شود؟ | How withdrawals work |
| `withdraw.hint.body` | واریزها به‌صورت دستی و حداکثر تا یک روز کاری پس از درخواست انجام می‌شوند. تا پیش از واریز می‌توانید درخواست را لغو کنید. | We pay withdrawals by hand, within one working day of your request. You can cancel while a request is pending. |
| `withdraw.hint.sms` | پس از واریز پیامک دریافت می‌کنید. | You'll get a text when it's paid. |
| `withdraw.hint.dismiss` | متوجه شدم | Got it |
| `withdraw.bank.title` | به کدام حساب واریز شود؟ | Where to pay |
| `withdraw.bank.helper` | مبلغ به این حساب واریز می‌شود. | We'll pay to this account. |
| `withdraw.bank.change` | تغییر | Change |
| `withdraw.bank.saveContinue` | ذخیره و ادامه | Save and continue |
| `withdraw.bank.cta` | ادامه | Continue |
| `withdraw.amount.title` | چند سکه برداشت می‌کنید؟ | How many coins to withdraw? |
| `withdraw.amount.label` | تعداد سکه | Number of coins |
| `withdraw.amount.helperMin` | حداقل: {min} سکه | Minimum: {min} coins |
| `withdraw.amount.helperWindow` | باقی‌مانده در ۲۴ ساعت اخیر: {remaining} از {max} سکه | Left in the last 24 hours: {remaining} of {max} coins |
| `withdraw.amount.helperWithdrawable` | قابل برداشت: {amount} سکه | Withdrawable now: {amount} coins |
| `withdraw.amount.max` | حداکثر ({amount}) | Maximum ({amount}) |
| `withdraw.amount.preview` | کارمزد: {fee} سکه · واریزی به حساب شما: {toman} تومان | Fee: {fee} coins · Paid to your bank: {toman} toman |
| `withdraw.amount.error.required` | تعداد سکه را وارد کنید. | Enter an amount. |
| `withdraw.amount.error.invalid` | یک عدد صحیح بزرگ‌تر از صفر وارد کنید. | Enter a whole number above zero. |
| `withdraw.amount.error.belowMin` | حداقل برداشت {min} سکه است. | The minimum is {min} coins. |
| `withdraw.amount.error.aboveBalance` | بیشتر از موجودی شماست ({balance} سکه). | More than your balance ({balance} coins). |
| `withdraw.amount.error.notWithdrawable` | فقط {withdrawable} سکه قابل برداشت است. | Only {withdrawable} coins can be withdrawn. |
| `withdraw.amount.error.notWithdrawableBonus` | فقط {withdrawable} سکه قابل برداشت است؛ سکه‌های هدیه‌ی ثبت‌نام تا اولین خرید یا شارژ قابل برداشت نیستند. | Only {withdrawable} coins can be withdrawn; welcome coins can't be withdrawn until your first purchase or top-up. |
| `withdraw.amount.error.limit` | در حال حاضر حداکثر {remaining} سکه‌ی دیگر می‌توانید برداشت کنید (سقف: {max} سکه در هر ۲۴ ساعت). | You can withdraw up to {remaining} more coins right now (limit: {max} coins in any 24 hours). |
| `withdraw.amount.error.limitNext` | سقف از {time} دوباره آزاد می‌شود. | More becomes available from {time}. |
| `withdraw.amount.cta` | ادامه | Continue |
| `withdraw.amount.disabled` | یک مبلغ معتبر وارد کنید. | Enter a valid amount. |
| `withdraw.review.title` | بررسی درخواست | Review your request |
| `withdraw.review.bank` | واریز به | Paid to |
| `withdraw.review.rate` | با نرخ امروز: هر سکه {price} تومان. این مبلغ هنگام ثبت درخواست ثابت می‌شود. | At today's rate: 1 coin = {price} toman. This amount is fixed when you submit. |
| `withdraw.review.timing` | واریز حداکثر تا یک روز کاری (روزهای کاری ایران) پس از درخواست انجام می‌شود. تاریخ دقیق پس از ثبت نمایش داده می‌شود. | Paid within one working day of your request (Iranian working days). You'll see the exact expected date after you submit. |
| `withdraw.review.cancelNote` | تا پیش از واریز می‌توانید درخواست را لغو کنید. | You can cancel while it's pending. |
| `withdraw.review.notifySms` | پس از واریز پیامک دریافت می‌کنید. | You'll get a text when it's paid. |
| `withdraw.review.notifyApp` | وضعیت واریز را در همین بخش کیف پول می‌بینید. | You'll see when it's paid here in your wallet. |
| `withdraw.review.safety` | پشتیبانی هرگز کد پیامکی یا رمز عبور شما را نمی‌پرسد. | Support will never ask for your SMS code or password. |
| `withdraw.review.password` | رمز عبور حساب | Your account password |
| `withdraw.review.passwordHelper` | برای تأیید برداشت، رمز عبور خود را وارد کنید. | Enter your password to confirm this withdrawal. |
| `withdraw.review.ctaPassword` | درخواست برداشت {amount} سکه | Request withdrawal of {amount} coins |
| `withdraw.review.ctaSms` | ارسال کد تأیید | Send confirmation code |
| `withdraw.review.sendingCode` | در حال ارسال کد… | Sending code… |
| `withdraw.review.submitting` | در حال ثبت درخواست… | Submitting… |
| `withdraw.review.disabled` | رمز عبور را وارد کنید. | Enter your password. |
| `withdraw.review.smsOff` | ارسال پیامک فعلاً ممکن نیست؛ برداشت را با رمز عبور تأیید کنید. | Text messages aren't available right now. Confirm the withdrawal with your password instead. |
| `withdraw.review.modeChanged` | روش تأیید برداشت تغییر کرد. لطفاً دوباره تأیید کنید. | The way to confirm withdrawals has changed. Please confirm again. |
| `withdraw.code.title` | کد تأیید برداشت | Enter the code |
| `withdraw.code.sentTo` | کد ۵ رقمی به {phone} پیامک شد. | We sent a 5-digit code to {phone}. |
| `withdraw.code.nothingHeld` | تا کد را وارد نکنید، سکه‌ای نگه داشته نمی‌شود. | Nothing is held until you enter the code. |
| `withdraw.code.cta` | تأیید برداشت | Confirm withdrawal |
| `withdraw.code.back` | بازگشت به بررسی | Back to review |
| `withdraw.code.used` | کد استفاده شد اما درخواست ثبت نشد. مبلغ را اصلاح کنید؛ برای تأیید، کد جدید لازم است. | The code was used, but the request wasn't submitted. Fix the amount; you'll need a new code to confirm. |
| `withdraw.discard.title` | درخواست برداشت لغو شود؟ | Discard this withdrawal? |
| `withdraw.discard.body` | سکه‌ای نگه داشته یا از حساب شما کم نشده است. | Nothing has been held or charged. |
| `withdraw.discard.confirm` | لغو | Discard |
| `withdraw.discard.keep` | ادامه | Keep going |
| `withdrawals.title` | درخواست‌های برداشت | Withdrawal requests |
| `withdrawals.empty` | هنوز درخواست برداشتی ثبت نکرده‌اید. | No withdrawal requests yet. |
| `withdrawals.capped` | ۱۰۰ درخواست اخیر نمایش داده می‌شود. | Showing your latest 100 requests. |
| `withdrawals.status.pending` | در انتظار واریز | Pending |
| `withdrawals.status.paid` | واریز شد | Paid |
| `withdrawals.status.rejected` | رد شد | Rejected |
| `withdrawals.status.cancelled` | لغو شد | Cancelled |
| `withdrawals.expectedBy` | واریز تا {date} | Expected by {date} |
| `withdrawals.requestedAt` | ثبت: {date} | Requested {date} |
| `withdrawals.detail.title` | درخواست برداشت | Withdrawal request |
| `withdrawals.detail.submitted` | درخواست شما ثبت شد. | Your request was submitted. |
| `withdrawals.detail.amount` | مبلغ | Amount |
| `withdrawals.detail.fee` | کارمزد | Fee |
| `withdrawals.detail.payout` | واریزی به حساب شما | Paid to your bank |
| `withdrawals.detail.bank` | حساب مقصد | Bank account |
| `withdrawals.detail.timeline.requested` | ثبت درخواست | Requested |
| `withdrawals.detail.timeline.waiting` | در انتظار واریز (تا {date}) | Waiting for payment (expected by {date}) |
| `withdrawals.detail.timeline.paid` | واریز شد | Paid |
| `withdrawals.detail.timeline.rejected` | رد شد | Rejected |
| `withdrawals.detail.timeline.cancelled` | لغو شد | Cancelled |
| `withdrawals.detail.bankRef` | کد پیگیری بانک | Bank reference |
| `withdrawals.detail.copyRef` | کپی کد پیگیری | Copy bank reference |
| `withdrawals.detail.reason` | دلیل | Reason |
| `withdrawals.detail.returned` | {amount} سکه به موجودی شما برگشت. | {amount} coins went back to your balance. |
| `withdrawals.detail.late` | واریز این درخواست بیش از زمان معمول طول کشیده است. در صورت نیاز با پشتیبانی تماس بگیرید. | This is taking longer than usual. Contact support if you need help. |
| `withdrawals.detail.cancel` | لغو درخواست | Cancel request |
| `withdrawals.notFound` | این درخواست برداشت پیدا نشد. | We couldn't find this withdrawal request. |
| `withdrawals.backToList` | بازگشت به درخواست‌ها | Back to requests |
| `withdrawals.cancel.title` | این درخواست لغو شود؟ | Cancel this withdrawal? |
| `withdrawals.cancel.body` | {amount} سکه به موجودی شما برمی‌گردد. | {amount} coins go back to your balance. |
| `withdrawals.cancel.confirm` | لغو درخواست | Cancel withdrawal |
| `withdrawals.cancel.keep` | درخواست بماند | Keep request |
| `withdrawals.cancel.cancelling` | در حال لغو… | Cancelling… |
| `withdrawals.cancel.done` | درخواست لغو شد و {amount} سکه به موجودی شما برگشت. | Request cancelled. {amount} coins are back in your balance. |
| `withdrawals.cancel.alreadyPaid` | این درخواست پیش‌تر واریز شده است. | This withdrawal was already paid. |
| `withdrawals.cancel.alreadyRejected` | این درخواست پیش‌تر رد شده است. | This withdrawal was already rejected. |
| `withdrawals.cancel.alreadyCancelled` | این درخواست پیش‌تر لغو شده است. | This withdrawal was already cancelled. |
| `bank.title` | حساب بانکی | Bank account |
| `bank.intro` | برداشت‌ها به این حساب واریز می‌شوند. هر حساب کاربری یک شماره شبا دارد. | Withdrawals are paid to this account. You can have one Sheba number. |
| `bank.empty` | هنوز حساب بانکی ثبت نکرده‌اید. برای برداشت، شماره شبای خود را وارد کنید. | No bank account yet. Add your Sheba number to withdraw. |
| `bank.add` | افزودن حساب بانکی | Add bank account |
| `bank.field.label` | شماره شبا | Sheba number (IBAN) |
| `bank.field.helper` | شبای حساب بانکی خودتان را وارد کنید: ۲۴ رقم بعد از IR. | Enter the Sheba of your own bank account: 24 digits after IR. |
| `bank.error.required` | شماره شبا را وارد کنید. | Enter your Sheba number. |
| `bank.error.format` | شماره شبا باید ۲۴ رقم بعد از IR داشته باشد. | A Sheba number has 24 digits after IR. |
| `bank.error.checksum` | این شماره شبا معتبر نیست. آن را دوباره از کارت یا اپ بانک خود کپی کنید. | This Sheba number isn't valid. Copy it again from your bank card or banking app. |
| `bank.error.bank` | بانک این شماره شبا شناخته نشد. | We don't recognize the bank for this Sheba number. |
| `bank.valid.bank` | بانک: {bank} | Bank: {bank} |
| `bank.save` | ذخیره‌ی حساب | Save bank account |
| `bank.saving` | در حال ذخیره… | Saving… |
| `bank.saved` | حساب بانکی ذخیره شد. | Bank account saved. |
| `bank.card.a11y` | حساب {bank}، شبای منتهی به {last4} | {bank} account, Sheba ending {last4} |
| `bank.change` | تغییر حساب | Change |
| `bank.remove` | حذف حساب | Remove |
| `bank.change.title` | حساب بانکی جایگزین شود؟ | Replace your bank account? |
| `bank.change.body` | شبای جدید جایگزین {old} می‌شود و برداشت‌های بعدی به حساب جدید واریز می‌شود. | Your new Sheba will replace {old}. Future withdrawals go to the new account. |
| `bank.change.confirm` | جایگزین شود | Replace |
| `bank.remove.title` | حساب بانکی حذف شود؟ | Remove your bank account? |
| `bank.remove.body` | برای برداشت بعدی باید دوباره شماره شبا وارد کنید. | You'll need to add a Sheba number again before your next withdrawal. |
| `bank.remove.confirm` | حذف | Remove |
| `bank.removed` | حساب بانکی حذف شد. | Bank account removed. |
| `bank.locked` | تا وقتی یک درخواست برداشت در انتظار واریز است، نمی‌توانید حساب بانکی را تغییر دهید یا حذف کنید. | You can't change or remove your bank account while a withdrawal is pending. |
| `bank.locked.view` | مشاهده‌ی درخواست در انتظار | View pending request |
| `errors.wallet.insufficient` | موجودی کافی نیست. | Not enough coins. |
| `errors.wallet.idempotencyKeyRequired` | درخواست ناقص بود. دوباره تلاش کنید. | The request was incomplete. Please try again. |
| `errors.wallet.accountSuspended` | در زمان تعلیق حساب، این کار ممکن نیست. | Not available while your account is suspended. |
| `errors.wallet.amountInvalid` | این مبلغ معتبر نیست. | That amount isn't valid. |
| `errors.wallet.transferRecipientNotFound` | گیرنده پیدا نشد. | Recipient not found. |
| `errors.wallet.transferSelf` | نمی‌توانید به خودتان سکه بفرستید. | You can't send coins to yourself. |
| `errors.wallet.transferBelowMin` | مبلغ کمتر از حداقل ارسال است. | The amount is below the minimum transfer. |
| `errors.wallet.transferLimit` | این مبلغ از سقف ارسال ۲۴ ساعت بیشتر است. | This is over your 24-hour sending limit. |
| `errors.wallet.transferNotTransferable` | سکه‌های هدیه‌ی ثبت‌نام هنوز قابل ارسال نیستند. | Welcome coins can't be sent yet. |
| `errors.wallet.noBankAccount` | ابتدا حساب بانکی خود را ثبت کنید. | Add your bank account first. |
| `errors.wallet.bankAccountLocked` | تا وقتی یک درخواست برداشت در انتظار است، حساب بانکی قابل تغییر نیست. | You can't change your bank account while a withdrawal is pending. |
| `errors.wallet.ibanInvalid` | شماره شبا معتبر نیست. | That Sheba number isn't valid. |
| `errors.wallet.withdrawBelowMin` | مبلغ کمتر از حداقل برداشت است. | The amount is below the minimum withdrawal. |
| `errors.wallet.withdrawLimit` | این مبلغ از سقف برداشت ۲۴ ساعت بیشتر است. | This is over your 24-hour withdrawal limit. |
| `errors.wallet.withdrawNotWithdrawable` | این مقدار سکه قابل برداشت نیست. | That many coins can't be withdrawn. |
| `errors.wallet.withdrawalNotPending` | وضعیت این درخواست تغییر کرده است. | This request is no longer pending. |
| `errors.wallet.topupAboveCap` | مبلغ از سقف شارژ دستی بیشتر است. | The amount is above the top-up cap. |

Existing keys reused:
- `coins.*`: cost, amount, fee, balance, balanceAfter, tomanEquivalent, value, balanceChip, balanceUpdated
- `money.toman`, `transfer.recipientReceives`, `withdraw.youReceive`
- `common.*`: cancel, back, close, retry, done, help, stillWorking, checkStatus, errorCode
- `net.offline`, `net.offlineAction`, `support.contact.channel`
- `account.suspended.actionBlocked`, `account.suspended.details`
- `auth.verify.*` (code component), `errors.auth.*` (auth.md §7)
- `errors.validation`, `errors.notFound`, `errors.network`, `errors.generic`, `errors.unauthenticated`

The backend `message_key` values under `errors.wallet.*` must equal the keys above (§2 rule 8). `errors.wallet.topupAboveCap` is shown only in the admin panel (admin-users-wallet.md) but lives in the shared catalog because the backend uses one namespace.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| WA-01 | Skip link → app bar (back, title, balance chip) → suspension banner (if any) → balance card (available, on hold link, welcome-coins "Why?" disclosure) → Get coins → Send coins → Withdraw → suspended or offline reason (if any) → pending summary → Withdrawal requests → Bank account → history heading → rows (each one tab stop) → Show more |
| WA-02 | Sheet title (focused on open) → amount and facts → related link → Copy reference → Close. Closing returns focus to the row. |
| WA-04 | Title (focused on open) → content in order → Copy username → support link → Close |
| TR-00 / WD-01 | Heading (focused on load) → body → help link → secondary link (WD-06) → Back to wallet |
| TR-01 | Close → stepper text → heading (focused on load) → username field → lookup status (live region) → recipient card (a group with a heading) → Yes, this is the right person |
| TR-02 | Close → stepper → heading → "To @user · Change" → amount field (helpers linked by `aria-describedby`) → preview (live) → Continue |
| TR-03 | Close → stepper → heading → cost block (a description list) → Change recipient / Change amount → notes → password → show/hide → action error → Send |
| TR-04 | Heading "Sent" (focused, announced) → facts → Copy transaction ID → Done |
| WD-02 | Close → stepper → heading → first-time hint (dismiss) → bank card → Change → locked note link → Continue |
| WD-03 | Close → stepper → heading → amount field → Maximum chip → preview → Continue |
| WD-04 | Close → stepper → heading → cost block → notes → password (password mode) → show/hide → action error → primary button |
| WD-05 | As auth.md AU-03 (code field focused after the heading is announced) → Confirm withdrawal → Resend → Back to review |
| WD-06 | Heading → rows (one tab stop each) → cap footer |
| WD-07 | Submitted banner (focused once after submitting, then the heading) → status → facts → timeline (an ordered list) → Copy bank reference → Cancel request |
| WD-08 | Heading → intro → card → Change → Remove (or the form: Sheba field → Save) → locked note link |
| WD-09 / WD-11 / TR-05 / WD-10 | Title → body → safe option (initial focus) → other option. Focus is trapped. Esc = the safe option, except while in flight. |

**Labels and semantics**
- The balance chip reads `coins.balanceChip`. Copy buttons have explicit labels (`wallet.detail.copyReference`, `transfer.receipt.copyTx`, `withdrawals.detail.copyRef`, `shop.coins.supportTopup.copyUsername`) and announce "Copied" politely.
- Ledger rows are buttons whose name is `wallet.row.a11y` with `wallet.amount.a11yIn` or `wallet.amount.a11yOut`. The "+" and "−" glyphs are hidden from screen readers (`aria-hidden`) in favor of the words.
- The cost block is a `<dl>`. The balance-after value is announced with its label.
- Status chips (withdrawals) and the recipient-found state use icon plus text. Color is secondary (P§13).
- The masked Sheba has `aria-label` = `bank.card.a11y`, so screen readers don't read out bullets.
- Disabled actions and buttons use `aria-disabled="true"`, stay focusable, and have the visible reason linked with `aria-describedby`.
- **Polite live regions:** lookup result, the amount preview (announced on blur, not per keystroke), balance changes, countdowns at start and at 0, copy confirmations, and the snackbars.
- **Assertive:** only action errors after a submit (they sit in a `role="alert"` region above the button).

**Contrast and motion**
- 4.5:1 for all text, including helper lines, preview lines, disabled reasons, and the masked Sheba. 3:1 for chip outlines and focus rings.
- Transitions between steps are a cross-fade ≤ 200 ms, with none under `prefers-reduced-motion` or `animations.reduced`. The receipt has no confetti and no count-up animation of amounts (P§8).

**Text size:** at 200% text, the action row stacks, cost-block rows stack label over value, the Sheba wraps between groups (never mid-group), and there is no horizontal scroll at 320 px.

---

## 9. Acceptance criteria

**Wallet home and history**
1. `/wallet` shows `balance` as "Available", with the toman equivalent (`balance × coin_price_toman`, locale digits). The on-hold line appears only when `locked` > 0, and the welcome-coins line only when `bonus_locked` > 0, with "Can be sent or withdrawn: {transferable}". No value on the page is computed by the client except the toman equivalent.
2. Get coins, Send coins, and Withdraw render with identical size and style (visual regression), and none is pre-focused or highlighted.
3. A suspended user sees Send coins and Get coins disabled with `account.suspended.actionBlocked` and "Details"; Withdraw, bank account, requests, and history work.
4. History shows 30 rows, then "Show more" loads the next page with `cursor` = the previous `next`. When `next` is null, `wallet.history.end` shows, and no further request is made.
5. Every `LedgerType` value renders its `wallet.tx.*` label in fa and en. Positive transfers render "Received from @user" and negative ones "Sent to @user". An unknown type renders `wallet.tx.unknown` with the raw type. No row shows a phone number, and no `admin` `ref_id` is displayed.
6. Tapping a `withdrawal_hold` or `withdrawal_refund` row opens WA-02 with a link to `/wallet/withdrawals/{ref_id}`.
7. After an admin top-up, the next focus refresh shows the snackbar `wallet.notice.topup` once, and the welcome-coins line disappears when `bonus_locked` becomes 0. A first-ever load of the wallet shows no snackbar for old rows.

**Get coins**
8. "Get coins" opens WA-04 with the rate from `coin_price_toman`, the support channel, the user's username with a working copy button, and no phone number, package, or amount suggestion.

**Transfer**
9. A user with `transferable` < `transfer.min` and `bonus_locked` > 0 gets TR-00 with the welcome-coin explanation and no shop link. A suspended user gets TR-00 suspended, even by direct URL.
10. `/wallet/transfer?to=Ali_Tbz` looks up the username at once and shows the card with the canonical `ali_tbz`. The amount field is empty.
11. Typing one's own username shows `transfer.recipient.self` without a network request. A `404` shows `transfer.recipient.notFound`. The confirm button is enabled only while a card matches the current text.
12. TR-02 shows the minimum, "Left in the last 24 hours: {remaining} of {daily_max}", and the sendable amount before typing. Amounts below `min`, above `balance`, above `transferable`, and above `remaining` each show their own message; the limit message includes `next_available_at` formatted in Jalali (fa).
13. TR-03 shows amount, fee (even 0), recipient receives, balance, and balance after. The button reads "Send {amount} coins" and is disabled until a password is entered.
14. Exactly one `POST wallet/transfer` is sent per tap. Double taps are ignored. A network timeout shows "Check status", which re-sends the same body and `Idempotency-Key`. The ledger contains exactly one transfer.
15. A wrong password shows `wallet.password.wrong`, clears and focuses the field, and does **not** open the session-expired dialog. `AUTH_LOCKED` shows a countdown that survives a reload.
16. Each transfer error code in §3.9 lands on the listed step with the listed message. `WALLET_INSUFFICIENT` never shows a shop link.
17. TR-04 shows the amount, recipient, fee, received, new balance (`result.balance`), time, and a copyable `tx_id`. "Done" and Back go to `/wallet`, and the balance chip shows `result.balance`.

**Bank account**
18. The Sheba field accepts `IR82 0540 1026 8002 0817 9090 02`, `۸۲۰۵۴۰۱۰۲۶۸۰۰۲۰۸۱۷۹۰۹۰۰۲`, and `820540102680020817909002` as the same value. Wrong length, a bad checksum, and an unknown bank code (when the list is available) each show their own message before any request.
19. `IBAN_INVALID` reasons `format`, `checksum`, and `bank` map to the same three messages.
20. The card shows the bank name in the UI language and the masked Sheba grouped in 4s, LTR, with bullets. Screen readers hear "{bank} account, Sheba ending {last4}".
21. Replacing an account shows the confirmation with the old masked Sheba before `POST`. With a pending withdrawal, Change and Remove are disabled with `bank.locked` and a link to the pending request, and `BANK_ACCOUNT_LOCKED` from a race shows the same state.

**Withdrawal**
22. WD-01 appears instead of step 1 when `withdrawable` < `withdraw.min` (welcome-coin variant shows "Withdrawable now: X of Y") or `withdraw.remaining` < `withdraw.min` (with `next_available_at`). A suspended user can reach step 1.
23. With `withdraw.confirm` = `password`: the stepper shows 3 steps, WD-04 has the password field and "Request withdrawal of {amount} coins", `POST wallet/withdrawals/otp` is never called, and no screen promises an SMS.
24. With `withdraw.confirm` = `sms`: the stepper shows 4 steps, and WD-04's button is "Send confirmation code". Before sending the code, the client re-fetches `GET wallet` and blocks the code if the amount no longer passes.
25. WD-03 shows the helper lines before typing. The "Maximum" chip is inactive by default and fills min(`withdrawable`, `remaining`). The preview shows the fee in coins and the payout in toman = (amount − fee) × `coin_price_toman`.
26. WD-04 shows amount, fee (even 0), paid to your bank (toman), bank card, balance, balance after, the rate line, the timing rule, and the cancel note. It never shows a client-computed date.
27. A `503 SMS_UNAVAILABLE` on the code request switches WD-04 to password mode with `withdraw.review.smsOff` when `GET wallet` now says `password`, keeping the amount.
28. WD-05 masks the phone as `0912•••••89`, shows the validity and resend countdowns, and handles `AUTH_OTP_INVALID`, `AUTH_OTP_EXPIRED`, and `AUTH_OTP_RATE_LIMITED` as on AU-03. "Back to review" holds nothing.
29. Success replaces the flow with `/wallet/withdrawals/{id}`: status Pending, "Expected by {expected_by}" (Jalali in fa), and the submitted banner. Back goes to `/wallet`. `/wallet` shows the on-hold line with the amount.
30. `WITHDRAW_LIMIT`, `WITHDRAW_NOT_WITHDRAWABLE`, and `WITHDRAW_BELOW_MIN` after a code return to WD-03 with the field error plus `withdraw.code.used`.
31. A timeout on submit shows "Check status", which re-sends the same body and key and lands on the created request. Exactly one request exists.

**Requests and cancel**
32. WD-06 lists requests newest first with a status chip (icon plus text), amount, toman payout, requested date, and expected date for pending ones. The empty state has no action.
33. WD-07 for a pending request past `expected_by` (Tehran date) shows `withdrawals.detail.late` without alarm styling. Paid shows the bank reference with copy. Rejected shows the reason and `withdrawals.detail.returned`.
34. Cancel asks for confirmation (focus on "Keep request"), then shows Cancelled and `withdrawals.cancel.done`, and the balance returns. `WITHDRAWAL_NOT_PENDING {status: paid}` shows the Paid state with `withdrawals.cancel.alreadyPaid`.

**Cross-cutting**
35. Offline: cached wallet values stay readable with "Last updated"; every write action is disabled with `net.offlineAction`; entries except passwords and codes survive going offline and back online.
36. Every screen passes at 360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, and 1440 × 900 in fa and en, portrait and landscape: no horizontal scroll, no clipped text at 200%, all targets ≥ 44 × 44 px, and task-flow primary buttons in the bottom 40% in portrait.
37. At `md`/`lg`, `/wallet` shows the history with the WA-02 side panel, and `/wallet/withdrawals` shows list plus detail with the URL following the selection.
38. Every string on these screens comes from a key in §7 (or the listed existing keys) with fa and en text. No raw API `message`, code, or English appears in fa except the code line of `errors.generic`.
39. Contrast ≥ 4.5:1 for all text (automated). No information relies on color alone (status chips, signs, errors).

---

## 10. Open questions

For the main agent unless noted. Items 1–5 affect correctness or trust; please prioritize them.

1. **Withdrawal code is consumed before the limit checks.** `WithdrawalsView.post` verifies and consumes the SMS code before `request_withdrawal` checks `min`, the rolling limit, and `withdrawable`. A failing amount burns the code, and the user must request a new one (which counts toward the OTP rate limit). The UI pre-validates against a fresh `GET wallet` (§3.6 step 4, SMS mode), but races remain. Please run the amount checks before verifying the code, or add `POST wallet/withdrawals/preview {amount}` that validates without a code.
2. **Price or fee changes between review and submit are silent.** `transfer.fee_pct`, `withdraw.fee_pct`, and `coin.price_toman` are read at submit time. If an admin changes them after the user reviewed, the recipient gets a different amount, or the payout toman differs from what was shown. P§2.2 requires an error and a refreshed review. Proposal: accept `expected_fee` (transfer) and `expected_payout_toman` (withdrawal), and return `409 PRICE_CHANGED` with the new values when they differ.
3. **Expected date before submitting, and holidays.** The review can't show "Expected by {date}" because the API returns `expected_by` only after creation (P§2.5 asks for it on review). Please add it to `GET wallet` (e.g. `withdraw.expected_by_if_now`) or to the preview in item 1. Also, `next_working_day` skips only Fridays. Official Iranian holidays (and Thursdays, if finance doesn't work them) need a calendar, or the promise will be wrong around Nowruz.
4. **Wrong-password status code.** Transfer and withdrawal password checks return `401 AUTH_INVALID_CREDENTIALS`, the same status and code as a failed login. Generic 401 handling in the apps could treat it as an expired session, and the catalog text ("The mobile number or password is incorrect") doesn't fit. Proposal: `400` or `403` with a wallet-specific code (e.g. `WALLET_PASSWORD_INVALID`, `errors.wallet.passwordInvalid`) and a wallet-specific lock code. Until then, the UI maps by endpoint (§3.9).
5. **Withdrawal list pagination.** `GET wallet/withdrawals` returns at most 100 with `next: null`. Please add cursor pagination like the ledger.
6. **`requestWithdrawalCode` type mismatch.** `packages/api-client` types it as `OtpRequestResponse` (which has an `sms` discriminator), but the endpoint returns `{expires_in, resend_after}` without `sms`. Please add a dedicated type, e.g. `WithdrawalCodeResponse`.
7. **Receipt data.** `TransferResult` has no `created_at`, so the receipt uses the client clock. The ledger rows don't carry `tx_id`, so the receipt's transaction ID can't be matched to a history row, and the sender's row doesn't show the fee. Proposal: add `created_at` to `TransferResult`, and `tx_id` plus `fee` (for transfers) to `LedgerRow`.
8. **Explicit SMS flag for the wallet.** The UI infers "SMS is on" from `withdraw.confirm` = `"sms"`, to decide whether to promise a text when a withdrawal is paid. An explicit `sms_enabled` flag (wallet summary or a public config, see auth.md open question 14) would be clearer.
9. **Antifraud error codes.** §7.12 blocks withdrawals for accounts with an open flag, and §7.13 refuses transfers between linked accounts. Neither is implemented yet (step 14). Please reserve codes now, e.g. `WITHDRAW_BLOCKED` and `TRANSFER_REFUSED`, so the UI copy (`withdraw.unavailable.blocked`, P§2.5 refused copy) can be wired. Also: should `GET wallet` expose `withdraw_blocked: bool`, so WD-01 can explain before the user starts?
10. **Bank list on the client.** Instant bank-name display and the "unknown bank" check before saving need the bank-code list (`BANKS` in `backend/wallet/iban.py`). Please expose `GET banks` (public, cacheable) or ship the list in a shared package. Until then, the bank name appears only after saving, and `bank` errors come from the server.
11. **Reject reason language.** `reject_reason` is free text from an admin, shown to the player as written. An English-UI player may get Persian text, and internal notes could leak. Proposal: a reason category key (localized) plus an optional note, with admin guidance "the player sees this" (admin-users-wallet.md).
12. **Admin id in the player ledger.** `admin_topup` rows carry `ref_type: "admin"`, `ref_id: <admin id>` in the player's ledger API. The UI never shows it, but the API should not expose internal admin ids to players.
13. **Toman equivalent on transfers** (patterns.md open question 6). This spec shows it as secondary text on the transfer amount. Please confirm.
14. **Rejection notice.** Should a rejection also send an SMS (journeys.md open question 7)? Should there be a `wallet.updated` push or WebSocket event, so the chip and notices update without focus polling (journeys.md open question 8)?
15. **Transfer recipient rules.** The server accepts suspended recipients. Is that intended? (Recommended: yes, since receiving isn't spending.) Bots have no user account, so they can't receive; confirm that no bot username can resolve in `GET users/{username}`.
