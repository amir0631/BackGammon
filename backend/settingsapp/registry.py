"""Typed settings registry (CLAUDE.md §14).

Business code reads configurable values only through `get()`. Values are cached in Redis and
invalidated on write, so admin changes take effect without a redeploy. Writes return the old and
new value so the admin API can record them in `admin_audit` (CLAUDE.md §2 rule 12).
"""

import itertools
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.db import transaction

from config.errors import AppError
from settingsapp.models import Setting

CACHE_PREFIX = "setting:v1:"
_MISSING = object()


class SettingValidationError(AppError):
    code = "SETTING_INVALID"
    message_key = "errors.settings.invalid"


class UnknownSettingError(AppError):
    status_code = 404
    code = "SETTING_UNKNOWN"
    message_key = "errors.settings.unknown"


@dataclass(frozen=True)
class SettingDef:
    key: str
    kind: str  # int | bool | str | int_list | number_list | json
    default: Any
    description: dict[str, str]
    min: int | None = None
    max: int | None = None
    choices: tuple[str, ...] | None = None
    check: Callable[[Any], bool] | None = field(default=None, compare=False)


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _is_number(v: Any) -> bool:
    return (_is_int(v) or isinstance(v, float)) and v == v  # rejects NaN


_TYPE_CHECKS: dict[str, Callable[[Any], bool]] = {
    "int": _is_int,
    "bool": lambda v: isinstance(v, bool),
    "str": lambda v: isinstance(v, str),
    "int_list": lambda v: isinstance(v, list) and all(_is_int(x) for x in v),
    "number_list": lambda v: isinstance(v, list) and all(_is_number(x) for x in v),
    "json": lambda v: isinstance(v, dict | list),
}


def validate(defn: SettingDef, value: Any) -> None:
    if not _TYPE_CHECKS[defn.kind](value):
        raise SettingValidationError(details={"key": defn.key, "reason": "type", "expected": defn.kind})

    items = value if defn.kind in {"int_list", "number_list"} else [value] if defn.kind == "int" else []
    for item in items:
        if defn.min is not None and item < defn.min:
            raise SettingValidationError(details={"key": defn.key, "reason": "min", "min": defn.min})
        if defn.max is not None and item > defn.max:
            raise SettingValidationError(details={"key": defn.key, "reason": "max", "max": defn.max})
    if defn.choices is not None and value not in defn.choices:
        raise SettingValidationError(details={"key": defn.key, "reason": "choice", "choices": defn.choices})
    if defn.check is not None and not defn.check(value):
        raise SettingValidationError(details={"key": defn.key, "reason": "check"})


def _d(fa: str, en: str) -> dict[str, str]:
    return {"fa": fa, "en": en}


def _sums_to_100(v: list[float]) -> bool:
    return bool(v) and sum(Decimal(str(x)) for x in v) == 100


def _points(v: Any) -> bool:
    return (
        isinstance(v, dict)
        and set(v) == {"single", "gammon", "backgammon"}
        and all(_is_int(x) and 1 <= x <= 10 for x in v.values())
    )


def _e164_sender(v: str) -> bool:
    return re.fullmatch(r"\+\d{6,18}", v) is not None


def _pattern_code(v: str) -> bool:
    return re.fullmatch(r"[A-Za-z0-9]{6,40}", v) is not None


