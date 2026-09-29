import pytest
from rest_framework.test import APIClient

from accounts.models import Session
from game.models import Match
from predictions import services
from predictions.models import PredictionPool
from wallet import invariants
from wallet.ledger import PLATFORM_RAKE
from wallet.models import LedgerEntry, Wallet
from wallet.tests.helpers import fund, make_user


def match(entry=100, bot=False):
    a, b = make_user(), make_user()
    return Match.objects.create(
        variant="standard_cube",
        length=3,
        entry=entry,
        player_a=a,
        player_b=None if bot else b,
        is_bot=bot,
        seed_commit="c",
        seed_encrypted="e",
    )


def bettor(coins=1000):
    u = make_user()
    fund(u, coins)
    return u


def bal(u):
    return Wallet.objects.get(user=u).balance


@pytest.mark.django_db
class TestPools:
    def test_only_eligible_matches_get_a_pool(self):
        assert services.open_pool(match(entry=50)) is None  # below predict.min_table_entry
        assert services.open_pool(match(bot=True)) is None
        assert services.open_pool(match()) is not None

    def test_payout_rake_and_dust(self, published):
        m = match()
        services.open_pool(m)
        u1, u2, u3 = bettor(), bettor(), bettor()
        services.place(u1, str(m.id), 0, 30, "k")
        services.place(u2, str(m.id), 0, 70, "k")
        services.place(u3, str(m.id), 1, 50, "k")
        assert published[-1]["payload"] == {"total_a": 100, "total_b": 50, "open": True}
        services.close(m.id)
        result = services.settle(m, 0)
        # pool 150, rake 15, distributable 135: 30 -> 40, 70 -> 94, dust 1 to the rake.
        assert result == {"pool": 150, "rake": 15, "dust": 1, "paid": 134}
        assert (bal(u1), bal(u2), bal(u3)) == (1010, 1024, 950)
        assert LedgerEntry.objects.get(account=PLATFORM_RAKE).amount == 16
        assert invariants.check() == []

    def test_one_sided_pool_refunds_without_rake(self):
        m = match()
        services.open_pool(m)
        u1 = bettor()
        services.place(u1, str(m.id), 1, 200, "k")
        assert services.settle(m, 0) == {"refunded": 200}
        assert bal(u1) == 1000 and PredictionPool.objects.get().status == "refunded"

    def test_aborted_match_refunds(self):
        m = match()
        services.open_pool(m)
        u1, u2 = bettor(), bettor()
        services.place(u1, str(m.id), 0, 10, "k")
        services.place(u2, str(m.id), 1, 10, "k")
        services.settle(m, None)
        assert (bal(u1), bal(u2)) == (1000, 1000)

    def test_held_pool_settles_after_the_decision(self):
        m = match()
        pool = services.open_pool(m)
        assert pool is not None
        u1, u2 = bettor(), bettor()
        services.place(u1, str(m.id), 0, 100, "k")
        services.place(u2, str(m.id), 1, 100, "k")
        PredictionPool.objects.filter(pk=pool.pk).update(status="held")
        assert services.settle(m, 0) is None and bal(u1) == 900
        services.release_hold(pool.pk, approve=True)
        assert bal(u1) == 1080 and bal(u2) == 900  # 200 - 10% rake

    def test_rules(self):
        m = match()
        services.open_pool(m)
        from config.errors import AppError

        def reason(user, side=0, amount=10, key="k"):
            with pytest.raises(AppError) as exc:
                services.place(user, str(m.id), side, amount, key)
            return exc.value.details.get("reason") or exc.value.code

        player = m.player_a
        fund(player, 100)
        assert reason(player) == "player"
        linked = bettor()
        Session.objects.create(
            user=linked, refresh_hash="x", ip="10.1.1.1", user_agent="UA", expires_at="2100-01-01T00:00Z"
        )
        Session.objects.create(
            user=m.player_b, refresh_hash="x", ip="10.1.1.1", user_agent="UA", expires_at="2100-01-01T00:00Z"
        )
        assert reason(linked) == "linked"
        referred = bettor()
        referred.referrer = m.player_a
        referred.save()
        assert reason(referred) == "referral"
        u = bettor(5000)
        services.place(u, str(m.id), 0, 900, "a")
        assert reason(u, side=1, key="b") == "other_side"
        assert reason(u, amount=200, key="c") == "max_stake"
        suspended = bettor()
        suspended.status = "suspended"
        suspended.save()
        assert reason(suspended) == "ACCOUNT_SUSPENDED"
        services.close(m.id)
        assert reason(bettor()) == "closed"

    def test_api_and_accuracy_board(self):
        m = match()
        services.open_pool(m)
        u = bettor()
        c = APIClient()
        c.force_authenticate(user=u)
        rows = c.get("/api/v1/predictions/open").json()["results"]
        assert rows[0]["match_id"] == str(m.id) and rows[0]["blocked"] is None
        res = c.post(
            "/api/v1/predictions",
            {"match_id": str(m.id), "side": 1, "amount": 25},
            format="json",
            HTTP_IDEMPOTENCY_KEY="p1",
        )
        assert res.status_code == 201 and res.json()["amount"] == 25
        pool = c.get(f"/api/v1/predictions/pool/{m.id}").json()
        assert pool["total_b"] == 25 and pool["mine"] == [{"side": 1, "amount": 25, "payout": None}]
        assert pool["rake_pct"] == 10 and pool["max_pool_total"] > 0 and pool["blocked"] is None
        other = match()
        assert c.get(f"/api/v1/predictions/pool/{other.id}").json()["details"]["reason"] == "no_pool"
        other = bettor()
        services.place(other, str(m.id), 0, 25, "x")
        services.settle(m, 1)
        mine = c.get("/api/v1/me/predictions").json()["results"]
        assert mine[0]["payout"] == 45 and mine[0]["pool_status"] == "settled"
        assert mine[0]["winner_side"] == 1 and mine[0]["players"] == [
            m.player_a.username,
            m.player_b.username,
        ]
        board = services.accuracy_board(min_count=1)
        assert board[0]["value"] == 100 and board[-1]["value"] == 0
        from settingsapp import registry

        registry.set_value("predict.min_count_for_board", 1)
        res = c.get("/api/v1/leaderboard", {"scope": "predict"}).json()
        assert res["me"] == {"rank": 1, "value": 100, "count": 1}
        registry.set_value("predict.min_count_for_board", 5)
        res = c.get("/api/v1/leaderboard", {"scope": "predict"}).json()
        assert res["me"] == {"rank": None, "value": None, "count": 1, "needed": 5}
        weekly = c.get("/api/v1/leaderboard", {"scope": "weekly"}).json()
        assert weekly["period"]["start"] < weekly["period"]["end"]

    def test_a_win_that_pays_less_than_the_stake_still_counts_as_correct(self):
        m = match()
        services.open_pool(m)
        big, small = bettor(), bettor()
        services.place(big, str(m.id), 0, 900, "a")
        services.place(small, str(m.id), 1, 10, "b")
        services.settle(m, 1)  # small side wins the whole pool minus rake
        board = {r["username"]: r for r in services.accuracy_board(min_count=1)}
        assert board[small.username]["value"] == 100 and board[big.username]["value"] == 0
