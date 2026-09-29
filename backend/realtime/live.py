"""Live match runtime (CLAUDE.md §5.3, §5.4, §10.3, §10.4).

Each match's state lives in Redis and is changed only under the match lock (`rt:match:<id>:lock`), one
action at a time. An action runs inside a DB transaction: the events it emits are appended to
`match_event` and to the Redis event log, then the new state is saved and the events are published to
the match's channel group while the lock is still held, so every subscriber sees them in `seq` order.

Timers (turn deadlines, reconnect grace, the 1 s forced move, the 1.5 s pass, the next game, bot turns)
sit in one Redis sorted set scored by due time; `run_timers` pops them every 250 ms. Each timer carries
a token; rescheduling or cancelling a kind bumps the token, so stale timers do nothing.
"""

import json
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, cast

import redis
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from config.errors import AppError
from game.engine import dice as fair
from game.engine.match import GameResult, Phase, RuleError
from game.engine.match import Match as Engine
from game.engine.moves import IllegalMove, Play
from game.models import Game, Match, MatchEvent, Move
from realtime import protocol, reactions, seeds

FORCED_DELAY = 1.0  # §5.3: a single legal play is applied after 1 s
PASS_DELAY = 1.5  # §5.3: no legal play, the turn passes after showing the dice for 1.5 s
OPENING_DELAY = 1.5
NEXT_GAME_DELAY = 3.0
EVENT_LOG_KEEP = 2000
TIMERS_KEY = "rt:timers"
LIVE_SET = "rt:live"  # active human-vs-human matches, for the live list (§20.4)
ENDED_TTL = 3600

# Game actions must be sent against the latest state the client applied (§10.3 "seq").
SEQ_CHECKED = {"turn.roll", "turn.move", "cube.offer", "cube.take", "cube.drop"}


class LiveError(AppError):
    status_code = 409
    code = "MATCH_ACTION_INVALID"
    message_key = "errors.match.actionInvalid"


class NotAPlayer(LiveError):
    code = "MATCH_NOT_A_PLAYER"
    message_key = "errors.match.notAPlayer"


class MatchNotFound(LiveError):
    code = "MATCH_NOT_FOUND"
    message_key = "errors.match.notFound"


class ReactionRejected(LiveError):
    code = "REACTION_REJECTED"
    message_key = "errors.match.reactionRejected"


class _Stale(Exception):
    pass


_client: redis.Redis | None = None


def r() -> Any:
    """The shared sync Redis client. Typed as Any: redis-py's stubs give every sync call an
    `Awaitable | T` return type, which would need a cast at each use."""
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def now() -> float:
    return time.time()


def _key(match_id: str, suffix: str) -> str:
    return f"rt:match:{match_id}:{suffix}"


def group_name(match_id: str, spectators: bool = False) -> str:
    return f"{'spect' if spectators else 'match'}.{match_id}"


@dataclass
class Live:
    match_id: str
    players: list[dict[str, Any]]
    user_ids: list[int | None]
    variant: str
    length: int
    entry: int
    seed_commit: str
    seed_encrypted: str
    engine: Engine
    settings: dict[str, Any]
    seq: int = 0
    roll_n: int = 0
    status: str = "active"
    clock: dict[str, Any] = field(default_factory=dict)
    timeouts: list[int] = field(default_factory=lambda: [0, 0])
    channels: list[list[str]] = field(default_factory=lambda: [[], []])
    grace: list[float | None] = field(default_factory=lambda: [None, None])
    away: list[bool] = field(default_factory=lambda: [False, False])  # disconnected after having joined
    tokens: dict[str, int] = field(default_factory=dict)
    auto: dict[str, Any] | None = None
    last_react: list[float] = field(default_factory=lambda: [0.0, 0.0])
    game_pk: int | None = None
    move_seq: int = 0
    last_dice: list[int] | None = None
    spectators: int = 0
    spectators_sent_at: float = 0.0
    tournament_id: int | None = None
    # Not stored: work for the end of the current session.
    outbox: list[tuple[dict[str, Any], str]] = field(default_factory=list)
    new_timers: list[tuple[str, float]] = field(default_factory=list)

    _STORED = (
        "match_id players user_ids variant length entry seed_commit seed_encrypted settings seq roll_n "
        "status clock timeouts channels grace away tokens auto last_react game_pk move_seq last_dice "
        "spectators spectators_sent_at tournament_id"
    ).split()

    def to_json(self) -> str:
        data = {k: getattr(self, k) for k in self._STORED}
        data["engine"] = self.engine.to_dict()
        return json.dumps(data)

    @classmethod
    def from_json(cls, text: str) -> "Live":
        data = json.loads(text)
        engine = Engine.from_dict(data.pop("engine"))
        return cls(engine=engine, **data)

    def side_of(self, user_id: int) -> int | None:
        return self.user_ids.index(user_id) if user_id in self.user_ids else None

    def is_bot(self, side: int | None) -> bool:
        return side is not None and bool(self.players[side]["is_bot"])


