"""Prediction pools (CLAUDE.md §7.5, §15 prediction_pool, prediction)."""

from typing import ClassVar

from django.conf import settings
from django.db import models


class PredictionPool(models.Model):
    class Status(models.TextChoices):
        OPEN = "open"  # from match creation to the first roll
        CLOSED = "closed"  # waiting for the result
        HELD = "held"  # anti-fraud hold: settles only after an admin decision (§7.5, §12.2)
        SETTLED = "settled"
        REFUNDED = "refunded"

    match = models.OneToOneField("game.Match", on_delete=models.PROTECT, related_name="pool")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    total_a = models.BigIntegerField(default=0)
    total_b = models.BigIntegerField(default=0)
    # Settings frozen when the pool opens (§14).
    rake_pct = models.PositiveSmallIntegerField()
    max_stake_per_user = models.BigIntegerField()
    max_pool_total = models.BigIntegerField()
    winner_side = models.SmallIntegerField(null=True, blank=True)
    rake = models.BigIntegerField(default=0)
    hold_reason = models.TextField(blank=True, default="")
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "prediction_pool"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["status", "opened_at"])]

    def __str__(self) -> str:
        return f"pool:{self.match_id}:{self.status}"


class Prediction(models.Model):
    pool = models.ForeignKey(PredictionPool, on_delete=models.PROTECT, related_name="predictions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="predictions")
    side = models.SmallIntegerField()  # 0 = player A wins, 1 = player B wins
    amount = models.BigIntegerField()
    payout = models.BigIntegerField(null=True, blank=True)  # set at settlement (0 for a losing stake)
    idempotency_key = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "prediction"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["pool", "side"]),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "idempotency_key"], name="prediction_idem_unique"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="prediction_amount_positive"),
        ]

    def __str__(self) -> str:
        return f"prediction:{self.pool_id}:{self.user_id}:{self.amount}"
