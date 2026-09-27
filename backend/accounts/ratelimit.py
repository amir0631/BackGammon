"""Fixed-window counters and lockouts in Redis (through the Django cache).

Django's built-in Redis cache has no TTL lookup, so each window and lock stores its own end time
to report an exact `retry_after`.
"""

import math
import time

from django.core.cache import cache


def _remaining(end_key: str, fallback: int) -> int:
    end = cache.get(end_key)
    return max(1, math.ceil(end - time.time())) if end else fallback


def hit(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Count one event. Returns (allowed, seconds until the window resets)."""
    full = f"rl:{key}"
    if cache.add(full, 0, timeout=window_seconds):
        cache.set(f"{full}:end", time.time() + window_seconds, timeout=window_seconds)
    count = cache.incr(full)
    return count <= limit, _remaining(f"{full}:end", window_seconds)


def reset(key: str) -> None:
    cache.delete_many([f"rl:{key}", f"rl:{key}:end"])


def locked_for(key: str) -> int:
    """Seconds left on a lock, or 0 when not locked."""
    end = cache.get(f"lock:{key}")
    return max(0, math.ceil(end - time.time())) if end else 0


def record_failure(key: str, max_failures: int, lock_seconds: int) -> int:
    """Count a failed attempt; returns the lock length when this failure triggers a lock, else 0."""
    allowed, _ = hit(f"fail:{key}", max_failures - 1, lock_seconds)
    if allowed:
        return 0
    cache.set(f"lock:{key}", time.time() + lock_seconds, timeout=lock_seconds)
    reset(f"fail:{key}")
    return lock_seconds


def clear_failures(key: str) -> None:
    reset(f"fail:{key}")
