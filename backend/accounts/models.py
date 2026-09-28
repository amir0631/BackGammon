import uuid
from typing import Any, ClassVar

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower


def default_prefs() -> dict[str, bool]:
    return {"graphics_lite": False, "animations_reduced": False, "sound": True, "vibration": True}


class UserManager(BaseUserManager["User"]):
    def create_user(self, phone: str, password: str | None = None, **extra: Any) -> "User":
        user = self.model(phone=phone, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    """Player account (CLAUDE.md §15).

    Admin accounts live in a separate `admin_user` table; players never get admin access.
    """

    class Status(models.TextChoices):
        ACTIVE = "active"
        SUSPENDED = "suspended"
        BANNED = "banned"

    class Lang(models.TextChoices):
        FA = "fa"
        EN = "en"

    phone = models.CharField(max_length=20, unique=True)
    # NULL until chosen, so the case-insensitive unique constraint allows many unset usernames.
    username = models.CharField(max_length=20, null=True, blank=True)  # noqa: DJ001
    lang = models.CharField(max_length=2, choices=Lang.choices, default=Lang.FA)
    avatar = models.CharField(max_length=40, default="avatar_01")
    prefs = models.JSONField(default=default_prefs)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    elo = models.IntegerField(default=1500)
    xp = models.BigIntegerField(default=0)
    level = models.IntegerField(default=1)
    referrer = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="referees", db_index=True
    )
    age_confirmed_at = models.DateTimeField(null=True, blank=True)
    # Set when the number was proven by an SMS code; the signup bonus needs it (§7.10).
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects: ClassVar[UserManager] = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        db_table = "user"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(Lower("username"), name="user_username_ci_unique"),
        ]

    @property
    def is_active(self) -> bool:  # type: ignore[override]
        return self.status != self.Status.BANNED

    def __str__(self) -> str:
        return self.username or f"user:{self.pk}"


class Otp(models.Model):
    """One-time code sent by SMS (CLAUDE.md §12.1). The code itself is never stored, only its HMAC."""

    class Purpose(models.TextChoices):
        REGISTER = "register"
        PASSWORD_RESET = "password_reset"  # noqa: S105 (an OTP purpose, not a password)
        WITHDRAWAL = "withdrawal"

    phone = models.CharField(max_length=20)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    provider_message_id = models.CharField(max_length=40, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "otp"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["phone", "purpose", "created_at"])]

    def __str__(self) -> str:
        return f"otp:{self.pk}:{self.purpose}"


class Session(models.Model):
    """A signed-in device. The refresh token is `<id>.<secret>`; only the secret's hash is stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    refresh_hash = models.CharField(max_length=64)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "session"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["user", "created_at"])]

    def __str__(self) -> str:
        return f"session:{self.pk}"
