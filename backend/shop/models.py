"""Shop items and ownership (CLAUDE.md §11.2, §15 item, user_item, phrase)."""

from typing import ClassVar

from django.conf import settings
from django.db import models


class Item(models.Model):
    class Kind(models.TextChoices):
        BOARD_THEME = "board_theme"
        CHECKER_THEME = "checker_theme"
        AVATAR = "avatar"
        EMOJI_PACK = "emoji_pack"
        PHRASE_PACK = "phrase_pack"

    class Unlock(models.TextChoices):
        FREE = "free"
        LEVEL_LOCKED = "level_locked"  # free once the player reaches unlock_level
        PURCHASABLE = "purchasable"  # bought with coins (price_coins)

    kind = models.CharField(max_length=20, choices=Kind.choices)
    key = models.CharField(max_length=40)
    name_i18n = models.JSONField(default=dict)
    unlock = models.CharField(max_length=20, choices=Unlock.choices, default=Unlock.FREE)
    price_coins = models.BigIntegerField(default=0)
    unlock_level = models.PositiveSmallIntegerField(default=1)
    # Theme: asset path and sizes; packs: the emoji or phrase keys they contain.
    data = models.JSONField(default=dict)
    active = models.BooleanField(default=True)
    sort = models.IntegerField(default=0)
    is_default = models.BooleanField(default=False)  # equipped when nothing else is

    class Meta:
        db_table = "item"
        ordering: ClassVar[list[str]] = ["kind", "sort", "id"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["kind", "key"], name="item_kind_key_unique")
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.key}"


class UserItem(models.Model):
    class Source(models.TextChoices):
        PURCHASE = "purchase"
        PRIZE = "prize"  # tournament prizes (§7.6)
        GRANT = "grant"  # admin

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="owners")
    source = models.CharField(max_length=10, choices=Source.choices)
    acquired_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_item"
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["user", "acquired_at"])]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "item"], name="user_item_once")
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.item_id}"


class Phrase(models.Model):
    """Preset phrase texts (§13 Content). Players send the key; receivers render it in their locale."""

    key = models.CharField(max_length=40, unique=True)
    text_i18n = models.JSONField(default=dict)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "phrase"

    def __str__(self) -> str:
        return self.key
