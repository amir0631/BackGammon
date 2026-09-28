"""Matches, games, moves, and the match event log (CLAUDE.md §15, §20.1)."""

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models


class Match(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active"
        FINISHED = "finished"
        ABORTED = "aborted"  # ended before the first roll: entries refunded
        VOIDED = "voided"  # cancelled by an admin or anti-fraud: entries refunded

    class Variant(models.TextChoices):
        STANDARD_CUBE = "standard_cube"
        STANDARD_NOCUBE = "standard_nocube"
        TRADITIONAL = "traditional"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.CharField(max_length=20, choices=Variant.choices)
    length = models.PositiveSmallIntegerField()
    entry = models.BigIntegerField(default=0)
    player_a = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    player_b = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    is_bot = models.BooleanField(default=False)
    bot_level = models.CharField(max_length=10, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    winner_side = models.SmallIntegerField(null=True, blank=True)  # 0 = A, 1 = B (B may be the bot)
    score_a = models.PositiveSmallIntegerField(default=0)
    score_b = models.PositiveSmallIntegerField(default=0)
    end_reason = models.CharField(max_length=40, blank=True, default="")
    seed_commit = models.CharField(max_length=64)
    seed_encrypted = models.TextField()
    # The settings this match depends on, frozen when it starts (CLAUDE.md §14).
    rules = models.JSONField(default=dict)
    tournament_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "match"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["player_a", "created_at"]),
            models.Index(fields=["player_b", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"match:{self.id}"

    def side_of(self, user_id: int) -> int | None:
        if user_id == self.player_a_id:
            return 0
        if user_id == self.player_b_id:
            return 1
        return None


class Game(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="games")
    number = models.PositiveSmallIntegerField()
    winner_side = models.SmallIntegerField(null=True, blank=True)
    kind = models.CharField(max_length=12, blank=True, default="")
    cube = models.PositiveSmallIntegerField(default=1)
    points = models.PositiveSmallIntegerField(default=0)
    reason = models.CharField(max_length=12, blank=True, default="")
    crawford = models.BooleanField(default=False)

    class Meta:
        db_table = "game"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["match", "number"], name="game_match_number_unique")
        ]

    def __str__(self) -> str:
        return f"game:{self.match_id}:{self.number}"


class Move(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="moves")
    seq = models.PositiveIntegerField()
    player = models.SmallIntegerField()
    dice = models.JSONField(default=list)
    moves_json = models.JSONField(default=list)
    cube_action = models.CharField(max_length=8, blank=True, default="")
    position_after = models.CharField(max_length=120, blank=True, default="")
    ts = models.DateTimeField()

    class Meta:
        db_table = "move"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["game", "seq"])]

    def __str__(self) -> str:
        return f"move:{self.game_id}:{self.seq}"


class MatchEvent(models.Model):
    """Every protocol event of a match (CLAUDE.md §15, §20.1). Append-only (DB trigger)."""

    class Actor(models.TextChoices):
        PLAYER_A = "player_a"
        PLAYER_B = "player_b"
        SYSTEM = "system"

    id = models.BigAutoField(primary_key=True)
    match = models.ForeignKey(Match, on_delete=models.PROTECT, related_name="events")
    seq = models.PositiveIntegerField()
    type = models.CharField(max_length=32)
    actor = models.CharField(max_length=10, choices=Actor.choices)
    payload = models.JSONField(default=dict)
    server_ts = models.DateTimeField()

    class Meta:
        db_table = "match_event"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["match", "seq"], name="match_event_seq_unique")
        ]

    def __str__(self) -> str:
        return f"event:{self.match_id}:{self.seq}:{self.type}"


class ReplayView(models.Model):
    """Every replay access (CLAUDE.md §15, §20)."""

    class Role(models.TextChoices):
        PLAYER = "player"
        ADMIN = "admin"

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="replay_views")
    viewer_id = models.BigIntegerField()
    viewer_role = models.CharField(max_length=10, choices=Role.choices)
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "replay_view"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["match", "viewed_at"])]

    def __str__(self) -> str:
        return f"replay_view:{self.match_id}:{self.viewer_role}:{self.viewer_id}"
