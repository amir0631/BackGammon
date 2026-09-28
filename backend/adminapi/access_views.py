"""Admin accounts and roles (CLAUDE.md §13 Access, §12.1). Superadmin only. A new admin, or one whose
TOTP is reset, gets a one-time password and TOTP enrolment URI in the response; only their hashes and
the encrypted secret are stored. The last active superadmin can never be demoted or disabled."""

import secrets
from typing import Any

from django.conf import settings
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from adminapi import audit, totp
from adminapi.models import AdminSession, AdminUser
from adminapi.views import AdminView
from config.errors import AppError

Role = AdminUser.Role


class AdminExists(AppError):
    status_code = 409
    code = "ADMIN_EXISTS"
    message_key = "errors.admin.exists"


class LastSuperadmin(AppError):
    status_code = 409
    code = "ADMIN_LAST_SUPERADMIN"
    message_key = "errors.admin.lastSuperadmin"


def admin_row(a: AdminUser) -> dict[str, Any]:
    return {
        "id": a.id,
        "username": a.username,
        "role": a.role,
        "is_active": a.is_active,
        "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
        "created_at": a.created_at.isoformat(),
    }


def _credentials(admin: AdminUser) -> dict[str, str]:
    """New password and TOTP secret; returned once, never stored in clear."""
    password = secrets.token_urlsafe(12)
    secret = totp.new_secret()
    admin.set_password(password)
    admin.totp_secret_encrypted = totp.encrypt(secret)
    return {
        "password": password,
        "totp_secret": secret,
        "totp_uri": totp.provisioning_uri(secret, admin.username, settings.APP_NAME),
    }


def _revoke(admin: AdminUser) -> None:
    AdminSession.objects.filter(admin=admin, revoked_at__isnull=True).update(revoked_at=_now())


def _now() -> Any:
    from django.utils import timezone

    return timezone.now()


class CreateSerializer(serializers.Serializer[Any]):
    username = serializers.RegexField(r"^[a-z][a-z0-9_.-]{2,39}$")
    role = serializers.ChoiceField(choices=Role.choices)


class UpdateSerializer(serializers.Serializer[Any]):
    role = serializers.ChoiceField(choices=Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)
    reason = serializers.CharField(min_length=3, max_length=500)


class AdminsView(AdminView):
    admin_roles = (Role.SUPERADMIN,)

    def get(self, request: Request) -> Response:
        rows = AdminUser.objects.order_by("username")
        return Response({"results": [admin_row(a) for a in rows], "next": None})

    def post(self, request: Request) -> Response:
        s = CreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        username = s.validated_data["username"].lower()
        with transaction.atomic():
            if AdminUser.objects.filter(username=username).exists():
                raise AdminExists()
            admin = AdminUser(username=username, role=s.validated_data["role"])
            creds = _credentials(admin)
            admin.save()
            audit.record(request, "admin.create", "admin_user", str(admin.id), None, admin_row(admin))
        return Response({**admin_row(admin), "credentials": creds}, status=201)


class AdminDetailView(AdminView):
    admin_roles = (Role.SUPERADMIN,)

    def patch(self, request: Request, admin_id: int) -> Response:
        s = UpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        with transaction.atomic():
            admin = AdminUser.objects.select_for_update().filter(pk=admin_id).first()
            if admin is None:
                raise NotFound()
            before = admin_row(admin)
            role = d.get("role", admin.role)
            active = d.get("is_active", admin.is_active)
            losing = (
                admin.role == Role.SUPERADMIN and admin.is_active and (role != Role.SUPERADMIN or not active)
            )
            if losing:
                others = (
                    AdminUser.objects.select_for_update()
                    .filter(role=Role.SUPERADMIN, is_active=True)
                    .exclude(pk=admin.pk)
                )
                if not others.exists():
                    raise LastSuperadmin()
            admin.role, admin.is_active = role, active
            admin.save(update_fields=["role", "is_active"])
            if not active or role != before["role"]:
                _revoke(admin)  # the new role applies from the next sign-in
            audit.record(
                request, "admin.update", "admin_user", str(admin.id), before, admin_row(admin), d["reason"]
            )
        return Response(admin_row(admin))


class ResetSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(min_length=3, max_length=500)


class AdminResetView(AdminView):
    """New password and TOTP secret for an admin who lost theirs; signs them out everywhere."""

    admin_roles = (Role.SUPERADMIN,)

    def post(self, request: Request, admin_id: int) -> Response:
        s = ResetSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            admin = AdminUser.objects.select_for_update().filter(pk=admin_id).first()
            if admin is None:
                raise NotFound()
            creds = _credentials(admin)
            admin.save(update_fields=["password", "totp_secret_encrypted"])
            _revoke(admin)
            row = admin_row(admin)
            audit.record(
                request,
                "admin.reset_credentials",
                "admin_user",
                str(admin.id),
                row,
                row,
                s.validated_data["reason"],
            )
        return Response({**row, "credentials": creds})
