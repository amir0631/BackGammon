from typing import Any, ClassVar

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower


class UserManager(BaseUserManager["User"]):
    def create_user(self, phone: str, password: str | None = None, **extra: Any) -> "User":
        user = self.model(phone=phone, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    """Player account (CLAUDE.md §15). OTP, sessions, and profile endpoints come in §17 step 2.

    Admin accounts live in a separate `admin_user` table; players never get admin access.
    """

    class Status(models.TextChoices):
        ACTIVE = "active"
        SUSPENDED = "suspended"
        BANNED = "banned"

    class Lang(models.TextChoices):
        FA = "fa"
        AR = "ar"
        EN = "en"

    phone = models.CharField(max_length=20, unique=True)
    # NULL until chosen, so the case-insensitive unique constraint allows many unset usernames.
    username = models.CharField(max_length=20, null=True, blank=True)  # noqa: DJ001
    lang = models.CharField(max_length=2, choices=Lang.choices, default=Lang.FA)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    elo = models.IntegerField(default=1500)
    xp = models.BigIntegerField(default=0)
    level = models.IntegerField(default=1)
    referrer = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="referees", db_index=True
    )
    age_confirmed_at = models.DateTimeField(null=True, blank=True)
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