# ---- storage, locking, publishing ----

Publisher = Callable[[str, list[dict[str, Any]], bool], None]


def _channel_publish(match_id: str, envelopes: list[dict[str, Any]], spectators_only: bool) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    message = {"type": "match.events", "envelopes": envelopes}
    if not spectators_only:
        async_to_sync(layer.group_send)(group_name(match_id), message)
        from realtime import delay

        if (held := delay.seconds()) > 0:  # §20.4: spectators see the match with a delay
            delay.hold("group", group_name(match_id, spectators=True), envelopes, held)
            return
    async_to_sync(layer.group_send)(group_name(match_id, spectators=True), message)


publisher: Publisher = _channel_publish


def load(match_id: str) -> Live:
    text = cast(str | None, r().get(_key(match_id, "state")))
    if text is None:
        raise MatchNotFound()
    return Live.from_json(text)


def _actor(side: int | None) -> str:
    if side is None:
        return MatchEvent.Actor.SYSTEM
    return {0: MatchEvent.Actor.PLAYER_A, 1: MatchEvent.Actor.PLAYER_B}.get(side, MatchEvent.Actor.SYSTEM)


def _commit(live: Live) -> None:
    """Persist events and state; runs inside the session's DB transaction."""
    if live.outbox:
        MatchEvent.objects.bulk_create(
            MatchEvent(
                match_id=live.match_id,
                seq=env["seq"],
                type=env["type"],
                actor=actor,
                payload=env["payload"],
                server_ts=timezone.now(),
            )
            for env, actor in live.outbox
        )


def _save(live: Live) -> None:
    pipe = r().pipeline()
    pipe.set(_key(live.match_id, "state"), live.to_json())
    if live.outbox:
        pipe.rpush(_key(live.match_id, "events"), *(json.dumps(env) for env, _a in live.outbox))
        pipe.ltrim(_key(live.match_id, "events"), -EVENT_LOG_KEEP, -1)
    for member, due in live.new_timers:
        pipe.zadd(TIMERS_KEY, {member: due})
    if live.status != "active":
        pipe.expire(_key(live.match_id, "state"), ENDED_TTL)
        pipe.expire(_key(live.match_id, "events"), ENDED_TTL)
    pipe.execute()


def _publish(live: Live) -> None:
    if live.outbox:
        publisher(live.match_id, [env for env, _actor in live.outbox], False)


@contextmanager
def session(match_id: str) -> Iterator[Live]:
    lock = r().lock(_key(match_id, "lock"), timeout=15, blocking_timeout=10)
    if not lock.acquire():
        raise LiveError(details={"reason": "busy"})
    try:
        with transaction.atomic():
            live = load(match_id)
            yield live
            _commit(live)
        _save(live)
        _publish(live)
    finally:
        try:
            lock.release()
        except redis.exceptions.LockError:
            pass


def emit(live: Live, type_: str, payload: dict[str, Any], side: int | None = None) -> None:
    """A match event: numbered in the match sequence, recorded (§20.1), sent to players and spectators."""
    body = protocol.SERVER_MESSAGES[type_].model_validate(payload).model_dump(mode="json")
    live.seq += 1
    env = {"type": type_, "match_id": live.match_id, "seq": live.seq, "payload": body}
    live.outbox.append((env, _actor(side)))


def publish_to_spectators(match_id: str, type_: str, payload: dict[str, Any]) -> None:
    """A spectator-only event (§20.4): outside the match sequence (seq 0) and the match record, and
    sent without the match lock, so spectator activity never delays or gaps the players' stream."""
    body = protocol.SERVER_MESSAGES[type_].model_validate(payload).model_dump(mode="json")
    publisher(match_id, [{"type": type_, "match_id": match_id, "seq": 0, "payload": body}], True)


