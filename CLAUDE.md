# CLAUDE.md — Online Backgammon (Takhte Nard)

Instructions for AI coding agents building this project. Follow every rule in "Hard rules" without exception. If a task conflicts with a hard rule, stop and ask; do not work around it.

---

## 1. Product summary

Web backgammon, paid in rial through a Shaparak payment gateway. Two separate user frontends with dedicated designs (§11.0):

- Desktop web: `app.x3d.ir`
- Mobile (installable PWA): `m.x3d.ir`
- Admin panel: `admin.x3d.ir`

`x3d.ir` is a placeholder; read the real domain from the `BASE_DOMAIN` env var everywhere.

- Accounts: phone number + password, mandatory SMS OTP verification.
- Profile: unique username, avatar from a preset set.
- In-game communication: preset emojis and preset phrases only. No free text chat.
- Game variants: standard with doubling cube, standard without cube, traditional.
- Modes: online 1v1 (random matchmaking), vs bot, tournaments.
- Coins: bought with rial, spent in-game, withdrawal, transfer.
- Table entry fee with 10% platform rake. Referrer earns 1% commission in coins.
- Spectators predict match outcomes with purchased coins (pool-based, 10% rake).
- 3D board and checkers with realistic physics-based dice throws (3D only, no 2D fallback). A user setting enables a lite mode (see §11.6).
- Board and checker themes: purchasable with coins or unlocked by level.
- ELO ranking, XP levels, leaderboards.
- Every match is recorded as a full event log. Replays are viewable by the two players of that match and by admins only (§20).
- Live spectating: any logged-in user can watch any human-vs-human match in progress (§20).
- Full admin panel: all settings, financial reports, game analytics, anti-fraud.
- Languages: Persian (fa), English (en).
- Capacity target: 300 concurrent users (~100 live matches).
- Delivery phases (§17):
  - **Phase 1 — mobile surface `m.`**: every feature in this file, fully responsive, built with the UI and UX specialist agents (§21). All user traffic goes to `m.`.
  - **Phase 2 — desktop surface `app.`**: dedicated desktop UI on the same backend and shared packages; device routing switched on.
  - Backend, admin panel, and shared packages are complete in Phase 1. Phase 2 adds only `apps/desktop` and enables routing.

---

## 2. rules

1. **Server-authoritative game.** The client sends move intents only. The server generates dice, validates every move, applies state, and broadcasts. Never trust client-computed state, dice, timers, or results.
2. **Coin economy.** Coins are bought (gateway or admin top-up), spent in-game, transferred between users (§7.13), and withdrawn to a bank account (§7.12). Prediction payouts and tournament prizes are coins or items. No gifting or trading outside these flows.
3. **Coins are never edited directly.** Every balance change is a double-entry ledger transaction whose entries sum to zero. `wallet.balance` is a cache derived from the ledger and must always reconcile.
4. **Coins are integers** (`BIGINT`). No floats anywhere in money or coin math. Rial amounts live only in the `payment` and `withdrawal_request` tables; coin ↔ rial conversion uses the `coin.price_toman` setting (§7.11).
5. **Idempotency.** Every settlement, payment verification, and reward grant uses a unique idempotency key. Replaying the same event must not create a second transaction.
6. **Provably fair dice** using the commit-reveal scheme in §6. No `random` module, no `Math.random`, no client-side dice. **Dice physics is visual only**: the server value is fixed before the throw animation starts, and the 3D dice must always land on it (§11.1).
7. **Everything configurable lives in the `setting` table** (§14). No hardcoded rake percentages, timers, tiers, prices, or thresholds in business logic.
8. **i18n everywhere.** No user-facing string hardcoded in components or API responses. API errors return a stable `code` plus a `message_key`.
9. **No external CDNs at runtime.** Fonts, scripts, icons, and images are self-hosted.
10. **Bots are always labeled** as bots and never placed in coin tables or tournaments.
11. **Phone numbers are never exposed** to other users in any API response or WebSocket payload.
12. **Admin actions are audited.** Every admin write is recorded in `admin_audit` with before/after values. Manual balance adjustments require a reason.
13. **Every match is recorded; replay access is restricted.** The full event log of every match is persisted. Replay endpoints return 403 to anyone who is not one of the match's two players or an admin. No public replay links.
14. **Two frontends, one logic.** Desktop (`app.`) and mobile (`m.`) have separate UI code but share all non-visual logic through `packages/*` (§4). No business logic, protocol handling, dice simulation, or API calls are written inside `apps/desktop` or `apps/mobile` directly. Both apps expose the same route paths so any URL can be redirected between them with its path and query intact. In Phase 1, do not create `apps/desktop`; still keep all non-visual logic in `packages/*` so Phase 2 needs no refactor.

---

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| Desktop app (`app.`) | Next.js 15 (App Router), TypeScript strict, MUI v6 for chrome only |
| Mobile app (`m.`) | Separate Next.js 15 app, TypeScript strict, MUI v6 for chrome only, PWA (Serwist for the service worker) |
| Monorepo | pnpm workspaces + Turborepo |
| 3D | Three.js via React Three Fiber + drei; physics via Rapier (`@react-three/rapier`, WASM); assets as glTF/GLB with Draco meshes and KTX2 textures |
| Admin panel | Separate Next.js 15 app, MUI v6, served on its own subdomain |
| i18n | next-intl; MUI RTL via `@mui/stylis-plugin-rtl` and `direction` in theme |
| API | Django 5 + Django REST Framework |
| Real-time | Django Channels, ASGI with Uvicorn, Redis channel layer |
| Database | PostgreSQL 16 |
| Cache / live state / queues | Redis 7 |
| Background jobs | Celery (Redis broker) + Celery Beat |
| Bot | Separate Python service, called by the game server |
| Auth | JWT: access token 15 min, refresh token 30 days, both in HttpOnly Secure SameSite=Lax cookies with `Domain=.xxxx.ir` so one login works on `app.` and `m.`; admin uses separate host-only cookies on `admin.` (§12.1) |
| Password hashing | Argon2 |
| Monitoring | Prometheus + Grafana, self-hosted Sentry, structured JSON logs |
| Deploy | Docker Compose, Nginx reverse proxy with one server block per subdomain, wildcard TLS certificate `*.xxxx.ir`, CI pipeline, separate staging (`app.staging.`, `m.staging.`) with sandbox gateway |

---

## 4. Repository layout

