"""Bot decisions (CLAUDE.md §9): choose_move(position, dice, level) and cube_decision(position, level).

Levels differ by evaluation noise, so `easy` misjudges close plays and `hard` plays its best. Noise is
a hash of the inputs and a per-match seed: the same situation gets the same decision, which keeps
bot matches reproducible from their event log. `hard` can later swap in a neural-net evaluator.
"""

import hashlib
import math
from dataclasses import dataclass

from bot.evaluator import Evaluator, HeuristicEvaluator
from game.engine.board import Position
from game.engine.moves import legal_plays

LEVELS = ("easy", "medium", "hard")
NOISE = {"easy": 14.0, "medium": 5.0, "hard": 0.0}  # standard deviation in pips
ROLL_EDGE = 8.0  # being on roll is worth about this many pips
SCALE = 18.0  # pips per logistic unit when turning an evaluation into a winning chance

_default = HeuristicEvaluator()
_evaluators: dict[str, Evaluator] = {level: _default for level in LEVELS}


def set_evaluator(level: str, evaluator: Evaluator) -> None:
    """Swap the evaluator of a level (e.g. a neural net for `hard`)."""
    _evaluators[level] = evaluator


def relative(position: Position, player: int, level: str) -> float:
    """Zero-sum score: the player's evaluation minus the opponent's (a symmetric position scores 0)."""
    evaluator = _evaluators[level]
    return (evaluator.evaluate(position, player) - evaluator.evaluate(position, 1 - player)) / 2


def _noise(level: str, seed: int, *parts: object) -> float:
    sd = NOISE[level]
    if not sd:
        return 0.0
    digest = hashlib.sha256(repr((seed, level, *parts)).encode()).digest()
    # Box-Muller from two uniform values in (0, 1].
    u1 = (int.from_bytes(digest[:8], "big") + 1) / 2**64
    u2 = int.from_bytes(digest[8:16], "big") / 2**64
    return sd * math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)


def choose_move(
    position: Position, player: int, dice: tuple[int, int], level: str, seed: int = 0
) -> list[list[int]]:
    """The bot's full move as [from, to] pairs in its own numbering; [] when it cannot move."""
    if level not in LEVELS:
        raise ValueError(f"unknown level {level!r}")
    plays = legal_plays(position, player, dice)
    if not plays:
        return []
    key = position.encode()
    scored = [
        (relative(p.position, player, level) + _noise(level, seed, key, dice, i), -i, p)
        for i, p in enumerate(plays)
    ]
    return max(scored, key=lambda t: (t[0], t[1]))[2].as_lists()


def win_chance(position: Position, player: int, on_roll: bool, level: str) -> float:
    edge = relative(position, player, level) + (ROLL_EDGE if on_roll else -ROLL_EDGE)
    return 1 / (1 + math.exp(-edge / SCALE))


@dataclass(frozen=True)
class CubeDecision:
    double: bool
    take: bool


def cube_decision(position: Position, player: int, level: str, seed: int = 0) -> CubeDecision:
    """`double`: whether `player`, on roll, should offer. `take`: whether `player`, facing a double from
    the opponent who is on roll, should take."""
    jitter = _noise(level, seed, position.encode(), "cube") / 100
    p_on_roll = win_chance(position, player, on_roll=True, level=level) + jitter
    p_facing = win_chance(position, player, on_roll=False, level=level) + jitter
    # Double in the window where the opponent should still take; beyond it, play on for a gammon.
    double = 0.68 <= p_on_roll <= 0.86
    take = p_facing >= 0.25
    return CubeDecision(double=double, take=take)