def events_since(match_id: str, last_seq: int) -> list[dict[str, Any]] | None:
    """Missed events after `last_seq`, or None when they are no longer in the Redis log."""
    items = [json.loads(x) for x in cast(list[str], r().lrange(_key(match_id, "events"), 0, -1))]
    missed = [e for e in items if e["seq"] > last_seq]
    if last_seq and missed and missed[0]["seq"] != last_seq + 1:
        return None
    if not items and last_seq:
        return None
    return missed


# ---- timers ----


def _schedule(live: Live, kind: str, delay: float) -> None:
    token = live.tokens.get(kind, 0) + 1
    live.tokens[kind] = token
    live.new_timers.append((f"{live.match_id}|{kind}|{token}", now() + delay))


def _cancel(live: Live, kind: str) -> None:
    live.tokens[kind] = live.tokens.get(kind, 0) + 1


def due_timers(limit: int = 200) -> list[str]:
    """Claims due timers (ZREM wins the race between workers)."""
    members = cast(list[str], r().zrangebyscore(TIMERS_KEY, "-inf", now(), start=0, num=limit))
    return [m for m in members if r().zrem(TIMERS_KEY, m)]


def fire(member: str) -> None:
    match_id, kind, token = member.split("|")
    try:
        with session(match_id) as live:
            if live.tokens.get(kind) != int(token) or live.status != "active":
                return
            if kind == "turn":
                _on_turn_timeout(live)
            elif kind == "auto":
                _on_auto(live)
            elif kind.startswith("grace"):
                _on_grace_expired(live, int(kind[-1]))
            elif kind == "bot":
                from realtime import botturn

                botturn.act(live)
    except MatchNotFound:
        return


# ---- clock (§5.4) ----


def _init_clock(live: Live) -> None:
    bank = float(live.settings["timebank_seconds"])
    live.clock = {"actor": None, "started": None, "deadline": None, "bank": [bank, bank]}


def _start_clock(live: Live, side: int) -> None:
    turn_seconds = live.settings["turn_seconds"]
    started = now()
    deadline = started + turn_seconds + live.clock["bank"][side]
    live.clock.update(actor=side, started=started, deadline=deadline)
    token = live.tokens.get("turn", 0) + 1
    live.tokens["turn"] = token
    live.new_timers.append((f"{live.match_id}|turn|{token}", deadline))
    _push_if_away(live, side)


def _push_if_away(live: Live, side: int) -> None:
    """§11.5: a player whose app is closed hears that it is their turn (once a minute at most)."""
    user_id = live.user_ids[side]
    if user_id is None or live.channels[side] or live.status != "active":
        return
    from django.core.cache import cache

    if not cache.add(f"push:turn:{live.match_id}:{user_id}", 1, timeout=60):
        return
    from accounts.tasks import push_your_turn

    match_id = live.match_id
    transaction.on_commit(lambda: push_your_turn.delay(user_id, match_id))


def _stop_clock(live: Live) -> None:
    side = live.clock.get("actor")
    if side is not None:
        used = now() - live.clock["started"]
        over = max(0.0, used - live.settings["turn_seconds"])
        live.clock["bank"][side] = round(max(0.0, live.clock["bank"][side] - over), 3)
    live.clock.update(actor=None, started=None, deadline=None)
    _cancel(live, "turn")


def clock_payload(live: Live) -> dict[str, Any]:
    deadline = live.clock.get("deadline")
    return {
        "actor": live.clock.get("actor"),
        "deadline": int(deadline * 1000) if deadline else None,
        "bank": list(live.clock["bank"]),
        "turn_seconds": live.settings["turn_seconds"],
        "server_now": int(now() * 1000),
    }


# ---- creation ----


