"""Prediction pools (CLAUDE.md §7.5).

pool = total_a + total_b; rake = floor(pool x rake_pct / 100); distributable = pool - rake;
payout_i = floor(stake_i x distributable / winning_side_total); dust to platform:rake. One side empty,
or the match aborted or voided: every stake is refunded, no rake. Stakes go to escrow:pool:{id}.
"""

from typing import Any

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from accounts.models import User
from antifraud.links import are_linked
from config.errors import AppError
from predictions.models import Prediction, PredictionPool
from settingsapp import registry
from wallet import errors as wallet_errors
from wallet import ledger
from wallet.models import TxType


class PredictionError(AppError):
    status_code = 409
    code = "PREDICTION_REFUSED"
    message_key = "errors.predictions.refused"


def _escrow(pool: PredictionPool) -> str:
    return ledger.escrow("pool", pool.id)


def eligible(match: Any) -> bool:
    return (
        bool(registry.get("predict.enabled"))
        and not match.is_bot
        and match.player_b_id is not None
        and match.tournament_id is None
        and match.entry >= registry.get("predict.min_table_entry")
    )


def open_pool(match: Any) -> PredictionPool | None:
    """At match creation (random pairing only; the caller decides that)."""
    if not eligible(match):
        return None
    return PredictionPool.objects.create(
        match=match,
        rake_pct=registry.get("predict.rake_pct"),
        max_stake_per_user=registry.get("predict.max_stake_per_user"),
        max_pool_total=registry.get("predict.max_pool_total"),
    )


def pool_payload(pool: PredictionPool) -> dict[str, Any]:
    return {
        "total_a": pool.total_a,
        "total_b": pool.total_b,
        "open": pool.status == PredictionPool.Status.OPEN,
    }


def blocked(user: User, match: Any) -> str | None:
    """Why this user may not predict on this match (§7.5), or None."""
    if user.id in (match.player_a_id, match.player_b_id):
        return "player"
    for player_id in (match.player_a_id, match.player_b_id):
        if player_id is None:
            continue
        if are_linked(user.id, player_id):
            return "linked"
        player = User.objects.filter(pk=player_id).only("referrer_id").first()
        if user.referrer_id == player_id or (player is not None and player.referrer_id == user.id):
            return "referral"
    return None


def place(user: User, match_id: str, side: int, amount: int, key: str) -> Prediction:
    if side not in (0, 1) or not isinstance(amount, int) or amount <= 0:
        raise wallet_errors.AmountInvalid()
    if user.status == User.Status.SUSPENDED:
        raise wallet_errors.AccountSuspended()
    existing = Prediction.objects.filter(user=user, idempotency_key=key).first()
    if existing is not None:
        return existing
    ledger.ensure_wallet(user.id)
    with transaction.atomic():
        pool = (
            PredictionPool.objects.select_for_update()
            .select_related("match")
            .filter(match_id=match_id)
            .first()
        )
        if pool is None or pool.status != PredictionPool.Status.OPEN:
            raise PredictionError(details={"reason": "closed"})
        if reason := blocked(user, pool.match):
            raise PredictionError(details={"reason": reason})
        mine = Prediction.objects.filter(pool=pool, user=user)
        if mine.exclude(side=side).exists():
            raise PredictionError(details={"reason": "other_side"})
        staked = mine.aggregate(s=Sum("amount"))["s"] or 0
        if staked + amount > pool.max_stake_per_user:
            raise PredictionError(
                details={"reason": "max_stake", "remaining": pool.max_stake_per_user - staked}
            )
        if pool.total_a + pool.total_b + amount > pool.max_pool_total:
            raise PredictionError(details={"reason": "pool_full"})
        ledger.post(
            TxType.PREDICTION_STAKE,
            [(ledger.user_account(user.id), -amount), (_escrow(pool), amount)],
            idempotency_key=f"prediction:{user.id}:{key}",
            ref_type="pool",
            ref_id=pool.id,
        )
        prediction = Prediction.objects.create(
            pool=pool, user=user, side=side, amount=amount, idempotency_key=key
        )
        if side == 0:
            pool.total_a += amount
        else:
            pool.total_b += amount
        pool.save(update_fields=["total_a", "total_b"])
    _announce(pool)
    return prediction


def _announce(pool: PredictionPool) -> None:
    """pool.update to the match's spectators (spectator-only: not in the match record)."""
    from realtime import live

    env = {"type": "pool.update", "match_id": str(pool.match_id), "seq": 0, "payload": pool_payload(pool)}
    live.publisher(str(pool.match_id), [env], True)