```
/
├── CLAUDE.md
├── apps/
│   ├── desktop/             # app.x3d.ir — desktop UI (Next.js)
│   ├── mobile/              # m.x3d.ir — mobile UI + PWA (Next.js)
│   └── admin/               # admin.x3d.ir — admin panel (Next.js)
├── backend/
│   ├── config/              # Django settings, ASGI, URLs
│   ├── accounts/            # users, OTP, sessions, profile, avatars
│   ├── wallet/              # ledger, wallet, transaction service
│   ├── payments/            # coin packages, gateway checkout/verify
│   ├── game/                # engine (pure Python), match/game/move models
│   ├── realtime/            # Channels consumers, protocol, timers
│   ├── matchmaking/         # queues, pairing
│   ├── tournaments/
│   ├── predictions/
│   ├── referrals/
│   ├── shop/                # items, themes, emoji/phrase packs, ownership
│   ├── ranking/             # ELO, XP, levels, leaderboards, achievements
│   ├── antifraud/           # rules, flags, device fingerprints
│   ├── settingsapp/         # typed settings registry backed by `setting` table
│   ├── adminapi/            # admin-only endpoints, RBAC, audit
│   └── reports/             # financial and analytics aggregations
├── bot/                     # bot move-selection service
├── packages/
│   ├── protocol/            # shared TS types for REST + WS messages
│   ├── api-client/          # typed REST + WebSocket client, reconnect, seq handling
│   ├── game-core/           # client-side state store, legal-move highlighting, replay player
│   ├── game3d/              # R3F scene, models, materials, dice pre-simulation, raycast input; layout-agnostic (camera and framing passed in by each app)
│   ├── i18n/                # message catalogs (fa, en), number and date formatting
│   ├── design-tokens/       # colors, type scale, spacing, radii shared by both UIs
│   └── device-routing/      # device detection, redirect rules, view preference cookie
└── infra/                   # docker-compose, nginx, grafana, backups
```

`backend/game/engine/` must be pure Python with no Django imports, so it can be unit-tested and reused by the bot.

---

## 5. Game rules

### 5.1 Variants

| Variant key | Cube | Points: single / gammon / backgammon | Crawford rule |
| --- | --- | --- | --- |
| `standard_cube` | Yes, max 64 | 1 / 2 / 3, multiplied by cube value | Yes |
| `standard_nocube` | No | 1 / 2 / 3 | No |
| `traditional` | No | Configurable per setting (see §18 open items); default 1 / 2 / 2 | No |

Board rules are standard backgammon for all variants: 24 points, 15 checkers each, bar, bear-off, doubles played four times, must use both dice if possible, if only one die can be used the larger must be used when possible.

### 5.2 Match length

- Match = first to N points. Allowed N: 1, 3, 5, 7, 11. Admin chooses the allowed subset per table tier and tournament.
- Entry fee is paid once per match, not per game.

### 5.3 Turn flow

1. Opening roll: each player rolls one die; higher starts and plays those two numbers. Ties re-roll.
2. On a turn: optional cube offer (cube variant, player owns cube or cube centered, not Crawford game) → roll → move → confirm.
3. Client may undo moves until the turn is confirmed. The server validates the complete move list on confirm.
4. Forced move: if exactly one legal full move exists, the server applies it automatically after 1 second.
5. No legal move: turn passes automatically after showing the dice for 1.5 seconds.

### 5.4 Timers and disconnects

- Per-turn timer: `game.turn_seconds` (default 30) plus a match time bank `game.timebank_seconds` (default 90).
- Timeout: server plays the first legal move in its canonical ordering. `game.max_consecutive_timeouts` (default 3) consecutive timeouts forfeit the match.
- Disconnect: `game.reconnect_grace_seconds` (default 90). The turn timer keeps running. On expiry, the disconnected player forfeits the match.
- Resign: allowed any time; opponent receives the full value of the current game (including gammon/backgammon if applicable to the position, and cube value). A match resignation awards the opponent the match.

### 5.5 Engine requirements

- Deterministic move generation from `(position, dice)`.
- Position encoding must be serializable to a compact string for storage and replay.
- Unit tests must include known reference positions for: bar entry, blocked entry, bear-off with higher die, doubles partial use, single-die forced-larger rule, gammon and backgammon detection, Crawford game detection.

---

## 6. Provably fair dice

1. On match start: `seed = secrets.token_bytes(32)`. Store `seed` encrypted at rest. Send `seed_commit = sha256(seed).hex()` to both players in `match.found`.
2. Roll number `n` (0-based, match-wide counter): compute `h = HMAC_SHA256(seed, f"{match_id}:{n}:{k}")` for `k = 0, 1, …`. Take bytes of `h` in order; accept a byte `b` only if `b < 252`; die = `b % 6 + 1`. Continue through `k` until two dice are produced. This avoids modulo bias.
3. On match end: publish `seed` in `match.ended` and in the replay endpoint. The replay page lets any user recompute every roll and verify `sha256(seed) == seed_commit`.
4. Visual throw seed: `throw_seed = first 4 bytes of HMAC_SHA256(seed, f"{match_id}:{n}:throw")` as an unsigned 32-bit integer. It only drives the 3D animation and never influences dice values.
5. Weekly Celery job: chi-square test of die face distribution across all matches; result shown on the admin dashboard.

---

## 7. Coin economy

### 7.1 Ledger accounts

| Account | Meaning |
| --- | --- |
| `user:{id}` | User's available coins |
| `escrow:match:{id}` | Entry fees locked for a match |
| `escrow:pool:{id}` | Prediction stakes locked for a pool |
| `escrow:tournament:{id}` | Tournament entry fees |
| `platform:rake` | Rake revenue |
| `platform:rewards` | Source of signup bonus, level rewards, achievement rewards |
| `platform:sales` | Source of purchased coins |
| `platform:sinks` | Coins spent in shop, username changes |
| `escrow:withdrawal:{id}` | Coins held while a withdrawal request is pending |
| `platform:payouts` | Coins paid out to bank accounts (withdrawn from circulation) |

Every transaction: `ledger_entry` rows sharing one `tx_id`, sum of `amount` = 0. Wrap in a DB transaction; lock affected `wallet` rows with `SELECT … FOR UPDATE` in a consistent order (ascending user id) to avoid deadlocks.

### 7.2 Transaction types

`purchase`, `match_entry`, `match_payout`, `match_refund`, `rake`, `referral_commission`, `prediction_stake`, `prediction_payout`, `prediction_refund`, `tournament_entry`, `tournament_prize`, `tournament_refund`, `signup_bonus`, `level_reward`, `achievement_reward`, `shop_purchase`, `username_change`, `admin_adjustment`, `withdrawal_hold`, `withdrawal_payout`, `withdrawal_refund`, `transfer`.

`admin_topup`: admin-initiated wallet charge (see §7.9).

### 7.9 Admin wallet top-up (until the payment gateway is live)

The payment gateway is added later (§18). Until then, and permanently as a support tool, the admin panel can charge any user's wallet with an arbitrary coin amount:

- Endpoint `POST /api/v1/admin/users/{id}/wallet/topup` with `amount` (positive integer coins), mandatory `reason`, and `Idempotency-Key` header.
- Roles: `finance` and `superadmin` only. Per-action cap `admin.topup_max_amount` (default 10,000 coins = 10,000,000 toman). The form offers the coin packages as presets plus a custom amount.
- Ledger: one `admin_topup` transaction, `platform:sales → user:{id}`, entries summing to zero, idempotent.
- Written to `admin_audit` with before/after balance, amount, reason, and admin id. Shown in the user's ledger and in financial reports as a separate line from gateway purchases.

### 7.10 Signup bonus

- Every new account receives `bonus.signup_coins` (default 100 coins = 100,000 toman) once its phone is verified at registration.
- One `signup_bonus` transaction `platform:rewards → user:{id}`, idempotency key `signup_bonus:{user_id}`. Granted at most once per phone number, ever (a phone that registers again gets nothing).
- Antifraud `multi_account` matches (§12.2) on the new account hold the bonus for review instead of paying it.
- There is no daily bonus.

