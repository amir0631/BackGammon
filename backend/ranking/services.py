"""ELO, XP, levels, and leaderboards (CLAUDE.md §8).

ELO: E_a = 1 / (1 + 10^((R_b - R_a) / 400)); K = elo.k_new for a player's first elo.new_threshold rated
matches, then elo.k; K times sqrt(match length); rounded. Only human-vs-human matches are rated.
Leaderboards live in Redis sorted sets, updated after each rated match and rebuilt nightly.
"""

import math
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounts.models import User
from ranking.models import EloHistory, XpHistory
from settingsapp import registry

LB_ALL = "lb:elo"


def expected(r_a: int, r_b: int) -> float:
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))


def _k(user: User) -> int:
    rated = EloHistory.objects.filter(user=user).count()
    return int(
        registry.get("elo.k_new") if rated < registry.get("elo.new_threshold") else registry.get("elo.k")
    )


def rate_match(match: Any, a: User, b: User, winner_side: int) -> dict[str, int]:
    """Updates both ratings in the caller's transaction; returns {"a": delta, "b": delta}."""
    first, second = sorted([a, b], key=lambda u: u.id)
    locked = {
        u.id: u for u in User.objects.select_for_update().filter(id__in=[first.id, second.id]).order_by("id")
    }
    ua, ub = locked[a.id], locked[b.id]
    scale = math.sqrt(match.length)
    score_a = 1.0 if winner_side == 0 else 0.0
    delta_a = round(_k(ua) * scale * (score_a - expected(ua.elo, ub.elo)))
    delta_b = round(_k(ub) * scale * ((1 - score_a) - expected(ub.elo, ua.elo)))
    for user, delta in ((ua, delta_a), (ub, delta_b)):
        EloHistory.objects.create(
            user=user, match=match, before=user.elo, after=user.elo + delta, delta=delta
        )
        user.elo += delta
        user.save(update_fields=["elo"])
    transaction.on_commit(lambda: _leaderboard_update([(ua.id, ua.elo, delta_a), (ub.id, ub.elo, delta_b)]))
    return {"a": delta_a, "b": delta_b}


def level_for(xp: int) -> int:
    return 1 + sum(1 for threshold in registry.get("xp.level_thresholds") if xp >= threshold)


def grant_xp(user: User, amount: int, reason: str, match: Any = None) -> int:
    """Adds XP in the caller's transaction and updates the level; returns the new level."""
    if amount <= 0:
        return user.level
    locked = User.objects.select_for_update().get(pk=user.pk)
    locked.xp += amount
    locked.level = level_for(locked.xp)
    locked.save(update_fields=["xp", "level"])
    XpHistory.objects.create(user=locked, match=match, amount=amount, reason=reason)
    return locked.level


# ---- leaderboards ----


def _period_keys(when: datetime) -> tuple[str, str]:
    iso = when.isocalendar()
    return f"lb:week:{iso.year}-{iso.week:02d}", f"lb:month:{when:%Y-%m}"


def _leaderboard_update(rows: list[tuple[int, int, int]]) -> None:
    from realtime.live import r

    week, month = _period_keys(timezone.now())
    pipe = r().pipeline()
    for user_id, elo, delta in rows:
        pipe.zadd(LB_ALL, {str(user_id): elo})
        pipe.zincrby(week, delta, str(user_id))
        pipe.zincrby(month, delta, str(user_id))
    pipe.expire(week, 60 * 60 * 24 * 60)
    pipe.expire(month, 60 * 60 * 24 * 400)
    pipe.execute()


def rebuild_leaderboards() -> None:
    """Nightly (§8): recompute every board from PostgreSQL."""
    from realtime.live import r

    now = timezone.now()
    week, month = _period_keys(now)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rated = User.objects.filter(elo_history__isnull=False).distinct().exclude(status=User.Status.BANNED)
    pipe = r().pipeline()
    pipe.delete(LB_ALL, week, month)
    for uid, elo in rated.values_list("id", "elo"):
        pipe.zadd(LB_ALL, {str(uid): elo})
    for key, since in ((week, week_start), (month, month_start)):
        gains = (
            EloHistory.objects.filter(created_at__gte=since).values("user_id").annotate(total=Sum("delta"))
        )
        for row in gains:
            pipe.zadd(key, {str(row["user_id"]): row["total"]})
    pipe.execute()


def leaderboard(scope: str, limit: int = 50, me: User | None = None) -> dict[str, Any]:
    from realtime.live import r

    week, month = _period_keys(timezone.now())
    key = {"all": LB_ALL, "weekly": week, "monthly": month}[scope]
    top = r().zrevrange(key, 0, limit - 1, withscores=True)
    ids = [int(uid) for uid, _ in top]
    users = {u.id: u for u in User.objects.filter(id__in=ids).exclude(status=User.Status.BANNED)}
    rows = [
        {
            "rank": i + 1,
            "username": users[int(uid)].username,
            "avatar": users[int(uid)].avatar,
            "level": users[int(uid)].level,
            "value": int(score),
        }
        for i, (uid, score) in enumerate(top)
        if int(uid) in users
    ]
    mine = None
    if me is not None:
        rank = r().zrevrank(key, str(me.id))
        score = r().zscore(key, str(me.id))
        if rank is not None and score is not None:
            mine = {"rank": int(rank) + 1, "value": int(score)}
    return {"scope": scope, "results": rows, "me": mine}
