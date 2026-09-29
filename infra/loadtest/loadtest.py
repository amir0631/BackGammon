"""WebSocket load test (CLAUDE.md §16 Load): N players sign in, queue, and play real matches against
each other through the public API and /ws, for a fixed duration. Reports roll and move round-trip
percentiles and fails when the p95 move round-trip is over the limit or anything went wrong.

Runs with the backend's own Python environment (websockets ships with uvicorn[standard]); nothing
else to install. The players come from `manage.py seed_load`; after the run, `manage.py check_ledger`
confirms the §7.8 invariants. See README.md.

Each player uses its own User-Agent so the players don't look like one person on one device, which
the matchmaker would refuse to pair (§12.2 multi_account).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random  # think time only; dice are never generated here
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass, field
from http.cookiejar import CookieJar
from typing import Any
from urllib.parse import urlsplit

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed


def load_phone(i: int) -> str:
    return f"+98901{i:07d}"  # the numbers seed_load creates


@dataclass
class Stats:
    roll_ms: list[float] = field(default_factory=list)
    move_ms: list[float] = field(default_factory=list)
    matches: int = 0
    games: int = 0
    signed_in: int = 0
    rejoined: int = 0
    errors: Counter[str] = field(default_factory=Counter)
    auto: Counter[str] = field(default_factory=Counter)
    ends: Counter[str] = field(default_factory=Counter)

    def fail(self, what: str) -> None:
        self.errors[what] += 1


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(len(s) - 1, round(p / 100 * (len(s) - 1)))]


class Http:
    """A tiny cookie-keeping client on the standard library, run in threads."""

    def __init__(self, base: str, user_agent: str, origin: str) -> None:
        self.base = base.rstrip("/")
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(self.jar)
        )
        self.headers = {"User-Agent": user_agent, "Origin": origin, "Referer": origin + "/"}

    def _cookie(self, name: str) -> str:
        return next((c.value or "" for c in self.jar if c.name == name), "")

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        headers = dict(self.headers)
        if data is not None:
            headers["Content-Type"] = "application/json"
        if method != "GET":
            headers["X-CSRFToken"] = self._cookie("csrftoken")
        req = urllib.request.Request(  # noqa: S310 - --base is checked to be http(s)
            self.base + path, data=data, method=method, headers=headers
        )
        try:
            with self.opener.open(req, timeout=30) as res:
                raw = res.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:200]
            raise RuntimeError(f"{method} {path}: HTTP {exc.code} {detail}") from None
        return json.loads(raw) if raw else {}

    def sign_in(self, phone: str, password: str) -> None:
        self.request("GET", "/api/v1/auth/csrf")
        self.request("POST", "/api/v1/auth/login", {"phone": phone, "password": password})

    def ws_token(self) -> str:
        return str(self.request("GET", "/api/v1/auth/ws-token")["token"])


class Player:
    def __init__(self, i: int, args: argparse.Namespace, stats: Stats, stop_at: float) -> None:
        self.i = i
        self.args = args
        self.stats = stats
        self.stop_at = stop_at
        self.http = Http(args.base, f"bg-load/{i} ({args.run_id})", args.origin)
        self.ws: ClientConnection | None = None
        self.match_id: str | None = None
        self.you: int | None = None
        self.seq = 0
        self.pending_roll: float | None = None
        self.pending_move: float | None = None
        self.acting = False  # a roll or move is scheduled; don't schedule another
        self.tasks: set[asyncio.Future[None]] = set()

    async def send(self, type_: str, payload: dict[str, Any] | None = None, **extra: Any) -> None:
        assert self.ws is not None
        env = {"type": type_, "match_id": extra.get("match_id", self.match_id), "seq": self.seq}
        env["payload"] = payload or {}
        await self.ws.send(json.dumps(env))

    async def run(self, sign_in_gate: asyncio.Semaphore) -> None:
        async with sign_in_gate:
            try:
                await asyncio.to_thread(self.http.sign_in, load_phone(self.i), self.args.password)
            except Exception as exc:  # reported, not raised
                self.stats.fail(f"sign_in: {str(exc)[:120]}")
                return
        self.stats.signed_in += 1
        while time.monotonic() < self.stop_at or self.match_id is not None:
            try:
                await self.session()
            except (ConnectionClosed, OSError) as exc:
                self.stats.fail(f"socket: {type(exc).__name__}")
                await asyncio.sleep(1 + random.random())  # noqa: S311
            except Exception as exc:
                self.stats.fail(f"player: {type(exc).__name__}: {str(exc)[:120]}")
                return

    async def session(self) -> None:
        token = await asyncio.to_thread(self.http.ws_token)
        async with connect(
            self.args.ws_url,
            origin=self.args.origin,
            additional_headers={"User-Agent": self.http.headers["User-Agent"]},
            user_agent_header=None,
            proxy=None,
            open_timeout=30,
        ) as ws:
            self.ws = ws
            auth = {"type": "auth", "match_id": None, "seq": 0, "payload": {"token": token}}
            await ws.send(json.dumps(auth))
            if self.match_id is not None:  # reconnecting mid-match
                await self.send("match.sync", {"last_seq": self.seq})
            while True:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                except TimeoutError:
                    raw = None
                if raw is not None:
                    await self.on_message(json.loads(raw))
                if self.match_id is None and time.monotonic() >= self.stop_at:
                    await self.send("queue.leave", match_id=None)  # still waiting to be paired
                    await ws.close()
                    self.ws = None
                    return

    async def join_queue(self) -> None:
        if time.monotonic() >= self.stop_at:
            return  # the session loop closes the socket
        await self.send(
            "queue.join",
            {"tier_id": self.args.tier, "variant": self.args.variant, "length": self.args.length},
            match_id=None,
        )

    def later(self, coro_factory: Any, delay: float) -> None:
        """Acts after a human-ish pause, without blocking the reader."""
        self.acting = True

        async def go() -> None:
            await asyncio.sleep(delay)
            self.acting = False
            try:
                await coro_factory()
            except ConnectionClosed:
                pass

        task = asyncio.ensure_future(go())
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    def think(self) -> float:
        return random.uniform(self.args.think_min, self.args.think_max)  # noqa: S311

    async def roll(self) -> None:
        self.pending_roll = time.perf_counter()
        await self.send("turn.roll")

    def move_factory(self, legal: list[list[list[int]]]) -> Any:
        async def move() -> None:
            self.pending_move = time.perf_counter()
            await self.send("turn.move", {"moves": legal[0]})

        return move

    def act_on_state(self, p: dict[str, Any]) -> None:
        """A full state (after joining, a stale action, or an error): do whatever is ours to do."""
        if p["status"] != "active" or p["turn"] != self.you or self.acting:
            return
        if p["phase"] == "roll":
            self.later(self.roll, self.think())
        elif p["phase"] == "move" and len(p["legal"]) > 1:
            self.later(self.move_factory(p["legal"]), self.think())
        elif p["phase"] == "cube_offered":
            self.later(lambda: self.send("cube.take"), self.think())

    async def on_message(self, env: dict[str, Any]) -> None:
        t, p = env["type"], env.get("payload") or {}
        if env.get("match_id") and env["match_id"] == self.match_id and env.get("seq", 0) > 0:
            self.seq = env["seq"]
        now = time.perf_counter()
        if t == "auth.ok":
            if self.match_id is None:
                await self.join_queue()
        elif t == "match.found":
            self.match_id, self.you, self.seq = p["match_id"], p["you"], 0
            await self.send("match.sync", {"last_seq": 0})
        elif t == "match.state":
            self.you = p["you"]
            self.act_on_state(p)
        elif t == "turn.rolled":
            if p["player"] == self.you and self.pending_roll is not None:
                self.stats.roll_ms.append((now - self.pending_roll) * 1000)
                self.pending_roll = None
            if p["clock"]["actor"] == self.you and len(p["legal"]) > 1:
                self.later(self.move_factory(p["legal"]), self.think())
        elif t == "turn.moved":
            if p["player"] == self.you:
                if p["auto"]:
                    self.stats.auto[p["auto"]] += 1
                elif self.pending_move is not None:
                    self.stats.move_ms.append((now - self.pending_move) * 1000)
                self.pending_move = None
            if p["clock"]["actor"] == self.you:
                self.later(self.roll, self.think())
        elif t == "turn.passed":
            if p["clock"]["actor"] == self.you:
                self.later(self.roll, self.think())
        elif t == "cube.update":
            if p["action"] == "offer" and p["player"] != self.you:
                self.later(lambda: self.send("cube.take"), self.think())
        elif t == "game.ended":
            if p.get("winner") == self.you:
                self.stats.games += 1
        elif t == "match.ended":
            if self.you == 0:  # count each match once
                self.stats.matches += 1
            self.stats.ends[p.get("reason") or "?"] += 1
            self.match_id, self.you, self.seq = None, None, 0
            self.pending_roll = self.pending_move = None
            await asyncio.sleep(random.uniform(0.5, 2.0))  # noqa: S311
            await self.join_queue()
        elif t == "error":
            code = p.get("code", "?")
            details = p.get("details") or {}
            if code == "MATCH_IN_PROGRESS" and self.match_id is None:
                # Left over from an earlier run or a dropped socket: play it out.
                self.stats.rejoined += 1
                self.match_id, self.seq = details["match_id"], 0
                await self.send("match.sync", {"last_seq": 0})
                return
            reason = details.get("reason")
            self.stats.fail(f"error: {code}{f' ({reason})' if reason else ''}")
            if self.match_id is None and code not in {"MATCH_NOT_ATTACHED"}:
                await asyncio.sleep(2)
                await self.join_queue()
        elif t == "queue.status" and p.get("state") == "removed":
            self.stats.fail(f"queue removed: {p.get('reason')}")
            await asyncio.sleep(2)
            await self.join_queue()


async def report(stats: Stats, started: float, every: float) -> None:
    while True:
        await asyncio.sleep(every)
        print(
            f"[{time.monotonic() - started:6.0f}s] signed in {stats.signed_in} · matches {stats.matches} · "
            f"moves {len(stats.move_ms)} p95 {pct(stats.move_ms, 95):.0f} ms · rolls {len(stats.roll_ms)} "
            f"p95 {pct(stats.roll_ms, 95):.0f} ms · errors {sum(stats.errors.values())}",
            flush=True,
        )


async def main(args: argparse.Namespace) -> int:
    stats = Stats()
    started = time.monotonic()
    stop_at = started + args.ramp + args.duration
    gate = asyncio.Semaphore(args.sign_in_concurrency)
    ticker = asyncio.ensure_future(report(stats, started, args.report_every))
    tasks = []
    for n in range(args.users):
        player = Player(args.first + n, args, stats, stop_at)
        tasks.append(asyncio.ensure_future(player.run(gate)))
        await asyncio.sleep(args.ramp / max(1, args.users))
    # Players finish the match they are in; a stuck one is cut off after the grace.
    _, pending = await asyncio.wait(tasks, timeout=args.ramp + args.duration + args.finish_grace)
    for task in pending:
        task.cancel()
    ticker.cancel()

    print("\n=== load test result ===")
    print(f"players {args.users} (signed in {stats.signed_in}) · duration {args.duration}s")
    print(f"unfinished {len(pending)}")
    print(f"rejoined running matches {stats.rejoined}")
    print(f"matches finished {stats.matches} · end reasons {dict(stats.ends)}")
    print(f"auto moves {dict(stats.auto)}")
    for name, values in (("roll", stats.roll_ms), ("move", stats.move_ms)):
        print(
            f"{name} round-trip: n={len(values)} p50={pct(values, 50):.1f} ms p95={pct(values, 95):.1f} ms "
            f"p99={pct(values, 99):.1f} ms max={max(values, default=0):.1f} ms"
        )
    if stats.errors:
        print("errors:")
        for what, n in stats.errors.most_common(20):
            print(f"  {n:6d}  {what}")

    failures = []
    if pct(stats.move_ms, 95) > args.p95_move_ms:
        failures.append(f"p95 move round-trip {pct(stats.move_ms, 95):.0f} ms > {args.p95_move_ms} ms")
    if not stats.move_ms:
        failures.append("no moves were measured")
    if stats.signed_in < args.users:
        failures.append(f"only {stats.signed_in}/{args.users} players signed in")
    if sum(stats.errors.values()) > args.max_errors:
        failures.append(f"{sum(stats.errors.values())} errors > {args.max_errors}")
    if pending:
        failures.append(f"{len(pending)} players did not finish")
    if stats.auto["timeout"]:
        failures.append(f"{stats.auto['timeout']} turns timed out (players should always act in time)")
    print("\nFAIL: " + "; ".join(failures) if failures else "\nPASS")
    print("Now run `python manage.py check_ledger` against the same database (§7.8 invariants).")
    return 1 if failures else 0


def parse() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://localhost:8000", help="Site origin serving /api and /ws")
    ap.add_argument("--origin", help="Origin header (default: --base); must be an allowed host")
    ap.add_argument("--users", type=int, default=1000)
    ap.add_argument("--first", type=int, default=1, help="First seed_load player number")
    ap.add_argument("--password", required=True, help="The password given to seed_load")
    ap.add_argument("--duration", type=float, default=1800, help="Seconds of play after the ramp")
    ap.add_argument("--ramp", type=float, default=60, help="Seconds over which players arrive")
    ap.add_argument("--finish-grace", type=float, default=600, help="Seconds to finish last matches")
    ap.add_argument("--tier", type=int, default=50, help="Table tier (its entry fee)")
    variants = ["standard_cube", "standard_nocube", "traditional"]
    ap.add_argument("--variant", default="standard_nocube", choices=variants)
    ap.add_argument("--length", type=int, default=1)
    ap.add_argument("--think-min", type=float, default=0.5)
    ap.add_argument("--think-max", type=float, default=2.0)
    ap.add_argument("--p95-move-ms", type=float, default=200)
    ap.add_argument("--max-errors", type=int, default=0)
    ap.add_argument("--sign-in-concurrency", type=int, default=16)
    ap.add_argument("--report-every", type=float, default=30)
    args = ap.parse_args()
    args.origin = (args.origin or args.base).rstrip("/")
    parts = urlsplit(args.base)
    if parts.scheme not in {"http", "https"}:
        ap.error("--base must be an http:// or https:// URL")
    args.ws_url = f"{'wss' if parts.scheme == 'https' else 'ws'}://{parts.netloc}/ws"
    args.run_id = f"{int(time.time())}"
    return args


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse())))