def create(match: Match, players: list[dict[str, Any]], user_ids: list[int | None]) -> None:
    """Initial live state for a new match; the first game starts and the opening roll is scheduled."""
    from game.engine.match import Rules

    rules = match.rules
    engine = Engine.start(Rules.for_variant(match.variant, match.length, rules.get("traditional_points")))
    live = Live(
        match_id=str(match.id),
        players=players,
        user_ids=user_ids,
        variant=match.variant,
        length=match.length,
        entry=match.entry,
        seed_commit=match.seed_commit,
        seed_encrypted=match.seed_encrypted,
        engine=engine,
        settings=rules,
        tournament_id=match.tournament_id,
    )
    _init_clock(live)
    grace = float(rules["reconnect_grace_seconds"])
    for side in (0, 1):
        if not live.is_bot(side):
            # A player who never connects forfeits like one who disconnects.
            live.grace[side] = now() + grace
            _schedule(live, f"grace{side}", grace)
    with transaction.atomic():
        _new_game_row(live)
        emit(live, "game.started", _game_started_payload(live))
        # The opening roll waits until every human player has joined (see connect), so a match whose
        # player never comes ends before the first roll and is refunded (§7.3).
        _commit(live)
    _save(live)
    if not any(p["is_bot"] for p in players):
        r().sadd(LIVE_SET, live.match_id)
    _publish(live)


def _new_game_row(live: Live) -> None:
    game = Game.objects.create(
        match_id=live.match_id, number=live.engine.game_no, crawford=live.engine.crawford_game
    )
    live.game_pk = game.pk


def _game_started_payload(live: Live) -> dict[str, Any]:
    e = live.engine
    return {
        "game_no": e.game_no,
        "crawford": e.crawford_game,
        "score": list(e.score),
        "position": e.position.encode(),
    }


# ---- actions ----


def handle(
    match_id: str, user_id: int, type_: str, payload: dict[str, Any], client_seq: int
) -> list[dict[str, Any]]:
    """Applies one client action. Returns messages for the sending socket only (errors, a fresh state)."""
    try:
        with session(match_id) as live:
            side = live.side_of(user_id)
            if side is None:
                raise NotAPlayer()
            if live.status != "active":
                raise LiveError(details={"reason": "ended"})
            if type_ in SEQ_CHECKED and client_seq != live.seq:
                raise _Stale()
            _dispatch(live, side, type_, payload)
        return []
    except _Stale:
        return [state_envelope(match_id, user_id)]
    except (RuleError, IllegalMove) as exc:
        return [
            _error(match_id, LiveError(details={"reason": exc.reason})),
            state_envelope(match_id, user_id),
        ]
    except LiveError as exc:
        if isinstance(exc, MatchNotFound):
            return [_error(match_id, exc)]
        return [_error(match_id, exc), state_envelope(match_id, user_id)]


def _error(match_id: str, exc: AppError) -> dict[str, Any]:
    return {
        "type": "error",
        "match_id": match_id,
        "seq": 0,
        "payload": {"code": exc.code, "message_key": exc.message_key, "details": exc.details},
    }


def _dispatch(live: Live, side: int, type_: str, payload: dict[str, Any]) -> None:
    e = live.engine
    if type_ == "turn.roll":
        if e.phase != Phase.ROLL or e.turn != side:
            raise RuleError("phase")
        live.timeouts[side] = 0
        do_roll(live, side)
    elif type_ == "turn.move":
        moves = protocol.TurnMoveIn.model_validate(payload).moves
        play, result = e.play(side, moves)
        live.timeouts[side] = 0
        after_play(live, side, play, result, auto=None)
    elif type_ == "cube.offer":
        live.timeouts[side] = 0
        do_offer(live, side)
    elif type_ == "cube.take":
        live.timeouts[side] = 0
        do_take(live, side)
    elif type_ == "cube.drop":
        live.timeouts[side] = 0
        do_drop(live, side)
    elif type_ == "react.send":
        body = protocol.ReactSendIn.model_validate(payload)
        kind, key = ("emoji", body.emoji_key) if body.emoji_key else ("phrase", body.phrase_key)
        assert key is not None
        user_id = live.user_ids[side]
        if not reactions.allowed(kind, key, user_id):
            raise ReactionRejected(details={"reason": "unknown"})
        if now() - live.last_react[side] < reactions.RATE_SECONDS:
            raise ReactionRejected(details={"reason": "rate"})
        live.last_react[side] = now()
        emit(live, "react.recv", {"key": key, "kind": kind, "sender": side}, side)
    elif type_ == "match.resign":
        scope = protocol.MatchResignIn.model_validate(payload).scope
        _stop_clock(live)
        result = e.resign(side, scope)
        if result is not None:
            game_over(live, result)
        else:
            match_over(live)
    else:
        raise LiveError(details={"reason": "unknown_type"})


def _cube_payload(live: Live, action: str, side: int) -> dict[str, Any]:
    e = live.engine
    return {
        "action": action,
        "player": side,
        "value": e.cube_value,
        "owner": e.cube_owner,
        "clock": clock_payload(live),
    }


