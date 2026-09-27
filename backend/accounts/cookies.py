"""User auth cookies: HttpOnly, Secure on HTTPS, SameSite=Lax, shared by `app.` and `m.` (CLAUDE.md §3)."""

from django.conf import settings
from django.http import HttpResponse

REFRESH_PATH = "/api/v1/auth/"


def _set(response: HttpResponse, name: str, value: str, max_age: int, path: str) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        path=path,
        domain=settings.COOKIE_DOMAIN,
        secure=settings.SECURE_COOKIES,
        httponly=True,
        samesite="Lax",
    )


def set_auth_cookies(response: HttpResponse, access: str, refresh: str) -> None:
    _set(response, settings.ACCESS_COOKIE, access, settings.ACCESS_TOKEN_TTL_SECONDS, "/")
    _set(response, settings.REFRESH_COOKIE, refresh, settings.REFRESH_TOKEN_TTL_SECONDS, REFRESH_PATH)


def clear_auth_cookies(response: HttpResponse) -> None:
    response.delete_cookie(settings.ACCESS_COOKIE, path="/", domain=settings.COOKIE_DOMAIN, samesite="Lax")
    response.delete_cookie(
        settings.REFRESH_COOKIE, path=REFRESH_PATH, domain=settings.COOKIE_DOMAIN, samesite="Lax"
    )
