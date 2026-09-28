from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Session, User
from adminapi.models import AdminAudit, AdminUser
from adminapi.tests.test_admin_api import admin_client, make_admin
from antifraud import links, rules
from antifraud.models import DeviceFingerprint, FraudFlag
from config.errors import AppError
from game.models import Match
from predictions import services as predictions
from predictions.models import PredictionPool
from referrals.models import ReferralEarning
from referrals.services import pay_commissions
from settingsapp import registry
from wallet import invariants
from wallet import services as wallet
from wallet.models import BankAccount, Wallet
from wallet.tests.helpers import fund, make_iban, make_user


def same_ip(*users, ip="10.9.9.9", ua="UA-1"):
    for u in users:
        Session.objects.create(user=u, refresh_hash="x", ip=ip, user_agent=ua, expires_at="2100-01-01T00:00Z")


def bal(u):
    return Wallet.objects.get(user=u).balance


def finished(a, b, winner, reason="bear_off", entry=100):
    return Match.objects.create(
        variant="standard_nocube",
        length=1,
        entry=entry,
        player_a=a,
        player_b=b,
        status=Match.Status.FINISHED,
        winner=winner,
        end_reason=reason,
        seed_commit="c",
        seed_encrypted="e",
        ended_at=timezone.now(),
    )


@pytest.mark.django_db
class TestLinks:
    def test_shared_device_or_ip_and_agent(self):
        a, b, c = make_user(), make_user(), make_user()
        assert links.link_reasons(a.id, b.id) == []
        DeviceFingerprint.objects.create(user=a, fingerprint="dev-1")
        DeviceFingerprint.objects.create(user=b, fingerprint="dev-1")
        assert links.link_reasons(a.id, b.id) == ["device"]
        same_ip(a, c)
        assert links.link_reasons(a.id, c.id) == ["ip"]
        # The same IP with a different browser is a shared network, not a link.
        same_ip(b, ua="UA-2")
        assert "ip" not in links.link_reasons(b.id, c.id)
        assert links.are_linked(a.id, a.id)

    def test_old_signals_expire(self):
        a, b = make_user(), make_user()
        DeviceFingerprint.objects.create(user=a, fingerprint="dev-1")
        DeviceFingerprint.objects.create(user=b, fingerprint="dev-1")
        old = timezone.now() - timedelta(days=registry.get("antifraud.link_window_days") + 1)
        DeviceFingerprint.objects.filter(user=b).update(last_seen=old)
        assert links.link_reasons(a.id, b.id) == []

    def test_graph(self):
        a, b, c = make_user("Hub_1"), make_user(), make_user()
        DeviceFingerprint.objects.create(user=a, fingerprint="dev-1")
        DeviceFingerprint.objects.create(user=b, fingerprint="dev-1")
        c.referrer = a
        c.save()
        g = links.graph(a.id)
        assert {(e["to"], e["reason"]) for e in g["edges"]} == {(b.id, "device"), (c.id, "referee")}
        assert {n["id"] for n in g["nodes"]} == {a.id, b.id, c.id}
        assert all("phone" not in n for n in g["nodes"])


@pytest.mark.django_db
class TestDevices:
    def test_header_records_device_and_flags_shared_one(self):
        a, b = make_user(), make_user()
        for u in (a, b):
            c = APIClient()
            c.post("/api/v1/auth/login", {"phone": u.phone, "password": "S3cure-pass!"}, format="json")
            assert c.get("/api/v1/me", HTTP_X_DEVICE_ID="shared-device").status_code == 200
        assert DeviceFingerprint.objects.filter(fingerprint="shared-device").count() == 2
        f = FraudFlag.objects.get(rule="multi_account")
        assert {f.user_id, f.other_id} == {a.id, b.id}
        # A repeated signal does not pile up flags.
        rules.record_device(b, "shared-device-2", None, "")
        rules.record_device(a, "shared-device-2", None, "")
        assert FraudFlag.objects.filter(rule="multi_account").count() == 1


@pytest.mark.django_db
class TestWalletBlocks:
    def test_transfer_between_linked_accounts_is_refused_and_flagged(self):
        a, b = make_user(), make_user("Linked_1")
        fund(a, 500)
        same_ip(a, b)
        with pytest.raises(AppError) as exc:
            wallet.transfer(a, "Linked_1", 50, "S3cure-pass!", "k1")
        assert exc.value.code == "TRANSFER_LINKED"
        assert bal(a) == 500 and bal(b) == 0
        assert FraudFlag.objects.filter(rule="linked_transfer", user=a, other=b).exists()

    def test_open_flag_blocks_withdrawal(self):
        u = make_user()
        fund(u, 1000)
        BankAccount.objects.create(user=u, iban=make_iban())
        assert wallet.check_withdrawal(u, 200) == 200
        f = rules.flag("engine_assist", u)
        with pytest.raises(AppError) as exc:
            wallet.check_withdrawal(u, 200)
        assert exc.value.code == "WITHDRAW_UNDER_REVIEW"
        FraudFlag.objects.filter(pk=f.pk).update(status="dismissed")
        assert wallet.check_withdrawal(u, 200) == 200


