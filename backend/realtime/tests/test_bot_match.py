import pytest
from rest_framework.test import APIClient

from game.engine.match import Phase
from game.models import Match
from realtime import live
from settingsapp import registry
from wallet import invariants
from wallet.models import Wallet
from wallet.tests.helpers import fund, make_user


def advance(clock, seconds):
    clock.t += seconds
    for member in live.due_timers():
        live.fire(member)


@pytest.mark.django_db
@pytest.mark.parametrize("paid", [False, True])
def test_bot_match_plays_to_the_end(clock, published, django_capture_on_commit_callbacks, paid):
    user = make_user("Human_1")
    if paid:
        registry.set_value("bot.entry_enabled", True)
        fund(user, 100)
    c = APIClient()
    c.force_authenticate(user=user)
    config = c.get("/api/v1/config").json()["bot_entry"]
    assert config == (
        {"enabled": True, "entry": 10, "prize": 15} if paid else {"enabled": False, "entry": 0, "prize": 0}
    )
    body = {"level": "medium", "variant": "standard_cube", "length": 1}
    if paid:
        # A client that didn't show the cost (no entry, or a stale one) charges nothing.
        refused = c.post("/api/v1/matches/bot", body, format="json")
        assert refused.status_code == 409 and refused.json()["code"] == "BOT_ENTRY_CHANGED"
        assert refused.json()["details"]["entry"] == 10
        assert c.get("/api/v1/wallet").json()["balance"] == 100
    with django_capture_on_commit_callbacks(execute=True):
        res = c.post("/api/v1/matches/bot", {**body, "entry": config["entry"]}, format="json")
    assert res.status_code == 201, res.json()
    mid = res.json()["match_id"]
    assert (
        c.post(
            "/api/v1/matches/bot", {"level": "easy", "variant": "standard_cube", "length": 1}, format="json"
        ).json()["code"]
        == "MATCH_IN_PROGRESS"
    )
    assert res.json()["entry"] == (10 if paid else 0)
    active = c.get("/api/v1/me/matches/active").json()
    assert active["match_id"] == mid and active["is_bot"] is True
    live.connect(mid, user.id, "chan")

    state = live.state_envelope(mid, user.id)["payload"]
    assert state["players"][1]["is_bot"] and state["players"][1]["username"] == "bot_medium"
    assert state["rules"]["payout"] == (25 if paid else 0)  # entry back plus the 15-coin prize
    assert state["grace"][1] is None and state["grace"][0] is None  # joined; the bot never needs one

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
    ended = next(e for e in published if e["type"] == "match.ended")["payload"]
    balance = Wallet.objects.get(user=user).balance
    if not paid:
        assert ended["settlement"] is None and balance == 0
    elif ended["winner"] == 0:
        assert ended["settlement"] == {"entry": 10, "prize": 15, "payout": 25} and balance == 115
    else:
        assert ended["settlement"]["payout"] == 0 and balance == 90
    assert invariants.check() == []
    history = c.get("/api/v1/me/matches").json()["results"][0]
    assert history["coins"] == (None if not paid else balance - 100)
    assert history["elo_delta"] is None and history["games"][0]["game_no"] == 1


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
