# Load test (CLAUDE.md §16 Load)

Target: 1,000 concurrent WebSocket players in 500 matches for 30 minutes, p95 move round-trip under
200 ms, and zero ledger invariant violations.

`loadtest.py` signs players in through the public API, opens `/ws`, joins the matchmaking queue, and
plays real matches: it rolls, plays the first legal move after a short think time, takes any double,
and re-queues when a match ends. It measures:

- roll round-trip: `turn.roll` sent → own `turn.rolled` received
- move round-trip: `turn.move` sent → own `turn.moved` received

It exits non-zero when the p95 move round-trip is over `--p95-move-ms`, a player can't sign in, any
error event arrives, a turn times out, or a player can't finish its last match.

It needs only the backend's Python environment (`websockets` ships with `uvicorn[standard]`).

## Run

Never against production: `seed_load` refuses `APP_ENV=production`.

```sh
# 1. Players load0001… with phones 0901…, one password, and coins for table entries.
python backend/manage.py seed_load --count 1000 --coins 100000 --password '<load password>'

# 2. Play for 30 minutes after a 60 s ramp.
python infra/loadtest/loadtest.py --base https://m.staging.<domain> \
  --users 1000 --password '<load password>' --duration 1800 --ramp 60

# 3. Check the §7.8 invariants on the same database.
python backend/manage.py check_ledger
```

Against a local stack without Nginx, point `--base` at the ASGI server, e.g.
`--base http://localhost:8000`. The `Origin` header defaults to `--base` and must be an allowed host.

Useful options: `--tier` (entry fee, default 50), `--variant` (default `standard_nocube`), `--length`
(default 1), `--think-min`/`--think-max` (seconds), `--first` (first player number, to split players
across several load machines), `--report-every` (progress line interval).

Each player sends its own `User-Agent`, so the players don't look like one person on one device
(§12.2 `multi_account` would otherwise refuse to pair them).

## Reference result

Local run (2 uvicorn workers, one timer worker, Postgres and Redis on the same machine), 40 players
for 180 s, think time 0.2–0.6 s: 83 matches played to the end, 3,539 moves, p95 move round-trip
36 ms, p95 roll 35 ms, no errors, ledger invariants held.
