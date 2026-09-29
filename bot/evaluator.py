"""Heuristic evaluation of a position for the side to move next after a play (CLAUDE.md §9)."""

from typing import Protocol

from game.engine.board import BAR, CHECKERS, Position, view

# Rolls out of 36 that hit a blot at a given distance, ignoring blocks (standard shot table).
SHOTS = {
    1: 11,
    2: 12,
    3: 14,
    4: 15,
    5: 15,
    6: 17,
    7: 6,
    8: 6,
    9: 5,
    10: 3,
    11: 2,
    12: 3,
    15: 1,
    16: 1,
    18: 1,
    20: 1,
    24: 1,
}


class Evaluator(Protocol):
    def evaluate(self, position: Position, player: int) -> float:
        """Higher is better for `player`. Roughly in pips."""
        ...


def _longest_prime(points: list[int]) -> int:
    best = run = 0
    for p in range(1, 25):
        run = run + 1 if points[p] >= 2 else 0
        best = max(best, run)
    return best


def is_race(mine: list[int], theirs: list[int]) -> bool:
    """No more contact: my rearmost checker is past their rearmost (in my numbering they move up)."""
    my_back = max((p for p in range(1, 26) if mine[p]), default=0)
    their_back = min((p for p in range(0, 25) if theirs[p] and p > 0), default=25)
    if theirs[BAR]:
        their_back = 0
    return my_back < their_back


class HeuristicEvaluator:
    """Weights tuned by hand for sensible play; `weights` lets tests and levels vary them."""

    def __init__(self, weights: dict[str, float] | None = None) -> None:
        self.w = {
            "pip": 1.0,
            "blot": 0.9,
            "made": 2.0,
            "home_made": 3.0,
            "prime": 4.0,
            "their_bar": 8.0,
            "off": 3.5,
            "stack": 0.6,
            "anchor": 3.0,
            **(weights or {}),
        }

    def evaluate(self, position: Position, player: int) -> float:
        mine, theirs = view(position, player)
        w = self.w
        my_pip = sum(p * mine[p] for p in range(1, 26))
        # In my numbering the opponent moves upward; its pip count is 25 - p per checker, 25 on its bar.
        their_pip = sum((25 - p) * theirs[p] for p in range(1, 25)) + 25 * theirs[BAR]
        score = w["pip"] * (their_pip - my_pip)
        score += w["off"] * (mine[0] - theirs[0])
        if is_race(mine, theirs):
            return score + (CHECKERS - mine[0]) * -0.1

        made = [p for p in range(1, 25) if mine[p] >= 2]
        score += w["made"] * len(made)
        score += w["home_made"] * sum(1 for p in made if p <= 6)
        score += w["prime"] * max(0, _longest_prime(mine) - 1)
        score += w["their_bar"] * theirs[BAR]
        score -= w["stack"] * sum(max(0, mine[p] - 3) for p in range(1, 25))
        if any(mine[p] >= 2 for p in range(19, 25)):
            score += w["anchor"]

        # Blots: rolls that hit them, times the pips a hit costs (25 - p to come back from the bar).
        for p in range(1, 25):
            if mine[p] != 1:
                continue
            rolls = 0
            for q in range(0, p):
                if q == 0:
                    shooters = theirs[BAR]
                    distance = p  # entering checkers come in at my point d
                else:
                    shooters = theirs[q]
                    distance = p - q
                if shooters and distance in SHOTS:
                    rolls += SHOTS[distance]
            if rolls:
                score -= w["blot"] * min(36, rolls) / 36 * (25 - p) * 0.5
        return score
