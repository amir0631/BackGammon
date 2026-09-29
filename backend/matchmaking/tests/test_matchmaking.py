import pytest

from accounts.models import Session
from game.models import Match
from matchmaking import service as mm
from wallet.models import Wallet
from wallet.tests.helpers import fund, make_user


@pytest.fixture
def notes(monkeypatch):
    sent: list[tuple[int, dict[str, object]]] = []
    monkeypatch.setattr(mm, "notifier", lambda uid, env: sent.append((uid, env)))
    return sent


def player(elo=1500, coins=500):
    user = make_user()
    user.elo = elo
    user.save(update_fields=["elo"])
    fund(user, coins)
    return user


@pytest.mark.django_db
class TestQueue:
    def test_two_players_are_paired_and_entries_escrowed(
        self, clock, published, notes, django_capture_on_commit_callbacks
    ):
        a, b = player(), player(1600)
        with django_capture_on_commit_callbacks(execute=True):
            assert mm.join(a, 100, "standard_cube", 3)["state"] == "waiting"
            mm.join(b, 100, "standard_cube", 3)
        found = [env for _, env in notes if env["type"] == "match.found"]
        assert len(found) == 2 and {e["payload"]["you"] for e in found} == {0, 1}
        assert "phone" not in str(found)
        # The join deadline is the grace every side starts with (§5.2, §5.4); not a tournament match.
        assert all(e["payload"]["join_deadline"] == int((clock.t + 90) * 1000) for e in found)
        assert all(e["payload"]["tournament"] is None for e in found)
        match = Match.objects.get()
        assert match.entry == 100 and {match.player_a_id, match.player_b_id} == {a.id, b.id}
        assert [Wallet.objects.get(user=u).balance for u in (a, b)] == [400, 400]
        assert mm.tiers()[1]["waiting"] == 0

    def test_elo_window_widens_with_waiting(
        self, clock, published, notes, django_capture_on_commit_callbacks
    ):
        a, b = player(1500), player(1720)  # 220 apart: 150 + 50 per 10 s -> 20 s
        mm.join(a, 50, "traditional", 1)
        mm.join(b, 50, "traditional", 1)
        assert not Match.objects.exists()
        clock.t += 10
        mm.tick()
        assert not Match.objects.exists()
        clock.t += 10
        with django_capture_on_commit_callbacks(execute=True):
            mm.tick()
        assert Match.objects.count() == 1

    def test_linked_accounts_are_never_paired(self, clock, notes):
        a, b = player(), player()
        for u in (a, b):
            Session.objects.create(
                user=u, refresh_hash="x", ip="10.0.0.9", user_agent="Phone/1", expires_at=clock_dt()
            )
        mm.join(a, 50, "standard_nocube", 1)
        mm.join(b, 50, "standard_nocube", 1)
        clock.t += 600
        mm.tick()
        assert not Match.objects.exists()

    def test_join_rules(self, clock, notes):
        from config.errors import AppError

        poor = player(coins=10)
        with pytest.raises(AppError) as exc:
            mm.join(poor, 50, "standard_cube", 1)
        assert exc.value.code == "WALLET_INSUFFICIENT"
        with pytest.raises(AppError) as exc:
            mm.join(player(), 77, "standard_cube", 1)
        assert exc.value.details["reason"] == "tier"
        suspended = player()
        suspended.status = "suspended"
        suspended.save()
        with pytest.raises(AppError) as exc:
            mm.join(suspended, 50, "standard_cube", 1)
        assert exc.value.code == "ACCOUNT_SUSPENDED"

    def test_leave_and_switch_queue(self, clock, notes):
        a = player()
        mm.join(a, 50, "standard_cube", 1)
        mm.join(a, 100, "standard_cube", 3)  # joining another queue leaves the first
        waiting = {t["entry"]: t["waiting"] for t in mm.tiers()}
        assert waiting[50] == 0 and waiting[100] == 1
        left = mm.leave(a)
        assert left is not None and left["state"] == "left"
        assert mm.leave(a) is None


def clock_dt():
    from datetime import timedelta

    from django.utils import timezone

    return timezone.now() + timedelta(days=1)
