from datetime import date

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from payments import services
from payments.models import Payment
from settingsapp import registry
from wallet import invariants
from wallet import services as wallet_services
from wallet.models import LedgerEntry, Wallet
from wallet.tests.helpers import make_user


def client(user):
    c = APIClient(HTTP_HOST="m.localhost")
    c.force_authenticate(user=user)
    return c


def checkout(c, body, key="k1"):
    return c.post("/api/v1/shop/checkout", body, format="json", HTTP_IDEMPOTENCY_KEY=key)


@pytest.mark.django_db
class TestPurchase:
    def test_disabled_until_a_gateway_is_connected(self):
        c = client(make_user())
        listing = c.get("/api/v1/shop/packages").json()
        assert listing["enabled"] is False and [p["coins"] for p in listing["results"]] == [
            50,
            100,
            500,
            1000,
        ]
        assert listing["results"][0]["price_toman"] == 50_000
        assert checkout(c, {"package_id": listing["results"][0]["id"]}).json()["code"] == "PAYMENTS_DISABLED"

    def test_sandbox_purchase_credits_once_after_verify(self):
        registry.set_value("payments.enabled", True)
        user = make_user()
        wallet_services.grant_signup_bonus(user)
        c = client(user)
        package = c.get("/api/v1/shop/packages").json()["results"][1]
        res = checkout(c, {"package_id": package["id"], "surface": "m"})
        assert res.status_code == 201
        body = res.json()
        assert body["status"] == "pending" and body["amount_toman"] == 100_000
        page = body["redirect_url"].split("m.localhost")[1]
        assert "درگاه" in c.get(page).content.decode()
        back = c.post(page, {"action": "pay"})
        assert back.status_code == 302 and "/api/v1/payments/callback?authority=" in back["Location"]
        result = c.get(back["Location"].split("m.localhost")[1])
        assert result.status_code == 302 and result["Location"].startswith(
            "http://m.localhost/shop/coins/result?payment="
        )
        payment = Payment.objects.get()
        assert payment.status == "verified" and payment.reference
        assert Wallet.objects.get(user=user).balance == 200
        # A repeated callback does not credit again, and the purchase unlocks the signup bonus.
        c.get(back["Location"].split("m.localhost")[1])
        assert LedgerEntry.objects.filter(type="purchase", account=f"user:{user.id}").count() == 1
        summary = c.get("/api/v1/wallet").json()
        assert summary["bonus_locked"] == 0 and summary["withdrawable"] == 200
        assert c.get(f"/api/v1/payments/{payment.id}").json()["status"] == "verified"
        assert services.reconcile(date.today()) == []
        assert invariants.check() == []

    def test_cancelled_payment_credits_nothing(self):
        registry.set_value("payments.enabled", True)
        user = make_user()
        c = client(user)
        res = checkout(c, {"custom_toman": 25_000})
        page = res.json()["redirect_url"].split("m.localhost")[1]
        back = c.post(page, {"action": "cancel"})
        c.get(back["Location"].split("m.localhost")[1])
        assert Payment.objects.get().status == "failed"
        assert Wallet.objects.filter(user=user, balance__gt=0).count() == 0

    @pytest.mark.parametrize(
        ("body", "reason"),
        [
            ({"custom_toman": 5_000}, "range"),
            ({"custom_toman": 10_500}, "multiple"),
            ({"package_id": 999}, "package"),
            ({}, "missing"),
        ],
    )
    def test_amount_rules(self, body, reason):
        registry.set_value("payments.enabled", True)
        res = checkout(client(make_user()), body)
        assert res.json()["code"] == "PAYMENT_AMOUNT_INVALID" and res.json()["details"]["reason"] == reason

    def test_checkout_is_idempotent_and_callback_returns_to_the_same_surface(self):
        registry.set_value("payments.enabled", True)
        c = client(make_user())
        first = checkout(c, {"custom_toman": 30_000, "surface": "app"}).json()
        again = checkout(c, {"custom_toman": 30_000, "surface": "app"}).json()
        assert first["id"] == again["id"] and Payment.objects.count() == 1
        assert services.callback_url("app") == "http://app.localhost/api/v1/payments/callback"
        assert c.get("/api/v1/payments/not-a-uuid").status_code == 404

    def test_reconcile_flags_a_payment_the_gateway_does_not_know(self):
        registry.set_value("payments.enabled", True)
        user = make_user()
        Payment.objects.create(
            user=user,
            coins=10,
            price_toman=1000,
            amount_rial=100_000,
            gateway="sandbox",
            authority="SBx",
            reference="R1",
            status="verified",
            idempotency_key="z",
            verified_at=timezone.now(),
        )
        assert services.reconcile(date.today())
