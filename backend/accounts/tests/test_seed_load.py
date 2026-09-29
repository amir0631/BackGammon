from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from accounts.models import User
from wallet import invariants, ledger
from wallet.models import TxType, Wallet


def seed(**options):
    out = StringIO()
    call_command("seed_load", stdout=out, **options)
    return out.getvalue()


@pytest.mark.django_db
def test_seeds_players_that_sign_in_and_rerun_tops_balances_up():
    seed(count=3, coins=1000, password="Load-pass-1")
    assert list(User.objects.order_by("id").values_list("username", flat=True)) == [
        "load0001",
        "load0002",
        "load0003",
    ]
    assert [w.balance for w in Wallet.objects.order_by("user_id")] == [1000, 1000, 1000]
    res = APIClient().post(
        "/api/v1/auth/login", {"phone": "09010000003", "password": "Load-pass-1"}, format="json"
    )
    assert res.status_code == 200, res.json()

    spender = User.objects.get(username="load0002")
    ledger.post(
        TxType.SHOP_PURCHASE,
        [(ledger.user_account(spender.id), -300), (ledger.PLATFORM_SINKS, 300)],
        idempotency_key="test:spend",
    )
    seed(count=3, coins=1000, password="Load-pass-1")
    assert User.objects.count() == 3
    assert [w.balance for w in Wallet.objects.order_by("user_id")] == [1000, 1000, 1000]
    assert invariants.check() == []


@pytest.mark.django_db
def test_refused_in_production(settings):
    settings.APP_ENV = "production"
    with pytest.raises(CommandError):
        seed(password="x")
