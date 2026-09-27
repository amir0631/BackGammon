"""Fixed-window counters in Redis (through the Django cache)."""

from django.core.cache import cache


def hit(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Count one event. Returns (allowed, seconds until the window resets)."""
    full = f"rl:{key}"
    cache.add(full, 0, timeout=window_seconds)
    count = cache.incr(full)
    ttl = _ttl(full, window_seconds)
    return count <= limit, ttl


def _ttl(key: str, fallback: int) -> int:
    ttl_fn = getattr(cache, "ttl", None)
    if ttl_fn is None:
        return fallback
    ttl = ttl_fn(key)
    return int(ttl) if ttl and ttl > 0 else fallback
