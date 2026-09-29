from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from accounts.models import User
from adminapi import totp
from adminapi.models import AdminUser
from wallet import invariants
from wallet.models import Wallet


def seed(**options):
    out = StringIO()
    call_command("seed_testers", stdout=out, **options)
    return out.getvalue()


@pytest.mark.django_db
def test_seeds_players_and_admin_that_can_log_in():
    out = seed(count=2, coins=500, password="Tester-pass-1", admin_password="Admin-pass-1")
    assert "tester2" in out and "09000000002" in out
    assert [w.balance for w in Wallet.objects.order_by("user_id")] == [600, 600]  # 100 bonus + 500
    res = APIClient().post(
        "/api/v1/auth/login", {"phone": "09000000001", "password": "Tester-pass-1"}, format="json"
    )
    assert res.status_code == 200, res.json()
    assert res.cookies  # signed in
    assert APIClient().get("/api/v1/wallet").status_code == 401

    admin = AdminUser.objects.get(username="admin")
    secret = totp.decrypt(admin.totp_secret_encrypted)
    assert secret in out
    code = totp._code(secret, int(__import__("time").time() // totp.STEP_SECONDS))
    res = APIClient(HTTP_HOST="admin.localhost").post(
        "/api/v1/admin/auth/login",
        {"username": "admin", "password": "Admin-pass-1", "totp": code},
        format="json",
    )
    assert res.status_code == 200, res.json()
    assert invariants.check() == []


@pytest.mark.django_db
def test_rerun_rotates_passwords_but_keeps_coins_and_authenticator():
    seed(count=1, coins=500)
    secret = totp.decrypt(AdminUser.objects.get().totp_secret_encrypted)
    old_hash = User.objects.get().password
    seed(count=1, coins=500)
    assert User.objects.get().password != old_hash
    assert Wallet.objects.get().balance == 600
    assert totp.decrypt(AdminUser.objects.get().totp_secret_encrypted) == secret


@pytest.mark.django_db
def test_refused_in_production(settings):
    settings.APP_ENV = "production"
    with pytest.raises(CommandError):
        seed()
