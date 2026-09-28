"""Account links (CLAUDE.md §12.2 multi_account): accounts that share a device. Until device
fingerprints arrive (§17 step 14), a device is a sign-in from the same IP with the same user agent
within the last 30 days. Linked accounts are never paired, and their transfers are refused."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from accounts.models import Session

WINDOW = timedelta(days=30)


def _devices(user_id: int) -> set[tuple[str, str]]:
    since = timezone.now() - WINDOW
    rows = Session.objects.filter(user_id=user_id).filter(
        Q(last_used_at__gte=since) | Q(created_at__gte=since)
    )
    return {(ip, ua) for ip, ua in rows.values_list("ip", "user_agent") if ip}


def are_linked(a: int, b: int) -> bool:
    if a == b:
        return True
    return bool(_devices(a) & _devices(b))
