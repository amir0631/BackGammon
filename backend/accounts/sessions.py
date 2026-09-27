"""Access JWTs and rotating refresh tokens (CLAUDE.md §3 Auth).

Access token: HS256 JWT, 15 minutes, claims {sub, sid, typ}. Refresh token: `<session_id>.<secret>`,
30 days, rotated on every refresh; only sha256(secret) is stored. Presenting an already-rotated
secret revokes the session (a stolen token was used).
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from django.conf import settings
from django.http import HttpRequest
from django.utils import timezone

from accounts import errors
from accounts.models import Session, User

ALGORITHM = "HS256"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def client_ip(request: HttpRequest) -> str | None:
    # Nginx sets X-Real-IP to the connecting client; the backend is reachable only through Nginx.
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR")


def access_token(user_id: int, session_id: uuid.UUID, typ: str = "access") -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(user_id),
        "sid": str(session_id),
        "typ": typ,
        "iat": now,
        "exp": now + timedelta(seconds=settings.ACCESS_TOKEN_TTL_SECONDS),
    }
    return jwt.encode(claims, settings.JWT_SIGNING_KEY, algorithm=ALGORITHM)


def decode_access(token: str, typ: str = "access") -> dict[str, Any] | None:
    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SIGNING_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub", "sid"]},
        )
    except jwt.PyJWTError:
        return None
    return claims if claims.get("typ") == typ else None


def create_session(user: User, request: HttpRequest) -> tuple[Session, str]:
    secret = secrets.token_urlsafe(32)
    session = Session.objects.create(
        user=user,
        refresh_hash=_hash(secret),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255],
        ip=client_ip(request),
        expires_at=timezone.now() + timedelta(seconds=settings.REFRESH_TOKEN_TTL_SECONDS),
    )
    return session, f"{session.id}.{secret}"


def rotate(refresh_token: str, request: HttpRequest) -> tuple[Session, str]:
    session_id, _, secret = refresh_token.partition(".")
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise errors.SessionInvalid() from None
    session = (
        Session.objects.select_related("user")
        .filter(id=sid, revoked_at__isnull=True, expires_at__gt=timezone.now())
        .first()
    )
    if session is None or not session.user.is_active:
        raise errors.SessionInvalid()
    if not secret or not hmac.compare_digest(session.refresh_hash, _hash(secret)):
        revoke(session)  # reuse of a rotated token: treat as theft
        raise errors.SessionInvalid()
    new_secret = secrets.token_urlsafe(32)
    session.refresh_hash = _hash(new_secret)
    session.last_used_at = timezone.now()
    session.ip = client_ip(request)
    session.save(update_fields=["refresh_hash", "last_used_at", "ip"])
    return session, f"{session.id}.{new_secret}"


def revoke(session: Session) -> None:
    Session.objects.filter(id=session.id, revoked_at__isnull=True).update(revoked_at=timezone.now())


def revoke_all(user: User, except_session: Session | None = None) -> int:
    qs = Session.objects.filter(user=user, revoked_at__isnull=True)
    if except_session is not None:
        qs = qs.exclude(id=except_session.id)
    return qs.update(revoked_at=timezone.now())
