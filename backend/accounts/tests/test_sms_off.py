"""`sms.enabled` off (the default until the SMS line is approved): nothing is sent, signup skips
the code step, password reset by SMS is unavailable, and withdrawals are confirmed by password."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from accounts.models import Otp
from wallet import invariants
from wallet.models import WithdrawalRequest
from wallet.tests.helpers import fund, make_iban, make_user

PHONE = "+989121234567"


@pytest.fixture(autouse=True)
def _no_sms_task():
    with mock.patch("accounts.otp.send_otp_sms.delay") as send:
        yield send


@pytest.mark.django_db
class TestSignupWithoutSms:
    def test_otp_request_returns_a_token_and_sends_nothing(self, _no_sms_task):
        c = APIClient()
        res = c.post("/api/v1/auth/otp", {"phone": "09121234567", "purpose": "register"}, format="json")
        assert res.status_code == 200
        body = res.json()
        assert body["sms"] is False and body["verification_token"]
        _no_sms_task.assert_not_called()

        res = c.post(
            "/api/v1/auth/register",
            {
                "verification_token": body["verification_token"],
                "username": "No_Sms_1",
                "password": "S3cure-pass!",
                "age_confirmed": True,
            },
            format="json",
        )
        assert res.status_code == 201, res.json()
        # The number is not proven, so no signup bonus (§7.10).
        assert c.get("/api/v1/me").json()["phone_verified"] is False
        assert c.get("/api/v1/wallet").json()["balance"] == 0
        assert invariants.check() == []

    def test_token_is_single_use(self):
        c = APIClient()
        token = c.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json").json()[
            "verification_token"
        ]
        body = {"verification_token": token, "password": "S3cure-pass!", "age_confirmed": True}
        assert (
            c.post("/api/v1/auth/register", {**body, "username": "One_1"}, format="json").status_code == 201
        )
        res = APIClient().post("/api/v1/auth/register", {**body, "username": "Two_2"}, format="json")
        assert res.json()["code"] == "AUTH_VERIFICATION_INVALID"

    def test_taken_phone_is_still_refused(self):
        make_user()
        user = make_user()
        res = APIClient().post(
            "/api/v1/auth/otp", {"phone": user.phone, "purpose": "register"}, format="json"
        )
        assert res.json()["code"] == "AUTH_PHONE_TAKEN"

    def test_rate_limit_still_applies(self, settings):
        c = APIClient()
        codes = [
            c.post(
                "/api/v1/auth/otp", {"phone": f"+98912000000{i}", "purpose": "register"}, format="json"
            ).status_code
            for i in range(4)
        ]
        assert codes == [200, 200, 200, 429]  # otp.rate_limit_count per IP

    def test_password_reset_by_sms_is_unavailable(self):
        user = make_user()
        res = APIClient().post(
            "/api/v1/auth/otp", {"phone": user.phone, "purpose": "password_reset"}, format="json"
        )
        assert res.status_code == 503 and res.json()["code"] == "SMS_UNAVAILABLE"
        assert not Otp.objects.exists()


@pytest.mark.django_db
class TestWithdrawalWithoutSms:
    def setup(self):
        user = make_user()
        fund(user, 1000)
        c = APIClient()
        c.force_authenticate(user=user)
        c.post("/api/v1/me/bank-accounts", {"iban": make_iban()}, format="json")
        return user, c

    def post(self, c, body, key="w1"):
        return c.post("/api/v1/wallet/withdrawals", body, format="json", HTTP_IDEMPOTENCY_KEY=key)

    def test_confirmed_by_password(self):
        _user, c = self.setup()
        assert c.get("/api/v1/wallet").json()["withdraw"]["confirm"] == "password"
        assert c.post("/api/v1/wallet/withdrawals/otp").json()["code"] == "SMS_UNAVAILABLE"
        assert self.post(c, {"amount": 300}).json()["code"] == "VALIDATION"
        assert self.post(c, {"amount": 300, "password": "wrong"}).json()["code"] == "WALLET_PASSWORD_INVALID"
        res = self.post(c, {"amount": 300, "password": "S3cure-pass!"})
        assert res.status_code == 201, res.json()
        assert WithdrawalRequest.objects.get().coins == 300

    def test_paid_withdrawal_sends_no_sms(self):
        from adminapi.tests.test_admin_api import admin_client, make_admin

        _user, c = self.setup()
        wid = self.post(c, {"amount": 300, "password": "S3cure-pass!"}).json()["id"]
        make_admin()
        with mock.patch("wallet.services.send_withdrawal_paid_sms.delay") as send:
            res = admin_client().post(
                f"/api/v1/admin/withdrawals/{wid}/approve", {"bank_reference": "REF-1"}, format="json"
            )
        assert res.json()["status"] == "paid"
        send.assert_not_called()
