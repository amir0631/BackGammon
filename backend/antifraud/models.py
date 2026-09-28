"""Device fingerprints and fraud flags (CLAUDE.md §12.2, §15 device_fingerprint, fraud_flag)."""

from typing import ClassVar

from django.conf import settings
from django.db import models


class DeviceFingerprint(models.Model):
    """A device a player used: the app's device id (a random id kept in the browser, sent as
    X-Device-Id), with the IP and user agent it was seen with."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    fingerprint = models.CharField(max_length=64, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "device_fingerprint"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["user", "last_seen"])]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "fingerprint"], name="device_once_per_user")
        ]

    def __str__(self) -> str:
        return f"device:{self.user_id}:{self.fingerprint[:8]}"


class FraudFlag(models.Model):
    class Rule(models.TextChoices):
        CHIP_DUMPING = "chip_dumping"
        MULTI_ACCOUNT = "multi_account"
        REFERRAL_FARM = "referral_farm"
        PREDICTION_COLLUSION = "prediction_collusion"
        ENGINE_ASSIST = "engine_assist"
        LINKED_TRANSFER = "linked_transfer"

    class Status(models.TextChoices):
        OPEN = "open"
        DISMISSED = "dismissed"  # reviewed: no fraud; held money released
        CONFIRMED = "confirmed"  # reviewed: fraud; held money refunded or withheld, accounts actioned

    rule = models.CharField(max_length=24, choices=Rule.choices)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="fraud_flags")
    other = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    match = models.ForeignKey("game.Match", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    evidence = models.JSONField(default=dict)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    decided_by = models.ForeignKey(
        "adminapi.AdminUser", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decision_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "fraud_flag"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"flag:{self.rule}:{self.user_id}:{self.status}"
