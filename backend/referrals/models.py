from typing import ClassVar

from django.conf import settings
from django.db import models


class ReferralEarning(models.Model):
    """A commission paid to a referrer for one match of a referred player (CLAUDE.md §7.4, §15)."""

    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="referral_earnings"
    )
    referee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    match = models.ForeignKey("game.Match", on_delete=models.PROTECT, related_name="+")
    amount = models.BigIntegerField()
    base = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "referral_earning"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["referrer", "created_at"])]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["match", "referee"], name="referral_once_per_match")
        ]

    def __str__(self) -> str:
        return f"referral:{self.referrer_id}:{self.amount}"