### 7.11 Coin price and purchase amounts

- `coin.price_toman` (default 1,000): one coin costs 1,000 toman (10,000 rial). The UI shows toman; `payment` stores rial.
- Buying coins offers the preset coin packages plus a custom amount between `shop.custom_min_toman` and `shop.custom_max_toman` (default 10,000 to 10,000,000 toman). The amount must be a whole multiple of `coin.price_toman`; the server rejects any other amount, so the user never pays for a fraction of a coin.
- Until the gateway is live, the coins page explains that top-ups are done by support (§7.9).

### 7.12 Withdrawal (cash-out)

- Each user registers exactly one bank account (Sheba/IBAN). The Sheba the user declares is accepted as theirs (no ownership inquiry), but it must be a valid Iranian IBAN: `IR` + 24 digits passing the ISO 13616 mod-97 checksum, with a known bank code. Changing it replaces the old one and is blocked while a withdrawal is pending.
- The user requests a withdrawal of at least `withdraw.min_coins` and at most `withdraw.daily_max_coins` within any rolling 24 hours, confirmed with an SMS OTP.
- On request: `withdrawal_hold` `user → escrow:withdrawal:{id}`. Status `pending`.
- Payout target: within one business day of the request (Iranian working days; shown to the user as the expected time). A `finance` admin makes the bank transfer manually, enters the bank reference, and approves: `withdrawal_payout` `escrow:withdrawal:{id} → platform:payouts` (a fee, if `withdraw.fee_pct` > 0, goes to `platform:rake`). Status `paid`; the user gets an SMS.
- Reject (with reason) or user cancel while pending: `withdrawal_refund` back to the user. Status `rejected` / `cancelled`.
- `withdrawal_request` stores coins, the rial amount at the request-time `coin.price_toman`, bank account, status, admin, bank reference, and timestamps.
- Signup bonus coins are not withdrawable until the user has completed at least one purchase or top-up. Accounts with an open antifraud flag cannot withdraw.

### 7.13 Transfer between users

- `POST wallet/transfer` with recipient `username`, `amount`, password confirmation, and `Idempotency-Key`.
- Limits: `transfer.min_coins`, `transfer.daily_max_coins` within any rolling 24 hours; optional fee `transfer.fee_pct` to `platform:rake`.
- One `transfer` transaction `user:{sender} → user:{recipient}`. Transfers between accounts that antifraud links (§12.2) are refused and flagged.
- The recipient sees the sender's username, never their phone number.

### 7.3 Table (match) settlement

```
pot            = entry * 2
rake           = floor(pot * table.rake_pct / 100)        # default 10
winner_payout  = pot - rake
```

- Entry fees move `user → escrow:match` when the match starts. If the match is aborted before the first roll, full refund.
- On end: `escrow:match → winner (winner_payout)` and `escrow:match → platform:rake (rake)`.

### 7.4 Referral commission

Default (configurable, see §18):

```
commission = floor(referee_entry * referral.pct / 100)    # default 1
```

- Paid from `platform:rake` to `user:{referrer}` in the same settlement transaction, once per match per referred player.
- Active only after the referee has verified their phone and completed at least one coin purchase.
- `referral.base` setting: `referee_entry` (default) or `pot`. `referral.duration_days`: 0 = unlimited (default).
- Skip commission if antifraud links referrer and referee (same device, IP cluster).

### 7.5 Predictions (pool-based)

- One pool per eligible match: random-matched (not private invite), human vs human, table entry ≥ `predict.min_table_entry`.
- Opens at `match.found`, closes at the first roll of the match.
- Blocked users: both players, and any account antifraud links to either player (device, IP cluster, referral relation).
- Stakes: `user → escrow:pool`. Limits: `predict.max_stake_per_user`, `predict.max_pool_total`.
- Settlement:
  ```
  pool           = total_a + total_b
  rake           = floor(pool * predict.rake_pct / 100)   # default 10
  distributable  = pool - rake
  payout_i       = floor(stake_i * distributable / winning_side_total)
  dust           = distributable - sum(payout_i)          # goes to platform:rake
  ```
- If one side has zero stakes, or the match is voided, refund all stakes in full with no rake.
- Settlement can be put on hold by antifraud (§12); held pools settle only after admin decision.

### 7.6 Tournaments

- Entry `user → escrow:tournament`. Rake = `floor(total * tournament.rake_pct / 100)`.
- Prize split from tournament config (default: 1st 50%, 2nd 25%, 3rd–4th 12.5% each), each `floor`, dust to rake.
- Not filled by start time, or cancelled: full refund.

### 7.7 Purchases

- `POST shop/checkout` creates a `payment` (status `pending`) and returns the gateway redirect.
- Gateway callback only marks `callback_received`. Coins are credited only after a server-side `verify` call succeeds; then status `verified` and a `purchase` transaction is created with idempotency key = gateway reference.
- Nightly reconciliation job compares verified payments against the gateway report.

### 7.8 Invariant checks (run hourly and in tests)

- For every `tx_id`, entries sum to 0.
- For every user, `wallet.balance == sum(ledger_entry.amount where account = user:{id})`.
- Total coins issued (`platform:sales` + `platform:rewards` outflows) minus sinks and rake equals the sum of all user balances plus open escrows. Mismatch → immediate admin alert.

---

## 8. Ranking, levels, matchmaking

- ELO start 1500. Expected score `E_a = 1 / (1 + 10 ** ((R_b - R_a) / 400))`. `K = 40` for the first 30 rated matches, then 20. Multiply K by `sqrt(match_length)`. Round to integer.
- Only human vs human matches are rated. Bot matches never change ELO.
- XP: `xp.per_match` for a completed match, `xp.per_win` extra for a win. Levels from a configurable XP table. Level is independent of ELO.
- Leaderboards: all-time ELO, weekly and monthly (by ELO gain), prediction accuracy (min `predict.min_count_for_board` predictions). Cache in Redis sorted sets, rebuild nightly from PostgreSQL.
- Matchmaking queue key: `(tier_id, variant, length)`. Pair when |ΔELO| ≤ 150, widening by 50 every 10 s of waiting. Never pair accounts antifraud links together.

---

## 9. Bot

- Levels: `easy`, `medium`, `hard`. Heuristic evaluation (pip count, blots exposed, points made, prime length, home board strength) with randomized noise that decreases with level. Design the interface so `hard` can later be swapped for an open-source neural net evaluator.
- Interface: `choose_move(position, dice, level) -> move_list`, and `cube_decision(position, level)`.
- Bot matches: no entry fee by default; `bot.entry_enabled` can enable a small fixed entry with a fixed prize from `platform:rewards`.
- Response latency: add a human-like delay of 0.8–2.0 s.

---

## 10. API contract

### 10.1 REST conventions

- Prefix `/api/v1`. JSON only. Each user subdomain proxies `/api/` and `/ws` to the backend through Nginx, so the frontends call same-origin paths and no CORS is needed. Cursor pagination (`?cursor=`, `next`).
- Error body: `{"code": "WALLET_INSUFFICIENT", "message_key": "errors.wallet.insufficient", "details": {}}`.
- Every write endpoint that moves coins accepts an `Idempotency-Key` header.