_DEFS: list[SettingDef] = [
    SettingDef(
        "game.turn_seconds",
        "int",
        30,
        _d("زمان هر نوبت (ثانیه)", "Turn time (s)"),
        5,
        300,
    ),
    SettingDef(
        "game.timebank_seconds",
        "int",
        90,
        _d("زمان ذخیره (ثانیه)", "Time bank (s)"),
        0,
        1800,
    ),
    SettingDef(
        "game.max_consecutive_timeouts",
        "int",
        3,
        _d("حداکثر اتمام زمان پیاپی", "Max consecutive timeouts"),
        1,
        20,
    ),
    SettingDef(
        "game.reconnect_grace_seconds",
        "int",
        90,
        _d("مهلت اتصال مجدد (ثانیه)", "Reconnect grace (s)"),
        10,
        600,
    ),
    SettingDef(
        "game.allowed_lengths",
        "int_list",
        [1, 3, 5, 7, 11],
        _d("طول‌های مجاز مسابقه", "Allowed match lengths"),
        1,
        25,
        check=lambda v: bool(v) and all(x % 2 == 1 for x in v),
    ),
    SettingDef(
        "game.traditional_points",
        "json",
        {"single": 1, "gammon": 2, "backgammon": 2},
        _d("امتیاز بازی سنتی", "Traditional variant points"),
        check=_points,
    ),
    SettingDef("table.rake_pct", "int", 10, _d("کارمزد میز (٪)", "Table rake (%)"), 0, 50),
    SettingDef(
        "table.tiers",
        "int_list",
        [50, 100, 500, 1000],
        _d("سطوح ورودی میز", "Table entry tiers"),
        1,
        None,
        check=lambda v: bool(v) and v == sorted(set(v)),
    ),
    SettingDef(
        "referral.pct",
        "int",
        1,
        _d("پورسانت معرف (٪)", "Referral commission (%)"),
        0,
        10,
    ),
    SettingDef(
        "referral.base",
        "str",
        "referee_entry",
        _d("مبنای پورسانت", "Referral base"),
        choices=("referee_entry", "pot"),
    ),
    SettingDef(
        "referral.duration_days",
        "int",
        0,
        _d("مدت پورسانت (روز، ۰=نامحدود)", "Referral duration (days, 0 = unlimited)"),
        0,
        3650,
    ),
    SettingDef("predict.enabled", "bool", True, _d("پیش‌بینی فعال", "Predictions enabled")),
    SettingDef(
        "predict.rake_pct",
        "int",
        10,
        _d("کارمزد پیش‌بینی (٪)", "Prediction rake (%)"),
        0,
        50,
    ),
    SettingDef(
        "predict.min_table_entry",
        "int",
        100,
        _d("حداقل ورودی میز برای پیش‌بینی", "Min table entry for predictions"),
        0,
        None,
    ),
    SettingDef(
        "predict.max_stake_per_user",
        "int",
        1000,
        _d("سقف پیش‌بینی هر کاربر", "Max stake per user"),
        1,
        None,
    ),
    SettingDef(
        "predict.max_pool_total",
        "int",
        50000,
        _d("سقف کل استخر", "Max pool total"),
        1,
        None,
    ),
    SettingDef(
        "predict.min_count_for_board",
        "int",
        20,
        _d("حداقل پیش‌بینی برای جدول", "Min predictions for leaderboard"),
        1,
        None,
    ),
    SettingDef(
        "tournament.rake_pct",
        "int",
        10,
        _d("کارمزد تورنمنت (٪)", "Tournament rake (%)"),
        0,
        50,
    ),
    SettingDef(
        "tournament.default_prize_split",
        "number_list",
        [50, 25, 12.5, 12.5],
        _d("تقسیم جایزه پیش‌فرض (٪)", "Default prize split (%)"),
        0,
        100,
        check=_sums_to_100,
    ),
    SettingDef(
        "bonus.signup_coins",
        "int",
        100,
        _d("سکه هدیه ثبت‌نام", "Signup bonus coins"),
        0,
        None,
    ),
    SettingDef("coin.price_toman", "int", 1000, _d("قیمت هر سکه (تومان)", "Price per coin (toman)"), 1, None),
    SettingDef(
        "shop.custom_min_toman",
        "int",
        10_000,
        _d("حداقل خرید دلخواه (تومان)", "Custom purchase minimum (toman)"),
        1,
        None,
    ),
    SettingDef(
        "shop.custom_max_toman",
        "int",
        10_000_000,
        _d("حداکثر خرید دلخواه (تومان)", "Custom purchase maximum (toman)"),
        1,
        None,
    ),
    SettingDef("transfer.min_coins", "int", 10, _d("حداقل انتقال سکه", "Minimum transfer (coins)"), 1, None),
    SettingDef(
        "transfer.daily_max_coins",
        "int",
        5000,
        _d("سقف انتقال روزانه (سکه)", "Daily transfer cap (coins)"),
        1,
        None,
    ),
    SettingDef("transfer.fee_pct", "int", 0, _d("کارمزد انتقال (٪)", "Transfer fee (%)"), 0, 50),
    SettingDef(
        "withdraw.min_coins", "int", 100, _d("حداقل برداشت (سکه)", "Minimum withdrawal (coins)"), 1, None
    ),
    SettingDef(
        "withdraw.daily_max_coins",
        "int",
        10_000,
        _d("سقف برداشت روزانه (سکه)", "Daily withdrawal cap (coins)"),
        1,
        None,
    ),
    SettingDef("withdraw.fee_pct", "int", 0, _d("کارمزد برداشت (٪)", "Withdrawal fee (%)"), 0, 50),
    SettingDef(
        "xp.per_match",
        "int",
        10,
        _d("امتیاز تجربه هر مسابقه", "XP per match"),
        0,
        None,
    ),
    SettingDef("xp.per_win", "int", 15, _d("امتیاز تجربه برد", "XP per win"), 0, None),
    SettingDef(
        "xp.level_thresholds",
        "int_list",
        [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6200, 7600, 9200, 11000],
        _d("تجربهٔ لازم برای سطح ۲ به بعد", "XP to reach level 2, 3, ..."),
        1,
        None,
        check=lambda v: all(a < b for a, b in itertools.pairwise(v)),
    ),
    SettingDef(
        "elo.k_new",
        "int",
        40,
        _d("ضریب K بازیکن جدید", "ELO K (new players)"),
        1,
        100,
    ),
    SettingDef("elo.k", "int", 20, _d("ضریب K", "ELO K"), 1, 100),
    SettingDef(
        "elo.new_threshold",
        "int",
        30,
        _d("تعداد مسابقه بازیکن جدید", "New-player match count"),
        0,
        1000,
    ),
    SettingDef(
        "matchmaking.elo_window",
        "int",
        150,
        _d("بازه ELO جفت‌سازی", "Matchmaking ELO window"),
        0,
        3000,
    ),
    SettingDef(
        "matchmaking.widen_step",
        "int",
        50,
        _d("گام افزایش بازه", "Window widen step"),
        0,
        1000,
    ),
    SettingDef(
        "matchmaking.widen_seconds",
        "int",
        10,
        _d("فاصله افزایش بازه (ثانیه)", "Widen interval (s)"),
        1,
        300,
    ),
    SettingDef(
        "username.change_cost",
        "int",
        200,
        _d("هزینه تغییر نام کاربری", "Username change cost"),
        0,
        None,
    ),
    SettingDef(
        "username.change_cooldown_days",
        "int",
        30,
        _d("فاصله تغییر نام (روز)", "Username change cooldown (days)"),
        0,
        3650,
    ),
    SettingDef(
        "bot.entry_enabled",
        "bool",
        False,
        _d("ورودی بازی با ربات", "Bot match entry enabled"),
    ),
    SettingDef(
        "live.max_spectators_per_match",
        "int",
        500,
        _d("حداکثر تماشاگر هر مسابقه", "Max spectators per match"),
        0,
        100000,
    ),
    SettingDef(
        "live.spectator_delay_seconds",
        "int",
        0,
        _d("تأخیر پخش برای تماشاگر (ثانیه)", "Spectator delay (s)"),
        0,
        300,
    ),
    SettingDef(
        "live.spectator_reactions_enabled",
        "bool",
        True,
        _d("واکنش تماشاگران فعال", "Spectator reactions enabled"),
    ),
    SettingDef(
        "replay.retention_days",
        "int",
        0,
        _d("نگهداری بازپخش (روز، ۰=همیشه)", "Replay retention (days, 0 = forever)"),
        0,
        None,
    ),
    SettingDef(
        "admin.topup_max_amount",
        "int",
        10_000,
        _d("سقف شارژ دستی کیف پول (سکه، ۰=نامحدود)", "Admin top-up cap (coins, 0 = none)"),
        0,
        None,
    ),
    # SMS through IPPanel Edge (sms.md). The API key is a secret and stays in the environment.
    # Off until the sender line and patterns are approved: signup skips the code step, password
    # reset by SMS is unavailable, and withdrawals are confirmed with the account password.
    SettingDef("sms.enabled", "bool", False, _d("ارسال پیامک فعال است", "SMS sending enabled")),
    SettingDef(
        "sms.from_number",
        "str",
        "+983000505",
        _d("شماره فرستنده پیامک", "SMS sender number"),
        check=_e164_sender,
    ),
    SettingDef(
        "sms.pattern_otp",
        "str",
        "77j9q04y28txoy6",
        _d("کد الگوی پیامک کد تأیید", "OTP SMS pattern code"),
        check=_pattern_code,
    ),
    SettingDef(
        "sms.pattern_withdrawal_paid",
        "str",
        "t1lf706mnokv21n",
        _d("کد الگوی پیامک واریز برداشت", "Withdrawal-paid SMS pattern code"),
        check=_pattern_code,
    ),
    SettingDef(
        "sms.low_credit_alert_rial",
        "int",
        1_000_000,
        _d("هشدار کمبود اعتبار پیامک (ریال)", "Low SMS credit alert (rial)"),
        0,
        None,
    ),
    # OTP and login protection (CLAUDE.md §12.1)
    SettingDef("otp.ttl_seconds", "int", 120, _d("اعتبار کد تأیید (ثانیه)", "OTP validity (s)"), 30, 900),
    SettingDef(
        "otp.max_attempts", "int", 5, _d("حداکثر تلاش اشتباه کد تأیید", "Max wrong OTP attempts"), 1, 20
    ),
    SettingDef(
        "otp.rate_limit_count",
        "int",
        3,
        _d("تعداد مجاز درخواست کد در بازه", "OTP requests allowed per window"),
        1,
        50,
    ),
    SettingDef(
        "otp.rate_limit_window_seconds",
        "int",
        600,
        _d("بازه محدودیت درخواست کد (ثانیه)", "OTP rate-limit window (s)"),
        60,
        86_400,
    ),
    SettingDef(
        "otp.resend_cooldown_seconds",
        "int",
        60,
        _d("فاصله ارسال مجدد کد (ثانیه)", "OTP resend cooldown (s)"),
        10,
        900,
    ),
    SettingDef(
        "admin.login_max_failures",
        "int",
        5,
        _d("حداکثر ورود ناموفق ادمین پیش از قفل", "Admin failed logins before lock"),
        1,
        50,
    ),
    SettingDef(
        "admin.login_lock_seconds",
        "int",
        900,
        _d("مدت قفل ورود ادمین (ثانیه)", "Admin login lock duration (s)"),
        60,
        86_400,
    ),
    SettingDef(
        "auth.login_max_failures",
        "int",
        5,
        _d("حداکثر ورود ناموفق پیش از قفل", "Failed logins before lock"),
        1,
        50,
    ),
    SettingDef(
        "auth.login_lock_seconds",
        "int",
        900,
        _d("مدت قفل ورود (ثانیه)", "Login lock duration (s)"),
        60,
        86_400,
    ),
]

