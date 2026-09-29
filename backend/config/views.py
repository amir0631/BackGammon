from django.conf import settings
from django.core.cache import cache
from django.db import connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response


def _db_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except Exception:
        return False


def _redis_ok() -> bool:
    try:
        cache.set("health:ping", 1, timeout=5)
        return bool(cache.get("health:ping") == 1)
    except Exception:
        return False


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def health(request: Request) -> Response:
    checks = {"database": _db_ok(), "redis": _redis_ok()}
    ok = all(checks.values())
    return Response({"status": "ok" if ok else "degraded", "checks": checks}, status=200 if ok else 503)


@api_view(["GET"])
@permission_classes([AllowAny])
@authentication_classes([])
def public_config(request: Request) -> Response:
    """Client-visible switches and prices, readable before sign-in (e.g. whether signup needs an SMS
    code). Only values that are safe to publish."""
    from settingsapp import registry

    return Response(
        {
            "app_name": settings.APP_NAME,
            "sms_enabled": bool(registry.get("sms.enabled")),
            "payments_enabled": bool(registry.get("payments.enabled")),
            "predictions_enabled": bool(registry.get("predict.enabled")),
            "spectating_enabled": registry.get("live.max_spectators_per_match") > 0,
            "spectator_delay_seconds": registry.get("live.spectator_delay_seconds"),
            # A player who hasn't joined a found match (or a tournament match) forfeits after this.
            "reconnect_grace_seconds": registry.get("game.reconnect_grace_seconds"),
            "predict_min_count_for_board": registry.get("predict.min_count_for_board"),
            "spectator_reactions_enabled": bool(registry.get("live.spectator_reactions_enabled")),
            "coin_price_toman": registry.get("coin.price_toman"),
            # Shown wherever players are told to contact support (top-ups while the gateway is off).
            "support_contact": registry.get("support.contact") or f"support@{settings.BASE_DOMAIN}",
            "username_change": {
                "cost": registry.get("username.change_cost"),
                "cooldown_days": registry.get("username.change_cooldown_days"),
            },
            "allowed_lengths": registry.get("game.allowed_lengths"),
            "tiers": registry.get("table.tiers"),
        }
    )
