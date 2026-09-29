"""Financial, game, and user reports for the admin panel (CLAUDE.md §13). Days are Tehran days; every
report takes an inclusive date range and is also exported as CSV by the views."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

from django.db.models import Avg, Count, F, Q, Sum
from django.db.models.functions import TruncDate

from accounts.models import User
from antifraud.models import FraudFlag
from game.models import Match, MatchEvent
from payments.models import Payment
from realtime import live
from reports.activity import TEHRAN, online_count, today
from reports.models import DiceTest, QueueWait, UserActivity
from wallet.ledger import PLATFORM_PAYOUTS, PLATFORM_RAKE, PLATFORM_SINKS
from wallet.models import LedgerEntry, TxType, Wallet, WithdrawalRequest

MAX_DAYS = 366


def bounds(first: date, last: date) -> tuple[datetime, datetime]:
    """The instants covering Tehran days first..last."""
    return (
        datetime.combine(first, time.min, tzinfo=TEHRAN),
        datetime.combine(last + timedelta(days=1), time.min, tzinfo=TEHRAN),
    )


def _days(first: date, last: date) -> list[date]:
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def _by_day(qs: Any, field: str, **aggs: Any) -> dict[date, dict[str, Any]]:
    rows = qs.annotate(day=TruncDate(field, tzinfo=TEHRAN)).values("day").annotate(**aggs)
    return {row["day"]: row for row in rows}


# ---- dashboard ----


def dashboard() -> dict[str, Any]:
    start, end = bounds(today(), today())
    sales = Payment.objects.filter(
        status=Payment.Status.VERIFIED, verified_at__gte=start, verified_at__lt=end
    ).aggregate(rial=Sum("amount_rial"), n=Count("id"))
    entries = LedgerEntry.objects.filter(created_at__gte=start, created_at__lt=end)
    topups = entries.filter(type=TxType.ADMIN_TOPUP, account__startswith="user:").aggregate(s=Sum("amount"))
    rake = entries.filter(account=PLATFORM_RAKE).aggregate(s=Sum("amount"))
    return {
        "online_users": online_count(),
        "live_matches": live.r().scard(live.LIVE_SET),
        "today": {
            "sales_rial": sales["rial"] or 0,
            "payments": sales["n"],
            "topup_coins": topups["s"] or 0,
            "rake_coins": rake["s"] or 0,
            "signups": User.objects.filter(created_at__gte=start, created_at__lt=end).count(),
        },
        "open_fraud_flags": FraudFlag.objects.filter(status=FraudFlag.Status.OPEN).count(),
        "pending_withdrawals": WithdrawalRequest.objects.filter(
            status=WithdrawalRequest.Status.PENDING
        ).count(),
        "dice_test": dice_test_payload(DiceTest.objects.order_by("-created_at").first()),
    }


def dice_test_payload(test: DiceTest | None) -> dict[str, Any] | None:
    if test is None:
        return None
    return {
        "period_start": test.period_start.isoformat(),
        "period_end": test.period_end.isoformat(),
        "dice": test.dice,
        "counts": test.counts,
        "chi_square": round(test.chi_square, 4),
        "p_value": round(test.p_value, 6),
        "created_at": test.created_at.isoformat(),
    }


# ---- financial ----

# What each column sums: (account filter, transaction types or None for all). Coins entering the
# account are positive.
_REWARDS = [TxType.SIGNUP_BONUS, TxType.LEVEL_REWARD, TxType.ACHIEVEMENT_REWARD]
FINANCIAL_COLUMNS = [
    "sales_rial",
    "payments",
    "purchased_coins",
    "topup_coins",
    "rewards_coins",
    "sinks_coins",
    "rake_table",
    "rake_prediction",
    "rake_tournament",
    "rake_fees",
    "referral_paid",
    "withdrawn_coins",
    "adjustments_coins",
]


def financial(first: date, last: date) -> dict[str, Any]:
    start, end = bounds(first, last)
    payments = _by_day(
        Payment.objects.filter(status=Payment.Status.VERIFIED, verified_at__gte=start, verified_at__lt=end),
        "verified_at",
        rial=Sum("amount_rial"),
        n=Count("id"),
    )
    entries = LedgerEntry.objects.filter(created_at__gte=start, created_at__lt=end)
    users = entries.filter(account__startswith="user:")
    rake = entries.filter(account=PLATFORM_RAKE)

    def col(qs: Any) -> dict[date, int]:
        return {d: row["s"] or 0 for d, row in _by_day(qs, "created_at", s=Sum("amount")).items()}

    cols = {
        "purchased_coins": col(users.filter(type=TxType.PURCHASE)),
        "topup_coins": col(users.filter(type=TxType.ADMIN_TOPUP)),
        "rewards_coins": col(users.filter(type__in=_REWARDS)),
        "sinks_coins": col(entries.filter(account=PLATFORM_SINKS)),
        "rake_table": col(rake.filter(type__in=[TxType.MATCH_PAYOUT, TxType.RAKE])),
        "rake_prediction": col(rake.filter(type=TxType.PREDICTION_PAYOUT)),
        "rake_tournament": col(rake.filter(type=TxType.TOURNAMENT_PRIZE)),
        "rake_fees": col(rake.filter(type__in=[TxType.TRANSFER, TxType.WITHDRAWAL_PAYOUT])),
        "referral_paid": col(users.filter(type=TxType.REFERRAL_COMMISSION)),
        "withdrawn_coins": col(entries.filter(account=PLATFORM_PAYOUTS)),
        "adjustments_coins": col(users.filter(type=TxType.ADMIN_ADJUSTMENT)),
    }
    rows: list[dict[str, Any]] = []
    for d in _days(first, last):
        pay = payments.get(d, {})
        row: dict[str, Any] = {"day": d.isoformat()}
        row.update(sales_rial=pay.get("rial") or 0, payments=pay.get("n") or 0)
        row.update({name: values.get(d, 0) for name, values in cols.items()})
        rows.append(row)
    totals = {c: sum(r[c] for r in rows) for c in FINANCIAL_COLUMNS}
    packages = (
        Payment.objects.filter(status=Payment.Status.VERIFIED, verified_at__gte=start, verified_at__lt=end)
        .values("coins")
        .annotate(n=Count("id"), rial=Sum("amount_rial"))
        .order_by("coins")
    )
    escrow = LedgerEntry.objects.filter(account__startswith="escrow:").aggregate(s=Sum("amount"))
    return {
        "rows": rows,
        "totals": totals,
        "by_package": [{"coins": p["coins"], "payments": p["n"], "rial": p["rial"]} for p in packages],
        "balances": {
            "users": Wallet.objects.aggregate(s=Sum("balance"))["s"] or 0,
            "escrow": escrow["s"] or 0,
        },
        "reconciliation": reconciliation(first, last),
    }


def reconciliation(first: date, last: date) -> list[dict[str, Any]]:
    from payments.models import ReconciliationRun

    return [
        {
            "day": run.day.isoformat(),
            "gateway": run.gateway,
            "verified": run.verified_count,
            "verified_rial": run.verified_rial,
            "problems": run.problems,
        }
        for run in ReconciliationRun.objects.filter(day__gte=first, day__lte=last).order_by("day")
    ]


# ---- game analytics ----


def games(first: date, last: date) -> dict[str, Any]:
    start, end = bounds(first, last)
    ended = Match.objects.filter(ended_at__gte=start, ended_at__lt=end).exclude(status=Match.Status.ACTIVE)
    human = ended.filter(is_bot=False)
    total = human.count()
    reasons = dict(human.values_list("end_reason").annotate(n=Count("id")).values_list("end_reason", "n"))
    disconnected = (
        MatchEvent.objects.filter(match__in=human, type="opponent.disconnected")
        .values("match_id")
        .distinct()
        .count()
    )
    finished = human.filter(status=Match.Status.FINISHED, started_at__isnull=False)
    duration = finished.aggregate(d=Avg(F("ended_at") - F("started_at")))["d"]
    by = (
        ended.values("variant", "entry", "is_bot")
        .annotate(n=Count("id"), aborted=Count("id", filter=Q(status=Match.Status.ABORTED)))
        .order_by("is_bot", "entry", "variant")
    )
    waits = QueueWait.objects.filter(created_at__gte=start, created_at__lt=end).aggregate(
        avg=Avg("seconds"), n=Count("id")
    )
    per_day = _by_day(ended, "ended_at", n=Count("id"), bots=Count("id", filter=Q(is_bot=True)))
    return {
        "rows": [
            {
                "day": d.isoformat(),
                "matches": per_day.get(d, {}).get("n", 0),
                "bot_matches": per_day.get(d, {}).get("bots", 0),
            }
            for d in _days(first, last)
        ],
        "by_table": [
            {
                "variant": row["variant"],
                "entry": row["entry"],
                "bot": row["is_bot"],
                "matches": row["n"],
                "aborted": row["aborted"],
            }
            for row in by
        ],
        "human_matches": total,
        "avg_duration_seconds": int(duration.total_seconds()) if duration else None,
        "resign_rate_pct": _pct(reasons.get("resign", 0), total),
        "timeout_forfeit_rate_pct": _pct(reasons.get("forfeit:timeouts", 0), total),
        "disconnect_rate_pct": _pct(disconnected, total),
        "disconnect_forfeit_rate_pct": _pct(reasons.get("forfeit:disconnect", 0), total),
        "end_reasons": reasons,
        "queue_wait": {"avg_seconds": round(waits["avg"] or 0, 1), "samples": waits["n"]},
        "dice_tests": [
            dice_test_payload(t)
            for t in DiceTest.objects.filter(created_at__gte=start, created_at__lt=end).order_by("created_at")
        ],
    }


def _pct(part: int, whole: int) -> float:
    return round(part * 100 / whole, 2) if whole else 0.0


# ---- user analytics ----


def users(first: date, last: date) -> dict[str, Any]:
    start, end = bounds(first, last)
    joined = User.objects.filter(created_at__gte=start, created_at__lt=end)
    signups = _by_day(joined, "created_at", n=Count("id"))
    dau = dict(
        UserActivity.objects.filter(day__gte=first, day__lte=last)
        .values("day")
        .annotate(n=Count("user_id", distinct=True))
        .values_list("day", "n")
    )
    rows = []
    for d in _days(first, last):
        mau = (
            UserActivity.objects.filter(day__gt=d - timedelta(days=30), day__lte=d)
            .values("user_id")
            .distinct()
            .count()
        )
        rows.append(
            {
                "day": d.isoformat(),
                "signups": signups.get(d, {}).get("n", 0),
                "dau": dau.get(d, 0),
                "mau": mau,
            }
        )
    cohort = list(joined.values_list("id", "created_at"))
    retention = _retention(cohort)
    paid_users = _paying_users(start, end)
    revenue = (
        Payment.objects.filter(
            status=Payment.Status.VERIFIED, verified_at__gte=start, verified_at__lt=end
        ).aggregate(s=Sum("amount_rial"))["s"]
        or 0
    )
    cohort_ids = {uid for uid, _ in cohort}
    converted = len(cohort_ids & _paying_users(start, None))
    return {
        "rows": rows,
        "signups": len(cohort),
        "retention_pct": retention,
        "purchase_conversion_pct": _pct(converted, len(cohort)),
        "paying_users": len(paid_users),
        "revenue_rial": revenue,
        "arppu_rial": revenue // len(paid_users) if paid_users else 0,
    }


def _paying_users(start: datetime, end: datetime | None) -> set[int]:
    """Users with a verified gateway purchase in the period (admin top-ups are not revenue here)."""
    qs = Payment.objects.filter(status=Payment.Status.VERIFIED, verified_at__gte=start)
    if end is not None:
        qs = qs.filter(verified_at__lt=end)
    return set(qs.values_list("user_id", flat=True))


def _retention(cohort: list[tuple[int, datetime]]) -> dict[str, float | None]:
    """D1/D7/D30: the share of the period's signups active exactly N days after their signup day,
    counting only users whose day N has already happened."""
    active: dict[int, set[date]] = defaultdict(set)
    ids = [uid for uid, _ in cohort]
    for uid, day in UserActivity.objects.filter(user_id__in=ids).values_list("user_id", "day"):
        active[uid].add(day)
    now = today()
    out: dict[str, float | None] = {}
    for n in (1, 7, 30):
        eligible = [(uid, created.astimezone(TEHRAN).date()) for uid, created in cohort]
        eligible = [(uid, d) for uid, d in eligible if d + timedelta(days=n) <= now]
        kept = sum(1 for uid, d in eligible if d + timedelta(days=n) in active[uid])
        out[f"d{n}"] = _pct(kept, len(eligible)) if eligible else None
    return out
