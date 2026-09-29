"""Weekly dice fairness check (CLAUDE.md §6.5): a chi-square goodness-of-fit test of die faces
against the uniform distribution, over every roll recorded in the period."""

import math
from datetime import datetime
from typing import Any

from game.models import MatchEvent


def chi_square(counts: list[int]) -> tuple[float, float]:
    """(statistic, p-value) for six faces, five degrees of freedom."""
    n = sum(counts)
    if n == 0:
        return 0.0, 1.0
    expected = n / 6
    x = sum((c - expected) ** 2 / expected for c in counts)
    return x, survival_5(x)


def survival_5(x: float) -> float:
    """P(X >= x) for a chi-square variable with 5 degrees of freedom, in closed form."""
    p = math.erfc(math.sqrt(x / 2)) + math.sqrt(2 * x / math.pi) * math.exp(-x / 2) * (1 + x / 3)
    return min(1.0, max(0.0, p))


def face_counts(start: datetime, end: datetime) -> list[int]:
    counts = [0] * 6
    rolls = MatchEvent.objects.filter(type="turn.rolled", server_ts__gte=start, server_ts__lt=end)
    for payload in rolls.values_list("payload", flat=True).iterator(chunk_size=2000):
        for die in payload.get("dice") or []:
            if 1 <= die <= 6:
                counts[die - 1] += 1
    return counts


def run(start: datetime, end: datetime) -> Any:
    from reports.models import DiceTest

    counts = face_counts(start, end)
    x, p = chi_square(counts)
    return DiceTest.objects.create(
        period_start=start, period_end=end, dice=sum(counts), counts=counts, chi_square=x, p_value=p
    )
