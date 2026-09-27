from typing import Any

from django.conf import settings
from django.http import HttpResponse
from django.middleware.csrf import CsrfViewMiddleware
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.request import Request

from accounts import errors
from accounts.models import Session, User
from accounts.sessions import decode_access
from config.errors import AppError

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


class CsrfFailed(AppError):
    status_code = 403
    code = "CSRF_FAILED"
    message_key = "errors.csrf"


def _no_view(request: Any) -> HttpResponse:
    return HttpResponse()


def enforce_csrf(request: Request) -> None:
    """Cookie-authenticated writes need a CSRF token (CLAUDE.md §12.1), signed in or not."""
    if request.method in SAFE_METHODS:
        return
    check = CsrfViewMiddleware(_no_view)
    check.process_request(request._request)
    if check.process_view(request._request, _no_view, (), {}) is not None:
        raise CsrfFailed()


class CookieJWTAuthentication(BaseAuthentication):
    """Players: access JWT in the HttpOnly `ACCESS_COOKIE`. `request.auth` is the Session."""

    def authenticate(self, request: Request) -> tuple[User, Session] | None:
        enforce_csrf(request)
        token = request.COOKIES.get(settings.ACCESS_COOKIE)
        if not token:
            return None
        claims = decode_access(token)
        if claims is None:
            raise errors.SessionInvalid()
        session = (
            Session.objects.select_related("user")
            .filter(
                id=claims["sid"],
                user_id=claims["sub"],
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .first()
        )
        if session is None or not session.user.is_active:
            raise errors.SessionInvalid()
        return session.user, session

    def authenticate_header(self, request: Request) -> str:
        return "Cookie"
