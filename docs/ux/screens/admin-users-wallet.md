# Admin panel: users, wallet top-up, withdrawals queue

Status: draft for UI build (CLAUDE.md §17 step 3: admin top-up §7.9 and withdrawal approval §7.12. The rest of the Users section of §13 comes in step 15).
Surface: `admin.x3d.ir` (`apps/admin`), desktop-first. fa by default, en switch. Same shell, conventions, breakpoints, and dialog rules as admin-settings.md (AD-01 to AD-09).
Sources: CLAUDE.md §2 rules 3–5, 8, 11, 12; §7.1, §7.9, §7.10, §7.12; §12.1 (roles, account status); §13 (Users, Withdrawals); §14 (`admin.topup_max_amount`, `coin.price_toman`, `sms.enabled`); `sms.md` §1, §5; admin-settings.md; wallet.md (player side of the same data); patterns.md (P§) 4, 10, 13, 18.

**API (implemented in `backend/adminapi/wallet_views.py`, all under `/api/v1/admin/`):**

| Call | Roles | Response / notes used by this spec |
| --- | --- | --- |
| `GET users?q=` | all admin roles | `{results: AdminUserRow[], next: null}`: newest first, **max 50**. `q` matches `username` (contains, case-insensitive). If `q` has ≥ 4 digits, it also matches `phone` containing the last 10 digits. An empty `q` → the 50 newest accounts. `AdminUserRow`: `id`, `username` (nullable), `phone` (full, E.164), `status`, `created_at`, `balance` |
| `GET users/{id}` | all admin roles | `AdminUserDetail`: the row plus `elo`, `level`, `lang`, `wallet` (`WalletSummary`, the same object players get, wallet.md), and `ledger` (the latest **50** entries: `id`, `type`, `amount`, `created_at`; no counterparty) |
| `POST users/{id}/wallet/topup {amount, reason}` + `Idempotency-Key` | finance, superadmin | `{balance_before, balance_after, created}`. `amount` ≥ 1; `reason` 3–500 characters. Audited as `wallet.topup` (before/after balance, amount, reason) only when `created`. A replayed key → `created: false`. |
| `GET withdrawals?status=` | finance, superadmin | `{results: AdminWithdrawal[], next: null}`: **oldest first**, max **200**, optional `status` = `pending`, `paid`, `rejected`, `cancelled`. `AdminWithdrawal` = the player `Withdrawal` (`id`, `amount`, `fee`, `payout_toman`, `status`, `expected_by`, `bank` masked + bank names, `bank_reference`, `reject_reason`, `created_at`, `decided_at`) plus `iban` (full) and `user {id, username, phone}` |
| `POST withdrawals/{id}/approve {bank_reference}` | finance, superadmin | `Withdrawal` with `status: paid`. `bank_reference` 3–64 characters. Audited as `withdrawal.approve`. If `sms.enabled`, the player gets the withdrawal-paid SMS (amount and reference). |
| `POST withdrawals/{id}/reject {reason}` | finance, superadmin | `Withdrawal` with `status: rejected`. `reason` 3–500 characters, **shown to the player as written** (wallet.md WD-07). Coins return to the player. Audited as `withdrawal.reject`. |
| `GET audit?target_type=&target_id=` | superadmin | The latest 200 matching entries (admin-settings.md) |
| `GET settings` | all admin roles | Used to read `admin.topup_max_amount` (0 = no cap) and `sms.enabled` |

Error codes:

| Code | Endpoints |
| --- | --- |
| `TOPUP_ABOVE_CAP {cap}` | top-up |
| `AMOUNT_INVALID` | top-up |
| `IDEMPOTENCY_KEY_REQUIRED` | top-up |
| `VALIDATION {fields}` | top-up, approve, reject |
| `WITHDRAWAL_NOT_PENDING {status}` | approve, reject |
| `NOT_FOUND` | any |
| `ADMIN_FORBIDDEN {reason: role\|ip\|host}` | any |
| `ADMIN_UNAUTHENTICATED` | any |

---

## 1. Goal and user story

- As a **support** admin, I want to find a player by phone or username in seconds and see their account status and wallet, so I can answer "where are my coins?" without guessing.
- As a **finance** admin, I want to top up a player's wallet while online purchase isn't available (§7.9). I want to see exactly what will change (amount, toman value, balance before → after) and record why, so that a typo never adds 10,000 coins and every top-up is traceable.
- As a **finance** admin, I want a queue of pending withdrawals, oldest first, with the full Sheba and the exact toman to pay. After I make the bank transfer, I record its reference; or I reject with a reason the player will read. Two admins must never pay the same request twice.
- As a **superadmin**, I want the same, plus the audit trail of each top-up and withdrawal decision.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Admin nav "Users" | AD-10 `/users` (the 50 newest accounts until a search is typed) |
| Admin nav "Withdrawals" (finance, superadmin) | AD-13 `/withdrawals?status=pending` |
| `/` after sign-in | Until the Dashboard exists: finance → `/withdrawals`; support and superadmin → `/users`. This replaces the "`/` → `/settings`" rule of admin-settings.md §2. |
| Deep link `/users?q=<username>` | AD-10 with results. Phone searches are never written to the URL (§3.1 step 2). |
| Deep link `/users/[id]` | AD-11 |
| Deep link `/withdrawals?status=<s>&id=<id>` | AD-13 on that tab, with the AD-14 drawer open if the row is in the loaded list; otherwise the note "This request isn't in the current list" (open question 9) |
| Player name in the withdrawals queue | AD-11 |

| Exit | Destination |
| --- | --- |
| Back from AD-11 | AD-10 with the previous query and scroll position |
| Session expired | AD-08 → AD-01 with `next` (admin-settings.md) |
| Role lacks access (support opening `/withdrawals`) | The in-page "No access" state (§5); no redirect loop |

---

## 3. Flow

### 3.1 Find a user (AD-10)

1. On load: `GET users?q=` (empty) → the "Newest accounts" list.
2. **One search field**, "Phone number or username". Search runs on Enter, or after 400 ms without typing once the text has 2 or more characters. Before sending, the client normalizes the text:
   - Trim spaces, strip one leading `@`, and convert Persian and Arabic-Indic digits to Latin (the API compares ASCII digits).
   - **Phone-like input** (only digits, `+`, spaces, dashes, parentheses): remove everything except digits. Then drop a leading `0098`, or a leading `98` when the input started with `+98`, or a single leading `0`. So `0912 345` → `912345`, which matches the stored `+98912345…`. The API currently misses partial numbers typed with the leading `0` (open question 6).
   - Username input is sent as typed (after trim).
   - Only non-phone queries are synced to the URL (`?q=`). Phone numbers stay out of browser history and logs (P§18).
3. Results table, newest first. Columns:
   - Username (or "No username" in muted text plus an icon)
   - User id (`#123`, LTR)
   - Phone: displayed as `0912 345 6789`, LTR, Latin digits
   - Status chip: Active, Suspended, or Banned (icon plus text)
   - Joined date (Jalali in fa)
   - Available balance (coins)
