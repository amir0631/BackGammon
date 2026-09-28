import pytest
from rest_framework.test import APIClient

from game.engine.match import Phase
from game.models import Match
from realtime import live
from wallet.tests.helpers import make_user


def advance(clock, seconds):
    clock.t += seconds
    for member in live.due_timers():
        live.fire(member)


@pytest.mark.django_db
def test_bot_match_plays_to_the_end(clock, published, django_capture_on_commit_callbacks):
    user = make_user("Human_1")
    c = APIClient()
    c.force_authenticate(user=user)
    with django_capture_on_commit_callbacks(execute=True):
        res = c.post(
            "/api/v1/matches/bot", {"level": "medium", "variant": "standard_cube", "length": 1}, format="json"
        )
    assert res.status_code == 201, res.json()
    mid = res.json()["match_id"]
    assert (
        c.post(
            "/api/v1/matches/bot", {"level": "easy", "variant": "standard_cube", "length": 1}, format="json"
        ).json()["code"]
        == "MATCH_IN_PROGRESS"
    )
    assert c.get("/api/v1/me/matches/active").json() == {"match_id": mid}
    live.connect(mid, user.id, "chan")

    state = live.state_envelope(mid, user.id)["payload"]
    assert state["players"][1]["is_bot"] and state["players"][1]["username"] == "bot_medium"

    for _ in range(5000):
        s = live.load(mid)
        if s.status != "active":
            break
        e = s.engine
        if e.turn == 0 and e.phase == Phase.ROLL:
            live.handle(mid, user.id, "turn.roll", {}, s.seq)
        elif e.turn == 0 and e.phase == Phase.MOVE and e.legal() and not s.auto:
            live.handle(mid, user.id, "turn.move", {"moves": e.legal()[0].as_lists()}, s.seq)
        elif e.phase == Phase.CUBE and e.turn == 1:
            live.handle(mid, user.id, "cube.take", {}, s.seq)
        else:
            advance(clock, 2.1)
    else:
        raise AssertionError("bot match did not end")

    bot_moves = [e for e in published if e["type"] == "turn.moved" and e["payload"]["player"] == 1]
    assert bot_moves and all(e["payload"]["auto"] in (None, "forced") for e in bot_moves)
    row = Match.objects.get(pk=mid)
    assert row.status == Match.Status.FINISHED and row.is_bot and row.bot_level == "medium"
    assert c.get("/api/v1/me/matches/active").json() == {"match_id": None}


@pytest.mark.django_db
def test_bot_match_rules():
    user = make_user(status="suspended")
    c = APIClient()
    c.force_authenticate(user=user)
    body = {"level": "hard", "variant": "traditional", "length": 3}
    assert c.post("/api/v1/matches/bot", body, format="json").json()["code"] == "ACCOUNT_SUSPENDED"
    other = make_user()
    c.force_authenticate(user=other)
    assert (
        c.post("/api/v1/matches/bot", {**body, "length": 4}, format="json").json()["code"]
        == "MATCH_LENGTH_NOT_ALLOWED"
    )
    assert c.post("/api/v1/matches/bot", {**body, "level": "god"}, format="json").status_code == 400
