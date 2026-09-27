from django.core.cache import cache
from django.db import connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes
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