REGISTRY: dict[str, SettingDef] = {d.key: d for d in _DEFS}
assert len(REGISTRY) == len(_DEFS), "duplicate setting key"
for _defn in _DEFS:
    validate(_defn, _defn.default)


_UNITS: dict[str, str] = {
    "table.tiers": "coins",
    "game.allowed_lengths": "points",
    "tournament.default_prize_split": "percent",
    "admin.topup_max_amount": "coins",
    "bonus.signup_coins": "coins",
    "username.change_cost": "coins",
    "xp.per_match": "xp",
    "xp.per_win": "xp",
    "xp.level_thresholds": "xp",
}
_SUFFIX_UNITS = [
    ("_seconds", "seconds"),
    ("_days", "days"),
    ("_pct", "percent"),
    ("_toman", "toman"),
    ("_rial", "rial"),
    ("_coins", "coins"),
    ("_stake_per_user", "coins"),
    ("_pool_total", "coins"),
    ("_table_entry", "coins"),
]


def unit(key: str) -> str | None:
    """Display unit for the admin panel: seconds, days, percent, coins, toman, rial, points, xp."""
    if key in _UNITS:
        return _UNITS[key]
    return next((u for suffix, u in _SUFFIX_UNITS if key.endswith(suffix)), None)


def definition(key: str) -> SettingDef:
    try:
        return REGISTRY[key]
    except KeyError:
        raise UnknownSettingError(details={"key": key}) from None


