"""Typed settings registry (CLAUDE.md §14).

Business code reads configurable values only through `get()`. Values are cached in Redis and
invalidated on write, so admin changes take effect without a redeploy. Writes return the old and
new value so the admin API can record them in `admin_audit` (CLAUDE.md §2 rule 12).
"""

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


def _d(fa: str, ar: str, en: str) -> dict[str, str]:
    return {"fa": fa, "ar": ar, "en": en}


def _sums_to_100(v: list[float]) -> bool:
    return bool(v) and sum(Decimal(str(x)) for x in v) == 100


def _points(v: Any) -> bool:
    return (
        isinstance(v, dict)
        and set(v) == {"single", "gammon", "backgammon"}
        and all(_is_int(x) and 1 <= x <= 10 for x in v.values())
    )


_DEFS: list[SettingDef] = [
    SettingDef(
        "game.turn_seconds",
        "int",
        30,
        _d("زمان هر نوبت (ثانیه)", "مدة الدور (ثانية)", "Turn time (s)"),
        5,
        300,
    ),
    SettingDef(
        "game.timebank_seconds",
        "int",
        90,
        _d("زمان ذخیره (ثانیه)", "الوقت الاحتياطي (ثانية)", "Time bank (s)"),
        0,
        1800,
    ),
    SettingDef(
        "game.max_consecutive_timeouts",
        "int",
        3,
        _d("حداکثر اتمام زمان پیاپی", "الحد الأقصى لانتهاء الوقت المتتالي", "Max consecutive timeouts"),
        1,
        20,
    ),
    SettingDef(
        "game.reconnect_grace_seconds",
        "int",
        90,
        _d("مهلت اتصال مجدد (ثانیه)", "مهلة إعادة الاتصال (ثانية)", "Reconnect grace (s)"),
        10,
        600,
    ),
    SettingDef(
        "game.allowed_lengths",
        "int_list",
        [1, 3, 5, 7, 11],
        _d("طول‌های مجاز مسابقه", "أطوال المباراة المسموحة", "Allowed match lengths"),
        1,
        25,
        check=lambda v: bool(v) and all(x % 2 == 1 for x in v),
    ),
    SettingDef(
        "game.traditional_points",
        "json",
        {"single": 1, "gammon": 2, "backgammon": 2},
        _d("امتیاز بازی سنتی", "نقاط اللعبة التقليدية", "Traditional variant points"),
        check=_points,
    ),
    SettingDef(
        "table.rake_pct", "int", 10, _d("کارمزد میز (٪)", "عمولة الطاولة (٪)", "Table rake (%)"), 0, 50
    ),
    SettingDef(
        "table.tiers",
        "int_list",
        [50, 100, 500, 1000],
        _d("سطوح ورودی میز", "مستويات رسوم الطاولة", "Table entry tiers"),
        1,
        None,
        check=lambda v: bool(v) and v == sorted(set(v)),
    ),
    SettingDef(
        "referral.pct",
        "int",
        1,
        _d("پورسانت معرف (٪)", "عمولة الإحالة (٪)", "Referral commission (%)"),
        0,
        10,
    ),
    SettingDef(
        "referral.base",
        "str",
        "referee_entry",
        _d("مبنای پورسانت", "أساس العمولة", "Referral base"),
        choices=("referee_entry", "pot"),
    ),
    SettingDef(
        "referral.duration_days",
        "int",
        0,
        _d(
            "مدت پورسانت (روز، ۰=نامحدود)",
            "مدة العمولة (يوم، ٠=غير محدود)",
            "Referral duration (days, 0 = unlimited)",
        ),
        0,
        3650,
    ),
    SettingDef("predict.enabled", "bool", True, _d("پیش‌بینی فعال", "التوقعات مفعّلة", "Predictions enabled")),
    SettingDef(
        "predict.rake_pct",
        "int",
        10,
        _d("کارمزد پیش‌بینی (٪)", "عمولة التوقع (٪)", "Prediction rake (%)"),
        0,
        50,
    ),
    SettingDef(
        "predict.min_table_entry",
        "int",
        100,
        _d(
            "حداقل ورودی میز برای پیش‌بینی",
            "الحد الأدنى لرسوم الطاولة للتوقع",
            "Min table entry for predictions",
        ),
        0,
        None,
    ),
    SettingDef(
        "predict.max_stake_per_user",
        "int",
        1000,
        _d("سقف پیش‌بینی هر کاربر", "الحد الأقصى لرهان المستخدم", "Max stake per user"),
        1,
        None,
    ),
    SettingDef(
        "predict.max_pool_total",
        "int",
        50000,
        _d("سقف کل استخر", "الحد الأقصى للمجمع", "Max pool total"),
        1,
        None,
    ),
    SettingDef(
        "predict.min_count_for_board",
        "int",
        20,
        _d("حداقل پیش‌بینی برای جدول", "الحد الأدنى للتوقعات للوحة", "Min predictions for leaderboard"),
        1,
        None,
    ),
    SettingDef(
        "tournament.rake_pct",
        "int",
        10,
        _d("کارمزد تورنمنت (٪)", "عمولة البطولة (٪)", "Tournament rake (%)"),
        0,
        50,
    ),
    SettingDef(
        "tournament.default_prize_split",
        "number_list",
        [50, 25, 12.5, 12.5],
        _d("تقسیم جایزه پیش‌فرض (٪)", "توزيع الجوائز الافتراضي (٪)", "Default prize split (%)"),
        0,
        100,
        check=_sums_to_100,
    ),
    SettingDef(
        "bonus.daily_coins",
        "int",
        20,
        _d("سکه جایزه روزانه", "عملات المكافأة اليومية", "Daily bonus coins"),
        0,
        None,
    ),
    SettingDef(
        "xp.per_match",
        "int",
        10,
        _d("امتیاز تجربه هر مسابقه", "نقاط الخبرة لكل مباراة", "XP per match"),
        0,
        None,
    ),
    SettingDef("xp.per_win", "int", 15, _d("امتیاز تجربه برد", "نقاط الخبرة للفوز", "XP per win"), 0, None),
    SettingDef(
        "elo.k_new",
        "int",
        40,
        _d("ضریب K بازیکن جدید", "معامل K للاعب الجديد", "ELO K (new players)"),
        1,
        100,
    ),
    SettingDef("elo.k", "int", 20, _d("ضریب K", "معامل K", "ELO K"), 1, 100),
    SettingDef(
        "elo.new_threshold",
        "int",
        30,
        _d("تعداد مسابقه بازیکن جدید", "عدد مباريات اللاعب الجديد", "New-player match count"),
        0,
        1000,
    ),
    SettingDef(
        "matchmaking.elo_window",
        "int",
        150,
        _d("بازه ELO جفت‌سازی", "نطاق ELO للمطابقة", "Matchmaking ELO window"),
        0,
        3000,
    ),
    SettingDef(
        "matchmaking.widen_step",
        "int",
        50,
        _d("گام افزایش بازه", "خطوة توسيع النطاق", "Window widen step"),
        0,
        1000,
    ),
    SettingDef(
        "matchmaking.widen_seconds",
        "int",
        10,
        _d("فاصله افزایش بازه (ثانیه)", "فاصل التوسيع (ثانية)", "Widen interval (s)"),
        1,
        300,
    ),
    SettingDef(
        "username.change_cost",
        "int",
        200,
        _d("هزینه تغییر نام کاربری", "تكلفة تغيير اسم المستخدم", "Username change cost"),
        0,
        None,
    ),
    SettingDef(
        "username.change_cooldown_days",
        "int",
        30,
        _d("فاصله تغییر نام (روز)", "فترة تغيير الاسم (يوم)", "Username change cooldown (days)"),
        0,
        3650,
    ),
    SettingDef(
        "bot.entry_enabled",
        "bool",
        False,
        _d("ورودی بازی با ربات", "رسوم مباراة الروبوت", "Bot match entry enabled"),
    ),
    SettingDef(
        "live.max_spectators_per_match",
        "int",
        500,
        _d("حداکثر تماشاگر هر مسابقه", "الحد الأقصى للمشاهدين", "Max spectators per match"),
        0,
        100000,
    ),
    SettingDef(
        "live.spectator_delay_seconds",
        "int",
        0,
        _d("تأخیر پخش برای تماشاگر (ثانیه)", "تأخير البث للمشاهد (ثانية)", "Spectator delay (s)"),
        0,
        300,
    ),
    SettingDef(
        "live.spectator_reactions_enabled",
        "bool",
        True,
        _d("واکنش تماشاگران فعال", "تفاعلات المشاهدين مفعّلة", "Spectator reactions enabled"),
    ),
    SettingDef(
        "replay.retention_days",
        "int",
        0,
        _d(
            "نگهداری بازپخش (روز، ۰=همیشه)",
            "الاحتفاظ بالإعادة (يوم، ٠=دائمًا)",
            "Replay retention (days, 0 = forever)",
        ),
        0,
        None,
    ),
    SettingDef(
        "admin.topup_max_amount",
        "int",
        0,
        _d(
            "سقف شارژ دستی کیف پول (۰=نامحدود)",
            "الحد الأقصى للشحن اليدوي (٠=غير محدود)",
            "Admin top-up cap (0 = none)",
        ),
        0,
        None,
    ),
]

REGISTRY: dict[str, SettingDef] = {d.key: d for d in _DEFS}
assert len(REGISTRY) == len(_DEFS), "duplicate setting key"
for _defn in _DEFS:
    validate(_defn, _defn.default)


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
        transaction.on_commit(lambda: cache.delete(CACHE_PREFIX + key))
    return before, value


def reset(key: str) -> tuple[Any, Any]:
    """Drop the override so the default applies again."""
    defn = definition(key)
    with transaction.atomic():
        before = get(key)
        Setting.objects.filter(key=key).delete()
        transaction.on_commit(lambda: cache.delete(CACHE_PREFIX + key))
    return before, defn.default
