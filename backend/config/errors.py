"""API error format (CLAUDE.md §10.1): every error body is {code, message_key, details}."""

from typing import Any

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class AppError(exceptions.APIException):
    """Domain error with a stable code. Raise subclasses or instances from business code."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code = "BAD_REQUEST"
    message_key = "errors.generic"

    def __init__(
        self,
        code: str | None = None,
        message_key: str | None = None,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        self.code = code or self.code
        self.message_key = message_key or self.message_key
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=self.code)


_DRF_MAP: list[tuple[type[exceptions.APIException], str, str]] = [
    (exceptions.ValidationError, "VALIDATION", "errors.validation"),
    (exceptions.ParseError, "VALIDATION", "errors.validation"),
    (exceptions.NotAuthenticated, "UNAUTHENTICATED", "errors.unauthenticated"),
    (exceptions.AuthenticationFailed, "UNAUTHENTICATED", "errors.unauthenticated"),
    (exceptions.PermissionDenied, "FORBIDDEN", "errors.forbidden"),
    (exceptions.NotFound, "NOT_FOUND", "errors.notFound"),
    (exceptions.Throttled, "THROTTLED", "errors.throttled"),
]


def error_body(code: str, message_key: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"code": code, "message_key": message_key, "details": details or {}}


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # unhandled: Django returns 500 and Sentry records it

    if isinstance(exc, AppError):
        response.data = error_body(exc.code, exc.message_key, exc.details)
        return response

    for exc_type, code, key in _DRF_MAP:
        if isinstance(exc, exc_type):
            details: dict[str, Any] = {}
            if isinstance(exc, exceptions.ValidationError):
                details = {"fields": exc.detail}
            elif isinstance(exc, exceptions.Throttled) and (wait := getattr(exc, "wait", None)) is not None:
                details = {"retry_after": int(wait)}
            response.data = error_body(code, key, details)
            return response

    response.data = error_body("HTTP_ERROR", "errors.generic", {"status": response.status_code})
    return response
