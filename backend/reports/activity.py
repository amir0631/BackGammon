"""Who is online and who was active today (CLAUDE.md §13 dashboard and user analytics)."""

import time
from datetime import date
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.db import IntegrityError
from django.utils import timezone

from realtime import live

TEHRAN = ZoneInfo("Asia/Tehran")  # report days are Iranian calendar days
SEEN = "rt:seen"  # user id -> last HTTP activity (epoch seconds)
SOCKETS = "rt:sockets"  # "<user id>:<channel>" -> connected at (epoch seconds)
ONLINE_SECONDS = 300
STALE_SOCKET_SECONDS = 24 * 3600  # a socket left behind by a crashed worker


def today() -> date:
    return timezone.now().astimezone(TEHRAN).date()


def touch(user_id: int) -> None:
    """Called on authenticated requests; cheap after the first call of the minute."""
    if not cache.add(f"act:{user_id}", 1, timeout=60):
        return
    live.r().zadd(SEEN, {str(user_id): time.time()})
    day = today()
    if cache.add(f"act:{user_id}:{day.isoformat()}", 1, timeout=26 * 3600):
        from reports.models import UserActivity

        try:
            UserActivity.objects.get_or_create(user_id=user_id, day=day)
        except IntegrityError:  # a concurrent request recorded it
            pass


def socket_opened(user_id: int, channel: str) -> None:
    live.r().zadd(SOCKETS, {f"{user_id}:{channel}": time.time()})
    touch(user_id)


def socket_closed(user_id: int, channel: str) -> None:
    live.r().zrem(SOCKETS, f"{user_id}:{channel}")


def online_count() -> int:
    """Users with an open socket or an HTTP request in the last five minutes."""
    now = time.time()
    r = live.r()
    r.zremrangebyscore(SOCKETS, 0, now - STALE_SOCKET_SECONDS)
    r.zremrangebyscore(SEEN, 0, now - ONLINE_SECONDS)
    users = {m.split(":", 1)[0] for m in r.zrange(SOCKETS, 0, -1)}
    users |= set(r.zrange(SEEN, 0, -1))
    return len(users)