def do_offer(live: Live, side: int) -> None:
    live.engine.offer_double(side)
    _stop_clock(live)
    _start_clock(live, 1 - side)  # the opponent's decision time
    emit(live, "cube.update", _cube_payload(live, "offer", side), side)
    _record_move(live, side, cube_action="offer")
    if live.is_bot(1 - side):
        _schedule_bot(live)


def do_drop(live: Live, side: int) -> None:
    result = live.engine.drop(side)
    _stop_clock(live)
    emit(live, "cube.update", _cube_payload(live, "drop", side), side)
    _record_move(live, side, cube_action="drop")
    game_over(live, result)


def do_take(live: Live, side: int) -> None:
    live.engine.take(side)
    _stop_clock(live)
    mover = 1 - side
    _start_clock(live, mover)
    emit(live, "cube.update", _cube_payload(live, "take", side), side)
    _record_move(live, side, cube_action="take")
    if live.is_bot(mover):
        _schedule_bot(live)


def do_roll(live: Live, side: int, then_play: bool = False) -> list[Play]:
    seed = seeds.decrypt(live.seed_encrypted)
    n = live.roll_n
    live.roll_n += 1
    rolled = fair.roll(seed, live.match_id, n)
    plays = live.engine.roll(side, rolled)
    live.last_dice = list(rolled)
    emit(
        live,
        "turn.rolled",
        {
            "player": side,
            "opening": False,
            "dice": list(rolled),
            "throw_seed": fair.throw_seed(seed, live.match_id, n),
            "legal": [p.as_lists() for p in plays],
            "clock": clock_payload(live),
        },
        side,
    )
    if then_play:
        if plays:
            play, result = live.engine.play(side, plays[0].as_lists())
            after_play(live, side, play, result, auto="timeout")
        else:
            _schedule_auto(live, "pass", PASS_DELAY)
    elif not plays:
        _stop_clock(live)
        _schedule_auto(live, "pass", PASS_DELAY)
    elif len(plays) == 1:
        _stop_clock(live)
        _schedule_auto(live, "forced", FORCED_DELAY)
    elif live.is_bot(side):
        _schedule_bot(live)
    return plays


def _schedule_auto(live: Live, kind: str, delay: float) -> None:
    live.auto = {"kind": kind}
    _schedule(live, "auto", delay)


def _schedule_bot(live: Live) -> None:
    import secrets

    # §9: a human-like delay of 0.8-2.0 s.
    _schedule(live, "bot", 0.8 + secrets.randbelow(1201) / 1000)


def after_play(live: Live, side: int, play: Play, result: GameResult | None, auto: str | None) -> None:
    _stop_clock(live)
    _cancel(live, "auto")
    live.auto = None
    if result is None:
        # The next turn's clock starts first, so the event carries its actor and deadline (§5.4).
        start_turn(live)
    emit(
        live,
        "turn.moved",
        {
            "player": side,
            "moves": play.as_lists(),
            "hits": [s.hit for s in play.steps],
            "position": play.position.encode(),
            "auto": auto,
            "clock": clock_payload(live),
        },
        side,
    )
    _record_move(live, side, moves=play.as_lists(), position=play.position.encode())
    if result is not None:
        game_over(live, result)


def start_turn(live: Live) -> None:
    side = live.engine.turn
    assert side is not None
    _start_clock(live, side)
    if live.is_bot(side):
        _schedule_bot(live)


def _record_move(
    live: Live, side: int, moves: list[list[int]] | None = None, position: str = "", cube_action: str = ""
) -> None:
    live.move_seq += 1
    assert live.game_pk is not None
    Move.objects.create(
        game_id=live.game_pk,
        seq=live.move_seq,
        player=side,
        dice=live.last_dice or [],
        moves_json=moves or [],
        cube_action=cube_action,
        position_after=position,
        ts=timezone.now(),
    )


