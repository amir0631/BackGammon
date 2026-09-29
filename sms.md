# SMS integration — IPPanel Edge

How this project sends SMS through IPPanel Edge (CLAUDE.md §18 "SMS provider", §12.1 OTP rules).
Source: the official docs at https://ippanelcom.github.io/Edge-Document/docs/ (repo `ippanelcom/Edge-Document`), checked 2026-09-27.

## 1. What we use it for

| Use | Sending type | Pattern setting |
| --- | --- | --- |
| OTP: signup, password reset, withdrawal confirmation (§7.12) | `pattern` | `sms.pattern_otp` |
| Withdrawal paid notice (§7.12) | `pattern` | `sms.pattern_withdrawal_paid` |

Rules:

- **Only pattern sends.** Never send OTPs or transactional texts as free text (`webservice`). Pattern messages are pre-approved by IPPanel and use the fast transactional route.
- Marketing, bulk, phonebook, and voice sends are out of scope.
- In development and tests, `SMS_PROVIDER=console` logs the message instead of sending it. Only staging and production use `SMS_PROVIDER=ippanel`.

**Off switch.** The `sms.enabled` setting (admin panel, default `false`) stops all sending. While it is off, signup skips the code step (`POST auth/otp` returns `{"sms": false, "verification_token": ...}`), password reset by SMS returns `SMS_UNAVAILABLE`, withdrawals are confirmed with the account password (`withdraw.confirm` in `GET wallet`), and no withdrawal-paid SMS is sent.

## 2. Credentials and configuration

The API key never goes into the repo, the vault, or logs (CLAUDE.md §22.1). `sms_api.txt` in the project root holds it locally and is git-ignored. On every environment it is set as an env var:

Environment (secrets and deployment only):

| Env var | Value |
| --- | --- |
| `SMS_PROVIDER` | `console` (dev) or `ippanel` |
| `IPPANEL_BASE_URL` | `https://edge.ippanel.com/v1` |
| `IPPANEL_API_KEY` | API key from IPPanel: User Panel → Developers → Access Keys |

Settings registry (editable in the admin panel → Settings → `sms`, audited, no redeploy):

| Setting | Default |
| --- | --- |
| `sms.from_number` | `+983000505` (the shared pattern line) |
| `sms.pattern_otp` | `77j9q04y28txoy6` |
| `sms.pattern_withdrawal_paid` | `t1lf706mnokv21n` |
| `sms.low_credit_alert_rial` | `1000000` |

The admin panel's SMS card (`GET /api/v1/admin/sms/status`) shows the live credit and each pattern's approval status.

Authentication: send the key **as-is** in the `Authorization` header. There is no `Bearer` prefix.

```
Authorization: <IPPANEL_API_KEY>
Content-Type: application/json
```

API keys do not expire. Login tokens (the alternative) expire after 10 hours. Some sensitive panel operations accept only tokens, but everything below works with an API key.

> The IPPanel account is shared with other products (EzyTAP, CertiHub patterns exist in it). Only use the pattern codes configured for this project, and never edit or delete other patterns.

## 3. Endpoints we call

All paths are relative to `IPPANEL_BASE_URL`. Every response has the shape `{"data": …, "meta": {"status": bool, "message": str, "message_code": str, "errors"?: {…}}}`. Success is `meta.status == true` with `message_code` `"200-1"`.

### 3.1 Send a pattern message

```
POST /api/send
```

```json
{
  "sending_type": "pattern",
  "from_number": "+983000505",
  "code": "<pattern_code>",
  "recipients": ["+989120000000"],
  "params": { "code": 48213 }
}
```

- `recipients`: exactly **one** number, E.164 (`+989…`). Our `user.phone` is stored in E.164 already; convert `09…` input at the edge (accounts app).
- `params`: keys must match the pattern's variables exactly (without the `%` delimiters). An `integer` variable must be sent as a number.
- Do not send the optional `phonebook` object: we do not store players in IPPanel phonebooks.

Success:

```json
{
  "data": { "message_outbox_ids": [1123594208] },
  "meta": { "status": true, "message": "انجام شد", "message_parameters": [], "message_code": "200-1" }
}
```

Store `message_outbox_ids[0]` on the `otp` row (`provider_message_id`) for delivery lookups.

### 3.2 Delivery report for one message

```
GET /api/report/by_bulk?messages_outbox_id=<id>
```

Returns `data.state` (e.g. `finish`), `data.status` (Persian label), `data.cost`, `data.rcpts_count`, `data.exit_count`. Used by the admin user page ("was the code delivered?"), never on the hot path.

### 3.3 Account credit

