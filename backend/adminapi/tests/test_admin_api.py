import base64
import time
from unittest import mock

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from adminapi import totp
from adminapi.models import AdminAudit, AdminUser
from settingsapp import registry

HOST = "admin.localhost"
PASSWORD = "Adm1n-pass-word"
SECRET = base64.b32encode(b"12345678901234567890").decode()


def make_admin(username="boss", role=AdminUser.Role.SUPERADMIN):
    admin = AdminUser(username=username, role=role, totp_secret_encrypted=totp.encrypt(SECRET))
    admin.set_password(PASSWORD)
    admin.save()
    return admin


def current_code():
    return totp._code(SECRET, int(time.time() // totp.STEP_SECONDS))


def admin_client(username="boss"):
    c = APIClient(HTTP_HOST=HOST)
    res = c.post(
        "/api/v1/admin/auth/login",
        {"username": username, "password": PASSWORD, "totp": current_code()},
        format="json",
    )
    assert res.status_code == 200, res.json()
    return c


def test_totp_rfc6238_vector():
    # RFC 6238 appendix B, SHA-1, T=59 -> 94287082 (last six digits for a 6-digit code)
    assert totp._code(SECRET, 59 // 30) == "287082"
    assert totp.verify(SECRET, "287082", at=59)
    assert not totp.verify(SECRET, "287083", at=59)


def test_secret_encryption_roundtrip():
    assert totp.decrypt(totp.encrypt(SECRET)) == SECRET
    assert totp.decrypt("garbage") == ""


@pytest.mark.django_db
class TestAdminAuth:
    def test_login_sets_host_only_strict_cookie(self):
        make_admin()
        c = APIClient(HTTP_HOST=HOST)
        res = c.post(
            "/api/v1/admin/auth/login",
            {"username": "Boss", "password": PASSWORD, "totp": current_code()},
            format="json",
        )
        assert res.json() == {"username": "boss", "role": "superadmin", "environment": "development"}
        cookie = res.cookies[settings.ADMIN_COOKIE]
        assert cookie["httponly"] and cookie["samesite"] == "Strict" and not cookie["domain"]
        assert c.get("/api/v1/admin/me").status_code == 200

    def test_wrong_totp_is_rejected(self):
        make_admin()
        res = APIClient(HTTP_HOST=HOST).post(
            "/api/v1/admin/auth/login",
            {"username": "boss", "password": PASSWORD, "totp": "000000"},
            format="json",
        )
        assert res.json()["code"] == "ADMIN_INVALID_CREDENTIALS"

    def test_lock_after_five_failures(self):
        make_admin()
        codes = [
            APIClient(HTTP_HOST=HOST)
            .post(
                "/api/v1/admin/auth/login", {"username": "boss", "password": "x", "totp": "1"}, format="json"
            )
            .json()["code"]
            for _ in range(5)
        ]
        assert codes[-1] == "ADMIN_LOCKED"
        res = APIClient(HTTP_HOST=HOST).post(
            "/api/v1/admin/auth/login",
            {"username": "boss", "password": PASSWORD, "totp": current_code()},
            format="json",
        )
        assert res.json()["code"] == "ADMIN_LOCKED"
        assert 0 < res.json()["details"]["retry_after"] <= 900

    def test_only_on_admin_host(self):
        make_admin()
        res = APIClient(HTTP_HOST="m.localhost").post(
            "/api/v1/admin/auth/login",
            {"username": "boss", "password": PASSWORD, "totp": current_code()},
            format="json",
        )
        assert res.status_code == 403 and res.json()["details"] == {"reason": "host"}

    def test_ip_allowlist(self, settings):
        make_admin()
        settings.ADMIN_IP_ALLOWLIST = ["10.0.0.0/8"]
        res = APIClient(HTTP_HOST=HOST).get("/api/v1/admin/me")
        assert res.status_code == 403 and res.json()["details"] == {"reason": "ip"}
        res = APIClient(HTTP_HOST=HOST, HTTP_X_REAL_IP="10.1.2.3").get("/api/v1/admin/me")
        assert res.json()["code"] == "ADMIN_UNAUTHENTICATED"

    def test_player_cookie_is_not_accepted(self):
        c = APIClient(HTTP_HOST=HOST)
        c.cookies[settings.ACCESS_COOKIE] = "anything"
        assert c.get("/api/v1/admin/me").json()["code"] == "ADMIN_UNAUTHENTICATED"

    def test_logout_revokes(self):
        make_admin()
        c = admin_client()
        raw = c.cookies[settings.ADMIN_COOKIE].value
        assert c.post("/api/v1/admin/auth/logout").status_code == 204
        c.cookies[settings.ADMIN_COOKIE] = raw
        assert c.get("/api/v1/admin/me").status_code == 401


@pytest.mark.django_db
class TestAdminSettings:
    def test_list_contains_every_registry_key(self):
        make_admin()
        rows = admin_client().get("/api/v1/admin/settings").json()["results"]
        assert {r["key"] for r in rows} == set(registry.REGISTRY)
        otp = next(r for r in rows if r["key"] == "sms.pattern_otp")
        assert otp["group"] == "sms" and otp["is_default"] and set(otp["description"]) == {"fa", "en"}

    def test_update_is_audited_and_live(self):
        make_admin()
        c = admin_client()
        res = c.patch("/api/v1/admin/settings/table.rake_pct", {"value": 8, "reason": "promo"}, format="json")
        assert res.json()["value"] == 8
        assert registry.get("table.rake_pct") == 8
        row = AdminAudit.objects.get()
        assert (row.action, row.target_id, row.before, row.after, row.reason) == (
            "setting.update",
            "table.rake_pct",
            10,
            8,
            "promo",
        )
        res = c.delete("/api/v1/admin/settings/table.rake_pct", {"reason": "end of promo"}, format="json")
        assert res.json()["value"] == 10 and AdminAudit.objects.count() == 2

    def test_reason_is_required(self):
        make_admin()
        c = admin_client()
        res = c.patch("/api/v1/admin/settings/table.rake_pct", {"value": 8}, format="json")
        assert res.json()["code"] == "VALIDATION" and "reason" in res.json()["details"]["fields"]
        assert c.delete("/api/v1/admin/settings/table.rake_pct").json()["code"] == "VALIDATION"

    def test_concurrent_edit_is_refused(self):
        make_admin()
        c = admin_client()
        c.patch("/api/v1/admin/settings/table.rake_pct", {"value": 8, "reason": "first"}, format="json")
        res = c.patch(
            "/api/v1/admin/settings/table.rake_pct",
            {"value": 9, "reason": "second", "expected": 10},
            format="json",
        )
        assert res.status_code == 409
        assert res.json() == {
            "code": "SETTING_CONFLICT",
            "message_key": "errors.admin.settingConflict",
            "details": {"current": 8},
        }
        assert registry.get("table.rake_pct") == 8

    def test_saving_the_default_resets_and_reports_last_change(self):
        make_admin()
        c = admin_client()
        c.patch("/api/v1/admin/settings/elo.k", {"value": 25, "reason": "tuning"}, format="json")
        res = c.patch("/api/v1/admin/settings/elo.k", {"value": 20, "reason": "back"}, format="json").json()
        assert res["is_default"] and res["updated_by"] == "boss" and res["updated_at"]
        assert AdminAudit.objects.latest("created_at").action == "setting.reset"
        from settingsapp.models import Setting

        assert not Setting.objects.filter(key="elo.k").exists()

    def test_pattern_status_lookup(self, settings):
        settings.IPPANEL_API_KEY = "KEY"
        make_admin()
        fake = mock.Mock()
        fake.pattern_status.return_value = "active"
        with mock.patch("adminapi.views.sms.ippanel", return_value=fake):
            body = admin_client().get("/api/v1/admin/sms/patterns/abc123xyz").json()
        assert body == {"code": "abc123xyz", "status": "active"}

    def test_units_and_audit_filter(self):
        make_admin()
        c = admin_client()
        units = {r["key"]: r["unit"] for r in c.get("/api/v1/admin/settings").json()["results"]}
        assert units["game.turn_seconds"] == "seconds" and units["table.rake_pct"] == "percent"
        assert units["shop.custom_max_toman"] == "toman" and units["table.tiers"] == "coins"
        c.patch("/api/v1/admin/settings/elo.k", {"value": 25, "reason": "tuning"}, format="json")
        c.patch("/api/v1/admin/settings/xp.per_win", {"value": 20, "reason": "tuning"}, format="json")
        rows = c.get("/api/v1/admin/audit", {"target_id": "elo.k"}).json()["results"]
        assert [r["target_id"] for r in rows] == ["elo.k"]

    def test_invalid_value_is_rejected_without_audit(self):
        make_admin()
        res = admin_client().patch(
            "/api/v1/admin/settings/sms.from_number", {"value": "3000505", "reason": "typo"}, format="json"
        )
        assert res.json()["code"] == "SETTING_INVALID"
        assert not AdminAudit.objects.exists()

    def test_support_role_cannot_edit(self):
        make_admin("helper", AdminUser.Role.SUPPORT)
        c = admin_client("helper")
        assert c.get("/api/v1/admin/settings").status_code == 200
        res = c.patch("/api/v1/admin/settings/table.rake_pct", {"value": 8}, format="json")
        assert res.status_code == 403 and res.json()["details"] == {"reason": "role"}

    def test_sms_status_unconfigured(self, settings):
        settings.IPPANEL_API_KEY = ""
        make_admin()
        body = admin_client().get("/api/v1/admin/sms/status").json()
        assert body["configured"] is False and body["credit_rial"] is None

    def test_sms_status_reports_credit_and_patterns(self, settings):
        settings.IPPANEL_API_KEY = "KEY"
        make_admin()
        fake = mock.Mock()
        fake.credit_rial.return_value = (500_000, 20_000)
        fake.pattern_status.side_effect = lambda code: (
            "active" if code == registry.get("sms.pattern_otp") else "pending"
        )
        with mock.patch("adminapi.views.sms.ippanel", return_value=fake):
            body = admin_client().get("/api/v1/admin/sms/status?refresh=1").json()
        assert body["credit_rial"] == 500_000 and body["gift_rial"] == 20_000 and body["low_credit"] is True
        assert body["patterns"]["sms.pattern_otp"]["status"] == "active"
        assert body["patterns"]["sms.pattern_withdrawal_paid"]["status"] == "pending"
