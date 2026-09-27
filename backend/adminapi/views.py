"""Admin API (CLAUDE.md §13). Mounted at /api/v1/admin/; served only on the `admin.` host."""

import logging
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import ratelimit, sms
from adminapi import audit, totp
from adminapi.auth import AdminCookieAuthentication, AdminGate, IsAdmin, create_session
from adminapi.models import AdminAudit, AdminSession, AdminUser
from config.errors import AppError
from settingsapp import registry

logger = logging.getLogger("adminapi")
SMS_STATUS_CACHE_KEY = "admin:sms_status"


class AdminLocked(AppError):
    status_code = 429
    code = "ADMIN_LOCKED"
    message_key = "errors.admin.locked"


class AdminInvalidCredentials(AppError):
    status_code = 401
    code = "ADMIN_INVALID_CREDENTIALS"
    message_key = "errors.admin.invalidCredentials"


class AdminView(APIView):
    authentication_classes = (AdminCookieAuthentication,)
    permission_classes: tuple[type[BasePermission], ...] = (IsAdmin,)


def admin_payload(admin: AdminUser) -> dict[str, Any]:
    return {"username": admin.username, "role": admin.role}


class LoginSerializer(serializers.Serializer[Any]):
    username = serializers.CharField(max_length=40)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    totp = serializers.CharField(max_length=10)


class LoginView(AdminView):
    permission_classes = (AdminGate,)

    def post(self, request: Request) -> Response:
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        username = s.validated_data["username"].strip().lower()
        key = f"admin-login:{username}"
        if remaining := ratelimit.locked_for(key):
            raise AdminLocked(details={"retry_after": remaining})

        admin = AdminUser.objects.filter(username=username, is_active=True).first()
        ok = (
            admin is not None
            and admin.check_password(s.validated_data["password"])
            and totp.verify(totp.decrypt(admin.totp_secret_encrypted), s.validated_data["totp"])
        )
        if not ok or admin is None:
            lock = ratelimit.record_failure(
                key, registry.get("admin.login_max_failures"), registry.get("admin.login_lock_seconds")
            )
            if lock:
                raise AdminLocked(details={"retry_after": lock})
            raise AdminInvalidCredentials()

        ratelimit.clear_failures(key)
        admin.last_login_at = timezone.now()
        admin.save(update_fields=["last_login_at"])
        response = Response(admin_payload(admin))
        response.set_cookie(
            settings.ADMIN_COOKIE,
            create_session(admin, request._request),
            max_age=settings.ADMIN_SESSION_TTL_SECONDS,
            path="/",
            domain=None,  # host-only: never shared with the player subdomains
            secure=settings.SECURE_COOKIES,
            httponly=True,
            samesite="Strict",
        )
        return response


class LogoutView(AdminView):
    def post(self, request: Request) -> Response:
        if isinstance(request.auth, AdminSession):
            AdminSession.objects.filter(id=request.auth.id).update(revoked_at=timezone.now())
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.ADMIN_COOKIE, path="/", samesite="Strict")
        return response


class MeView(AdminView):
    def get(self, request: Request) -> Response:
        assert isinstance(request.user, AdminUser)
        return Response(admin_payload(request.user))


def setting_payload(key: str) -> dict[str, Any]:
    defn = registry.definition(key)
    value = registry.get(key)
    return {
        "key": key,
        "group": key.split(".", 1)[0],
        "kind": defn.kind,
        "value": value,
        "default": defn.default,
        "is_default": value == defn.default,
        "min": defn.min,
        "max": defn.max,
        "choices": list(defn.choices) if defn.choices else None,
        "description": defn.description,
        "unit": registry.unit(key),
    }


class SettingsView(AdminView):
    def get(self, request: Request) -> Response:
        return Response({"results": [setting_payload(k) for k in registry.REGISTRY], "next": None})


class SettingConflict(AppError):
    status_code = 409
    code = "SETTING_CONFLICT"
    message_key = "errors.admin.settingConflict"


class SettingUpdateSerializer(serializers.Serializer[Any]):
    value = serializers.JSONField()
    reason = serializers.CharField(min_length=3, max_length=500)
    # The value the admin saw before editing; a mismatch means someone else changed it meanwhile.
    expected = serializers.JSONField(required=False)


class SettingResetSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(min_length=3, max_length=500)
    expected = serializers.JSONField(required=False)


def _check_expected(key: str, data: dict[str, Any]) -> None:
    if "expected" in data and data["expected"] != registry.get(key):
        raise SettingConflict(details={"current": registry.get(key)})


class SettingDetailView(AdminView):
    admin_roles = (AdminUser.Role.SUPERADMIN,)

    def patch(self, request: Request, key: str) -> Response:
        s = SettingUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            _check_expected(key, s.validated_data)
            before, after = registry.set_value(key, s.validated_data["value"])
            audit.record(request, "setting.update", "setting", key, before, after, s.validated_data["reason"])
        return Response(setting_payload(key))

    def delete(self, request: Request, key: str) -> Response:
        """Reset to the registry default."""
        s = SettingResetSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            _check_expected(key, s.validated_data)
            before, after = registry.reset(key)
            audit.record(request, "setting.reset", "setting", key, before, after, s.validated_data["reason"])
        return Response(setting_payload(key))


class SmsStatusView(AdminView):
    admin_roles = (AdminUser.Role.SUPERADMIN, AdminUser.Role.FINANCE)

    def get(self, request: Request) -> Response:
        refresh = request.query_params.get("refresh") == "1"
        cached = None if refresh else cache.get(SMS_STATUS_CACHE_KEY)
        if cached is not None:
            return Response(cached)
        result: dict[str, Any] = {
            "provider": settings.SMS_PROVIDER,
            "configured": bool(settings.IPPANEL_API_KEY),
            "credit_rial": None,
            "low_credit": None,
            "patterns": {},
            "error": None,
            "checked_at": timezone.now().isoformat(),
        }
        if result["configured"]:
            try:
                provider = sms.ippanel()
                result["credit_rial"] = provider.credit_rial()
                result["low_credit"] = result["credit_rial"] < registry.get("sms.low_credit_alert_rial")
                for key in ("sms.pattern_otp", "sms.pattern_withdrawal_paid"):
                    code = registry.get(key)
                    result["patterns"][key] = {"code": code, "status": provider.pattern_status(code)}
            except sms.SmsError as exc:
                logger.warning("SMS status check failed: %s", exc.reason)
                result["error"] = exc.reason
        cache.set(SMS_STATUS_CACHE_KEY, result, timeout=60)
        return Response(result)


class AuditView(AdminView):
    admin_roles = (AdminUser.Role.SUPERADMIN,)

    def get(self, request: Request) -> Response:
        qs = AdminAudit.objects.select_related("admin").order_by("-created_at")
        if target_type := request.query_params.get("target_type"):
            qs = qs.filter(target_type=target_type)
        if target_id := request.query_params.get("target_id"):
            qs = qs.filter(target_id=target_id)
        rows = qs[:200]
        return Response(
            {
                "results": [
                    {
                        "id": r.id,
                        "admin": r.admin.username,
                        "action": r.action,
                        "target_type": r.target_type,
                        "target_id": r.target_id,
                        "before": r.before,
                        "after": r.after,
                        "reason": r.reason,
                        "created_at": r.created_at.isoformat(),
                    }
                    for r in rows
                ],
                "next": None,
            }
        )
