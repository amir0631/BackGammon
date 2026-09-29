from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from game.models import Match
from referrals.models import ReferralEarning
from referrals.services import pay_commissions
from settingsapp import registry
from wallet import invariants
from wallet import services as wallet
from wallet.ledger import PLATFORM_RAKE
from wallet.models import LedgerEntry, Wallet
from wallet.tests.helpers import fund, make_user


def setup(verified=True, funded=True):
    referrer = make_user("Ref_1")
    referee = make_user()
    referee.referrer = referrer
    referee.phone_verified_at = timezone.now() if verified else None
    referee.save()
    other = make_user()
    if funded:
        for u in (referee, other):
            fund(u, 500)
    match = Match.objects.create(
        variant="standard_nocube",
        length=1,
        entry=100,
        player_a=referee,
        player_b=other,
        seed_commit="c",
        seed_encrypted="e",
    )
    if funded:
        wallet.escrow_match_entries(match.id, [referee.id, other.id], 100)
    return referrer, referee, other, match


@pytest.mark.django_db
class TestCommission:
    def test_paid_from_rake_once(self):
        referrer, referee, other, match = setup()
        settlement = wallet.settle_match(match.id, other.id, 100, 10)
        paid = pay_commissions(match, [referee, other], settlement["rake"])
        assert paid == [{"referrer": referrer.id, "referee": referee.id, "amount": 1}]  # 1% of 100
        assert Wallet.objects.get(user=referrer).balance == 1
        assert sum(LedgerEntry.objects.filter(account=PLATFORM_RAKE).values_list("amount", flat=True)) == 19
        assert pay_commissions(match, [referee, other], settlement["rake"]) == []  # never twice
        assert ReferralEarning.objects.count() == 1
        assert invariants.check() == []

    def test_pot_base_and_capped_by_rake(self):
        registry.set_value("referral.base", "pot")
        registry.set_value("referral.pct", 10)
        _referrer, referee, other, match = setup()
        settlement = wallet.settle_match(match.id, other.id, 100, 5)  # rake 10
        # 10% of the 200 pot is 20, but never more than the match's rake.
        assert pay_commissions(match, [referee, other], settlement["rake"])[0]["amount"] == 10

    @pytest.mark.parametrize("kwargs", [{"verified": False}, {"funded": False}])
    def test_not_active_without_funding_or_verified_phone(self, kwargs):
        _referrer, referee, other, match = setup(**kwargs)
        assert pay_commissions(match, [referee, other], 20) == []

    def test_duration_limit(self):
        registry.set_value("referral.duration_days", 1)
        _referrer, referee, other, match = setup()
        referee.created_at = timezone.now() - timedelta(days=5)
        referee.save()
        assert pay_commissions(match, [referee, other], 20) == []

    def test_summary_endpoints(self):
        referrer, referee, other, match = setup()
        settlement = wallet.settle_match(match.id, other.id, 100, 10)
        pay_commissions(match, [referee, other], settlement["rake"])
        c = APIClient()
        c.force_authenticate(user=referrer)
        summary = c.get("/api/v1/me/referral").json()
        assert (
            summary["code"] == referrer.referral_code and summary["referees"] == 1 and summary["earned"] == 1
        )
        # The root domain: it redirects to the right surface with the query kept (§11.0).
        assert (
            summary["link"] == f"http://localhost/signup?ref={referrer.referral_code}"
            and summary["held"] == 0
        )
        rows = c.get("/api/v1/me/referral/earnings").json()["results"]
        assert rows[0]["amount"] == 1 and rows[0]["status"] == "paid" and "phone" not in str(rows)
