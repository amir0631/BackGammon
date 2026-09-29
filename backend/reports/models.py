"""Records the reports need that the rest of the data model does not keep (CLAUDE.md §13, §6.5)."""

from typing import ClassVar

from django.conf import settings
from django.db import models


class UserActivity(models.Model):
    """One row per user per (Tehran) day with any authenticated activity: DAU, MAU, retention."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    day = models.DateField()

    class Meta:
        db_table = "user_activity"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["day"])]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "day"], name="activity_once_per_day")
        ]

    def __str__(self) -> str:
        return f"activity:{self.user_id}:{self.day}"


class QueueWait(models.Model):
    """How long a player waited in the matchmaking queue before being paired (§13 game analytics)."""

    match = models.ForeignKey("game.Match", on_delete=models.CASCADE, related_name="+")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    seconds = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "queue_wait"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["created_at"])]

    def __str__(self) -> str:
        return f"wait:{self.user_id}:{self.seconds}s"


class DiceTest(models.Model):
    """The weekly chi-square test of die faces across all matches (§6.5)."""

    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    dice = models.PositiveBigIntegerField()
    counts = models.JSONField()  # faces 1..6
    chi_square = models.FloatField()
    p_value = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dice_test"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["created_at"])]

    def __str__(self) -> str:
        return f"dice:{self.period_end:%Y-%m-%d}:p={self.p_value:.4f}"
