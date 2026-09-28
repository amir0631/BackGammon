import asyncio
import json

import pytest

from bot import brain, service
from bot.evaluator import HeuristicEvaluator, is_race
from game.engine.board import A, B, initial_position, view
from game.engine.match import Match, Phase, Rules
from game.engine.moves import legal_plays, validate_play
from game.tests.helpers import pos


def test_choose_move_is_legal_and_reproducible():
    for level in brain.LEVELS:
        for dice in [(3, 1), (6, 6), (5, 2)]:
            moves = brain.choose_move(initial_position(), A, dice, level, seed=7)
            validate_play(initial_position(), A, dice, moves)
            assert moves == brain.choose_move(initial_position(), A, dice, level, seed=7)


def test_hard_makes_the_five_point_with_31():
    moves = brain.choose_move(initial_position(), A, (3, 1), "hard")
    assert sorted(moves) == [[6, 5], [8, 5]]


def test_hard_hits_a_loose_blot_in_its_board():
    # B has a blot on A's 5-point (B's 20); A can hit with 8/5.
    p = pos(a={24: 2, 13: 5, 8: 3, 6: 5}, b={20: 1, 24: 1, 13: 5, 8: 3, 6: 5})
    moves = brain.choose_move(p, A, (3, 1), "hard")
    after = validate_play(p, A, (3, 1), moves).position
    assert after.bar[B] == 1


def test_bears_off_in_a_race():
    p = pos(a={3: 2, 1: 1}, b={20: 3})
    moves = brain.choose_move(p, A, (3, 1), "hard")
    assert validate_play(p, A, (3, 1), moves).position.off[A] == 14


def test_no_move_when_blocked():
    p = pos(a={13: 14}, b={1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3}, bar=(1, 0))
    assert brain.choose_move(p, A, (6, 1), "medium") == []


def test_levels_differ_somewhere():
    positions = [initial_position()]
    diffs = 0
    for d1 in range(1, 7):
        for d2 in range(1, 7):
            easy = brain.choose_move(positions[0], A, (d1, d2), "easy", seed=d1 * 7 + d2)
            hard = brain.choose_move(positions[0], A, (d1, d2), "hard")
            diffs += easy != hard
    assert diffs > 0


def test_race_detection_and_evaluation_symmetry():
    mine, theirs = view(pos(a={3: 2}, b={3: 2}), A)
    assert is_race(mine, theirs)
    ev = HeuristicEvaluator()
    start = initial_position()
    assert ev.evaluate(start, A) == pytest.approx(ev.evaluate(start, B))


def test_cube_decisions():
    ahead = pos(a={1: 2}, b={13: 15})  # A about to win a gammon: too good to double
    assert not brain.cube_decision(ahead, A, "hard").double
    assert not brain.cube_decision(ahead, B, "hard").take
    even = initial_position()
    decision = brain.cube_decision(even, A, "hard")
    assert not decision.double and decision.take


def test_unknown_level():
    with pytest.raises(ValueError):
        brain.choose_move(initial_position(), A, (1, 2), "grandmaster")


def test_hard_beats_easy_more_often_than_not():
    """Sanity check of strength: 30 single games, hard vs easy, dice from a fixed sequence."""
    import hashlib

    wins = 0
    for g in range(30):
        m = Match.start(Rules.for_variant("standard_nocube", 1))
        n = 0

        def roll(g=g):
            nonlocal n
            h = hashlib.sha256(f"{g}:{n}".encode()).digest()
            n += 1
            return h[0] % 6 + 1, h[1] % 6 + 1

        while m.opening_roll(*roll()) is None:
            pass
        levels = {A: "hard", B: "easy"} if g % 2 == 0 else {A: "easy", B: "hard"}
        while m.phase != Phase.MATCH_OVER:
            if m.phase == Phase.ROLL:
                m.roll(m.turn, roll())
            player = m.turn
            if not legal_plays(m.position, player, m.dice):
                m.pass_turn(player)
                continue
            m.play(player, brain.choose_move(m.position, player, m.dice, levels[player], seed=g))
        wins += levels[m.winner] == "hard"
    assert wins >= 18


def _call(method, path, body=None):
    sent = []

    async def receive():
        return {
            "type": "http.request",
            "body": json.dumps(body).encode() if body is not None else b"",
            "more_body": False,
        }

    async def send(message):
        sent.append(message)

    asyncio.run(service.app({"type": "http", "method": method, "path": path}, receive, send))
    return sent[0]["status"], json.loads(sent[1]["body"])


def test_service_endpoints():
    assert _call("GET", "/health") == (200, {"status": "ok"})
    status, body = _call(
        "POST",
        "/move",
        {"position": initial_position().encode(), "player": 0, "dice": [3, 1], "level": "hard"},
    )
    assert status == 200 and sorted(body["moves"]) == [[6, 5], [8, 5]]
    status, body = _call(
        "POST", "/cube", {"position": initial_position().encode(), "player": 1, "level": "easy"}
    )
    assert status == 200 and set(body) == {"double", "take"}
    assert _call("POST", "/move", {"player": 0})[0] == 400
    assert (
        _call("POST", "/nope", {"position": initial_position().encode(), "player": 0, "level": "hard"})[0]
        == 404
    )
    assert _call("PUT", "/move", {})[0] == 405
