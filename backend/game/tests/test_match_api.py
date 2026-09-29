import pytest
from rest_framework.test import APIClient

from adminapi.tests.test_admin_api import admin_client, make_admin
from game.engine.match import Phase
from game.models import Match, ReplayView
from game.services import create_match
from ranking.models import EloHistory, XpHistory
from ranking.services import expected, level_for, rate_match
from realtime import live
from realtime.tests.test_bot_match import advance
from wallet import invariants
from wallet import services as wallet
from wallet.ledger import PLATFORM_RAKE
from wallet.models import LedgerEntry, Wallet
from wallet.tests.helpers import fund, make_user


def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def play_to_end(mid, users, clock):
    for _ in range(6000):
        s = live.load(mid)
        if s.status != "active":
            return
        e = s.engine
        if e.phase in (Phase.OPENING, Phase.GAME_OVER) or s.auto:
            advance(clock, 3.1)
            continue
        user = users[e.turn]
        if e.phase == Phase.ROLL:
            live.handle(mid, user.id, "turn.roll", {}, s.seq)
        elif e.phase == Phase.MOVE:
            plays = e.legal()
            if plays:
                live.handle(mid, user.id, "turn.move", {"moves": plays[0].as_lists()}, s.seq)
            else:
                advance(clock, 2)
    raise AssertionError("did not end")


@pytest.fixture
def finished(clock, published, django_capture_on_commit_callbacks):
    a, b = make_user("Pa_1"), make_user("Pb_1")
    fund(a, 500)
    fund(b, 500)
    with django_capture_on_commit_callbacks(execute=True):
        match = create_match(a, b, "standard_nocube", 1, entry=100)
        wallet.escrow_match_entries(match.id, [a.id, b.id], 100)
    mid = str(match.id)
    live.connect(mid, a.id, "ca")
    live.connect(mid, b.id, "cb")
    with django_capture_on_commit_callbacks(execute=True):
        play_to_end(mid, [a, b], clock)
    return mid, a, b


@pytest.mark.django_db
class TestSettlement:
    def test_winner_paid_rake_taken_elo_and_xp(self, finished, published):
        _mid, a, b = finished
        ended = next(e for e in published if e["type"] == "match.ended")["payload"]
        winner, loser = (a, b) if ended["winner"] == 0 else (b, a)
        assert ended["settlement"] == {"entry": 100, "pot": 200, "rake": 20, "payout": 180}
        assert Wallet.objects.get(user=winner).balance == 580
        assert Wallet.objects.get(user=loser).balance == 400
        assert LedgerEntry.objects.get(account=PLATFORM_RAKE).amount == 20
        winner.refresh_from_db()
        loser.refresh_from_db()
        # Equal ratings, new players: K 40, 1-point match: +/-20.
        assert (winner.elo, loser.elo) == (1520, 1480)
        assert ended["elo"] == ({"a": 20, "b": -20} if ended["winner"] == 0 else {"a": -20, "b": 20})
        assert EloHistory.objects.count() == 2
        assert (winner.xp, loser.xp) == (25, 10)
        assert XpHistory.objects.count() == 2
        assert invariants.check() == []

    def test_live_list_replay_history_leaderboard(self, finished):
        mid, a, _b = finished
        stranger = make_user()
        assert client(stranger).get(f"/api/v1/matches/{mid}/replay").status_code == 403
        res = client(a).get(f"/api/v1/matches/{mid}/replay")
        assert res.status_code == 200
        body = res.json()
        assert (
            body["seed"]
            and body["events"][0]["type"] == "game.started"
            and body["events"][-1]["type"] == "match.ended"
        )
        assert ReplayView.objects.filter(viewer_role="player").count() == 1
        make_admin()
        assert admin_client().get(f"/api/v1/admin/matches/{mid}/replay").status_code == 200
        assert ReplayView.objects.filter(viewer_role="admin").count() == 1
        history = client(a).get("/api/v1/me/matches").json()["results"]
        assert history[0]["id"] == mid and history[0]["you"] == 0
        won = history[0]["winner"] == 0
        assert history[0]["elo_delta"] == (20 if won else -20) and history[0]["xp"] == (25 if won else 10)
        assert history[0]["coins"] == (80 if won else -100)
        assert [g["game_no"] for g in history[0]["games"]] == [1]
        assert body["you"] == 0
        assert client(stranger).get(f"/api/v1/matches/{mid}").json()["you"] is None
        assert client(stranger).get("/api/v1/matches/live").json()["results"] == []
        board = client(a).get("/api/v1/leaderboard", {"scope": "all"}).json()
        assert [r["username"] for r in board["results"]] and board["me"]["rank"] in (1, 2)
        weekly = client(a).get("/api/v1/leaderboard", {"scope": "weekly"}).json()
        assert sorted(r["value"] for r in weekly["results"]) == [-20, 20]
        assert client(a).get("/api/v1/leaderboard", {"scope": "predict"}).json()["scope"] == "predict"
        assert client(a).get("/api/v1/leaderboard", {"scope": "yearly"}).status_code == 400


