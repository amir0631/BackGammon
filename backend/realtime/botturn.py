"""Bot turns inside a live match (CLAUDE.md §9). The bot service (`BOT_URL`) decides; if it is not
configured or does not answer, the in-process brain is used when importable (development, tests),
otherwise the first legal play in canonical order, no double, and a take."""

import json
import logging
import urllib.request
from typing import Any

from django.conf import settings

from game.engine.match import Phase
from realtime import live as rt

logger = logging.getLogger("realtime.bot")
TIMEOUT_SECONDS = 2.0


def _seed(live: rt.Live) -> int:
    return int(live.match_id.replace("-", "")[:8], 16)


def _call(path: str, body: dict[str, Any]) -> dict[str, Any] | None:
    url = getattr(settings, "BOT_URL", "")
    if not url.startswith(("http://", "https://")):
        return None
    request = urllib.request.Request(  # noqa: S310 (scheme checked above)
        url.rstrip("/") + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 (internal URL)
            result: dict[str, Any] = json.loads(response.read())
            return result
    except (OSError, ValueError):
        logger.warning("bot service unavailable at %s", url)
        return None


def _local() -> Any:
    try:
        from bot import brain  # the bot package, when it is on the path
    except ImportError:
        return None
    return brain


def choose_move(live: rt.Live, side: int, level: str) -> list[list[int]]:
    e = live.engine
    assert e.dice is not None
    body = {
        "position": e.position.encode(),
        "player": side,
        "dice": list(e.dice),
        "level": level,
        "seed": _seed(live),
    }
    answer = _call("/move", body)
    if answer is not None:
        return [list(m) for m in answer["moves"]]
    brain = _local()
    if brain is not None:
        moves: list[list[int]] = brain.choose_move(e.position, side, e.dice, level, _seed(live))
        return moves
    plays = e.legal()
    return plays[0].as_lists() if plays else []


def cube(live: rt.Live, side: int, level: str) -> tuple[bool, bool]:
    e = live.engine
    body = {"position": e.position.encode(), "player": side, "level": level, "seed": _seed(live)}
    answer = _call("/cube", body)
    if answer is not None:
        return bool(answer["double"]), bool(answer["take"])
    brain = _local()
    if brain is not None:
        decision = brain.cube_decision(e.position, side, level, _seed(live))
        return decision.double, decision.take
    return False, True


def act(live: rt.Live) -> None:
    """One bot action when it is the bot's move; the runtime schedules the next one."""
    side = next((i for i in (0, 1) if live.is_bot(i)), None)
    if side is None:
        return
    level = live.players[side]["bot_level"] or "medium"
    e = live.engine
    if e.phase == Phase.ROLL and e.turn == side:
        if e.can_double(side) and cube(live, side, level)[0]:
            rt.do_offer(live, side)
        else:
            rt.do_roll(live, side)
    elif e.phase == Phase.MOVE and e.turn == side:
        moves = choose_move(live, side, level)
        if not moves:
            return  # no legal play: the scheduled pass handles it
        play, result = e.play(side, moves)
        rt.after_play(live, side, play, result, auto=None)
    elif e.phase == Phase.CUBE and e.turn != side:
        if cube(live, side, level)[1]:
            rt.do_take(live, side)
        else:
            rt.do_drop(live, side)