4. Row click or Enter on a focused row → AD-11.
5. **Exactly 50 results** → footer `admin.users.capped` "Showing the first 50 matches. Add more of the number or username to narrow the search." (open question 6).
6. **No results** → `admin.users.empty` with the normalized query shown, plus the hint "Phone searches need at least 4 digits."

### 3.2 View a user (AD-11)

1. `GET users/{id}`.
2. **Header:**
   - Username, id, and status chip
   - Phone: full, LTR, with a copy button labelled "Copy phone number"
   - Joined date, language, ELO, and level
3. **Wallet card:** every figure from `wallet` (the same `WalletSummary` the player sees):

   | Line | Value |
   | --- | --- |
   | Available | `balance`, plus toman (`× coin_price_toman`) |
   | On hold (pending withdrawals) | `locked` |
   | Welcome coins still locked | `bonus_locked`, with the note "Unlocks on the first purchase or top-up" |
   | Withdrawable | `withdrawable` |
   | Transferable | `transferable` |
   | Transfers, last 24 h | `used_24h` of `daily_max`; next free at `next_available_at` |
   | Withdrawals, last 24 h | same fields for `withdraw` |
   | Withdrawal confirmation | "SMS code" or "Password (SMS is off)" (`withdraw.confirm`) |

4. **Actions** (finance, superadmin): "Top up wallet" → AD-12. Support sees no button, and instead the line `admin.user.topupRoleNote` "Top-ups are done by finance or a superadmin."
5. **Recent transactions:** the latest 50 ledger entries. Columns:
   - Date and time (Jalali, with seconds)
   - Type (the `wallet.tx.*` label; for transfers, the direction by sign: "Transfer in" / "Transfer out", because the admin ledger has no counterparty, open question 5)
   - Signed amount
   - Entry id
   The footer states "Latest 50 entries".
6. **Admin actions on this user** (superadmin only): `GET audit?target_type=user&target_id={id}`. Shows top-ups with date, admin, amount, before → after, and reason. Finance and support don't see this block (the API limits audit to superadmin; open question 4).
7. **Not shown yet** because the API lacks them (no placeholder links, as in admin-settings.md): suspend/ban, manual adjustment, bank account, this user's withdrawals, match history, sessions, referral, fraud flags. See open questions 1–4.

### 3.3 Top up a wallet (AD-12), finance and superadmin

1. "Top up wallet" → AD-12 dialog, **step 1 "Amount and reason"**:
   1. Player line: @username · #id · status chip · available balance.
   2. **Presets:** the coin packages, as chips (coins and toman), with none selected (§7.9). There is no packages endpoint yet (step 9, open question 3). **Until it exists, the preset row is not shown.** No invented values.
   3. **Amount (coins):** empty. It accepts Persian and Latin digits, with grouping on blur.
      - Helper: `admin.topup.capHelper` "Up to {cap} coins per top-up" (from `admin.topup_max_amount`), or `admin.topup.noCap` when it is 0.
      - Live line: "= {toman} toman" (`amount × wallet.coin_price_toman`).
   4. **Reason** (required, 3–500 characters, counter): label "Reason (saved in the audit log; the player doesn't see it)". The player's ledger shows only "Top-up by support" (wallet.md).
   5. "Review top-up" is disabled with a visible reason until the amount is a whole number from 1 to the cap and the reason has at least 3 characters: `admin.topup.disabled.amount`, `.cap`, or `.reason`.
