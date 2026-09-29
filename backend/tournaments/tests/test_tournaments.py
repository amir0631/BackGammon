from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from adminapi.models import AdminAudit
from adminapi.tests.test_admin_api import admin_client, make_admin
from game.models import Match
from game.tests.test_match_api import play_to_end
from realtime import live
from tournaments import services
from tournaments.models import Tournament, TournamentEntry
from wallet import invariants
from wallet.ledger import PLATFORM_RAKE
from wallet.models import LedgerEntry, Wallet
from wallet.tests.helpers import fund, make_user


def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def new_tournament(capacity=4, entry=100):
    return services.create(
        name={"fa": "جام", "en": "Cup"},
        variant="standard_nocube",
        length=1,
        entry=entry,
        capacity=capacity,
        starts_at=timezone.now() + timedelta(hours=1),
    )


def players(n, coins=500):
    out = []
    for i in range(n):
        u = make_user()
        u.elo = 1600 - i * 10
        u.save(update_fields=["elo"])
        fund(u, coins)
        out.append(u)
    return out


def join(user, t):
    return client(user).post(f"/api/v1/tournaments/{t.id}/join", HTTP_IDEMPOTENCY_KEY="j")


@pytest.mark.django_db
class TestTournament:
    def test_full_bracket_pays_places(
        self, clock, published, django_capture_on_commit_callbacks, monkeypatch
    ):
        from matchmaking import service as mm

        sent = []
        monkeypatch.setattr(mm, "notifier", lambda uid, env: sent.append(env))
        t = new_tournament()
        users = players(4)
        for u in users:
            assert join(u, t).status_code == 201
        assert Wallet.objects.get(user=users[0]).balance == 400
        with django_capture_on_commit_callbacks(execute=True):
            assert services.start_due(t.starts_at + timedelta(seconds=1)) == [t.id]
        found = [e["payload"] for e in sent if e["type"] == "match.found"]
        assert len(found) == 4 and all(
            f["tournament"] == {"id": t.id, "name": t.name_i18n, "round": 1, "rounds": 2} for f in found
        )
        semis = list(Match.objects.filter(tournament_id=t.id))
        assert len(semis) == 2
        by_id = {u.id: u for u in users}
        # Seeds 1 v 4 and 2 v 3.
        assert {frozenset((m.player_a_id, m.player_b_id)) for m in semis} == {
            frozenset((users[0].id, users[3].id)),
            frozenset((users[1].id, users[2].id)),
        }
        for m in semis:
            mid = str(m.id)
            a, b = by_id[m.player_a_id], by_id[m.player_b_id]
            live.connect(mid, a.id, "ca")
            live.connect(mid, b.id, "cb")
            with django_capture_on_commit_callbacks(execute=True):
                play_to_end(mid, [a, b], clock)
        final = Match.objects.filter(tournament_id=t.id).exclude(pk__in=[m.pk for m in semis]).get()
        a, b = by_id[final.player_a_id], by_id[final.player_b_id]
        live.connect(str(final.id), a.id, "ca")
        live.connect(str(final.id), b.id, "cb")
        with django_capture_on_commit_callbacks(execute=True):
            play_to_end(str(final.id), [a, b], clock)
        t.refresh_from_db()
        assert t.status == "finished"
        places = {e.place: e.prize for e in TournamentEntry.objects.filter(tournament=t)}
        # 400 total, 40 rake, 360 pool: 50 / 25 / 12.5 / 12.5 %.
        assert places == {1: 180, 2: 90, 3: 45, 4: 45}
        assert sum(LedgerEntry.objects.filter(account=PLATFORM_RAKE).values_list("amount", flat=True)) == 40
        assert invariants.check() == []
        bracket = client(users[0]).get(f"/api/v1/tournaments/{t.id}/bracket").json()
        assert len(bracket["slots"]) == 3 and bracket["slots"][-1]["winner"]

    def test_not_filled_is_cancelled_and_refunded(self):
        t = new_tournament(capacity=8)
        users = players(3)
        for u in users:
            join(u, t)
        services.start_due(t.starts_at + timedelta(seconds=1))
        t.refresh_from_db()
        assert t.status == "cancelled" and t.cancel_reason == "not_filled"
        assert [Wallet.objects.get(user=u).balance for u in users] == [500, 500, 500]

    def test_join_rules_and_leave(self):
        t = new_tournament(capacity=4)
        a, b, c, d, e = players(5)
        poor = players(1, coins=10)[0]
        assert join(poor, t).json()["code"] == "WALLET_INSUFFICIENT"
        join(a, t)
        assert join(a, t).status_code == 201  # joining twice charges once
        assert Wallet.objects.get(user=a).balance == 400
        for u in (b, c, d):
            join(u, t)
        assert join(e, t).json()["details"]["reason"] == "full"
        assert client(a).delete(f"/api/v1/tournaments/{t.id}/join").json()["joined"] is False
        assert Wallet.objects.get(user=a).balance == 500
        listing = client(e).get("/api/v1/tournaments").json()["results"]
        assert listing[0]["prizes"] == [180, 90, 45, 45]  # 4 x 100, 10% rake, 50/25/12.5/12.5
        assert listing[0]["rake_pct"] == 10 and listing[0]["my_place"] is None
        mine = client(b).get("/api/v1/tournaments", {"joined": "1"}).json()["results"]
        assert [r["id"] for r in mine] == [t.id] and mine[0]["joined"] is True
        assert client(e).get("/api/v1/tournaments", {"joined": "1"}).json()["results"] == []
        assert invariants.check() == []

    def test_split_longer_than_capacity_is_refused(self):
        with pytest.raises(services.TournamentError):
            new_tournament(capacity=2)  # the default split has four places

    def test_admin_create_and_cancel(self):
        make_admin()
        admin = admin_client()
        body = {
            "name": {"fa": "جام هفته", "en": "Weekly cup"},
            "variant": "standard_cube",
            "length": 3,
            "entry": 50,
            "capacity": 8,
            "starts_at": (timezone.now() + timedelta(days=1)).isoformat(),
            "prize_split": [60, 40],
        }
        res = admin.post("/api/v1/admin/tournaments", body, format="json")
        assert res.status_code == 201, res.json()
        tid = res.json()["id"]
        assert (
            admin.post("/api/v1/admin/tournaments", {**body, "capacity": 6}, format="json").json()["details"][
                "reason"
            ]
            == "capacity"
        )
        assert (
            admin.post("/api/v1/admin/tournaments", {**body, "prize_split": [60, 30]}, format="json").json()[
                "details"
            ]["reason"]
            == "prize_split"
        )
        u = players(1)[0]
        join(u, Tournament.objects.get(pk=tid))
        res = admin.post(f"/api/v1/admin/tournaments/{tid}/cancel", {"reason": "venue issue"}, format="json")
        assert res.json()["status"] == "cancelled" and Wallet.objects.get(user=u).balance == 500
        assert AdminAudit.objects.filter(action__startswith="tournament.").count() == 2


def test_prize_split_uses_basis_points():
    assert services.basis_points([50, 25, 12.5, 12.5]) == [5000, 2500, 1250, 1250]
    assert services._bracket_order(8) == [1, 8, 4, 5, 2, 7, 3, 6]