def get(key: str) -> Any:
    defn = definition(key)
    cached = cache.get(CACHE_PREFIX + key, _MISSING)
    if cached is not _MISSING:
        return cached
    row = Setting.objects.filter(key=key).values_list("value", flat=True).first()
    value = defn.default if row is None else row
    cache.set(CACHE_PREFIX + key, value, timeout=None)
    return value


def set_value(key: str, value: Any) -> tuple[Any, Any]:
    """Validate and store a value. Returns (before, after) for the caller's audit record."""
    defn = definition(key)
    validate(defn, value)
    with transaction.atomic():
        before = get(key)
        Setting.objects.update_or_create(key=key, defaults={"value": value})
        # Drop the cached value now (so this transaction reads its own write) and again after
        # commit (in case a concurrent reader re-cached the old value in between).
        cache.delete(CACHE_PREFIX + key)
        transaction.on_commit(lambda: cache.delete(CACHE_PREFIX + key))
    return before, value


def reset(key: str) -> tuple[Any, Any]:
    """Drop the override so the default applies again."""
    defn = definition(key)
    with transaction.atomic():
        before = get(key)
        Setting.objects.filter(key=key).delete()
        # Drop the cached value now (so this transaction reads its own write) and again after
        # commit (in case a concurrent reader re-cached the old value in between).
        cache.delete(CACHE_PREFIX + key)
        transaction.on_commit(lambda: cache.delete(CACHE_PREFIX + key))
    return before, defn.default