@pytest.mark.django_db
def test_live_list_shows_human_matches_only(clock, published, django_capture_on_commit_callbacks):
    a, b, c = make_user(), make_user(), make_user()
    with django_capture_on_commit_callbacks(execute=True):
        human = create_match(a, b, "standard_cube", 5)
        create_match(c, None, "standard_cube", 5, bot_level="easy")
    rows = client(c).get("/api/v1/matches/live").json()["results"]
    assert [r["match_id"] for r in rows] == [str(human.id)]
    assert client(c).get("/api/v1/tiers").json()["results"][0]["entry"] == 50


def test_tiers_show_the_payout(db):
    user = make_user()
    tiers = client(user).get("/api/v1/tiers").json()["results"]
    first = tiers[0]
    assert first["pot"] == first["entry"] * 2 and first["rake_pct"] == 10
    assert first["payout"] == first["pot"] - first["pot"] // 10


def test_elo_formula_and_levels(db):
    assert expected(1500, 1500) == 0.5
    assert round(expected(1700, 1500), 3) == 0.76
    assert level_for(0) == 1 and level_for(100) == 2 and level_for(260) == 3


@pytest.mark.django_db
def test_k_drops_after_threshold_and_scales_with_length():
    a, b = make_user(), make_user()
    m = Match.objects.create(
        variant="standard_cube", length=7, player_a=a, player_b=b, seed_commit="x", seed_encrypted="x"
    )
    deltas = rate_match(m, a, b, 0)
    assert deltas["a"] == round(40 * 7**0.5 * 0.5)  # K 40 while new, times sqrt(7)


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_replay_retention_purges_events_but_never_under_review(finished):
    from datetime import timedelta

    from django.db import ProgrammingError, transaction
    from django.utils import timezone

    from antifraud.rules import flag
    from game.models import MatchEvent
    from game.tasks import purge_replays
    from settingsapp import registry

    mid, a, b = finished
    assert purge_replays() == 0  # 0 days: kept forever
    registry.set_value("replay.retention_days", 30)
    old = timezone.now() - timedelta(days=31)
    Match.objects.filter(pk=mid).update(ended_at=old)
    other = Match.objects.create(
        variant="standard_nocube", length=1, player_a=a, player_b=b, status="finished",
        seed_commit="c", seed_encrypted="e", ended_at=old,
    )  # fmt: skip
    MatchEvent.objects.create(match=other, seq=1, type="game.started", actor="system", server_ts=old)
    flag("chip_dumping", a, b, match=other)
    assert purge_replays() == 1
    assert not MatchEvent.objects.filter(match_id=mid).exists()
    assert MatchEvent.objects.filter(match=other).count() == 1  # under an open flag: kept
    res = client(a).get(f"/api/v1/matches/{mid}/replay")
    assert res.status_code == 410 and res.json()["code"] == "REPLAY_PURGED"
    assert client(make_user()).get(f"/api/v1/matches/{mid}/replay").status_code == 403
    # Outside the purge job the log is still append-only.
    with pytest.raises(ProgrammingError), transaction.atomic():
        MatchEvent.objects.filter(match=other).delete()