2. "Review top-up" → re-read `GET users/{id}` (fresh balance and status) → **step 2 "Confirm"**:
   1. Summary list:
      - Player (@username, #id, status)
      - Amount (coins) and toman
      - Available balance: before → after, where after = before + amount, labelled "expected"
   2. **Notes and warnings** (non-blocking, icon plus text):
      - Always: `admin.topup.source` "Coins are issued from platform sales. This can't be undone here." (There is no reversal or adjustment endpoint yet, open question 2.)
      - If `bonus_locked` > 0: `admin.topup.unlocksBonus` "This is the account's first top-up: {bonus} welcome coins become withdrawable and transferable."
      - If the status is `suspended`: `admin.topup.suspended` "This account is suspended. It can't spend coins, but it can withdraw them."
      - If the status is `banned`: `admin.topup.banned` "This account is banned and can't sign in." (Whether this should be blocked is open question 12.)
   3. Buttons: "Back to edit" and "Add {amount} coins".
   4. **One `Idempotency-Key`** is generated when step 2 opens. It is kept across retries and discarded when the admin goes back and changes the amount.
3. "Add {amount} coins" → `POST users/{id}/wallet/topup {amount, reason}`:
   - **In flight:** button spinner; the dialog can't be dismissed (Esc and the scrim are ignored); repeat clicks are ignored.
   - **`created: true`** → close the dialog. Snackbar `admin.topup.done` "Added {amount} coins to @{username}. Balance {before} → {after}" (from the response). Re-fetch AD-11: the new `admin_topup` row appears at the top of the ledger. Focus returns to "Top up wallet".
   - **`created: false`** → close the dialog. Snackbar `admin.topup.already` "This top-up was already applied." Re-fetch AD-11. Don't show the response's before/after, because on a replay they are both the current balance (open question 11).
   - **`TOPUP_ABOVE_CAP {cap}`** → back to step 1, with the amount field error `admin.topup.error.cap` showing the server cap (it may have changed). The reason is kept.
   - **`AMOUNT_INVALID`, or `VALIDATION` on `amount`** → step 1 amount error. **`VALIDATION` on `reason`** → step 1 reason error.
   - **`ADMIN_FORBIDDEN {reason: role}`** → close; the page becomes read-only with the banner `errors.admin.forbidden`.
   - **`NOT_FOUND`** → close; screen error "This user no longer exists."
   - **`401`** → AD-08.
   - **Network error or no answer in 10 s** → stay on step 2 with `admin.topup.unknown` "We couldn't confirm the top-up." and "Check status". It re-sends the same body with the same key. The server either returns `created: false` (already applied → as above) or applies it exactly once. It is never a blind retry with a new key.

### 3.4 Withdrawals queue (AD-13, AD-14)

1. Tabs: **Pending** (default) · Paid · Rejected · Cancelled · All. Each tab → `GET withdrawals?status=<s>` (All: no parameter). The tab is in the URL.
2. **Pending tab:**
   - Oldest first (API order), because the oldest is closest to its one-working-day promise (§7.12).
   - **Summary bar** above the table, computed from the loaded rows and labelled "in this list": «{n} درخواست · {coins} سکه · {toman} تومان برای پرداخت», plus "{k} past the expected date" when k > 0 (icon plus text).
   - Columns:

     | Column | Content |
     | --- | --- |
     | Requested | Date, time, and age ("3 h ago") |
     | Expected by | `expected_by`; when today's Tehran date is after it, an "Overdue" marker (icon plus text) |
     | Player | @username (link to AD-11), #id, and the phone (LTR) |
     | Amount | Coins, and the fee in coins |
     | Pay | `payout_toman` in toman (bold), with rial (`payout_toman × 10`) as secondary text |
     | Bank | Bank name (`bank.fa` / `bank.en`) and the **full Sheba** (`iban`, LTR, grouped in 4s, monospace), with "Copy Sheba" (copies `IR` + 24 digits, no spaces) |
     | Actions | "Mark as paid" and "Reject" |

   - Row copy actions: "Copy amount (rial)" (Latin digits, no separators, for bank forms) and "Copy amount (toman)".
3. **History tabs** (Paid, Rejected, Cancelled, All): columns are Requested, Player, Amount, Pay, Status chip, Decided at, and "Reference / reason" (bank reference for paid, the reason for rejected). Decided by is missing (open question 8).
   - The API returns the **oldest** 200 first. When 200 rows come back, a notice says: "Showing the oldest 200 requests. Newer ones aren't listed until sorting and paging are available." (open question 7).
   - The client doesn't re-sort to fake "newest", because the newest might not be in the result.
4. **Row click → AD-14 drawer** (end side), with every field of the request:
   - Timeline: requested → decided
   - Payout in toman and rial; the rate is implied by `payout_toman` ÷ (`amount` − `fee`), shown as "rate at request: {price} toman per coin"
   - Full Sheba with copy, and the bank reference or reason
   - The player's current status and wallet summary, loaded lazily with `GET users/{user.id}`, because the withdrawal payload has no player status (open question 8)
   - Superadmin only: the audit entries for this request (`GET audit?target_type=withdrawal&target_id={id}`)
   - Pending requests also get "Mark as paid" and "Reject" buttons here.
5. **Refresh:** a "Refresh" button, plus an automatic re-fetch when the tab regains focus and after every approve or reject. No polling timer.

### 3.5 Mark as paid (AD-15)

1. "Mark as paid" → AD-15 dialog. `GET users/{user.id}` loads in parallel, for the player's status.
2. **Content:**
   1. Title "Mark withdrawal #{id} as paid"
   2. Summary:
      - Player (@username, #id, status chip)
      - Amount and fee (coins)
      - **Pay: {toman} toman ({rial} rial)**
      - Bank name
      - **Full Sheba** (with copy)
      - Requested and expected-by dates
   3. Instruction `admin.approve.instruction` "Make the bank transfer first. Then enter the transfer's reference number here."
   4. **Bank reference** field: required, 3–64 characters, `dir="ltr"`, monospace. Persian and Arabic-Indic digits are converted to Latin; spaces are trimmed.
   5. **Confirmation checkbox**, unchecked: `admin.approve.ack` "I have transferred {toman} toman to this Sheba."
   6. **Player status warning**, if the status isn't `active`:
      - Banned: `admin.approve.banned` "This account is banned. Its pending withdrawals are held for an admin decision (§12.1). Approve only after review."
      - Suspended: `admin.approve.suspended` "This account is suspended. Suspended players may still withdraw."
      - For banned accounts, a second acknowledgment is required: `admin.approve.bannedAck` "I reviewed this banned account's request."
   7. **Player notice line**, from `sms.enabled` (read from `GET settings`):
      - On: `admin.approve.smsOn` "The player will get a text with the amount and this reference."
      - Off: `admin.approve.smsOff` "SMS is off: the player sees the status in the app only."
   8. Buttons: "Cancel" (initial focus) and "Mark as paid" (disabled with a reason until the reference is valid and the acknowledgment or acknowledgments are ticked).
3. **Submit** → `POST withdrawals/{id}/approve {bank_reference}`:
   - In flight: the dialog is locked.
   - **`200`** → close. Snackbar `admin.approve.done` "Withdrawal #{id} marked as paid." The row leaves Pending. Focus moves to the next row's "Mark as paid", or to the table heading if the list is empty.
   - **`WITHDRAWAL_NOT_PENDING {status}`** → keep the dialog open, disable the form, and show `admin.decision.already` (worded per `status`). The primary button becomes "Close".
     - For `paid`, re-fetch the list and show the recorded bank reference with `admin.approve.dontPayAgain` "Don't transfer again. Compare the recorded reference with your bank." (Critical: prevents double payment when two admins work the queue.)
     - For `cancelled`, add `admin.approve.cancelledByPlayer` "The player cancelled this request. If you already transferred money, contact the player through support."
   - **`VALIDATION` on `bank_reference`** → field error `admin.approve.error.reference`.
   - **`NOT_FOUND`** → close and refresh; snackbar `admin.withdrawals.gone`.
   - **Network error or no answer in 10 s** → `admin.decision.unknown` "We couldn't confirm the result." with "Check status". It re-fetches the list:
     - The request is `paid` with this reference → treat as success.
     - The request is still `pending` → "Mark as paid" can be pressed again. This is safe: the server moves coins only once, and a second attempt gets `WITHDRAWAL_NOT_PENDING`.
     - The request is decided with a different reference → as `WITHDRAWAL_NOT_PENDING`.

### 3.6 Reject (AD-16)

1. "Reject" → AD-16 dialog:
   1. Title "Reject withdrawal #{id}"
   2. Summary: player, amount, pay (toman), and the effect line `admin.reject.effect` "{amount} coins go back to the player's balance."
   3. **Reason** (required, 3–500 characters, counter). Helper `admin.reject.helper` "The player sees this reason exactly as written, in the app. Write it plainly in the player's language, and don't include internal notes." The player's language (`lang` from `GET users/{id}`) is shown next to the field: "Player's language: فارسی" (open question 13).
   4. Buttons: "Cancel" (initial focus) and "Reject and return {amount} coins" (destructive style plus text; not color alone).
2. Submit → `POST withdrawals/{id}/reject {reason}`. Outcomes follow §3.5 step 3:
   - Success → snackbar `admin.reject.done`.
   - `WITHDRAWAL_NOT_PENDING` → the already-decided state. For `paid`: "This request was already paid; it can't be rejected."
   - The player gets no SMS for a rejection (open question 14).

---

## 4. Screen list

### Shell changes (AD-02)

- **Navigation** (start side), in §13 order, showing only sections that exist:
  - Users (all roles)
  - Settings (all roles)
  - Withdrawals (finance, superadmin; hidden for support)
- **Withdrawals nav item badge:** the pending count (number plus text, e.g. "Withdrawals, 12 pending"), from the last load of the Pending tab. It is shown only after the admin has visited the queue in this session, because there is no count endpoint (open question 7).
- The header shows `AdminMe.environment` as the environment chip ("Staging" / "Production", icon plus text; admin-settings.md open question 9 is resolved by the API). On Production, the top-up and approve dialogs repeat the chip next to their titles.

### AD-10 Users `/users`

- **Purpose:** find a player.
- **Content priority:**
  1. Title "Users"
  2. Search field (focused on load)
  3. The list label: "Newest accounts", or "Results for {q}" (phone queries shown normalized, e.g. "Results for 912345")
  4. Results table
  5. Cap footer
- **Primary action:** search. Rows open the detail.

### AD-11 User detail `/users/[id]`

- **Purpose:** understand a player's account and wallet; top up.
- **Content priority:**
  1. Header (identity and status)
  2. Wallet card
  3. "Top up wallet" (role-gated)
  4. Recent transactions
  5. Admin actions on this user (superadmin)
- **Primary action:** Top up wallet (finance, superadmin); none for support.

### AD-12 Top-up dialog (two steps)

- Step 1: player line, presets (when available), amount, toman line, reason, "Review top-up".
- Step 2: summary, balance before → after, notes and warnings, "Back to edit", "Add {amount} coins".
- 560 px wide (admin-settings.md §6); full screen below 600 px.

### AD-13 Withdrawals `/withdrawals`

- **Purpose:** process pending withdrawals and look up past ones.
- **Content priority:**
  1. Title
  2. Status tabs
  3. Summary bar (Pending)
  4. Refresh
  5. Table
  6. Cap notice
- **Primary action:** per row, "Mark as paid".

### AD-14 Withdrawal drawer

- End-side drawer, 440 px at `lg`, full screen below `md`. Content per §3.4 step 4. It closes with Esc or the Close button; focus returns to the row.

### AD-15 Mark as paid dialog

- Content per §3.5 step 2. 560 px.

### AD-16 Reject dialog

- Content per §3.6 step 1. 560 px.

---

## 5. States

| State | AD-10 Users | AD-11 User | AD-12 Top-up | AD-13 Withdrawals | AD-14 Drawer | AD-15 / AD-16 |
| --- | --- | --- | --- | --- | --- | --- |
| **Loading** | Table skeleton (8 rows); the search stays usable | Header and card skeletons; ledger skeleton | Step 2 waits for the fresh user read (button spinner "Checking…"); submit spinner | Table skeleton; tabs usable | Section skeletons; player status loads separately | Player status line skeleton; submit spinner, dialog locked |
| **Empty** | "No users match {q}." + phone hint; with no query and no users: "No accounts yet." | Ledger empty: "No transactions yet." | — | Pending: `admin.withdrawals.emptyPending` "No pending withdrawals." Other tabs: "No {status} withdrawals." | — | — |
| **Error** | Load failed: screen error + Retry | `NOT_FOUND`: "No user with id {id}." + "Back to users". Other: screen error + Retry | §3.3 step 3 | Load failed: screen error + Retry | Player load failed: inline "Couldn't load the player's status" + Retry (the decision buttons stay enabled; the status warning shows "Unknown") | §3.5 step 3, §3.6 step 2 |
| **Offline** | Banner; the last results stay, marked "Last loaded {time}" | Banner; cached view; "Top up wallet" disabled with the reason | "Add" disabled with the reason; entries kept | Banner; cached list; decision buttons disabled with the reason | Readable | Submit disabled with the reason; the reference or reason text is kept |
| **Reconnecting** | Not applicable (no socket). When the connection returns: re-fetch the current view; keep open dialogs. | ← | ← | ← | ← | ← |
| **Insufficient coins** | Not applicable: admins spend no coins, and top-ups come from `platform:sales`. | | | | | |
| **Permission (role)** | All roles | Support: no top-up button, with a role note; no audit block for finance and support | Not reachable for support | Support: nav hidden; direct URL → in-page "No access: withdrawals are handled by finance." (from `ADMIN_FORBIDDEN {reason: role}`) | Audit block superadmin only | Finance and superadmin only |
| **Player suspended / banned** | Status chip | Status chip in the header; the wallet is still shown | Warning notes (§3.3 step 2) | Not visible in the row (open question 8); shown in the drawer | Status chip and warning | Warning; banned needs the extra acknowledgment |
| **Concurrent change** | — | Balance changed since step 1 → step 2 shows the fresh "before" | Replay → "already applied" | Refresh after focus | Re-fetch on open | `WITHDRAWAL_NOT_PENDING` handling, with "don't pay again" |
| **First-time admin** | Newest accounts list | — | Cap helper explains the limit | Pending tab explains the rule in one line: "Pay within one working day of the request. Oldest first." | — | Instruction line |

---

## 6. Responsive notes

Desktop-first, reviewed at 1440 × 900 (primary), 1280 × 800, 1024 × 768, 768 × 1024, and 390 × 844 (emergency use on a phone), in fa then en (admin-settings.md §6).

| Width | AD-10 / AD-11 | AD-13 | Drawer and dialogs |
| --- | --- | --- | --- |
| ≥ 1280 | Nav column + content (max 1200 px). AD-11: two columns (header and wallet card on the start side; ledger on the end side). | Full table with all columns; Sheba on one line | Drawer 440 px; dialogs 560 px |
| 1024–1279 | Icon rail. AD-11 single column: wallet card above the ledger. | Player and Bank columns stack two lines each; the Sheba wraps between groups (never mid-group) | Same |
| 600–1023 | Top bar with a menu. Users table → cards (username, status, phone, balance). | One card per request: pay amount (large), player, bank and Sheba, expected-by with the overdue marker, and an action row | Drawer full width; dialogs at 90% |
| < 600 | Cards; search full width | Cards; the summary bar wraps; actions full-width buttons | Full-screen dialogs with a sticky footer |

- The table never scrolls horizontally at ≥ 1024 px. At 200% zoom, it falls back to cards (container queries on the content area).
- Money is always shown in full (never abbreviated as "1.2M"): finance copies exact values.

---

## 7. RTL/LTR notes and i18n keys

- fa first. The nav is on the right in fa; the drawer opens from the end side (left in fa). The before → after arrow mirrors (admin-settings.md §7).
- **Always LTR with Latin digits:** phone numbers, Sheba (monospace, grouped in 4s), bank references, user ids, withdrawal ids, and usernames (`<bdi dir="ltr">`).
- **Formatted values:** locale digits and grouping for coins, toman, and rial («۱٬۲۰۰٬۰۰۰ تومان»). Dates are Jalali with time in fa, Gregorian in en. `expected_by` is date-only.
- **Copy buttons** copy machine-friendly values: Latin digits and no grouping for amounts; no spaces in the Sheba.
- **Ledger type labels** reuse `wallet.tx.*` from the shared catalog (wallet.md §7). Admin transfer rows use `admin.user.tx.transferIn` / `.transferOut` (no counterparty available).
- Bank names come from the API (`bank.fa` / `bank.en`).

| Key | fa | en |
| --- | --- | --- |
| `admin.shell.nav.users` | کاربران | Users |
| `admin.shell.nav.withdrawals` | برداشت‌ها | Withdrawals |
| `admin.shell.nav.withdrawalsBadge` | برداشت‌ها، {count} در انتظار | Withdrawals, {count} pending |
| `admin.status.active` | فعال | Active |
| `admin.status.suspended` | تعلیق | Suspended |
| `admin.status.banned` | مسدود | Banned |
| `admin.users.title` | کاربران | Users |
| `admin.users.search` | شماره موبایل یا نام کاربری | Phone number or username |
| `admin.users.searchHelp` | برای جستجوی شماره دست‌کم ۴ رقم وارد کنید. | Phone searches need at least 4 digits. |
| `admin.users.newest` | جدیدترین حساب‌ها | Newest accounts |
| `admin.users.resultsFor` | نتایج برای «{q}» | Results for "{q}" |
| `admin.users.col.username` | نام کاربری | Username |
| `admin.users.col.id` | شناسه | ID |
| `admin.users.col.phone` | موبایل | Phone |
| `admin.users.col.status` | وضعیت | Status |
| `admin.users.col.joined` | عضویت | Joined |
| `admin.users.col.balance` | موجودی | Balance |
| `admin.users.noUsername` | بدون نام کاربری | No username |
| `admin.users.capped` | ۵۰ نتیجه‌ی اول نمایش داده می‌شود. برای محدود کردن، بخش بیشتری از شماره یا نام کاربری را وارد کنید. | Showing the first 50 matches. Add more of the number or username to narrow the search. |
| `admin.users.empty` | کاربری با «{q}» پیدا نشد. | No users match "{q}". |
| `admin.users.emptyAll` | هنوز حسابی ساخته نشده است. | No accounts yet. |
| `admin.users.loadError` | کاربران بارگذاری نشدند. | Couldn't load users. |
| `admin.user.notFound` | کاربری با شناسه‌ی {id} وجود ندارد. | No user with id {id}. |
| `admin.user.backToUsers` | بازگشت به کاربران | Back to users |
| `admin.user.copyPhone` | کپی شماره موبایل | Copy phone number |
| `admin.user.joined` | عضویت: {date} | Joined {date} |
| `admin.user.lang` | زبان: {lang} | Language: {lang} |
| `admin.user.elo` | ELO: {elo} | ELO: {elo} |
| `admin.user.level` | سطح {level} | Level {level} |
| `admin.user.wallet.title` | کیف پول | Wallet |
| `admin.user.wallet.available` | موجودی قابل استفاده | Available |
| `admin.user.wallet.onHold` | در انتظار برداشت | On hold (pending withdrawals) |
| `admin.user.wallet.bonusLocked` | هدیه‌ی ثبت‌نامِ قفل‌شده | Welcome coins still locked |
| `admin.user.wallet.bonusLockedNote` | با اولین خرید یا شارژ آزاد می‌شود. | Unlocks on the first purchase or top-up. |
| `admin.user.wallet.withdrawable` | قابل برداشت | Withdrawable |
| `admin.user.wallet.transferable` | قابل انتقال | Transferable |
| `admin.user.wallet.transfers24h` | انتقال در ۲۴ ساعت اخیر: {used} از {max} | Transfers, last 24 h: {used} of {max} |
| `admin.user.wallet.withdrawals24h` | برداشت در ۲۴ ساعت اخیر: {used} از {max} | Withdrawals, last 24 h: {used} of {max} |
| `admin.user.wallet.nextFree` | آزاد شدن سقف: {time} | Limit frees up: {time} |
| `admin.user.wallet.confirmSms` | تأیید برداشت: کد پیامکی | Withdrawal confirmation: SMS code |
| `admin.user.wallet.confirmPassword` | تأیید برداشت: رمز عبور (پیامک خاموش است) | Withdrawal confirmation: password (SMS is off) |
| `admin.user.topup` | شارژ کیف پول | Top up wallet |
| `admin.user.topupRoleNote` | شارژ کیف پول با نقش مالی یا مدیر ارشد انجام می‌شود. | Top-ups are done by finance or a superadmin. |
| `admin.user.ledger.title` | تراکنش‌های اخیر | Recent transactions |
| `admin.user.ledger.capped` | ۵۰ تراکنش اخیر | Latest 50 entries |
| `admin.user.ledger.empty` | هنوز تراکنشی ندارد. | No transactions yet. |
| `admin.user.ledger.col.date` | زمان | Date and time |
| `admin.user.ledger.col.type` | نوع | Type |
| `admin.user.ledger.col.amount` | مبلغ | Amount |
| `admin.user.ledger.col.id` | شناسه‌ی ردیف | Entry id |
| `admin.user.tx.transferIn` | انتقال ورودی | Transfer in |
| `admin.user.tx.transferOut` | انتقال خروجی | Transfer out |
| `admin.user.audit.title` | اقدامات مدیران روی این کاربر | Admin actions on this user |
| `admin.user.audit.empty` | اقدامی ثبت نشده است. | No admin actions recorded. |
| `admin.topup.title` | شارژ کیف پول {username} | Top up @{username}'s wallet |
| `admin.topup.step1` | مبلغ و دلیل | Amount and reason |
| `admin.topup.step2` | تأیید | Confirm |
| `admin.topup.presets` | بسته‌های سکه | Coin packages |
| `admin.topup.amount` | تعداد سکه | Amount (coins) |
| `admin.topup.capHelper` | حداکثر {cap} سکه در هر بار شارژ | Up to {cap} coins per top-up |
| `admin.topup.noCap` | بدون سقف | No cap |
| `admin.topup.toman` | = {toman} تومان | = {toman} toman |
| `admin.topup.reason` | دلیل (در گزارش ممیزی ثبت می‌شود؛ بازیکن آن را نمی‌بیند) | Reason (saved in the audit log; the player doesn't see it) |
| `admin.topup.reasonCounter` | {count} از ۵۰۰ نویسه | {count} of 500 characters |
| `admin.topup.review` | بررسی شارژ | Review top-up |
| `admin.topup.checking` | در حال بررسی… | Checking… |
| `admin.topup.disabled.amount` | یک عدد صحیح بزرگ‌تر از صفر وارد کنید. | Enter a whole number above zero. |
| `admin.topup.disabled.cap` | مبلغ از سقف {cap} سکه بیشتر است. | The amount is above the {cap}-coin cap. |
| `admin.topup.disabled.reason` | دلیل را بنویسید (دست‌کم ۳ نویسه). | Enter a reason (at least 3 characters). |
| `admin.topup.player` | بازیکن | Player |
| `admin.topup.balance` | موجودی قابل استفاده | Available balance |
| `admin.topup.expected` | (پیش‌بینی) | (expected) |
| `admin.topup.source` | سکه‌ها از محل فروش پلتفرم صادر می‌شوند. این کار از این صفحه برگشت‌پذیر نیست. | Coins are issued from platform sales. This can't be undone here. |
| `admin.topup.unlocksBonus` | این اولین شارژ این حساب است: {bonus} سکه‌ی هدیه‌ی ثبت‌نام قابل برداشت و انتقال می‌شود. | This is the account's first top-up: {bonus} welcome coins become withdrawable and transferable. |
| `admin.topup.suspended` | این حساب تعلیق است: نمی‌تواند سکه خرج کند، اما می‌تواند برداشت کند. | This account is suspended. It can't spend coins, but it can withdraw them. |
| `admin.topup.banned` | این حساب مسدود است و امکان ورود ندارد. | This account is banned and can't sign in. |
| `admin.topup.back` | بازگشت به ویرایش | Back to edit |
| `admin.topup.cta` | افزودن {amount} سکه | Add {amount} coins |
| `admin.topup.adding` | در حال افزودن… | Adding… |
| `admin.topup.done` | {amount} سکه به {username} اضافه شد. موجودی {before} ← {after} | Added {amount} coins to @{username}. Balance {before} → {after} |
| `admin.topup.already` | این شارژ قبلاً انجام شده است. | This top-up was already applied. |
| `admin.topup.unknown` | نتیجه‌ی شارژ مشخص نشد. | We couldn't confirm the top-up. |
| `admin.topup.error.cap` | حداکثر مبلغ هر شارژ {cap} سکه است. | The most you can add at once is {cap} coins. |
| `admin.topup.userGone` | این کاربر دیگر وجود ندارد. | This user no longer exists. |
| `admin.withdrawals.title` | برداشت‌ها | Withdrawals |
| `admin.withdrawals.tab.pending` | در انتظار | Pending |
| `admin.withdrawals.tab.paid` | پرداخت‌شده | Paid |
| `admin.withdrawals.tab.rejected` | ردشده | Rejected |
| `admin.withdrawals.tab.cancelled` | لغوشده | Cancelled |
| `admin.withdrawals.tab.all` | همه | All |
| `admin.withdrawals.rule` | هر درخواست باید حداکثر تا یک روز کاری پس از ثبت پرداخت شود. قدیمی‌ترین‌ها اول آمده‌اند. | Pay within one working day of the request. Oldest first. |
| `admin.withdrawals.summary` | در این فهرست: {count} درخواست · {coins} سکه · {toman} تومان برای پرداخت | In this list: {count} requests · {coins} coins · {toman} toman to pay |
| `admin.withdrawals.overdueCount` | {count} مورد از زمان مورد انتظار گذشته است | {count} past the expected date |
| `admin.withdrawals.refresh` | به‌روزرسانی | Refresh |
| `admin.withdrawals.col.requested` | زمان درخواست | Requested |
| `admin.withdrawals.col.expected` | موعد پرداخت | Expected by |
| `admin.withdrawals.col.player` | بازیکن | Player |
| `admin.withdrawals.col.amount` | مبلغ (سکه) | Amount (coins) |
| `admin.withdrawals.col.pay` | مبلغ پرداخت | Pay |
| `admin.withdrawals.col.bank` | بانک و شبا | Bank and Sheba |
| `admin.withdrawals.col.status` | وضعیت | Status |
| `admin.withdrawals.col.decided` | زمان تصمیم | Decided at |
| `admin.withdrawals.col.refReason` | کد پیگیری / دلیل | Reference / reason |
| `admin.withdrawals.col.actions` | عملیات | Actions |
| `admin.withdrawals.fee` | کارمزد: {fee} سکه | Fee: {fee} coins |
| `admin.withdrawals.rial` | ({rial} ریال) | ({rial} rial) |
| `admin.withdrawals.overdue` | گذشته از موعد | Overdue |
| `admin.withdrawals.age` | {relative} | {relative} |
| `admin.withdrawals.copySheba` | کپی شبا | Copy Sheba |
| `admin.withdrawals.copyRial` | کپی مبلغ (ریال) | Copy amount (rial) |
| `admin.withdrawals.copyToman` | کپی مبلغ (تومان) | Copy amount (toman) |
| `admin.withdrawals.copied` | کپی شد | Copied |
| `admin.withdrawals.approve` | ثبت پرداخت | Mark as paid |
| `admin.withdrawals.reject` | رد | Reject |
| `admin.withdrawals.emptyPending` | درخواست برداشت در انتظاری وجود ندارد. | No pending withdrawals. |
| `admin.withdrawals.emptyStatus` | درخواستی با این وضعیت وجود ندارد. | No withdrawals with this status. |
| `admin.withdrawals.capped` | ۲۰۰ درخواست قدیمی‌تر نمایش داده می‌شود؛ تا افزوده شدن مرتب‌سازی و صفحه‌بندی، درخواست‌های جدیدتر در این فهرست نیستند. | Showing the oldest 200 requests. Newer ones aren't listed until sorting and paging are available. |
| `admin.withdrawals.notInList` | این درخواست در فهرست فعلی نیست. | This request isn't in the current list. |
| `admin.withdrawals.noAccess` | دسترسی ندارید: برداشت‌ها توسط نقش مالی بررسی می‌شوند. | No access: withdrawals are handled by finance. |
| `admin.withdrawals.loadError` | برداشت‌ها بارگذاری نشدند. | Couldn't load withdrawals. |
| `admin.withdrawals.gone` | این درخواست دیگر وجود ندارد. فهرست به‌روز شد. | This request no longer exists. The list was refreshed. |
| `admin.withdrawal.drawerTitle` | درخواست برداشت #{id} | Withdrawal #{id} |
| `admin.withdrawal.rateAtRequest` | نرخ زمان درخواست: هر سکه {price} تومان | Rate at request: {price} toman per coin |
| `admin.withdrawal.playerStatus` | وضعیت فعلی بازیکن | Player's current status |
| `admin.withdrawal.playerLoadError` | وضعیت بازیکن بارگذاری نشد. | Couldn't load the player's status. |
| `admin.withdrawal.statusUnknown` | نامشخص | Unknown |
| `admin.withdrawal.audit` | سابقه‌ی اقدامات | Action history |
| `admin.approve.title` | ثبت پرداخت درخواست #{id} | Mark withdrawal #{id} as paid |
| `admin.approve.pay` | مبلغ پرداخت: {toman} تومان ({rial} ریال) | Pay: {toman} toman ({rial} rial) |
| `admin.approve.instruction` | ابتدا انتقال بانکی را انجام دهید، سپس کد پیگیری آن را اینجا وارد کنید. | Make the bank transfer first. Then enter the transfer's reference number here. |
| `admin.approve.reference` | کد پیگیری انتقال بانکی | Bank transfer reference |
| `admin.approve.error.reference` | کد پیگیری باید ۳ تا ۶۴ نویسه باشد. | The reference must be 3 to 64 characters. |
| `admin.approve.ack` | {toman} تومان را به این شبا منتقل کرده‌ام. | I have transferred {toman} toman to this Sheba. |
| `admin.approve.banned` | این حساب مسدود است. درخواست‌های برداشتِ در انتظارِ آن تا تصمیم مدیر نگه داشته می‌شوند. فقط پس از بررسی تأیید کنید. | This account is banned. Its pending withdrawals are held for an admin decision. Approve only after review. |
| `admin.approve.bannedAck` | درخواست این حساب مسدود را بررسی کرده‌ام. | I reviewed this banned account's request. |
| `admin.approve.suspended` | این حساب تعلیق است. بازیکنان تعلیق‌شده همچنان می‌توانند برداشت کنند. | This account is suspended. Suspended players may still withdraw. |
| `admin.approve.smsOn` | بازیکن پیامکی با مبلغ و این کد پیگیری دریافت می‌کند. | The player will get a text with the amount and this reference. |
| `admin.approve.smsOff` | پیامک خاموش است: بازیکن وضعیت را فقط در برنامه می‌بیند. | SMS is off: the player sees the status in the app only. |
| `admin.approve.cta` | ثبت پرداخت | Mark as paid |
| `admin.approve.saving` | در حال ثبت… | Saving… |
| `admin.approve.disabled` | کد پیگیری را وارد کنید و تأیید را علامت بزنید. | Enter the reference and tick the confirmation. |
| `admin.approve.done` | درخواست #{id} پرداخت‌شده ثبت شد. | Withdrawal #{id} marked as paid. |
| `admin.approve.dontPayAgain` | دوباره انتقال ندهید. کد پیگیری ثبت‌شده را با بانک مقایسه کنید: {reference} | Don't transfer again. Compare the recorded reference with your bank: {reference} |
| `admin.approve.cancelledByPlayer` | بازیکن این درخواست را لغو کرده است. اگر پولی منتقل کرده‌اید، از طریق پشتیبانی با بازیکن تماس بگیرید. | The player cancelled this request. If you already transferred money, contact the player through support. |
| `admin.decision.already` | {status, select, paid {مدیر دیگری این درخواست را پرداخت‌شده ثبت کرده است.} rejected {مدیر دیگری این درخواست را رد کرده است.} cancelled {این درخواست لغو شده است.} other {وضعیت این درخواست تغییر کرده است.}} | {status, select, paid {Another admin already marked this as paid.} rejected {Another admin already rejected this.} cancelled {This request was cancelled.} other {This request has changed.}} |
| `admin.decision.unknown` | نتیجه مشخص نشد. | We couldn't confirm the result. |
| `admin.decision.checkStatus` | بررسی وضعیت | Check status |
| `admin.reject.title` | رد درخواست #{id} | Reject withdrawal #{id} |
| `admin.reject.effect` | {amount} سکه به موجودی بازیکن برمی‌گردد. | {amount} coins go back to the player's balance. |
| `admin.reject.reason` | دلیل رد | Reason for rejecting |
| `admin.reject.helper` | بازیکن این دلیل را دقیقاً همان‌طور که می‌نویسید در برنامه می‌بیند. ساده و به زبان بازیکن بنویسید و یادداشت داخلی ننویسید. | The player sees this reason exactly as written, in the app. Write it plainly in the player's language, and don't include internal notes. |
| `admin.reject.playerLang` | زبان بازیکن: {lang} | Player's language: {lang} |
| `admin.reject.cta` | رد و بازگرداندن {amount} سکه | Reject and return {amount} coins |
| `admin.reject.saving` | در حال ثبت… | Saving… |
| `admin.reject.disabled` | دلیل را بنویسید (دست‌کم ۳ نویسه). | Enter a reason (at least 3 characters). |
| `admin.reject.done` | درخواست #{id} رد شد و سکه‌ها برگشت. | Withdrawal #{id} rejected; the coins were returned. |
| `admin.reject.alreadyPaid` | این درخواست پیش‌تر پرداخت شده و قابل رد نیست. | This request was already paid; it can't be rejected. |

Shared keys used:
- `common.cancel`, `common.close`, `common.retry`
- `errors.network`, `errors.generic`, `errors.validation`, `errors.notFound`
- `errors.admin.forbidden`, `errors.admin.unauthenticated`
- `errors.wallet.topupAboveCap`, `errors.wallet.amountInvalid`, `errors.wallet.idempotencyKeyRequired`, `errors.wallet.withdrawalNotPending` (wallet.md §7)
- `wallet.tx.*`
- `admin.offline`, `admin.shell.env.*`, `admin.role.*` (admin-settings.md §7)

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| AD-10 | Skip link ("Skip to users") → header → nav → heading → search field (focused on load) → list label (a live region announcing "{n} results") → table rows (each row is one focusable link) → cap footer |
| AD-11 | Back → heading (username) → status → copy phone → wallet card (a description list) → Top up wallet → ledger table → audit block |
| AD-12 | Step heading (focused on open) → player line → presets (a radio group; none checked) → amount → reason → Review top-up. Step 2: heading → summary → warnings → Back to edit → Add. Focus is trapped. Esc closes only when not in flight. Closing returns focus to "Top up wallet". |
| AD-13 | Heading → tabs (arrow keys move between tabs; one tab stop) → rule line → summary bar → Refresh → table (per row: player link → Copy Sheba → Copy amount → Mark as paid → Reject) → cap notice |
| AD-14 | Drawer heading (focused) → facts → copy buttons → player status → audit → decision buttons → Close. Focus is trapped. |
| AD-15 | Title → summary → Copy Sheba → instruction → reference field → acknowledgment(s) → Cancel (initial focus on open) → Mark as paid |
| AD-16 | Title → summary → effect line → reason → Cancel (initial focus) → Reject |

**Other rules**

- **Tables:** real `<table>` elements with `<th scope="col">`. The player cell is `<th scope="row">`. Action names include the context: "Mark withdrawal #123 as paid", "Copy Sheba of withdrawal #123".
- **Status and overdue** markers use icon plus text. The destructive Reject button carries its full text label; color is secondary.
- **The Sheba** is read in groups: `aria-label` = "Sheba IR82 0540 …" with the groups separated by spaces, so screen readers don't read one 26-digit number.
- **Live regions:**
  - Polite: search results count, copy confirmations, top-up and decision success, list refreshed.
  - Assertive: a failed submit in a dialog.
- **Keyboard:** everything works without a mouse. Enter in the reason textarea inserts a newline and never submits. "Add {amount} coins" and "Mark as paid" must be activated deliberately (no Enter shortcut from fields in step 2 or AD-15).
- **Contrast:** 4.5:1 for all text, including muted "No username" and secondary rial lines; 3:1 for chip outlines and focus rings.
- **Motion:** only fades ≤ 150 ms; none under `prefers-reduced-motion`.
- **Zoom:** 200% zoom without horizontal scroll (the card fallback).

---

## 9. Acceptance criteria

**Users**
1. `/users` loads the 50 newest accounts with username, id, phone (LTR, Latin digits), status chip (icon plus text), joined date (Jalali in fa), and balance.
2. Typing `۰۹۱۲۳۴۵۶۷۸۹`, `09123456789`, or `+98 912 345 6789` sends `q=9123456789` and finds that user. Typing `ali` finds usernames containing "ali". Phone queries never appear in the URL; username queries do.
3. Exactly 50 results show `admin.users.capped`. No results show the empty state with the phone hint.
4. `/users/{id}` shows every `WalletSummary` figure listed in §3.2 step 3, and the latest 50 ledger entries with `wallet.tx.*` labels (fa and en). Transfers show "Transfer in" or "Transfer out" by sign.
5. Support sees no "Top up wallet" button and sees `admin.user.topupRoleNote`. Finance and superadmin see the button. Only superadmin sees the audit block.

**Top-up**
6. The amount field starts empty. No preset is shown while there is no packages endpoint. When presets exist, none is selected on open.
7. "Review top-up" stays disabled, with a visible reason, until the amount is a whole number from 1 to `admin.topup_max_amount` (or any value ≥ 1 when the cap is 0) and the reason has at least 3 characters.
8. Step 2 re-reads the user and shows the fresh balance before → after (before + amount), the toman value, the source note, and, when they apply, the welcome-coin unlock note and the suspended or banned warning.
9. One click on "Add {amount} coins" sends exactly one `POST` with an `Idempotency-Key`. A timeout's "Check status" re-sends the same key and body; the ledger then has exactly one `admin_topup` entry for the action.
10. `created: true` closes the dialog, shows `admin.topup.done` with the response's before and after, and the new ledger row appears. `created: false` shows `admin.topup.already` and no before/after.
11. `TOPUP_ABOVE_CAP` returns to step 1 with the server's cap in the field error and the reason kept.
12. The audit log (superadmin view) shows the top-up with admin, amount, before, after, and reason.

**Withdrawals**
13. Support has no Withdrawals nav item, and opening `/withdrawals` shows `admin.withdrawals.noAccess`.
14. The Pending tab lists requests oldest first, with the full Sheba (LTR, grouped, monospace), bank name, pay amount in toman with rial, fee, expected-by date, and an "Overdue" marker (icon plus text) when today's Tehran date is after `expected_by`.
15. "Copy Sheba" copies `IR` + 24 digits without spaces. "Copy amount (rial)" copies Latin digits without separators.
16. "Mark as paid" is disabled until the reference has 3–64 characters and "I have transferred…" is ticked (and, for a banned player, the second acknowledgment). Neither box starts ticked. Initial focus is on Cancel.
17. A successful approval removes the row from Pending, shows `admin.approve.done`, and the request appears under Paid with its reference. The player's WD-07 shows Paid with the same reference.
18. When a second admin approves or rejects a request that is already paid, the dialog shows `admin.decision.already` plus `admin.approve.dontPayAgain` with the recorded reference, and no second decision is sent.
19. Reject requires a reason of at least 3 characters, shows the player's language and the "player sees this" helper, and on success returns the coins (the player's balance increases by `amount`; WD-07 shows the reason as written).
20. AD-15 shows `admin.approve.smsOn` when `sms.enabled` is true and `admin.approve.smsOff` when it is false.
21. History tabs show status, decided at, and reference or reason. When 200 rows come back, `admin.withdrawals.capped` is shown.
22. Layouts pass at 1440 × 900, 1280 × 800, 1024 × 768, 768 × 1024, and 390 × 844 in fa and en: no horizontal scroll at ≥ 1024 px, cards below 1024 px, full-screen dialogs below 600 px, and 200% zoom without clipping.
23. No UI string is hardcoded. All keys in §7 exist in fa and en. Money is never abbreviated.

---

## 10. Open questions (API gaps for the main agent)

1. **Suspend and ban** (§12.1, §13 Users) have no endpoints. Needed: `POST admin/users/{id}/status {status, until?, reason_category, reason}`, audited, with the reason category exposed to the player (auth.md open question 12). AD-11 will add a Status section when this exists.
2. **Manual balance adjustment** (§13, `admin_adjustment`, reason mandatory by rule 12) has no endpoint. It is also the only way to correct a mistaken top-up. Needed: `POST admin/users/{id}/wallet/adjust {amount (signed), reason}` + `Idempotency-Key`, with a confirmation that can't push the balance below zero.
3. **Coin packages for presets** (§7.9) are missing: there is no `GET shop/packages` or `coin_package` model yet (step 9). Presets stay hidden until then. Can the 4 placeholder packages (§18) be seeded in step 3, so finance gets presets now?
4. **User detail gaps** (§13 "full profile, ledger, match history"):
   - The user's bank account (masked, plus bank name)
   - The user's withdrawals (add a `user` filter to `GET admin/withdrawals`)
   - Match history (step 8)
   - Sessions and devices, referral, fraud flags
   - Audit read access for finance (at least for wallet actions)
5. **Admin ledger:** the latest 50 entries only, no cursor, no counterparty username for transfers, no `ref_type`/`ref_id`, and no date filter. Please return the same `LedgerRow` shape as the player API, with cursor pagination and `?from=&to=`.
6. **User search:**
   - Results cap at 50 with no pagination.
   - Partial numbers typed with a leading `0` (`0912345`) don't match, because the server compares raw digits with the stored `+98…`. The UI normalizes; the server should too (strip `0`, `98`, `0098`; convert Persian digits; `str.isdigit()` accepts Persian digits, which then never match).
   - Please also support search by user id (e.g. `#123`).
7. **Withdrawals list** (§13 "history, CSV export", "All reports: date range filter and CSV export"):
   - Only a status filter; always oldest first; capped at 200; no counts
   - Needed: `sort` (newest first for history), cursor pagination, date range (Jalali and Gregorian in the UI), user filter, a pending count (for the nav badge), and CSV export
8. **Withdrawal payload gaps:**
   - `decided_by` (admin username)
   - The player's current `status` (banned users' pending requests must be held, §12.1)
   - The antifraud flag state (§7.12: flagged accounts can't withdraw)
   - `payout_rial` (the UI multiplies toman × 10 for display)
9. **No `GET admin/withdrawals/{id}`.** Deep links (from a support ticket or the audit log) only work if the request is in the loaded list.
10. **Double payment risk.** Two finance admins can transfer money for the same request before either records it. `WITHDRAWAL_NOT_PENDING` only catches it after the bank transfer. Proposal: `POST admin/withdrawals/{id}/claim` (sets "in progress by X", with a timeout), shown in the queue, with approve and reject limited to the claimer. Approve and reject should also accept an `Idempotency-Key`.
11. **Top-up replay values.** On `created: false`, `balance_before` and `balance_after` are both today's balance, not the original values. Please return the original values (from the audit entry or the ledger) so the admin sees what happened.
12. **Top-up policy for banned and suspended accounts.** The API allows both. Should topping up a banned account be refused? Should suspended accounts require an acknowledgment?
13. **Rejection reasons are free text shown to players.** Proposal: a required category (e.g. `invalid_sheba`, `account_review`, `limit`, `other`) localized for the player, plus an optional note. That avoids language mismatch and leaking internal notes (wallet.md open question 11).
14. **Rejection notice.** Players get an SMS only when paid (sms.md). Should a rejection also notify (SMS when on, or an in-app notice)?
15. **Welcome-coin unlock by top-up.** Any `admin_topup`, even 1 coin, unlocks the signup bonus for withdrawal (§7.12). Is a minimum top-up needed to unlock, to avoid bonus farming through small top-ups? This spec shows a warning on the first top-up (§3.3 step 2).
16. **Cap source.** The top-up form reads `admin.topup_max_amount` from `GET admin/settings` (the whole registry). A small `GET admin/wallet/config` (cap, coin price, `sms.enabled`) would be lighter and keep the form correct for roles that shouldn't browse settings later.
