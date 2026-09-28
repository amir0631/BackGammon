from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from adminapi.models import AdminAudit
from adminapi.tests.test_admin_api import admin_client, make_admin
from settingsapp import registry
from wallet import invariants, services
from wallet.iban import validate_iban
from wallet.models import LedgerEntry, Wallet, WithdrawalRequest
from wallet.tests.helpers import fund, make_iban, make_user

CODE = 48213


def client_for(user: User) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def fixed_code():
    with mock.patch("accounts.otp.secrets.randbelow", return_value=CODE - 10_000):
        yield CODE


@pytest.mark.django_db
class TestSignupBonus:
    def test_register_grants_bonus_once_per_phone(self):
        user = make_user()
        services.grant_signup_bonus(user)
        services.grant_signup_bonus(user)
        assert Wallet.objects.get(user=user).balance == 100
        assert invariants.check() == []

    def test_bonus_is_not_withdrawable_until_first_top_up(self):
        user = make_user()
        services.grant_signup_bonus(user)
        s = services.summary(user)
        assert (s["balance"], s["bonus_locked"], s["withdrawable"]) == (100, 100, 0)
        fund(user, 50)
        s = services.summary(user)
        assert (s["balance"], s["bonus_locked"], s["withdrawable"]) == (150, 0, 150)

    def test_zero_bonus_setting(self):
        registry.set_value("bonus.signup_coins", 0)
        user = make_user()
        services.grant_signup_bonus(user)
        assert Wallet.objects.get(user=user).balance == 0


@pytest.mark.django_db
class TestTransfer:
    def post(self, c, body, key="k1"):
        return c.post("/api/v1/wallet/transfer", body, format="json", HTTP_IDEMPOTENCY_KEY=key)

    def test_transfer_and_idempotency(self):
        a, b = make_user("Sender_1"), make_user("Receiver_1")
        fund(a, 500)
        c = client_for(a)
        body = {"username": "receiver_1", "amount": 200, "password": "S3cure-pass!"}
        res = self.post(c, body)
        assert res.status_code == 200 and res.json()["balance"] == 300
        assert self.post(c, body).json()["balance"] == 300  # replay: no second transfer
        assert Wallet.objects.get(user=b).balance == 200
        ledger = client_for(b).get("/api/v1/wallet/ledger").json()["results"]
        assert ledger[0]["counterparty"] == "Sender_1" and ledger[0]["amount"] == 200
        assert "phone" not in str(ledger)

    def test_fee_goes_to_rake(self):
        registry.set_value("transfer.fee_pct", 10)
        a, b = make_user(), make_user("Rec_2")
        fund(a, 100)
        res = self.post(client_for(a), {"username": "Rec_2", "amount": 55, "password": "S3cure-pass!"})
        assert res.json()["fee"] == 5 and Wallet.objects.get(user=b).balance == 50
        assert invariants.check() == []

    @pytest.mark.parametrize(
        ("body", "code"),
        [
            (
                {"username": "nobody_x", "amount": 20, "password": "S3cure-pass!"},
                "TRANSFER_RECIPIENT_NOT_FOUND",
            ),
            ({"username": "Rec_3", "amount": 5, "password": "S3cure-pass!"}, "TRANSFER_BELOW_MIN"),
            ({"username": "Rec_3", "amount": 20, "password": "wrong-pass"}, "AUTH_INVALID_CREDENTIALS"),
            ({"username": "Rec_3", "amount": 900, "password": "S3cure-pass!"}, "WALLET_INSUFFICIENT"),
        ],
    )
    def test_errors(self, body, code):
        a = make_user("Sender_3")
        make_user("Rec_3")
        fund(a, 100)
        assert self.post(client_for(a), body).json()["code"] == code

    def test_self_and_missing_key(self):
        a = make_user("Self_1")
        fund(a, 100)
        c = client_for(a)
        assert (
            self.post(c, {"username": "self_1", "amount": 20, "password": "S3cure-pass!"}).json()["code"]
            == "TRANSFER_SELF"
        )
        res = c.post(
            "/api/v1/wallet/transfer", {"username": "x", "amount": 1, "password": "p"}, format="json"
        )
        assert res.json()["code"] == "IDEMPOTENCY_KEY_REQUIRED"

    def test_rolling_limit(self):
        registry.set_value("transfer.daily_max_coins", 100)
        a = make_user()
        make_user("Rec_4")
        fund(a, 1000)
        c = client_for(a)
        assert (
            self.post(c, {"username": "Rec_4", "amount": 80, "password": "S3cure-pass!"}, "a").status_code
            == 200
        )
        res = self.post(c, {"username": "Rec_4", "amount": 30, "password": "S3cure-pass!"}, "b").json()
        assert res["code"] == "TRANSFER_LIMIT" and res["details"]["remaining"] == 20
        assert res["details"]["next_available_at"]
        assert c.get("/api/v1/wallet").json()["transfer"]["remaining"] == 20

    def test_retry_returns_the_original_result_after_limits_or_recipient_change(self):
        a, b = make_user(), make_user("Rec_6")
        fund(a, 10_000)
        c = client_for(a)
        body = {"username": "Rec_6", "amount": 3000, "password": "S3cure-pass!"}
        first = self.post(c, body, "retry")
        assert first.status_code == 200
        # 3000 of the 5000 rolling limit is used, so a fresh 3000 would be refused; a retry is not.
        again = self.post(c, body, "retry")
        assert (again.status_code, again.json()) == (200, first.json())
        User.objects.filter(id=b.id).update(status=User.Status.BANNED)
        again = self.post(c, body, "retry")
        assert (again.status_code, again.json()) == (200, first.json())
        assert Wallet.objects.get(user=b).balance == 3000
        assert LedgerEntry.objects.filter(type="transfer").values("tx_id").distinct().count() == 1

    def test_signup_bonus_is_not_transferable_until_first_top_up(self):
        a = make_user()
        make_user("Rec_7")
        services.grant_signup_bonus(a)
        c = client_for(a)
        body = {"username": "Rec_7", "amount": 50, "password": "S3cure-pass!"}
        res = self.post(c, body, "b1").json()
        assert res["code"] == "TRANSFER_NOT_TRANSFERABLE"
        assert res["details"] == {"transferable": 0, "bonus_locked": 100}
        assert c.get("/api/v1/wallet").json()["transferable"] == 0
        fund(a, 20)
        assert self.post(c, body, "b2").status_code == 200
        assert invariants.check() == []

    def test_received_coins_are_transferable_while_the_bonus_is_locked(self):
        a, b = make_user(), make_user("Rec_8")
        make_user("Rec_9")
        services.grant_signup_bonus(b)
        fund(a, 100)
        self.post(client_for(a), {"username": "Rec_8", "amount": 30, "password": "S3cure-pass!"})
        c = client_for(b)
        assert c.get("/api/v1/wallet").json()["transferable"] == 30
        over = self.post(c, {"username": "Rec_9", "amount": 31, "password": "S3cure-pass!"}, "o")
        assert over.json()["code"] == "TRANSFER_NOT_TRANSFERABLE"
        assert (
            self.post(c, {"username": "Rec_9", "amount": 30, "password": "S3cure-pass!"}, "p").status_code
            == 200
        )

    def test_suspended_cannot_transfer(self):
        a = make_user(status="suspended")
        make_user("Rec_5")
        fund(a, 100)
        res = self.post(client_for(a), {"username": "Rec_5", "amount": 20, "password": "S3cure-pass!"})
        assert res.json()["code"] == "ACCOUNT_SUSPENDED"


