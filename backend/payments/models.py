"""Coin packages and gateway payments (CLAUDE.md §7.7, §7.11, §15). Rial lives only here."""

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models


class CoinPackage(models.Model):
    coins = models.BigIntegerField()
    name_i18n = models.JSONField(default=dict)
    active = models.BooleanField(default=True)
    sort = models.IntegerField(default=0)

    class Meta:
        db_table = "coin_package"
        ordering: ClassVar[list[str]] = ["sort", "coins"]

    def __str__(self) -> str:
        return f"package:{self.coins}"


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"  # sent to the gateway
        CALLBACK_RECEIVED = "callback_received"  # the gateway returned the user; not yet verified
        VERIFIED = "verified"  # server-side verify succeeded: coins credited
        FAILED = "failed"  # cancelled by the user or refused by verify
        EXPIRED = "expired"  # never came back

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payments")
    package = models.ForeignKey(CoinPackage, null=True, blank=True, on_delete=models.PROTECT)
    coins = models.BigIntegerField()
    price_toman = models.BigIntegerField()  # coin.price_toman at checkout
    amount_rial = models.BigIntegerField()
    gateway = models.CharField(max_length=20)
    authority = models.CharField(max_length=100, blank=True, default="", db_index=True)  # the gateway's token
    reference = models.CharField(max_length=100, blank=True, default="")  # tracking code after verify
    card_mask = models.CharField(max_length=32, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    surface = models.CharField(max_length=8, default="m")  # the app that started checkout (§11.0 rule 6)
    idempotency_key = models.CharField(max_length=128)
    failure = models.CharField(max_length=60, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payment"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "idempotency_key"], name="payment_idem_unique"),
            models.CheckConstraint(condition=models.Q(coins__gt=0), name="payment_coins_positive"),
        ]

    def __str__(self) -> str:
        return f"payment:{self.id}:{self.status}"


class ReconciliationRun(models.Model):
    """The nightly comparison of verified payments with the gateway's report (§7.7, §13)."""

    day = models.DateField()
    gateway = models.CharField(max_length=20)
    verified_count = models.PositiveIntegerField(default=0)
    verified_rial = models.BigIntegerField(default=0)
    problems = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_reconciliation"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["day", "gateway"], name="reconcile_once_per_day")
        ]

    def __str__(self) -> str:
        return f"reconcile:{self.day}:{self.gateway}"
