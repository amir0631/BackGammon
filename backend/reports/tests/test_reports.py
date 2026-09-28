from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from adminapi.models import AdminAudit, AdminUser
from adminapi.tests.test_admin_api import admin_client, make_admin
from game.models import Match, MatchEvent
from payments.models import Payment
from predictions import services as predictions
from predictions.models import PredictionPool
from reports import activity, dice, services
from reports.models import QueueWait, UserActivity
from shop.models import Announcement, Item
from wallet import services as wallet
from wallet.tests.helpers import fund, make_user


def match(a, b, **kw):
    fields = {
        "variant": "standard_nocube",
        "length": 1,
        "entry": 100,
        "player_a": a,
        "player_b": b,
        "seed_commit": "c",
        "seed_encrypted": "e",
    }
    return Match.objects.create(**{**fields, **kw})


def test_chi_square_matches_reference_values():
    x, p = dice.chi_square([100] * 6)
    assert x == 0 and p == pytest.approx(1.0)
    # Critical values of the chi-square distribution with 5 degrees of freedom.
    assert dice.survival_5(11.0705) == pytest.approx(0.05, abs=1e-5)
    assert dice.survival_5(15.0863) == pytest.approx(0.01, abs=1e-5)
    assert dice.survival_5(1.1455) == pytest.approx(0.95, abs=1e-4)
    x, p = dice.chi_square([118, 92, 92, 92, 92, 114])
    assert x == pytest.approx(7.76) and p == pytest.approx(dice.survival_5(7.76))
    assert dice.chi_square([0] * 6) == (0.0, 1.0)
    assert dice.chi_square([600, 0, 0, 0, 0, 0])[1] < 1e-6


@pytest.mark.django_db
class TestDiceTest:
    def test_counts_every_recorded_die(self):
        m = match(make_user(), make_user())
        now = timezone.now()
        for seq, pair in enumerate([[1, 6], [3, 3], [6, 2]], start=1):
            MatchEvent.objects.create(
                match=m, seq=seq, type="turn.rolled", actor="system", payload={"dice": pair}, server_ts=now
            )
        test = dice.run(now - timedelta(days=7), now + timedelta(seconds=1))
        assert test.counts == [1, 1, 2, 0, 0, 2] and test.dice == 6
        make_admin()
        res = admin_client().get("/api/v1/admin/dashboard").json()
        assert res["dice_test"]["dice"] == 6


@pytest.mark.django_db
class TestActivity:
    def test_touch_records_one_row_per_day_and_online(self):
        u = make_user()
        c = APIClient()
        c.post("/api/v1/auth/login", {"phone": u.phone, "password": "S3cure-pass!"}, format="json")
        c.get("/api/v1/me")
        c.get("/api/v1/me")
        assert UserActivity.objects.filter(user=u, day=activity.today()).count() == 1
        assert activity.online_count() >= 1
        before = activity.online_count()
        w = make_user()
        activity.socket_opened(w.id, "chan-1")
        assert activity.online_count() == before + 1
        activity.socket_closed(w.id, "chan-1")
        assert activity.online_count() == before + 1  # still active within the last five minutes


