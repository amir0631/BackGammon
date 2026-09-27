import pytest
from django.core.cache import cache

from settingsapp import registry
from settingsapp.models import Setting

REQUIRED_KEYS = {
    "game.turn_seconds": 30,
    "game.timebank_seconds": 90,
    "game.max_consecutive_timeouts": 3,
    "game.reconnect_grace_seconds": 90,
    "game.allowed_lengths": [1, 3, 5, 7, 11],
    "game.traditional_points": {"single": 1, "gammon": 2, "backgammon": 2},
    "table.rake_pct": 10,
    "table.tiers": [50, 100, 500, 1000],
    "referral.pct": 1,
    "referral.base": "referee_entry",
    "referral.duration_days": 0,
    "predict.enabled": True,
    "predict.rake_pct": 10,
    "predict.min_table_entry": 100,
    "predict.max_stake_per_user": 1000,
    "predict.max_pool_total": 50000,
    "predict.min_count_for_board": 20,
    "tournament.rake_pct": 10,
    "tournament.default_prize_split": [50, 25, 12.5, 12.5],
    "bonus.daily_coins": 20,
    "xp.per_match": 10,
    "xp.per_win": 15,
    "elo.k_new": 40,
    "elo.k": 20,
    "elo.new_threshold": 30,
    "matchmaking.elo_window": 150,
    "matchmaking.widen_step": 50,
    "matchmaking.widen_seconds": 10,
    "username.change_cost": 200,
    "username.change_cooldown_days": 30,
    "bot.entry_enabled": False,
    "live.max_spectators_per_match": 500,
    "live.spectator_delay_seconds": 0,
    "live.spectator_reactions_enabled": True,
    "replay.retention_days": 0,
    "admin.topup_max_amount": 0,
}


def test_registry_has_every_required_key_with_its_default():
    for key, default in REQUIRED_KEYS.items():
        assert registry.definition(key).default == default, key


def test_every_setting_has_three_language_descriptions():
    for defn in registry.REGISTRY.values():
        assert set(defn.description) == {"fa", "ar", "en"}, defn.key
        assert all(defn.description.values()), defn.key


@pytest.mark.django_db
def test_get_returns_default_without_a_row():
    assert registry.get("table.rake_pct") == 10


@pytest.mark.django_db(transaction=True)
def test_set_value_persists_invalidates_cache_and_returns_before_after():
    assert registry.get("table.rake_pct") == 10  # warms the cache
    before, after = registry.set_value("table.rake_pct", 8)
    assert (before, after) == (10, 8)
    assert Setting.objects.get(key="table.rake_pct").value == 8
    assert registry.get("table.rake_pct") == 8


@pytest.mark.django_db(transaction=True)
def test_reset_restores_default():
    registry.set_value("bonus.daily_coins", 50)
    assert registry.reset("bonus.daily_coins") == (50, 20)
    assert registry.get("bonus.daily_coins") == 20


@pytest.mark.django_db
def test_get_reads_from_cache():
    cache.set(registry.CACHE_PREFIX + "elo.k", 25)
    assert registry.get("elo.k") == 25


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("table.rake_pct", "10"),
        ("table.rake_pct", 10.5),
        ("table.rake_pct", True),
        ("table.rake_pct", 51),
        ("table.rake_pct", -1),
        ("predict.enabled", 1),
        ("referral.base", "everything"),
        ("game.allowed_lengths", [1, 2]),
        ("game.allowed_lengths", []),
        ("table.tiers", [100, 50]),
        ("tournament.default_prize_split", [50, 25, 12.5]),
        ("game.traditional_points", {"single": 1, "gammon": 2}),
    ],
)
@pytest.mark.django_db
def test_invalid_values_are_rejected(key, value):
    with pytest.raises(registry.SettingValidationError):
        registry.set_value(key, value)
    assert not Setting.objects.filter(key=key).exists()


@pytest.mark.django_db
def test_unknown_key_is_rejected():
    with pytest.raises(registry.UnknownSettingError):
        registry.get("no.such.key")
