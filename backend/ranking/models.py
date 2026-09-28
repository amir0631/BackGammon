"""ELO and XP history (CLAUDE.md §8, §15)."""

from typing import ClassVar

from django.conf import settings
from django.db import models


class EloHistory(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="elo_history")
    match = models.ForeignKey("game.Match", on_delete=models.CASCADE, related_name="+")
    before = models.IntegerField()
    after = models.IntegerField()
    delta = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "elo_history"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["user", "created_at"])]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "match"], name="elo_history_once_per_match")
        ]

    def __str__(self) -> str:
        return f"elo:{self.user_id}:{self.delta:+d}"


class XpHistory(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="xp_history")
    match = models.ForeignKey("game.Match", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    amount = models.IntegerField()
    reason = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "xp_history"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["user", "created_at"])]

    def __str__(self) -> str:
        return f"xp:{self.user_id}:{self.amount}"