@pytest.mark.django_db
class TestChipDumping:
    def test_one_sided_series_is_flagged_and_blocked_from_pools(self):
        a, b = make_user(), make_user()
        n = registry.get("antifraud.chip_min_matches")
        for i in range(n - 1):
            rules.check_match(finished(a, b, b, reason="resign" if i % 2 else "bear_off"))
        assert not FraudFlag.objects.filter(rule="chip_dumping").exists()  # too few matches yet
        rules.check_match(finished(a, b, b))
        f = FraudFlag.objects.get(rule="chip_dumping")
        lo = min(a.id, b.id)
        assert f.user_id == lo and f.evidence["matches"] == n
        assert f.evidence["wins"][str(b.id)] == n and f.evidence["resigns"] == (n - 1) // 2
        assert f.evidence["early_resigns"] == f.evidence["resigns"]  # no moves were played

        other = Match.objects.create(
            variant="standard_cube",
            length=3,
            entry=100,
            player_a=make_user(),
            player_b=make_user(),
            seed_commit="c",
            seed_encrypted="e",
        )
        predictions.open_pool(other)
        fund(a, 100)
        with pytest.raises(AppError) as exc:
            predictions.place(a, str(other.id), 0, 10, "k")
        assert exc.value.details["reason"] == "review"

    def test_balanced_series_is_not_flagged(self):
        a, b = make_user(), make_user()
        for i in range(registry.get("antifraud.chip_min_matches") + 2):
            rules.check_match(finished(a, b, a if i % 2 else b))
        assert not FraudFlag.objects.exists()

    def test_bot_matches_are_ignored(self):
        a = make_user()
        m = Match.objects.create(
            variant="standard_nocube",
            length=1,
            entry=0,
            player_a=a,
            is_bot=True,
            status=Match.Status.FINISHED,
            winner=a,
            seed_commit="c",
            seed_encrypted="e",
        )
        rules.check_match(m)
        assert not FraudFlag.objects.exists()


def pool_match(reason):
    m = Match.objects.create(
        variant="standard_cube",
        length=3,
        entry=100,
        player_a=make_user(),
        player_b=make_user(),
        seed_commit="c",
        seed_encrypted="e",
    )
    pool = predictions.open_pool(m)
    assert pool is not None
    backers = []
    for side, amount in ((0, 300), (1, 50), (0, 20)):
        u = make_user()
        fund(u, 1000)
        predictions.place(u, str(m.id), side, amount, "k")
        backers.append(u)
    predictions.close(m.id)
    m.end_reason = reason
    m.status = Match.Status.FINISHED
    m.save()
    return m, pool, backers


@pytest.mark.django_db
class TestPredictionCollusion:
    def test_normal_end_settles(self):
        m, _pool, _ = pool_match("bear_off")
        assert rules.check_pool(m, 0) is False
        assert predictions.settle(m, 0) is not None

    def test_large_stake_before_resign_holds_the_pool_until_dismissed(self):
        m, pool, (big, small, _other) = pool_match("resign")
        assert rules.check_pool(m, 0) is True
        assert predictions.settle(m, 0) is None
        assert PredictionPool.objects.get(pk=pool.pk).status == "held"
        f = FraudFlag.objects.get(rule="prediction_collusion")
        assert f.user_id == big.id and f.match_id == m.id
        make_admin()
        res = admin_client().post(
            f"/api/v1/admin/fraud/flags/{f.id}/decide",
            {"decision": "dismiss", "reason": "normal play"},
            format="json",
        )
        assert res.status_code == 200 and res.json()["status"] == "dismissed"
        assert PredictionPool.objects.get(pk=pool.pk).status == "settled"
        assert bal(big) > 1000 and bal(small) == 950
        assert invariants.check() == []

    def test_confirmed_collusion_refunds_everyone(self):
        m, _pool, backers = pool_match("forfeit_timeout")
        assert rules.check_pool(m, 0) is True
        predictions.settle(m, 0)
        f = FraudFlag.objects.get(rule="prediction_collusion")
        make_admin()
        res = admin_client().post(
            f"/api/v1/admin/fraud/flags/{f.id}/decide",
            {"decision": "confirm", "reason": "collusion", "action": "suspend"},
            format="json",
        )
        assert res.status_code == 200
        assert [bal(u) for u in backers] == [1000, 1000, 1000]
        assert User.objects.get(pk=backers[0].id).status == "suspended"
        assert AdminAudit.objects.filter(action="fraud.decide", target_id=str(f.id)).exists()
        # A decision is final.
        again = admin_client().post(
            f"/api/v1/admin/fraud/flags/{f.id}/decide",
            {"decision": "dismiss", "reason": "changed mind"},
            format="json",
        )
        assert again.status_code == 409 and again.json()["code"] == "FLAG_ALREADY_DECIDED"