def close(match_id: Any) -> None:
    """At the first roll."""
    pool = PredictionPool.objects.filter(match_id=match_id, status=PredictionPool.Status.OPEN).first()
    if pool is None:
        return
    pool.status = PredictionPool.Status.CLOSED
    pool.closed_at = timezone.now()
    pool.save(update_fields=["status", "closed_at"])
    transaction.on_commit(lambda: _announce(pool))


def _refund(pool: PredictionPool) -> None:
    for p in pool.predictions.all():
        ledger.post(
            TxType.PREDICTION_REFUND,
            [(_escrow(pool), -p.amount), (ledger.user_account(p.user_id), p.amount)],
            idempotency_key=f"prediction_refund:{p.id}",
            ref_type="pool",
            ref_id=pool.id,
        )
        p.payout = p.amount
        p.save(update_fields=["payout"])
    pool.status = PredictionPool.Status.REFUNDED
    pool.settled_at = timezone.now()
    pool.save(update_fields=["status", "settled_at"])


def settle(match: Any, winner_side: int | None) -> dict[str, int] | None:
    """In the match's settlement transaction. winner_side None: aborted or voided (refund)."""
    pool = PredictionPool.objects.select_for_update().filter(match=match).first()
    if pool is None or pool.status in (PredictionPool.Status.SETTLED, PredictionPool.Status.REFUNDED):
        return None
    if pool.status == PredictionPool.Status.HELD:
        pool.winner_side = winner_side
        pool.save(update_fields=["winner_side"])
        return None  # settles after the admin decision
    if winner_side is None or pool.total_a == 0 or pool.total_b == 0:
        _refund(pool)
        return {"refunded": pool.total_a + pool.total_b}
    return _pay(pool, winner_side)


def _pay(pool: PredictionPool, winner_side: int) -> dict[str, int]:
    total = pool.total_a + pool.total_b
    rake = total * pool.rake_pct // 100
    distributable = total - rake
    winning_total = pool.total_a if winner_side == 0 else pool.total_b
    paid = 0
    entries: list[tuple[str, int]] = [(_escrow(pool), -total)]
    for p in pool.predictions.order_by("id"):
        payout = p.amount * distributable // winning_total if p.side == winner_side else 0
        p.payout = payout
        p.save(update_fields=["payout"])
        if payout:
            entries.append((ledger.user_account(p.user_id), payout))
            paid += payout
    dust = distributable - paid
    if rake + dust:
        entries.append((ledger.PLATFORM_RAKE, rake + dust))
    ledger.post(
        TxType.PREDICTION_PAYOUT,
        _merge(entries),
        idempotency_key=f"pool_settle:{pool.id}",
        ref_type="pool",
        ref_id=pool.id,
    )
    pool.status = PredictionPool.Status.SETTLED
    pool.winner_side = winner_side
    pool.rake = rake + dust
    pool.settled_at = timezone.now()
    pool.save(update_fields=["status", "winner_side", "rake", "settled_at"])
    return {"pool": total, "rake": rake, "dust": dust, "paid": paid}


def _merge(entries: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """A user with several winning stakes gets one entry (the ledger wants each account once)."""
    merged: dict[str, int] = {}
    for account, amount in entries:
        merged[account] = merged.get(account, 0) + amount
    return [(a, v) for a, v in merged.items() if v]


def release_hold(pool_id: int, approve: bool) -> PredictionPool:
    """Admin decision on a held pool: settle with the recorded result, or refund everyone."""
    with transaction.atomic():
        pool = PredictionPool.objects.select_for_update().get(pk=pool_id)
        if pool.status != PredictionPool.Status.HELD:
            raise PredictionError(details={"reason": "not_held"})
        if approve and pool.winner_side is not None and pool.total_a and pool.total_b:
            _pay(pool, pool.winner_side)
        else:
            _refund(pool)
        return pool


def accuracy_board(min_count: int | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Prediction accuracy leaderboard (§8): settled predictions, at least predict.min_count_for_board."""
    need = registry.get("predict.min_count_for_board") if min_count is None else min_count
    rows = (
        Prediction.objects.filter(pool__status=PredictionPool.Status.SETTLED)
        .values("user_id", "user__username", "user__avatar", "user__level")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(payout__gt=0)))
        .filter(total__gte=need)
    )
    scored = sorted(rows, key=lambda r: (-(r["correct"] / r["total"]), -r["total"], r["user_id"]))[:limit]
    return [
        {
            "rank": i + 1,
            "username": r["user__username"],
            "avatar": r["user__avatar"],
            "level": r["user__level"],
            "value": round(100 * r["correct"] / r["total"]),
            "count": r["total"],
        }
        for i, r in enumerate(scored)
    ]