### 10.2 Endpoints

| Group | Endpoints |
| --- | --- |
| Auth | `POST auth/otp`, `POST auth/register`, `POST auth/login`, `POST auth/refresh`, `POST auth/logout`, `POST auth/password/reset` |
| Profile | `GET/PATCH me`, `GET users/{username}`, `GET me/sessions`, `DELETE me/sessions` |
| Wallet | `GET wallet`, `GET wallet/ledger`, `POST wallet/transfer`, `POST wallet/withdrawals`, `GET wallet/withdrawals`, `DELETE wallet/withdrawals/{id}` (cancel while pending), `GET/POST me/bank-accounts`, `DELETE me/bank-accounts/{id}`; `GET wallet` returns `balance`, `locked`, and `withdrawable` |
| Shop | `GET shop/packages`, `POST shop/checkout`, `GET payments/callback`, `GET shop/items`, `POST shop/items/{id}/buy`, `POST me/items/{id}/equip` |
| Matches | `GET tiers`, `GET matches/{id}`, `GET matches/{id}/replay` (players of that match and admins only), `GET me/matches` |
| Live | `GET matches/live?tier=&variant=&tournament=&sort=spectators|pool|elo` |
| Tournaments | `GET tournaments`, `POST tournaments/{id}/join`, `DELETE tournaments/{id}/join`, `GET tournaments/{id}/bracket` |
| Predictions | `GET predictions/open`, `POST predictions`, `GET me/predictions` |
| Leaderboard | `GET leaderboard?scope=all|weekly|monthly|predict` |
| Referral | `GET me/referral`, `GET me/referral/earnings` |
| Content | `GET phrases`, `GET avatars`, `GET themes` |

### 10.3 WebSocket protocol

Endpoint `/ws`. First message must be `auth` with the access token; otherwise close within 5 s.

Envelope (both directions):

```json
{ "type": "turn.move", "match_id": "uuid", "seq": 42, "payload": {} }
```

- Client messages carry the last server `seq` they applied. Stale or duplicate `seq` → ignored.
- Invalid action → `error` event, then a full `match.state`.
- On reconnect, client sends `match.sync` with `last_seq`; server replies with missed events or a full `match.state`.

| Direction | Type | Payload |
| --- | --- | --- |
| C→S | `queue.join` / `queue.leave` | `tier_id`, `variant`, `length` |
| S→C | `match.found` | `match_id`, opponent public profile, `seed_commit` |
| C→S | `match.sync` | `last_seq` |
| S→C | `match.state` | full state, timers, `seq` |
| C→S | `turn.roll` | — |
| S→C | `turn.rolled` | `dice`, `throw_seed`, legal moves |
| C→S | `turn.move` | move list |
| C→S | `cube.offer` / `cube.take` / `cube.drop` | — |
| C→S | `react.send` | `emoji_key` or `phrase_key` (rate limit 1 per 3 s) |
| S→C | `react.recv` | key, sender |
| C→S | `match.resign` | `scope`: `game` or `match` |
| S→C | `opponent.disconnected` / `opponent.back` | remaining grace seconds |
| S→C | `match.ended` | winner, score, ELO/XP deltas, coin settlement, `seed` |
| S→C | `pool.update` | `total_a`, `total_b` (spectators) |
| C→S | `spectate.join` / `spectate.leave` | `match_id` |
| S→C | `spectate.state` | full match state for a joining spectator, then the same event stream players receive |
| S→C | `spectators.count` | current spectator count (sent to players and spectators, throttled to 1 per 5 s) |
| C→S | `spectate.react` | `emoji_key` (spectator panel only; never delivered to players) |

Shared TypeScript types for every message live in `packages/protocol`; Python side mirrors them with pydantic models. Keep both in sync; add a contract test.

### 10.4 Live state

- Redis key per match holds state + event log. A Redis lock (`match:{id}:lock`) ensures one worker processes a match at a time.
- Timers: Redis sorted set scored by deadline; a timer worker polls every 250 ms.
- On match end, persist `match`, `game`, `move` rows to PostgreSQL, then run settlement in one DB transaction, then emit `match.ended`.

---

## 11. Frontend rules

### 11.0 Two surfaces: desktop and mobile

Each surface is designed for its own device class. Do not build one responsive UI and deploy it twice.

| | Desktop `app.` | Mobile `m.` |
| --- | --- | --- |
| Target | Desktop and laptop browsers, mouse and keyboard, ≥ 1024 px wide | Phones and tablets, touch |
| Layout | Multi-panel: board centered in landscape; side panels for move history, reactions, spectators, prediction pool always visible | Single-focus screens, bottom navigation, bottom sheets for secondary panels |
| Board framing | Landscape, natural orientation, larger camera distance | Portrait: board rotated 90° to fill width; landscape supported |
| Input | Drag with mouse, hover highlights legal moves, keyboard shortcuts: Space roll, Enter confirm, Ctrl+Z undo, D offer double | Drag or tap-tap, controls in the thumb zone, haptics |
| Lobby | Tables, live matches, and tournaments on one screen | Tabbed lists |
| PWA | Not installable (no manifest); service worker for asset caching only | Installable PWA (§11.5) |

Phase switch: env var `DESKTOP_ENABLED` (default `false`).

- `false` (Phase 1): `app.xxxx.ir` and the root `xxxx.ir` redirect every request to the same path on `m.`. No device detection. `m.` serves all devices with its responsive layout (§11.7).
- `true` (Phase 2): the rules below apply.