@pytest.mark.django_db
class TestReports:
    def test_financial_columns_and_csv(self):
        u, v = make_user(), make_user()
        fund(u, 1000)  # admin top-up
        fund(v, 1000)
        Payment.objects.create(
            user=u,
            coins=50,
            price_toman=1000,
            amount_rial=500_000,
            gateway="sandbox",
            status=Payment.Status.VERIFIED,
            idempotency_key="k",
            verified_at=timezone.now(),
        )
        m = match(u, v)
        wallet.escrow_match_entries(m.id, [u.id, v.id], 100)
        wallet.settle_match(m.id, u.id, 100, 10)
        report = services.financial(activity.today(), activity.today())
        totals = report["totals"]
        assert totals["sales_rial"] == 500_000 and totals["payments"] == 1
        assert totals["topup_coins"] == 2000 and totals["rake_table"] == 20
        assert report["by_package"] == [{"coins": 50, "payments": 1, "rial": 500_000}]
        assert report["balances"]["users"] == 1980 and report["balances"]["escrow"] == 0
        make_admin()
        csv = admin_client().get("/api/v1/admin/reports/financial?export=csv")
        assert csv.status_code == 200 and csv["Content-Type"].startswith("text/csv")
        assert "rake_table" in csv.content.decode()

    def test_financial_is_for_money_roles(self):
        make_admin("helper", AdminUser.Role.SUPPORT)
        assert admin_client("helper").get("/api/v1/admin/reports/financial").status_code == 403
        assert admin_client("helper").get("/api/v1/admin/reports/games").status_code == 200

    def test_range_validation(self):
        make_admin()
        c = admin_client()
        bad = c.get("/api/v1/admin/reports/users?from=2025-01-01&to=2024-01-01")
        assert bad.status_code == 400 and bad.json()["code"] == "REPORT_RANGE_INVALID"
        assert c.get("/api/v1/admin/reports/users?from=nope").status_code == 400
        assert c.get("/api/v1/admin/reports/users?from=2020-01-01&to=2025-01-01").status_code == 400

    def test_games_rates_and_queue_wait(self):
        a, b = make_user(), make_user()
        now = timezone.now()
        done = [
            match(a, b, status="finished", end_reason=r, started_at=now - timedelta(minutes=10), ended_at=now)
            for r in ("points", "resign", "forfeit:timeouts", "forfeit:disconnect")
        ]
        match(a, None, is_bot=True, status="finished", end_reason="points", ended_at=now)
        MatchEvent.objects.create(
            match=done[3], seq=1, type="opponent.disconnected", actor="system", payload={}, server_ts=now
        )
        QueueWait.objects.create(match=done[0], user=a, seconds=10)
        QueueWait.objects.create(match=done[0], user=b, seconds=20)
        r = services.games(activity.today(), activity.today())
        assert r["human_matches"] == 4
        assert r["resign_rate_pct"] == 25.0 and r["timeout_forfeit_rate_pct"] == 25.0
        assert r["disconnect_rate_pct"] == 25.0 and r["disconnect_forfeit_rate_pct"] == 25.0
        assert r["avg_duration_seconds"] == 600
        assert r["queue_wait"] == {"avg_seconds": 15.0, "samples": 2}
        assert sum(row["bot_matches"] for row in r["rows"]) == 1

    def test_users_retention_and_arppu(self):
        today = activity.today()
        old = make_user()
        old.created_at = timezone.now() - timedelta(days=8)
        old.save()
        signup_day = (old.created_at.astimezone(activity.TEHRAN)).date()
        UserActivity.objects.create(user=old, day=signup_day + timedelta(days=1))
        UserActivity.objects.create(user=old, day=today)
        Payment.objects.create(
            user=old,
            coins=10,
            price_toman=1000,
            amount_rial=100_000,
            gateway="sandbox",
            status="verified",
            idempotency_key="p",
            verified_at=timezone.now(),
        )
        r = services.users(signup_day, today)
        assert r["signups"] == 1
        assert r["retention_pct"]["d1"] == 100.0 and r["retention_pct"]["d7"] == 0.0
        assert r["retention_pct"]["d30"] is None  # day 30 has not happened yet
        assert r["purchase_conversion_pct"] == 100.0
        assert r["arppu_rial"] == 100_000
        assert r["rows"][-1]["dau"] == 1 and r["rows"][-1]["mau"] == 1