```
GET /api/payment/credit/mine
```

Returns `data.credit` (rial) and `data.gift`. A Celery Beat job checks it hourly and raises an admin alert below `sms.low_credit_alert_rial` (a setting; add it with the SMS adapter). Show it on the admin dashboard.

### 3.4 Pattern management (one-time setup, not called at runtime)

| Action | Request |
| --- | --- |
| Create | `POST /api/patterns/normal` |
| List | `GET /api/patterns?page=1&per_page=100` (filters: `filter[code]`, `filter[title]`) |
| Get one | `GET /api/patterns/{pattern_code}` |

Create body:

```json
{
  "title": "Takhte Nard - OTP",
  "description": "کد تأیید ورود و ثبت‌نام بازی تخته نرد",
  "is_share": false,
  "message": "کد تأیید تخته نرد: %code%\nاین کد را به کسی ندهید.",
  "variable": [{ "name": "code", "type": "integer" }]
}
```

- Variables are written `%name%` in the message. Types: `string` or `integer`. The delimiter is `%`.
- A new pattern starts as `pattern_status: "pending"`. IPPanel reviews it manually. Only `active` patterns can be sent. The admin SMS card shows the status.
- The response returns the `pattern_code`; put it in the matching `sms.pattern_*` setting.

## 4. Errors and retries

| HTTP | `message_code` | Meaning | Our handling |
| --- | --- | --- | --- |
| 200 | `200-1` | Accepted | Store the outbox id |
| 401 | `400-1` | Invalid or expired key | Do not retry. Alert admins (misconfiguration). The user sees `errors.sms.unavailable` |
| 422 | `400-2` | Validation error; details in `meta.errors` (field → messages) | Do not retry. Log the field names (not values) and alert. The user sees `errors.sms.unavailable` |
| 5xx / timeout / network | — | Provider problem | Retry once after 2 s inside the Celery task, then give up with `errors.sms.unavailable` |

- HTTP timeout: 5 s connect, 10 s total.
- `meta.message` is Persian provider text. Never show it to users; map to our own `message_key` (CLAUDE.md §2 rule 8).
- Treat `meta.status == false` as a failure even when the HTTP status is 200.

## 5. Patterns for this project

Created in the panel on 2026-09-27; both were `pending` IPPanel approval at creation.

| Setting | Code | Title | Message | Variables |
| --- | --- | --- | --- | --- |
| `sms.pattern_otp` | `77j9q04y28txoy6` | Takhte Nard - OTP | `کد تأیید تخته نرد: %code%` + newline + `این کد را به کسی ندهید.` | `code` (integer) |
| `sms.pattern_withdrawal_paid` | `t1lf706mnokv21n` | Takhte Nard - Withdrawal paid | `مبلغ %amount% تومان از کیف پول تخته نرد به حساب بانکی شما واریز شد.` + newline + `کد پیگیری: %ref%` | `amount` (string, pre-formatted), `ref` (string) |

- OTP codes are 5 digits from `secrets.randbelow(90000) + 10000`, so they never start with `0` (an integer variable would drop a leading zero).
- When the production domain is known, add a new OTP pattern whose last line is `@m.<domain> #%code%`. That enables automatic code fill-in on Android (WebOTP). Then switch `sms.pattern_otp` to it in the admin panel.
- Pattern text is fixed after approval. Changing the brand name or wording means creating a new pattern and switching the setting.

## 6. Implementation (§17 step 2, done)

```
backend/accounts/sms/
├── base.py       # SmsProvider protocol: send_otp(phone, code) -> str | None; send_withdrawal_paid(phone, amount, ref)
├── console.py    # logs "SMS to +98912***0000: code=48213" (dev only)
├── ippanel.py    # IPPanelSmsProvider: POST /api/send with sending_type=pattern
└── __init__.py   # get_provider() picks the adapter from SMS_PROVIDER
```

- Sending happens in a Celery task, so a slow provider never blocks the request. The OTP request endpoint returns immediately after the rate-limit checks and OTP creation.
- OTP rules (CLAUDE.md §12.1): 5 digits, valid 2 minutes, stored only as a hash. Rate limits: 3 per 10 minutes per phone and per IP.
- Logs mask the phone (`+98912***0000`) and never contain the code (CLAUDE.md §2 rule 11).
- Tests use the console adapter plus an `IPPanelSmsProvider` test with a mocked HTTP transport covering: success, 401, 422, a timeout followed by a successful retry, and `meta.status == false` on HTTP 200.
- Manual smoke test on staging only: a management command `python manage.py sms_smoke +98912…` sends one OTP pattern to a given test number.
