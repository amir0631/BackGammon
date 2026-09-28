"""Leaderboard periods in Iranian time (CLAUDE.md §8, §11.3): the week starts on Saturday and the month
is the Jalali month, both in Asia/Tehran. Jalali conversion is Borkowski's algorithm (the same as
@bg/i18n's jalali.ts)."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TEHRAN = ZoneInfo("Asia/Tehran")
_BREAKS = [
    -61,
    9,
    38,
    199,
    426,
    686,
    756,
    818,
    1111,
    1181,
    1210,
    1635,
    2060,
    2097,
    2192,
    2262,
    2324,
    2394,
    2456,
    3178,
]


def _div(a: int, b: int) -> int:
    return int(a / b)


def _mod(a: int, b: int) -> int:
    return a - int(a / b) * b


def _jal_cal(jy: int) -> tuple[int, int, int]:
    gy = jy + 621
    leap_j = -14
    jp = _BREAKS[0]
    jump = 0
    for jm in _BREAKS[1:]:
        jump = jm - jp
        if jy < jm:
            break
        leap_j += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4)
        jp = jm
    n = jy - jp
    leap_j += _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4)
    if _mod(jump, 33) == 4 and jump - n == 4:
        leap_j += 1
    leap_g = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
    march = 20 + leap_j - leap_g
    if jump - n < 6:
        n = n - jump + _div(jump + 4, 33) * 33
    leap = _mod(_mod(n + 1, 33) - 1, 4)
    return (4 if leap == -1 else leap), gy, march


def to_jalali(d: date) -> tuple[int, int, int]:
    jy = d.year - 621
    leap, gy, march = _jal_cal(jy)
    k = (d - date(gy, 3, march)).days
    if k >= 0:
        if k <= 185:
            return jy, 1 + k // 31, k % 31 + 1
        k -= 186
    else:
        jy -= 1
        k += 179
        if leap == 1:
            k += 1
    return jy, 7 + k // 30, k % 30 + 1


def to_gregorian(jy: int, jm: int, jd: int) -> date:
    _leap, gy, march = _jal_cal(jy)
    return date(gy, 3, march) + timedelta(days=(jm - 1) * 31 - (jm // 7) * (jm - 7) + jd - 1)


@dataclass(frozen=True)
class Period:
    key: str
    start: datetime
    end: datetime  # exclusive


def _at(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=TEHRAN)


def week(now: datetime) -> Period:
    today = now.astimezone(TEHRAN).date()
    start = today - timedelta(days=(today.weekday() - 5) % 7)  # Saturday = 5
    return Period(f"lb:week:{start.isoformat()}", _at(start), _at(start + timedelta(days=7)))


def month(now: datetime) -> Period:
    jy, jm, _ = to_jalali(now.astimezone(TEHRAN).date())
    nxt = (jy + 1, 1) if jm == 12 else (jy, jm + 1)
    return Period(f"lb:month:{jy}-{jm:02d}", _at(to_gregorian(jy, jm, 1)), _at(to_gregorian(*nxt, 1)))
