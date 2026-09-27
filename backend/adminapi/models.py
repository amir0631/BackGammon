import uuid
from typing import ClassVar

from django.contrib.auth.hashers import check_password, make_password
from django.db import models


class AdminUser(models.Model):
    """Admin panel account (CLAUDE.md §12.1). Separate from players; TOTP 2FA is mandatory."""

    class Role(models.TextChoices):
        SUPPORT = "support"
        FINANCE = "finance"
        SUPERADMIN = "superadmin"

    username = models.CharField(max_length=40, unique=True)
    password = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=Role.choices)
    totp_secret_encrypted = models.TextField()
    is_active = models.BooleanField(default=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "admin_user"

    def __str__(self) -> str:
        return self.username

    def set_password(self, raw: str) -> None:
        self.password = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return check_password(raw, self.password)


class AdminSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admin = models.ForeignKey(AdminUser, on_delete=models.CASCADE, related_name="sessions")
    token_hash = models.CharField(max_length=64)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "admin_session"

    def __str__(self) -> str:
        return f"admin_session:{self.pk}"


class AdminAudit(models.Model):
    """Every admin write, with before/after values (CLAUDE.md §2 rule 12)."""

    admin = models.ForeignKey(AdminUser, on_delete=models.PROTECT, related_name="audit")
    action = models.CharField(max_length=60)
    target_type = models.CharField(max_length=40)
    target_id = models.CharField(max_length=100)
    before = models.JSONField(null=True)
    after = models.JSONField(null=True)
    reason = models.TextField(blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "admin_audit"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["admin", "created_at"]),
            models.Index(fields=["target_type", "target_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.action}:{self.target_type}:{self.target_id}"