@pytest.mark.django_db
class TestAdminSections:
    def test_shop_and_content_crud_is_audited_and_role_gated(self):
        make_admin()
        make_admin("helper", AdminUser.Role.SUPPORT)
        c = admin_client()
        res = c.post(
            "/api/v1/admin/shop/items",
            {
                "kind": "board_theme",
                "key": "test_oak",
                "name_i18n": {"fa": "گردو", "en": "Walnut"},
                "unlock": "purchasable",
                "price_coins": 0,
            },
            format="json",
        )
        assert res.status_code == 400  # purchasable needs a price
        res = c.post(
            "/api/v1/admin/shop/items",
            {
                "kind": "board_theme",
                "key": "test_oak",
                "name_i18n": {"fa": "گردو", "en": "Walnut"},
                "unlock": "purchasable",
                "price_coins": 300,
            },
            format="json",
        )
        assert res.status_code == 201, res.json()
        item_id = res.json()["id"]
        assert (
            c.patch(f"/api/v1/admin/shop/items/{item_id}", {"price_coins": 250}, format="json").json()[
                "price_coins"
            ]
            == 250
        )
        assert c.delete(f"/api/v1/admin/shop/items/{item_id}").status_code == 204
        assert Item.objects.get(pk=item_id).active is False  # deactivated, not deleted
        assert AdminAudit.objects.filter(target_type="item").count() == 3
        helper = admin_client("helper")
        assert helper.get("/api/v1/admin/shop/items").status_code == 200
        assert (
            helper.patch(f"/api/v1/admin/shop/items/{item_id}", {"sort": 1}, format="json").status_code == 403
        )
        # Content editors: announcements, shown publicly while active.
        res = helper.post(
            "/api/v1/admin/content/announcements",
            {"kind": "banner", "title_i18n": {"fa": "تورنمنت", "en": "Tournament"},
             "body_i18n": {"fa": "امشب", "en": "Tonight"}, "link": "/tournaments"},
            format="json",
        )  # fmt: skip
        assert res.status_code == 201
        assert (
            helper.post(
                "/api/v1/admin/content/announcements",
                {"title_i18n": {"fa": "x"}, "body_i18n": {"fa": "x", "en": "x"}},
                format="json",
            ).status_code
            == 400
        )  # both languages are required
        public = APIClient().get("/api/v1/announcements").json()["results"]
        assert [a["title"]["en"] for a in public] == ["Tournament"]
        Announcement.objects.update(ends_at=timezone.now() - timedelta(minutes=1))
        assert APIClient().get("/api/v1/announcements").json()["results"] == []
        res = helper.post(
            "/api/v1/admin/content/texts",
            {"key": "home.title", "text_i18n": {"fa": "خانه", "en": "Home"}},
            format="json",
        )
        assert res.status_code == 201
        assert APIClient().get("/api/v1/content/texts").json()["en"] == {"home.title": "Home"}

    def test_held_pool_decision(self):
        m = match(make_user(), make_user(), entry=100, variant="standard_cube", length=3)
        pool = predictions.open_pool(m)
        assert pool is not None
        backers = []
        for side in (0, 1):
            u = make_user()
            fund(u, 500)
            predictions.place(u, str(m.id), side, 100, "k")
            backers.append(u)
        PredictionPool.objects.filter(pk=pool.pk).update(status="held", winner_side=0)
        make_admin()
        c = admin_client()
        rows = c.get("/api/v1/admin/predictions/pools").json()["results"]
        assert [r["id"] for r in rows] == [pool.pk]
        res = c.post(
            f"/api/v1/admin/predictions/pools/{pool.pk}/decide",
            {"approve": False, "reason": "void"},
            format="json",
        )
        assert res.status_code == 200 and res.json()["status"] == "refunded"
        assert AdminAudit.objects.filter(action="prediction_pool.decide").exists()

    def test_access_management(self):
        make_admin()
        c = admin_client()
        res = c.post("/api/v1/admin/admins", {"username": "cashier", "role": "finance"}, format="json")
        assert res.status_code == 201
        body = res.json()
        assert body["credentials"]["totp_uri"].startswith("otpauth://")
        assert "totp_secret_encrypted" not in body
        assert (
            c.post(
                "/api/v1/admin/admins", {"username": "cashier", "role": "finance"}, format="json"
            ).status_code
            == 409
        )
        boss = AdminUser.objects.get(username="boss")
        res = c.patch(f"/api/v1/admin/admins/{boss.id}", {"role": "support", "reason": "test"}, format="json")
        assert res.status_code == 409 and res.json()["code"] == "ADMIN_LAST_SUPERADMIN"
        cashier = AdminUser.objects.get(username="cashier")
        res = c.patch(
            f"/api/v1/admin/admins/{cashier.id}", {"is_active": False, "reason": "left"}, format="json"
        )
        assert res.json()["is_active"] is False
        res = c.post(f"/api/v1/admin/admins/{cashier.id}/reset", {"reason": "lost phone"}, format="json")
        assert res.status_code == 200 and res.json()["credentials"]["password"]
        make_admin("helper", AdminUser.Role.SUPPORT)
        assert admin_client("helper").get("/api/v1/admin/admins").status_code == 403

    def test_match_search(self):
        a, b = make_user("Findme_1"), make_user()
        m = match(a, b)
        match(make_user(), make_user())
        make_admin()
        c = admin_client()
        by_name = c.get("/api/v1/admin/matches?q=findme_1").json()["results"]
        assert [r["id"] for r in by_name] == [str(m.id)]
        assert [r["id"] for r in c.get(f"/api/v1/admin/matches?q={m.id}").json()["results"]] == [str(m.id)]
        assert len(c.get("/api/v1/admin/matches").json()["results"]) == 2
        assert c.get("/api/v1/admin/matches/live").status_code == 200