def referral_setup():
    referrer = make_user("Farm_1")
    referee = make_user()
    referee.referrer = referrer
    referee.phone_verified_at = timezone.now()
    referee.save()
    other = make_user()
    for u in (referee, other):
        fund(u, 500)
    m = Match.objects.create(
        variant="standard_nocube",
        length=1,
        entry=100,
        player_a=referee,
        player_b=other,
        seed_commit="c",
        seed_encrypted="e",
    )
    wallet.escrow_match_entries(m.id, [referee.id, other.id], 100)
    settlement = wallet.settle_match(m.id, other.id, 100, 10)
    same_ip(referrer, referee)
    return referrer, referee, other, m, settlement


@pytest.mark.django_db
class TestReferralFarm:
    @pytest.mark.parametrize(("decision", "paid"), [("dismiss", 1), ("confirm", 0)])
    def test_linked_commission_is_held_until_the_decision(self, decision, paid):
        referrer, referee, other, m, settlement = referral_setup()
        assert pay_commissions(m, [referee, other], settlement["rake"]) == []
        earning = ReferralEarning.objects.get()
        assert earning.status == "held" and bal(referrer) == 0
        f = FraudFlag.objects.get(rule="referral_farm")
        assert f.evidence["earning"] == earning.id
        make_admin()
        res = admin_client().post(
            f"/api/v1/admin/fraud/flags/{f.id}/decide",
            {"decision": decision, "reason": "reviewed"},
            format="json",
        )
        assert res.status_code == 200
        earning.refresh_from_db()
        assert earning.status == ("paid" if paid else "cancelled")
        assert bal(referrer) == paid
        assert invariants.check() == []


@pytest.mark.django_db
class TestAdminQueue:
    def test_list_filter_links_and_roles(self):
        a, b = make_user("Qa_1"), make_user()
        rules.flag("multi_account", a, b, evidence={"reason": "device"})
        rules.flag("engine_assist", b)
        make_admin()
        c = admin_client()
        rows = c.get("/api/v1/admin/fraud/flags?status=open").json()["results"]
        assert [r["rule"] for r in rows] == ["engine_assist", "multi_account"]
        assert all("phone" not in (r["user"] or {}) for r in rows)
        only = c.get(f"/api/v1/admin/fraud/flags?user_id={a.id}").json()["results"]
        assert [r["rule"] for r in only] == ["multi_account"]
        DeviceFingerprint.objects.create(user=a, fingerprint="d")
        DeviceFingerprint.objects.create(user=b, fingerprint="d")
        graph = c.get(f"/api/v1/admin/users/{a.id}/links").json()
        assert graph["edges"] == [{"from": a.id, "to": b.id, "reason": "device"}]

        make_admin("money", AdminUser.Role.FINANCE)
        flag_id = rows[0]["id"]
        res = admin_client("money").post(
            f"/api/v1/admin/fraud/flags/{flag_id}/decide",
            {"decision": "dismiss", "reason": "ok"},
            format="json",
        )
        assert res.status_code == 403

    def test_ban_revokes_sessions(self):
        u = make_user()
        c = APIClient()
        c.post("/api/v1/auth/login", {"phone": u.phone, "password": "S3cure-pass!"}, format="json")
        f = rules.flag("engine_assist", u)
        make_admin()
        res = admin_client().post(
            f"/api/v1/admin/fraud/flags/{f.id}/decide",
            {"decision": "confirm", "reason": "engine use", "action": "ban"},
            format="json",
        )
        assert res.status_code == 200
        assert User.objects.get(pk=u.id).status == "banned"
        assert c.get("/api/v1/me").status_code == 401

    def test_engine_assist_needs_enough_moves(self):
        assert rules.check_engine_assist(make_user().id) is None
