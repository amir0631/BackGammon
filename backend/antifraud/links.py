"""Account links (CLAUDE.md §12.2 multi_account): accounts that share a device fingerprint, or signed
in from the same IP with the same user agent, within antifraud.link_window_days. Linked accounts are
never paired, cannot predict on each other, and their transfers are refused and flagged."""

from datetime import timedelta
from typing import Any

from django.db.models import Q
from django.utils import timezone

from accounts.models import Session, User
from settingsapp import registry


def _since() -> Any:
    return timezone.now() - timedelta(days=registry.get("antifraud.link_window_days"))


def _fingerprints(user_id: int) -> set[str]:
    from antifraud.models import DeviceFingerprint

    return set(
        DeviceFingerprint.objects.filter(user_id=user_id, last_seen__gte=_since()).values_list(
            "fingerprint", flat=True
        )
    )


def _ip_devices(user_id: int) -> set[tuple[str, str]]:
    since = _since()
    rows = Session.objects.filter(user_id=user_id).filter(
        Q(last_used_at__gte=since) | Q(created_at__gte=since)
    )
    return {(ip, ua) for ip, ua in rows.values_list("ip", "user_agent") if ip}


def link_reasons(a: int, b: int) -> list[str]:
    reasons = []
    if _fingerprints(a) & _fingerprints(b):
        reasons.append("device")
    if _ip_devices(a) & _ip_devices(b):
        reasons.append("ip")
    return reasons


def are_linked(a: int, b: int) -> bool:
    return a == b or bool(link_reasons(a, b))


def graph(user_id: int) -> dict[str, Any]:
    """The account link graph around a user, for the admin review (§13 Anti-fraud)."""
    from antifraud.models import DeviceFingerprint

    edges: list[dict[str, Any]] = []
    fps = _fingerprints(user_id)
    for other in (
        DeviceFingerprint.objects.filter(fingerprint__in=fps)
        .exclude(user_id=user_id)
        .values_list("user_id", flat=True)
        .distinct()
    ):
        edges.append({"from": user_id, "to": other, "reason": "device"})
    mine = _ip_devices(user_id)
    ips = {ip for ip, _ in mine}
    for other_id, ip, ua in (
        Session.objects.filter(ip__in=ips, created_at__gte=_since())
        .exclude(user_id=user_id)
        .values_list("user_id", "ip", "user_agent")
    ):
        if (ip, ua) in mine:
            edges.append({"from": user_id, "to": other_id, "reason": "ip"})
    user = User.objects.filter(pk=user_id).first()
    if user and user.referrer_id:
        edges.append({"from": user_id, "to": user.referrer_id, "reason": "referrer"})
    for referee in User.objects.filter(referrer_id=user_id).values_list("id", flat=True):
        edges.append({"from": user_id, "to": referee, "reason": "referee"})
    unique = {(e["to"], e["reason"]): e for e in edges}
    ids = {user_id, *(e["to"] for e in unique.values())}
    names = dict(User.objects.filter(id__in=ids).values_list("id", "username"))
    return {
        "nodes": [{"id": i, "username": names.get(i)} for i in sorted(ids)],
        "edges": list(unique.values()),
    }
