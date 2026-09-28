"""Admin authentication: host-only cookie on `admin.`, separate from player tokens (CLAUDE.md §12.1).

The cookie holds `<session_id>.<secret>`; only sha256(secret) is stored. Player cookies are never
read here, and admin cookies are never read by the player API.
"""

import hashlib
import hmac
import ipaddress
import secrets
import uuid
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from accounts.authentication import enforce_csrf
from accounts.sessions import client_ip
from adminapi.models import AdminSession, AdminUser
from config.errors import AppError


class AdminUnauthenticated(AppError):
    status_code = 401
    code = "ADMIN_UNAUTHENTICATED"
    message_key = "errors.admin.unauthenticated"


class AdminForbidden(AppError):
    status_code = 403
    code = "ADMIN_FORBIDDEN"
    message_key = "errors.admin.forbidden"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def create_session(admin: AdminUser, request: HttpRequest) -> str:
    secret = secrets.token_urlsafe(32)
    session = AdminSession.objects.create(
        admin=admin,
        token_hash=_hash(secret),
        ip=client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255],
        expires_at=timezone.now() + timedelta(seconds=settings.ADMIN_SESSION_TTL_SECONDS),
    )
    return f"{session.id}.{secret}"


def resolve(raw: str) -> AdminSession | None:
    session_id, _, secret = raw.partition(".")
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    session = (
        AdminSession.objects.select_related("admin")
        .filter(id=sid, revoked_at__isnull=True, expires_at__gt=timezone.now(), admin__is_active=True)
        .first()
    )
    if session is None or not secret or not hmac.compare_digest(session.token_hash, _hash(secret)):
        return None
    return session


def ip_allowed(ip: str | None) -> bool:
    networks = settings.ADMIN_IP_ALLOWLIST
    if not networks:
        return True
    if ip is None:
        return False
    address = ipaddress.ip_address(ip)
    return any(address in ipaddress.ip_network(net, strict=False) for net in networks)


class AdminCookieAuthentication(BaseAuthentication):
    def authenticate(self, request: Request) -> tuple[AdminUser, AdminSession] | None:
        enforce_csrf(request)
        raw = request.COOKIES.get(settings.ADMIN_COOKIE)
        if not raw:
            return None
        session = resolve(raw)
        if session is None:
            raise AdminUnauthenticated()
        return session.admin, session

    def authenticate_header(self, request: Request) -> str:
        return "Cookie"


class AdminGate(BasePermission):
    """Admin host and IP allowlist, for every admin endpoint including login."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        if settings.ADMIN_ENFORCE_HOST and request.get_host().split(":")[0] != settings.ADMIN_HOST:
            raise AdminForbidden(details={"reason": "host"})
        if not ip_allowed(client_ip(request._request)):
            raise AdminForbidden(details={"reason": "ip"})
        return True


class IsAdmin(AdminGate):
    """Signed-in admin; a view may narrow access with `admin_roles = (...)`."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        super().has_permission(request, view)
        if not isinstance(request.user, AdminUser):
            raise AdminUnauthenticated()
        allowed: Any = getattr(view, "admin_roles", ())
        if allowed and request.user.role not in allowed:
            raise AdminForbidden(details={"reason": "role"})
        return True


ADMIN_WS_SALT = "admin-ws"
ADMIN_WS_TTL_SECONDS = 60


def ws_token(session: AdminSession) -> str:
    """For the admin panel's hidden spectating socket (§13 Live and replays): signed with the admin key,
    never accepted as a player token, valid for 60 s, bound to the admin session."""
    from django.core import signing

    return signing.dumps(
        {"adm": session.admin_id, "sid": str(session.id)}, key=settings.ADMIN_SECRET_KEY, salt=ADMIN_WS_SALT
    )


def admin_for_ws(token: str) -> AdminUser | None:
    from django.core import signing

    try:
        claims = signing.loads(
            token, key=settings.ADMIN_SECRET_KEY, salt=ADMIN_WS_SALT, max_age=ADMIN_WS_TTL_SECONDS
        )
    except signing.BadSignature:
        return None
    session = (
        AdminSession.objects.select_related("admin")
        .filter(
            id=claims.get("sid"),
            admin_id=claims.get("adm"),
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
            admin__is_active=True,
        )
        .first()
    )
    return session.admin if session else None