class TestIban:
    def test_valid_and_known_bank(self):
        iban = make_iban("054")
        assert validate_iban(iban) == (iban, "054")
        assert validate_iban(" ".join([iban[i : i + 4] for i in range(0, 26, 4)]).lower())[1] == "054"

    @pytest.mark.parametrize(
        ("value", "reason"),
        [
            ("IR12345", "format"),
            ("GB82WEST12345698765432", "format"),
            ("IR000540102680020817909002", "checksum"),
        ],
    )
    def test_invalid(self, value, reason):
        from wallet.iban import IbanInvalid

        with pytest.raises(IbanInvalid) as exc:
            validate_iban(value)
        assert exc.value.details["reason"] == reason

    def test_unknown_bank(self):
        from wallet.iban import IbanInvalid

        with pytest.raises(IbanInvalid) as exc:
            validate_iban(make_iban("099"))
        assert exc.value.details["reason"] == "bank"


@pytest.mark.django_db
@pytest.mark.usefixtures("sms_on")
class TestWithdrawal:
    def setup_user(self, balance=1000, status="active"):
        user = make_user(status=status)
        fund(user, balance)
        c = client_for(user)
        res = c.post("/api/v1/me/bank-accounts", {"iban": make_iban()}, format="json")
        assert res.status_code == 201 and "*" in res.json()["iban"]
        return user, c

    def request(self, c, amount, key="w1", code=CODE):
        assert c.post("/api/v1/wallet/withdrawals/otp").status_code == 202
        return c.post(
            "/api/v1/wallet/withdrawals",
            {"amount": amount, "code": str(code)},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def test_request_cancel(self, fixed_code):
        _user, c = self.setup_user()
        res = self.request(c, 300)
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["status"] == "pending" and body["payout_toman"] == 300_000
        w = c.get("/api/v1/wallet").json()
        assert (w["balance"], w["locked"]) == (700, 300)
        # bank account is locked while pending
        assert c.post("/api/v1/me/bank-accounts", {"iban": make_iban("012")}, format="json").json()[
            "code"
        ] == ("BANK_ACCOUNT_LOCKED")
        res = c.delete(f"/api/v1/wallet/withdrawals/{body['id']}")
        assert res.json()["status"] == "cancelled"
        w = c.get("/api/v1/wallet").json()
        assert (w["balance"], w["locked"]) == (1000, 0)
        assert invariants.check() == []

    def test_wrong_code(self, fixed_code):
        _, c = self.setup_user()
        assert self.request(c, 300, code=11111).json()["code"] == "AUTH_OTP_INVALID"

    def test_limits_and_bonus(self, fixed_code):
        user = make_user()
        services.grant_signup_bonus(user)
        c = client_for(user)
        c.post("/api/v1/me/bank-accounts", {"iban": make_iban()}, format="json")
        assert self.request(c, 100).json()["code"] == "WITHDRAW_NOT_WITHDRAWABLE"
        from accounts import ratelimit

        ratelimit.reset(f"otp:resend:{user.phone}:withdrawal")
        assert self.request(c, 50, "w2").json()["code"] == "WITHDRAW_BELOW_MIN"

    def test_suspended_can_withdraw(self, fixed_code):
        _, c = self.setup_user(status="suspended")
        assert self.request(c, 200).status_code == 201

    def test_expected_by_skips_friday(self):
        thursday = datetime(2026, 10, 1, 12, tzinfo=ZoneInfo("Asia/Tehran"))
        assert services.next_working_day(thursday).isoformat() == "2026-10-03"  # Friday skipped

    def test_admin_approve_and_reject(self, fixed_code):
        make_admin("fin", "finance")
        admin = admin_client("fin")
        user, c = self.setup_user()
        first = self.request(c, 300).json()
        from accounts import ratelimit

        ratelimit.reset(f"otp:resend:{user.phone}:withdrawal")
        second = self.request(c, 200, "w2").json()
        queue = admin.get("/api/v1/admin/withdrawals", {"status": "pending"}).json()["results"]
        assert [q["id"] for q in queue] == [first["id"], second["id"]]
        assert queue[0]["iban"].startswith("IR") and "*" not in queue[0]["iban"]
        with mock.patch("wallet.services.send_withdrawal_paid_sms.delay") as sms:
            res = admin.post(
                f"/api/v1/admin/withdrawals/{first['id']}/approve",
                {"bank_reference": "BR-123"},
                format="json",
            )
        assert res.json()["status"] == "paid"
        res = admin.post(
            f"/api/v1/admin/withdrawals/{second['id']}/reject", {"reason": "wrong sheba"}, format="json"
        )
        assert res.json()["status"] == "rejected"
        w = c.get("/api/v1/wallet").json()
        assert (w["balance"], w["locked"]) == (700, 0)
        assert WithdrawalRequest.objects.get(id=first["id"]).bank_reference == "BR-123"
        assert AdminAudit.objects.filter(action__startswith="withdrawal.").count() == 2
        assert invariants.check() == []
        sms.assert_not_called()  # on_commit never fires inside the test transaction


@pytest.mark.django_db
class TestAdminTopup:
    def test_topup_is_audited_idempotent_and_capped(self):
        make_admin("fin", "finance")
        admin = admin_client("fin")
        user = make_user()
        url = f"/api/v1/admin/users/{user.id}/wallet/topup"
        res = admin.post(
            url, {"amount": 500, "reason": "support ticket 12"}, format="json", HTTP_IDEMPOTENCY_KEY="t1"
        )
        assert res.json() == {"balance_before": 0, "balance_after": 500, "created": True}
        res = admin.post(
            url, {"amount": 500, "reason": "support ticket 12"}, format="json", HTTP_IDEMPOTENCY_KEY="t1"
        )
        assert res.json()["created"] is False and Wallet.objects.get(user=user).balance == 500
        audit = AdminAudit.objects.get(action="wallet.topup")
        assert audit.before == {"balance": 0} and audit.after == {"balance": 500, "amount": 500}
        res = admin.post(
            url, {"amount": 10_001, "reason": "too much"}, format="json", HTTP_IDEMPOTENCY_KEY="t2"
        )
        assert res.json()["code"] == "TOPUP_ABOVE_CAP"
        assert LedgerEntry.objects.filter(type="admin_topup").count() == 2

    def test_support_role_cannot_top_up(self):
        make_admin("helper", "support")
        user = make_user()
        res = admin_client("helper").post(
            f"/api/v1/admin/users/{user.id}/wallet/topup",
            {"amount": 5, "reason": "x y z"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="t",
        )
        assert res.status_code == 403

    def test_user_search(self):
        make_admin()
        make_user("Findme_1")
        rows = admin_client().get("/api/v1/admin/users", {"q": "findme"}).json()["results"]
        assert [r["username"] for r in rows] == ["Findme_1"]
