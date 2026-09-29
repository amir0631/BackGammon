"""Tournaments (CLAUDE.md §7.6, §15 tournament, tournament_entry)."""

from typing import ClassVar

from django.conf import settings
from django.db import models


class Tournament(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled"  # open for entries until starts_at
        RUNNING = "running"
        FINISHED = "finished"
        CANCELLED = "cancelled"  # not filled in time, or by an admin: entries refunded

    name_i18n = models.JSONField(default=dict)
    variant = models.CharField(max_length=20)
    length = models.PositiveSmallIntegerField()
    entry = models.BigIntegerField()
    capacity = models.PositiveSmallIntegerField()  # a power of two: single elimination
    starts_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED)
    # Frozen at creation (§14): percent per place, and the rake.
    prize_split = models.JSONField(default=list)
    rake_pct = models.PositiveSmallIntegerField()
    # Optional item prizes per place: [item_id or null, ...].
    prize_items = models.JSONField(default=list, blank=True)
    round = models.PositiveSmallIntegerField(default=0)
    created_by = models.BigIntegerField(null=True, blank=True)
    cancel_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "tournament"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["status", "starts_at"])]

    def __str__(self) -> str:
        return f"tournament:{self.pk}:{self.status}"


class TournamentEntry(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.PROTECT, related_name="entries")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="tournament_entries"
    )
    seed = models.PositiveSmallIntegerField(null=True, blank=True)
    eliminated_round = models.PositiveSmallIntegerField(null=True, blank=True)
    place = models.PositiveSmallIntegerField(null=True, blank=True)
    prize = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tournament_entry"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["user", "created_at"])]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["tournament", "user"], name="tournament_entry_once")
        ]

    def __str__(self) -> str:
        return f"entry:{self.tournament_id}:{self.user_id}"


class BracketSlot(models.Model):
    """One match of the bracket: round r, position i; feeds position i // 2 of round r + 1."""

    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="slots")
    round = models.PositiveSmallIntegerField()
    position = models.PositiveSmallIntegerField()
    player_a = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    player_b = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    match = models.OneToOneField(
        "game.Match", null=True, blank=True, on_delete=models.PROTECT, related_name="slot"
    )
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "tournament_slot"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["tournament", "round", "position"], name="slot_unique")
        ]

    def __str__(self) -> str:
        return f"slot:{self.tournament_id}:{self.round}:{self.position}"
