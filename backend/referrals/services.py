"""Referral commissions (CLAUDE.md §7.4).

commission = floor(base * referral.pct / 100), base = the referee's entry (referral.base
"referee_entry") or the pot ("pot"); paid from platform:rake in the settlement transaction, once per
match per referred player, never more than the match's rake. Active once the referee's phone is
verified and their wallet has been funded (a purchase, or a support top-up while payments are off),
within referral.duration_days of signup (0 = no limit). Skipped when the accounts are linked.
"""

from datetime import timedelta
from typing import Any

from django.db.models import Count, Sum
from django.utils import timezone

from accounts.models import User
from antifraud.links import link_reasons
from referrals.models import ReferralEarning
from settingsapp import registry
from wallet import ledger
from wallet.models import LedgerEntry, TxType


def _funded(user_id: int) -> bool:
    return LedgerEntry.objects.filter(
        account=ledger.user_account(user_id), type__in=[TxType.PURCHASE, TxType.ADMIN_TOPUP], amount__gt=0
    ).exists()


def active(referee: User) -> bool:
    if referee.referrer_id is None or referee.phone_verified_at is None or not _funded(referee.id):
        return False
    days = registry.get("referral.duration_days")
    return not days or timezone.now() - referee.created_at <= timedelta(days=days)


def pay_commissions(match: Any, players: list[User], rake: int) -> list[dict[str, int]]:
    """Runs inside the settlement transaction. Returns what was paid."""
    pct = registry.get("referral.pct")
    base_kind = registry.get("referral.base")
    remaining = rake
    paid = []
    for referee in players:
        if remaining <= 0 or not active(referee):
            continue
        if ReferralEarning.objects.filter(match=match, referee=referee).exists():
            continue  # once per match per referred player
        referrer_id = referee.referrer_id
        assert referrer_id is not None
        referrer = User.objects.filter(pk=referrer_id).exclude(status=User.Status.BANNED).first()
        if referrer is None:
            continue
        base = match.entry * 2 if base_kind == "pot" else match.entry
        amount = min(base * pct // 100, remaining)
        if amount <= 0:
            continue
        if reasons := link_reasons(referrer.id, referee.id):
            # referral_farm (§12.2): hold the commission until the review decides.
            earning = ReferralEarning.objects.create(
                referrer=referrer,
                referee=referee,
                match=match,
                amount=amount,
                base=base,
                status=ReferralEarning.Status.HELD,
            )
            from antifraud.rules import Rule, flag

            evidence = {"reason": reasons, "earning": earning.id, "amount": amount}
            flag(Rule.REFERRAL_FARM, referrer, referee, match, evidence=evidence)
            continue
        _pay(referrer.id, referee.id, match.id, amount)
        ReferralEarning.objects.create(
            referrer=referrer, referee=referee, match=match, amount=amount, base=base
        )
        remaining -= amount
        paid.append({"referrer": referrer.id, "referee": referee.id, "amount": amount})
    return paid


def summary(user: User) -> dict[str, Any]:
    referees = User.objects.filter(referrer=user)
    total = ReferralEarning.objects.filter(referrer=user, status=ReferralEarning.Status.PAID).aggregate(
        s=Sum("amount"), n=Count("id")
    )
    held = ReferralEarning.objects.filter(referrer=user, status=ReferralEarning.Status.HELD).aggregate(
        s=Sum("amount")
    )
    from django.conf import settings

    return {
        "code": user.referral_code,
        "link": f"{settings.URL_SCHEME}://m.{settings.BASE_DOMAIN}/signup?ref={user.referral_code}",
        "held": held["s"] or 0,
        "referees": referees.count(),
        "active_referees": sum(1 for r in referees if active(r)),
        "earned": total["s"] or 0,
        "commissions": total["n"],
        "pct": registry.get("referral.pct"),
        "base": registry.get("referral.base"),
        "duration_days": registry.get("referral.duration_days"),
    }


def _pay(referrer_id: int, referee_id: int, match_id: Any, amount: int) -> None:
    ledger.ensure_wallet(referrer_id)
    ledger.post(
        TxType.REFERRAL_COMMISSION,
        [(ledger.PLATFORM_RAKE, -amount), (ledger.user_account(referrer_id), amount)],
        idempotency_key=f"referral:{match_id}:{referee_id}",
        ref_type="match",
        ref_id=match_id,
    )


def release_held(earning_id: int, pay: bool) -> ReferralEarning:
    """The review's decision on a held commission: pay it from the rake, or cancel it."""
    earning = ReferralEarning.objects.select_for_update().get(pk=earning_id)
    if earning.status != ReferralEarning.Status.HELD:
        return earning
    if pay:
        _pay(earning.referrer_id, earning.referee_id, earning.match_id, earning.amount)
        earning.status = ReferralEarning.Status.PAID
    else:
        earning.status = ReferralEarning.Status.CANCELLED
    earning.save(update_fields=["status"])
    return earning