def opening(live: Live) -> None:
    seed = seeds.decrypt(live.seed_encrypted)
    n = live.roll_n
    if n == 0:
        from predictions.services import close as close_pool

        close_pool(live.match_id)  # predictions close at the first roll (§7.5)
    live.roll_n += 1
    die_a, die_b = fair.roll(seed, live.match_id, n)
    starter = live.engine.opening_roll(die_a, die_b)
    live.last_dice = [die_a, die_b]
    legal = [p.as_lists() for p in live.engine.legal()] if starter is not None else []
    if starter is not None:
        _start_clock(live, starter)
    emit(
        live,
        "turn.rolled",
        {
            "player": None,
            "opening": True,
            "dice": [die_a, die_b],
            "throw_seed": fair.throw_seed(seed, live.match_id, n),
            "legal": legal,
            "clock": clock_payload(live),
        },
    )
    if starter is None:
        _schedule_auto(live, "opening", OPENING_DELAY)
    elif live.is_bot(starter):
        _schedule_bot(live)


def game_over(live: Live, result: GameResult) -> None:
    _stop_clock(live)
    _cancel(live, "auto")
    _cancel(live, "bot")
    e = live.engine
    emit(live, "game.ended", {**result.as_dict(), "score": list(e.score)})
    assert live.game_pk is not None
    Game.objects.filter(pk=live.game_pk).update(
        winner_side=result.winner,
        kind=result.kind,
        cube=result.cube,
        points=result.points,
        reason=result.reason,
    )
    if e.phase == Phase.MATCH_OVER:
        match_over(live)
    else:
        _schedule_auto(live, "next_game", NEXT_GAME_DELAY)


def match_over(live: Live) -> None:
    from game import results

    _stop_clock(live)
    for kind in ("auto", "bot", "grace0", "grace1"):
        _cancel(live, kind)
    live.auto = None
    e = live.engine
    outcome = results.finish(live)
    aborted = outcome.pop("aborted")
    live.status = "aborted" if aborted else "finished"
    r().srem(LIVE_SET, live.match_id)
    emit(
        live,
        "match.ended",
        {
            "winner": None if aborted else e.winner,
            "score": list(e.score),
            "reason": f"aborted:{e.end_reason or ''}" if aborted else e.end_reason or "",
            "seed": seeds.decrypt(live.seed_encrypted).hex(),
            **outcome,
        },
    )


def forfeit(live: Live, side: int, reason: str) -> None:
    live.engine.forfeit(side, reason)
    match_over(live)


# ---- timers ----


def _on_turn_timeout(live: Live) -> None:
    side = live.clock.get("actor")
    if side is None:
        return
    _stop_clock(live)
    live.timeouts[side] += 1
    limit = live.settings["max_consecutive_timeouts"]
    emit(live, "turn.timeout", {"player": side, "count": live.timeouts[side], "limit": limit}, side)
    if live.timeouts[side] >= limit:
        forfeit(live, side, "timeouts")
        return
    e = live.engine
    if e.phase == Phase.ROLL and e.turn == side:
        do_roll(live, side, then_play=True)
    elif e.phase == Phase.MOVE and e.turn == side:
        plays = e.legal()
        if plays:
            play, result = e.play(side, plays[0].as_lists())
            after_play(live, side, play, result, auto="timeout")
        else:
            _pass(live, side)
    elif e.phase == Phase.CUBE and e.turn != side:
        do_take(live, side)  # an unanswered double is taken


def _pass(live: Live, side: int) -> None:
    live.engine.pass_turn(side)
    live.auto = None
    start_turn(live)  # before the event, so it carries the next turn's clock
    emit(live, "turn.passed", {"player": side, "clock": clock_payload(live)}, side)
    _record_move(live, side)


def _on_auto(live: Live) -> None:
    kind = (live.auto or {}).get("kind")
    live.auto = None
    e = live.engine
    if kind == "opening" and e.phase == Phase.OPENING:
        opening(live)
    elif kind == "next_game" and e.phase == Phase.GAME_OVER:
        e.next_game()
        live.move_seq = 0
        _new_game_row(live)
        emit(live, "game.started", _game_started_payload(live))
        _schedule_auto(live, "opening", OPENING_DELAY)
    elif kind == "forced" and e.phase == Phase.MOVE and e.turn is not None:
        side = e.turn
        play, result = e.play(side, e.legal()[0].as_lists())
        after_play(live, side, play, result, auto="forced")
    elif kind == "pass" and e.phase == Phase.MOVE and e.turn is not None:
        _pass(live, e.turn)


def _on_grace_expired(live: Live, side: int) -> None:
    if live.channels[side] or live.grace[side] is None:
        return
    live.grace[side] = None
    forfeit(live, side, "disconnect")


# ---- connections ----