Routing rules (implemented in `packages/device-routing`, enforced in each app's Next.js middleware):

1. Device class is detected from `Sec-CH-UA-Mobile` Client Hint (request it with `Accept-CH`), falling back to User-Agent parsing. Phones and tablets are `mobile`; everything else is `desktop`.
2. A `mobile` device on `app.` is redirected (HTTP 302) to the same path and query on `m.`. A `desktop` device on `m.` is redirected to `app.`.
3. The root `xxxx.ir` redirects by the same rule.
4. A "switch to desktop / mobile version" link in both apps sets cookie `view_pref=desktop|mobile` on `.xxxx.ir` (1 year). When present, `view_pref` overrides detection and no redirect happens.
5. Never redirect: `/api/`, `/ws`, payment callback routes, static assets, `manifest.webmanifest`, service worker files, and requests from the installed PWA (`display-mode: standalone` sets `view_pref=mobile`).
6. Payment callback URLs are built for the surface that started the checkout, so the user returns to the same app.
7. Both apps share route paths (`/play`, `/live`, `/match/[id]`, `/replay/[id]`, `/tournaments/[id]`, `/shop`, `/profile/[username]`, …) so a redirect never lands on a 404.
8. SEO: `app.` pages carry `<link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.xxxx.ir/…">`; `m.` pages carry `<link rel="canonical" href="https://app.xxxx.ir/…">`.

### 11.1 3D board and dice

Scene
- React Three Fiber scene with one base board model and one checker model; themes swap materials and textures only.
- Camera: fixed, top-down with a slight tilt (~15°). No free orbit. The scene lives in `packages/game3d`; each app passes its own camera and framing. Mobile portrait: board rotated 90° to fill the width, checkers at least 44 CSS px wide on a 360 px screen. Desktop and mobile landscape: natural orientation.
- Lighting: baked lighting and shadows in textures (lightmaps/AO), at most 2 real-time lights, real-time shadow only under the dice.
- The 3D canvas holds only the board, checkers, and dice. Player bars, timers, buttons, emojis, and menus are MUI/HTML overlays.

Input
- Checker selection by raycasting. Drag a checker, or tap checker then tap destination. Legal destinations are highlighted in 3D.
- Undo until confirm. Vibration on your-turn and timeout warning (respect user setting). Sounds toggleable.
- Board orientation is fixed and independent of UI direction (RTL/LTR).
- Each player sees their own board theme; opponent's checkers use the opponent's checker theme.

Dice throw (pre-simulate, then play back)
1. On `turn.rolled` the client receives `dice` (authoritative values) and `throw_seed` (derived by the server from the match seed and roll number, used only for the visual throw: start position, velocity, spin).
2. The client runs the Rapier simulation off-screen at a fixed 1/120 s step until both dice are at rest or 240 steps elapse, recording each die's transform per step.
3. Read the resting top face of each die. Compute the rotation that maps that face to the required value and apply it as a fixed offset to the die's visual mesh (not the physics body).
4. Play back the recorded trajectory. The dice land showing exactly the server values.
5. If the simulation does not settle within 240 steps, re-run with `throw_seed + 1`, up to 3 times, then fall back to the lite-mode dice placement (§11.6).
6. Both players and spectators receive the same `throw_seed`, so they see the same throw. Visual differences between devices are acceptable; values are never affected.
7. Dice collide with the board floor and side walls only; they never collide with or move checkers.

### 11.2 Themes

- A theme is a set of PBR materials and KTX2 textures applied to the shared base models. Target ≤ 1.5 MB per board theme and ≤ 300 KB per checker theme.
- Themes load on demand when equipped or previewed, and are cached by the service worker.
- Theme states: `free`, `level_locked`, `purchasable`.
- All 3D models and textures must be original or properly licensed. Do not use third-party renders or models without a license.

### 11.3 i18n and RTL

- Locales `fa` (default) and `en` only. `fa` is RTL; `en` is LTR. Set `<html dir>` and MUI theme direction per locale.
- Digits by locale: fa `۰۱۲`, en `012`. Use `Intl.NumberFormat` with the locale.
- Fonts, self-hosted: Vazirmatn (fa), Inter (en).
- Dates: Jalali calendar for `fa`, Gregorian for `en`.
- Money shown to users is in toman (fa: تومان); the database stores rial.
- Preset phrases are keys; the receiver renders them in their own locale.

### 11.4 Performance budget

- Mobile: 60 fps on a mid-range Android phone (reference: Snapdragon 6-series, 4 GB RAM) in normal mode; 30 fps minimum in lite mode on low-end devices.
- Desktop: 60 fps on integrated graphics (reference: Intel Iris Xe) at 1080p; DPR cap 2; higher-resolution theme textures allowed (≤ 3 MB per board theme).
- Non-game routes: initial load under 3 s on 4G (mobile) / 2 s on broadband (desktop), JS under 250 KB gzipped.
- Game route: the 3D engine (Three.js, R3F, Rapier WASM) and default theme are lazy-loaded; first load of the game scene under 6 s on 4G, under 1 s on repeat visits (service worker cache). Show a loading state with progress.
- Device pixel ratio capped at 2 (1.5 in lite mode). Triangle budget ≤ 60k for the whole scene. Draw calls ≤ 50.
- Minimum requirement: WebGL2. If unavailable, show an unsupported-device screen with minimum requirements. No 2D fallback.
- Lighthouse on non-game routes: `m.` mobile profile Performance ≥ 85, Accessibility ≥ 90, PWA installable; `app.` desktop profile Performance ≥ 90, Accessibility ≥ 90.

### 11.5 PWA (mobile surface only)

- Only `m.x3d.ir` serves a web app manifest: `scope` and `start_url` = `https://m.x3d.ir/`, `display: standalone`, portrait-primary orientation preference, icons 192/512 plus maskable, localized `name` via per-locale manifests.
- Mobile visitors reach `m.` automatically through the redirect rules in §11.0. The installed PWA always opens `m.` directly.
- Browsers do not allow installing without a user tap. Install prompt behavior:
  - Android/Chromium: capture `beforeinstallprompt`, show a custom install banner on the first visit (dismissible), re-show after 7 days, at most 3 times; also a permanent "Install app" item in the menu.
  - iOS Safari: show a localized guide (Share → Add to Home Screen) with the same frequency rules.
  - Never show the prompt during a match.
- Service worker caches static assets, the 3D engine bundle, the Rapier WASM, and equipped themes.
- Web Push for tournament start and your-turn (with permission) on both surfaces; on iOS only inside the installed PWA.
- Offline: show a connection-lost screen; offer local bot play (no coins, no rating).
- `app.` has no manifest and is not installable; its service worker only caches assets.

### 11.6 Lite mode (user setting)

- Setting `graphics.lite` in the user profile, toggled from game settings; default off. Auto-suggest (never auto-enable) when measured frame rate stays below 30 fps for 10 s.
- Lite mode stays 3D but: no physics throw (dice appear at rest with the server values after a 300 ms fade), no real-time shadows, DPR 1.5, reduced texture resolution, simplified checker movement animation.
- A separate `animations.reduced` setting (also honoring `prefers-reduced-motion`) shortens all checker and UI animations.

### 11.7 Responsive rules for `m.` (Phase 1)

`m.` must work well on every screen from 320 px wide to large desktop, in both orientations. Mobile phones are the primary design target; wider screens get an adapted layout of the same app, not a stretched phone screen.

| Breakpoint | Width | Layout |
| --- | --- | --- |
| `xs` | 320–359 | Compact phone: reduced paddings, 2-line player bars, icon-only bottom nav labels |
| `sm` | 360–599 | Reference phone design (design at 390 × 844 first) |
| `md` | 600–1023 | Tablet / large phone landscape: board plus one side panel; bottom nav becomes a side rail |
| `lg` | ≥ 1024 | Desktop browsers in Phase 1: centered app shell max 1280 px, board plus two side panels (move history and reactions; spectators and prediction pool) |

Rules:

- Portrait and landscape supported at every breakpoint; the game screen re-frames the 3D camera on resize and orientation change without reloading the scene or losing state.
- Use `dvh`/`svh` units, never `100vh`. Respect `env(safe-area-inset-*)` for notches and home indicators.
- Touch targets ≥ 44 × 44 CSS px; primary game actions (roll, confirm, double) in the bottom 40% of the screen in portrait.
- Mouse and keyboard also work on `m.` (hover states, keyboard shortcuts from §11.0) since desktop users use it in Phase 1.
- Text scales to 200% (browser zoom and OS font size) without clipping or horizontal scroll.
- Foldables and split-screen: layout must survive width changes at runtime.
- Container queries for components that appear in both sheets and side panels.
- Every screen is designed and reviewed at 360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, and 1440 × 900, in fa (RTL) and en (LTR).

---

## 12. Security and anti-fraud

### 12.1 Security

- Argon2 password hashing; OTP stored as hash only; OTP valid 2 minutes, 5 digits.
- Rate limits: login 5 failures → 15-minute lock; OTP 3 per 10 minutes per phone and per IP; WebSocket 20 messages per second per connection.
- CSRF protection on cookie-authenticated REST writes. Strict CORS.
- User session cookies are scoped to `.xxxx.ir` and shared by `app.` and `m.`. Admin panel on `admin.xxxx.ir` uses its own host-only cookies with different names; user tokens are never accepted by admin endpoints and vice versa.
- Admin panel: TOTP 2FA, IP allowlist, roles `support`, `finance`, `superadmin`.
- Security headers on every subdomain: HSTS (includeSubDomains), CSP without third-party origins, `X-Frame-Options: DENY`.
- Account status. `suspended`: can sign in, view live matches and their own predictions and history, and request withdrawals; cannot join queues or tables, start matches, place predictions, enter tournaments, transfer, or spend coins in any way (including shop items and username changes). A match already in progress when the suspension starts is played to the end, and open predictions settle normally. `banned`: cannot sign in; pending withdrawals are held for admin decision.
- Password reset signs the user in on the current device and revokes every other session.
- Username filter for profanity in fa and en. Username 3–20 chars; change costs coins, max once per 30 days.

### 12.2 Anti-fraud rules

| Rule key | Signal | Automatic action |
| --- | --- | --- |
| `chip_dumping` | Repeated one-sided wins between the same two accounts, early resigns, move quality far below the bot's evaluation | Flag; block both from prediction pools |
| `multi_account` | Shared device fingerprint, IP cluster | Never pair together; flag |
| `referral_farm` | Referral chains sharing device or IP | Hold commission pending review |
| `prediction_collusion` | Large prediction shortly before an abnormal loss | Hold pool settlement pending review |
| `engine_assist` | Very high move agreement with a strong evaluator across consecutive matches | Flag for manual review |

All thresholds are settings. Flags go to the admin review queue with evidence JSON and a replay link.

---

## 13. Admin panel

Every section below is required in v1.

| Section | Must provide |
| --- | --- |
| Dashboard | Online users, live matches, today's sales and rake, open fraud flags |
| Users | Search by phone or username, full profile, ledger, match history, suspend/ban, manual balance adjustment with reason, wallet top-up with an arbitrary amount (§7.9) |
| Game settings | Variants and allowed lengths, timers, reconnect grace, table tiers, rake %, referral %, signup bonus, coin price, custom purchase limits, transfer and withdrawal limits, ELO and XP parameters |
| Predictions | Enable/disable globally, min table entry, stake and pool caps, rake %, held pools |
| Tournaments | Create, schedule, prize split, cancel with refund, live bracket |
| Shop | Coin packages, themes, avatars, emoji and phrase packs, prices and unlock levels |
| Content | All bilingual (fa, en) texts, preset phrases, announcements and banners |
| Financial reports | Rial sales by day and package, coins issued and consumed, table and prediction rake, referral payouts, total user balances, daily gateway reconciliation |
| Game analytics | Matches by variant and tier, average duration, resign and disconnect rates, queue wait time, dice distribution test |
| User analytics | Signups, DAU/MAU, D1/D7/D30 retention, purchase conversion, ARPPU |
| Anti-fraud | Flag queue with evidence, replay, account link graph, decision with reason |
| Live and replays | List of live matches with join-as-spectator (hidden from players), search any past match by id, player, or date, admin replay viewer (§20.3), spectator stats |
| Withdrawals | Pending withdrawal queue, approve with bank reference or reject with reason, history, CSV export |
| Access | Roles, admin users, full audit log |

All reports: date range filter (Jalali and Gregorian) and CSV export.

---

## 14. Settings registry

Implement a typed registry in `settingsapp` (key, type, default, min, max, description in fa and en). Business code reads settings only through the registry. Changes are audited and take effect without redeploy (cache in Redis, invalidate on write).

Required keys with defaults:

| Key | Default |
| --- | --- |
| `game.turn_seconds` | 30 |
| `game.timebank_seconds` | 90 |
| `game.max_consecutive_timeouts` | 3 |
| `game.reconnect_grace_seconds` | 90 |
| `game.allowed_lengths` | [1, 3, 5, 7, 11] |
| `game.traditional_points` | {"single": 1, "gammon": 2, "backgammon": 2} |
| `table.rake_pct` | 10 |
| `table.tiers` | [50, 100, 500, 1000] |
| `referral.pct` | 1 |
| `referral.base` | "referee_entry" |
| `referral.duration_days` | 0 |
| `predict.enabled` | true |
| `predict.rake_pct` | 10 |
| `predict.min_table_entry` | 100 |
| `predict.max_stake_per_user` | 1000 |
| `predict.max_pool_total` | 50000 |
| `predict.min_count_for_board` | 20 |
| `tournament.rake_pct` | 10 |
| `tournament.default_prize_split` | [50, 25, 12.5, 12.5] |
| `bonus.signup_coins` | 100 |
| `coin.price_toman` | 1000 (1 coin = 1,000 toman) |
| `shop.custom_min_toman` / `shop.custom_max_toman` | 10,000 / 10,000,000 |
| `transfer.min_coins` / `transfer.daily_max_coins` / `transfer.fee_pct` | 10 / 5,000 / 0 |
| `withdraw.min_coins` / `withdraw.daily_max_coins` / `withdraw.fee_pct` | 100 / 10,000 / 0 |
| `xp.per_match` / `xp.per_win` | 10 / 15 |
| `elo.k_new` / `elo.k` / `elo.new_threshold` | 40 / 20 / 30 |
| `matchmaking.elo_window` / `matchmaking.widen_step` / `matchmaking.widen_seconds` | 150 / 50 / 10 |
| `username.change_cost` / `username.change_cooldown_days` | 200 / 30 |
| `bot.entry_enabled` | false |
| `live.max_spectators_per_match` | 500 |
| `live.spectator_delay_seconds` | 0 |
| `live.spectator_reactions_enabled` | true |
| `replay.retention_days` | 0 (keep forever) |
| `admin.topup_max_amount` | 10000 |

---

## 15. Data model

Implement these tables (Django models). Add indexes on every foreign key and on `(user_id, created_at)` for history queries.

`user`, `session`, `otp`, `wallet`, `ledger_entry`, `payment`, `withdrawal_request`, `bank_account`, `coin_package`, `table_tier`, `match`, `game`, `move`, `match_event`, `replay_view`, `tournament`, `tournament_entry`, `prediction_pool`, `prediction`, `referral_earning`, `item`, `user_item`, `phrase`, `elo_history`, `xp_history`, `achievement`, `user_achievement`, `device_fingerprint`, `fraud_flag`, `admin_user`, `admin_audit`, `setting`.

Key field notes:

- `user`: `phone` unique, `username` unique case-insensitive, `lang`, `elo`, `xp`, `level`, `referrer_id` (immutable after signup), `status` (`active`, `suspended`, `banned`), `age_confirmed_at`.
- `wallet`: `user_id` PK, `balance`, `locked`, `version`.
- `ledger_entry`: `tx_id`, `account`, `amount` (signed BIGINT), `type`, `ref_type`, `ref_id`, `idempotency_key` (unique per tx), `created_at`. Append-only; no UPDATE or DELETE permitted (enforce with a DB trigger).
- `match`: `variant`, `length`, `entry`, `player_a`, `player_b`, `is_bot`, `bot_level`, `status`, `winner_id`, `score_a`, `score_b`, `seed_commit`, `seed_encrypted`, `tournament_id`, `started_at`, `ended_at`, `void_reason`.
- `move`: `game_id`, `seq`, `player`, `dice`, `moves_json`, `cube_action`, `position_after`, `ts`.
- `match_event`: `match_id`, `seq`, `type`, `actor` (`player_a`, `player_b`, `system`), `payload` (JSONB), `server_ts`. Append-only (DB trigger), unique `(match_id, seq)`. Holds every protocol event of §10.3 except spectator-only events.
- `replay_view`: `match_id`, `viewer_id`, `viewer_role` (`player`, `admin`), `viewed_at`. Every replay access is logged.
- Translatable admin content uses `name_i18n` JSON: `{"fa": "", "en": ""}`.

---

## 16. Testing and definition of done

A task is done only when all of these hold:

- Engine: unit tests for every rule in §5, including the reference positions list. Coverage ≥ 90% for `game/engine`.
- Wallet: property-based tests (Hypothesis) that random sequences of operations keep all §7.8 invariants. Concurrency test: 50 parallel settlements on the same wallets produce no double spend and no deadlock.
- Settlement: integration tests for match win, resign, timeout forfeit, disconnect forfeit, abort refund, prediction one-sided refund, prediction dust, tournament cancel refund, referral skip on linked accounts.
- Dice: test that a published seed reproduces every roll of a recorded match.
- Dice visuals: automated test runs 10,000 seeded throws for every value pair (1–1 through 6–6) and asserts the rendered top faces always equal the server values and the simulation settles within the retry budget.
- 3D performance: scripted game on a real mid-range Android device (or remote device lab) holds the frame-rate targets in §11.4 for a full 5-point match.
- Protocol: contract test that TS and pydantic message definitions match.
- Recording: for 1,000 simulated matches, replaying `match_event` through the engine reproduces the final position, score, and settlement exactly. Killing a game worker mid-match loses no persisted events.
- Replay access: tests that non-participants get 403 on every replay route, and that every access writes `replay_view`.
- Spectating: load test with 500 live matches, 1,000 players, and 2,000 spectators; spectator event latency p95 under 500 ms; players' latency targets unchanged.
- Frontend: Playwright tests on `m.` with Pixel, iPhone, iPad, and desktop viewports in Phase 1, and additionally on `app.` with a desktop viewport in Phase 2, for signup with OTP (mock SMS), a full bot match, RTL/LTR switch, purchase flow with sandbox gateway returning to the originating surface.
- Routing: tests for every rule in §11.0 (mobile → `m.`, desktop → `app.`, path and query preserved, `view_pref` override, excluded paths never redirected, login shared across subdomains).
- PWA: `m.` passes the installability audit; `app.` serves no manifest.
- Responsive: Playwright visual regression screenshots for every screen at the six viewports in §11.7, in fa and en, portrait and landscape where applicable. No horizontal scroll, no clipped text at 200% text size, no touch target under 44 px (automated check).
- UX sign-off: the UX specialist's review (§21) is recorded in the PR with no open blocking issues.
- Phase 1 routing: with `DESKTOP_ENABLED=false`, every `app.` and root URL redirects to `m.` with path and query preserved.
- Load: k6 or Locust test sustaining 1000 concurrent WebSocket users in 500 matches for 30 minutes, p95 move round-trip under 200 ms, zero invariant violations.
- Lint and type checks pass (ruff, mypy, eslint, tsc strict).
- No hardcoded user-facing strings; no hardcoded configurable values.

---

## 17. Implementation order

Build in this order; each step must meet §16 for its scope before the next starts. Every user-facing step follows the UX → UI → UX review loop in §21.

### Phase 1 — mobile surface `m.` (main focus)

0. UX foundation (UX specialist): personas, user journeys, information architecture, screen inventory, navigation model, and flows for every feature in §1. UI foundation (UI specialist): design tokens, typography in three scripts, component library on MUI, motion principles, 3D art direction. Both approved before step 6.
1. Monorepo scaffold (`apps/mobile`, `apps/admin`, shared packages), Docker Compose, Nginx for `m.`, `admin.`, and a redirect-only block for `app.` and root (`DESKTOP_ENABLED=false`), shared login cookie, CI, settings registry, i18n skeleton with RTL.
2. Accounts: OTP, register, login, sessions, profile, avatars.
3. Wallet ledger and invariants, signup bonus (§7.10), admin wallet top-up (§7.9), transfers (§7.13), withdrawal requests and admin approval (§7.12).
4. Game engine (pure Python) with full test suite.
5. Real-time layer: WebSocket protocol, match state in Redis, timers, reconnect.
6. 3D scene in `packages/game3d` (base models, raycast input, pre-simulated physics dice, lite mode) and the `m.` game screen, responsive across all §11.7 breakpoints. Performance pass on the reference phone.
7. Bot service; bot matches.
8. Matchmaking, table tiers, entry and settlement, ELO, XP, match event recording, replay viewer, live spectating.
9. Coin packages, `PaymentGateway` interface and sandbox adapter (real PSP adapter later, §18).
10. Shop, themes, emoji and phrase packs.
11. Referrals.
12. Predictions.
13. Tournaments.
14. Anti-fraud rules and review queue.
15. Admin panel: all sections in §13.
16. Reports and analytics.
17. PWA install flow, push notifications, performance pass.
18. Full UX audit of the whole `m.` app (§21), load test, security review, staging sign-off, Phase 1 launch.

### Phase 2 — desktop surface `app.`

19. UX: desktop information architecture and flows, reusing Phase 1 research and live usage data. UI: desktop layouts and components on the same tokens.
20. `apps/desktop` scaffold on the shared packages; desktop game screen (landscape, side panels, keyboard shortcuts) with the §11.4 desktop performance targets.
21. All remaining screens on `app.` with route parity to `m.`.
22. Enable `DESKTOP_ENABLED=true`: device routing, `view_pref` switch, SEO alternate/canonical links. Routing tests from §16.
23. UX audit of `app.`, staging sign-off, Phase 2 launch.

No backend or shared-package change in Phase 2 may break `m.`; any such change needs its own PR with `m.` tests passing.

---

## 18. Open items — use defaults, do not block

Implement with the default and keep the value configurable. Do not ask about these unless a change is needed in code structure.

| Item | Default to implement |
| --- | --- |
| Traditional variant scoring | `game.traditional_points` = 1 / 2 / 2, no cube |
| Referral base and duration | 1% of referee's entry, paid from rake, unlimited duration |
| Coin package prices | Seed 4 placeholder packages, admin-editable |
| Payment gateway | Added later. For now implement only the abstract `PaymentGateway` interface and a sandbox adapter; the real Shaparak PSP adapter comes when the provider is chosen. Users are charged through admin top-up (§7.9) until then |
| SMS provider | Abstract `SmsProvider` interface; IPPanel Edge adapter (pattern sends, see `sms.md`) + a console adapter for dev |
| Brand name | Use `APP_NAME` env var and i18n key `app.name` |
| Terms of service and privacy text | Placeholder pages with i18n keys; include an 18+ age confirmation checkbox at signup |

---

## 19. Working rules for the agent

- Read this file before every task. Cite the section you are implementing in the PR description.
- Keep changes scoped to one step of §17 per PR. Include migrations, tests, and i18n keys in the same PR.
- Never weaken a test to make it pass. If a hard rule blocks the task, stop and ask.
- Ask before: adding a dependency not listed in §3, changing the ledger schema, changing the WebSocket envelope, or changing any §2 rule.
- Commit messages: Conventional Commits (`feat(wallet): …`, `fix(engine): …`).
- Git and deployment workflow: §22.

---

## 22. Source control and deployment

### 22.1 GitHub

- Remote: `https://github.com/amir0631/BackGammon.git` (`origin`, default branch `main`).
- After the initial scaffold, and after every completed change, commit and push to `origin`. Do not leave finished work uncommitted or unpushed.
- Never commit secrets: `.env` files, server credentials, `Arvan.txt`, keys, and certificates are in `.gitignore`. Commit `.env.example` with placeholder values only.

### 22.2 Local first, then server

1. Every step is first installed, run, and tested locally (Docker Compose stack on the developer machine: Postgres, Redis, backend, Celery, frontends, Nginx with local hostnames).
2. Only after the initial local tests pass is the project moved to the production server.
3. Server details (host, access, domain) will be provided later in `Arvan.txt` in the project root. Do not guess or invent server details; until that file exists, deployment is local only.
4. When `Arvan.txt` is provided: read it, never copy its secrets into the repo, the vault, or logs; deploy with the same Docker Compose setup (`infra/`), configure env vars on the server, run migrations, and smoke-test `m.`, `admin.`, and the API before reporting the deploy as done.

---

## 20. Recording, replay, and live spectating

### 20.1 Recording

- Replays are event logs re-rendered in the 3D scene, not video. Typical size 5–20 KB per match (compressed).
- Every event of §10.3 that affects a match (dice with `throw_seed`, moves, cube actions, reactions, timeouts, disconnects and reconnects, resign, end) is written to `match_event` with its server timestamp.
- Events are flushed from Redis to PostgreSQL in batches every 2 s and on match end, so a worker crash loses at most the unflushed tail, which is rebuilt from the Redis log on recovery.
- Bot matches are recorded too.
- Retention per `replay.retention_days`; 0 keeps forever. Records linked to an open fraud flag or payment dispute are never purged.

### 20.2 Player replay

- Available from match history (`GET me/matches`) to the two players of that match only.
- Controls: play/pause, speed 0.5×/1×/2×/4×, step forward/back by move, jump to game N of the match, dice throws replay with the same animation (lite mode respected).
- Shows the match's published `seed` and a "verify dice" action that recomputes every roll client-side and checks it against `seed_commit`.
- Reactions and phrases sent during the match are shown at their timestamps.

### 20.3 Admin replay

- Same viewer plus: exact timestamps, think time per move, disconnect and reconnect markers, device and IP changes during the match, and per-move bot evaluation (move quality vs best move) for anti-fraud review.
- Opened from the user page, the match search, and the fraud flag queue.

### 20.4 Live spectating

- Any logged-in user can watch any human-vs-human match in progress. Bot matches are not listed.
- Live list (`GET matches/live`): filters by tier, variant, tournament; sort by spectator count, prediction pool size, or average ELO. Tournament matches are highlighted.
- Joining mid-match: server sends `spectate.state` (full current state), then streams the same events players receive, delayed by `live.spectator_delay_seconds` (default 0: backgammon has no hidden information).
- Spectators see players' reactions and phrases. Spectator reactions go only to other spectators and can be disabled with `live.spectator_reactions_enabled`.
- Players see the spectator count only, never the spectator list.
- The prediction panel is part of the spectator view while the pool is open (§7.5).
- Spectator connections are read-only: the server rejects any game action from a spectator socket.
- Cap per match: `live.max_spectators_per_match`; beyond it, show "match full".
- Fan-out: one Redis channel group per match; spectators never join the players' group, so spectator load cannot delay player events.

---

## 21. Specialist agents and design workflow

Two subagents are defined in `.claude/agents/`. The main agent orchestrates, owns backend and shared logic, and delegates every user-facing screen to them.

| Agent | File | Owns | Writes to |
| --- | --- | --- | --- |
| `ux-specialist` | `.claude/agents/ux-specialist.md` | User journeys, information architecture, flows, screen specs, interaction states, microcopy keys, accessibility, usability reviews | `docs/ux/**` only |
| `ui-specialist` | `.claude/agents/ui-specialist.md` | Design tokens, component library, visual design, layouts, motion, 3D art direction and scene polish, screen implementation | `packages/design-tokens/**`, `packages/game3d/**` (visual only), `apps/mobile/**`, `apps/desktop/**` (Phase 2), `docs/ui/**` |

Loop for every user-facing feature:

1. **UX spec**: `ux-specialist` writes `docs/ux/screens/<feature>.md` (§21.1).
2. **UI build**: `ui-specialist` implements the screens from that spec with the shared packages, adds visual regression screenshots at the §11.7 viewports, and records any deviation from the spec in the PR.
3. **UX review**: `ux-specialist` reviews the running build and screenshots against the spec and heuristics, writes `docs/ux/reviews/<feature>-<date>.md` with issues labeled `blocking`, `major`, or `minor`.
4. `ui-specialist` fixes all `blocking` and `major` issues. The step is done only after a UX review with no open `blocking` issue.

The main agent never skips step 1 or 3 for a user-facing change.

### 21.1 Screen spec template (`docs/ux/screens/<feature>.md`)

- Goal and user story
- Entry points and exit points
- Flow (numbered steps, decision points, error paths)
- Screen list; for each screen: purpose, content priority order, components, primary and secondary actions
- States: loading, empty, error, offline, reconnecting, insufficient coins, banned or suspended, first-time user
- Responsive notes per breakpoint (§11.7) and orientation
- RTL/LTR notes, i18n keys for every string
- Accessibility: focus order, labels, contrast, motion
- Acceptance criteria (testable)
- Open questions

### 21.2 Design principles (both agents)

- The board and the dice are the product: in a match, nothing competes with them for attention.
- One primary action per screen; the next step is always obvious.
- Every wait (matchmaking, opponent's turn, payment verification, reconnect) shows progress and a way out.
- Coins are always visible where they are spent, with the cost shown before confirming.
- No dark patterns: no fake urgency, no hidden costs, no pre-checked purchases, no manipulative streaks or loss-chasing prompts. Purchase, entry, and prediction confirmations are explicit.
- Persian is the primary language; designs start in fa (RTL) and are then checked in en.
