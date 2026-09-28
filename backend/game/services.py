"""Creating matches (CLAUDE.md §6.1, §14 snapshot)."""

from typing import Any

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from game.engine import dice as fair
from game.engine.match import Rules
from game.models import Match
from realtime import live, seeds
from settingsapp import registry


def rules_snapshot() -> dict[str, Any]:
    """The settings a match depends on, frozen at its start (§14)."""
    return {
        "turn_seconds": registry.get("game.turn_seconds"),
        "timebank_seconds": registry.get("game.timebank_seconds"),
        "max_consecutive_timeouts": registry.get("game.max_consecutive_timeouts"),
        "reconnect_grace_seconds": registry.get("game.reconnect_grace_seconds"),
        "traditional_points": registry.get("game.traditional_points"),
        "table_rake_pct": registry.get("table.rake_pct"),
    }


def player_info(user: User) -> dict[str, Any]:
    return {
        "username": user.username or "",
        "avatar": user.avatar,
        "elo": user.elo,
        "level": user.level,
        "is_bot": False,
        "bot_level": None,
    }


def bot_info(level: str) -> dict[str, Any]:
    return {
        "username": f"bot_{level}",
        "avatar": "bot",
        "elo": 0,
        "level": 0,
        "is_bot": True,
        "bot_level": level,
    }


def create_match(
    player_a: User,
    player_b: User | None,
    variant: str,
    length: int,
    entry: int = 0,
    bot_level: str = "",
    tier_id: int | None = None,
    extra_rules: dict[str, Any] | None = None,
) -> Match:
    """Creates the match row and its live state; the first game starts at once. Entry fees are moved to
    escrow by the caller in the same transaction (§7.3)."""
    rules = {**rules_snapshot(), **(extra_rules or {})}
    Rules.for_variant(variant, length, rules["traditional_points"])  # validates variant and length
    seed = fair.new_seed()
    with transaction.atomic():
        match = Match.objects.create(
            variant=variant,
            length=length,
            entry=entry,
            tier_id=tier_id,
            player_a=player_a,
            player_b=player_b,
            is_bot=player_b is None,
            bot_level=bot_level,
            seed_commit=fair.commit(seed),
            seed_encrypted=seeds.encrypt(seed),
            rules=rules,
            started_at=timezone.now(),
        )
        players = [player_info(player_a), player_info(player_b) if player_b else bot_info(bot_level)]
        user_ids = [player_a.id, player_b.id if player_b else None]
        # Live state only once the row is committed, so a rolled-back creation leaves nothing behind.
        transaction.on_commit(lambda: live.create(match, players, user_ids))
    return match