def connect(match_id: str, user_id: int, channel: str) -> int:
    with session(match_id) as live:
        side = live.side_of(user_id)
        if side is None:
            raise NotAPlayer()
        if channel not in live.channels[side]:
            live.channels[side].append(channel)
        if live.grace[side] is not None and live.status == "active":
            live.grace[side] = None
            _cancel(live, f"grace{side}")
            if live.away[side]:
                emit(live, "opponent.back", {"player": side}, side)
        live.away[side] = False
        everyone_here = all(live.channels[i] or live.is_bot(i) for i in (0, 1))
        if live.status == "active" and live.roll_n == 0 and live.auto is None and everyone_here:
            _schedule_auto(live, "opening", OPENING_DELAY)
        return side


def disconnect(match_id: str, user_id: int, channel: str) -> None:
    try:
        with session(match_id) as live:
            side = live.side_of(user_id)
            if side is None or channel not in live.channels[side]:
                return
            live.channels[side].remove(channel)
            if live.channels[side] or live.status != "active":
                return
            grace = int(live.settings["reconnect_grace_seconds"])
            live.grace[side] = now() + grace
            live.away[side] = True
            _schedule(live, f"grace{side}", grace)
            emit(live, "opponent.disconnected", {"player": side, "grace_seconds": grace}, side)
    except MatchNotFound:
        return


# ---- snapshots ----


def snapshot(live: Live, you: int | None) -> dict[str, Any]:
    e = live.engine
    players = [
        {**p, "connected": bool(live.channels[i]) or bool(p["is_bot"])} for i, p in enumerate(live.players)
    ]
    legal = [p.as_lists() for p in e.legal()] if e.phase == Phase.MOVE else []
    body = {
        "match_id": live.match_id,
        "status": live.status,
        "you": you,
        "players": players,
        "variant": live.variant,
        "length": live.length,
        "entry": live.entry,
        "seed_commit": live.seed_commit,
        "score": list(e.score),
        "game_no": e.game_no,
        "crawford_game": e.crawford_game,
        "phase": str(e.phase),
        "position": e.position.encode(),
        "turn": e.turn,
        "dice": list(e.dice) if e.dice else None,
        "cube_value": e.cube_value,
        "cube_owner": e.cube_owner,
        "can_double": you is not None and e.can_double(you),
        "legal": legal,
        "clock": clock_payload(live),
        "timeouts": list(live.timeouts),
        "results": [x.as_dict() for x in e.results],
        "winner": e.winner,
        "end_reason": e.end_reason,
        "spectators": live.spectators,
        "rules": rules_payload(live),
        "grace": [None if g is None else int(g * 1000) for g in live.grace],
    }
    return protocol.MatchStateOut.model_validate(body).model_dump(mode="json")


def _payout(live: Live, pot: int, rake_pct: int) -> int:
    if not live.entry or live.tournament_id is not None:
        return 0
    if any(p["is_bot"] for p in live.players):
        return live.entry + int(live.settings.get("bot_prize", 0))  # §9: entry back plus the prize
    return pot - pot * rake_pct // 100


def join_deadline_ms(rules: dict[str, Any]) -> int:
    """When a player who never joins is out (the grace every human side starts with, §5.4)."""
    return int((now() + float(rules["reconnect_grace_seconds"])) * 1000)


def rules_payload(live: Live) -> dict[str, Any]:
    rules = live.settings
    if live.variant == "traditional":
        points = dict(rules["traditional_points"])
    else:
        points = {"single": 1, "gammon": 2, "backgammon": 3}
    rake_pct = int(rules.get("table_rake_pct", 0))
    pot = live.entry * 2
    return {
        "turn_seconds": int(rules["turn_seconds"]),
        "timebank_seconds": int(rules["timebank_seconds"]),
        "max_consecutive_timeouts": int(rules["max_consecutive_timeouts"]),
        "reconnect_grace_seconds": int(rules["reconnect_grace_seconds"]),
        "points": points,
        "rake_pct": rake_pct,
        "payout": _payout(live, pot, rake_pct),
    }


def state_envelope(match_id: str, user_id: int | None, spectator: bool = False) -> dict[str, Any]:
    live = load(match_id)
    you = None if user_id is None else live.side_of(user_id)
    return {
        "type": "spectate.state" if spectator else "match.state",
        "match_id": match_id,
        "seq": live.seq,
        "payload": snapshot(live, you),
    }
