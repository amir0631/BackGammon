"""Backgammon rules engine (CLAUDE.md §5, §6). Pure Python: no Django imports, so the bot and tests
can use it directly.

Coordinates: `Position.board[i]` is absolute point i+1 seen from player A (0), positive for A's
checkers and negative for B's. A moves from 24 down to 1 (home 1-6); B moves from 1 up to 24 (home
19-24). Moves are always written in the mover's own numbering: from 24..1 or 25 for the bar, to 24..1
or 0 for off, like "24/18 13/11" in backgammon notation.
"""

from game.engine.board import A, B, Position, initial_position, pip_count
from game.engine.moves import IllegalMove, Play, Step, apply_play, legal_plays, validate_play

__all__ = [
    "A",
    "B",
    "IllegalMove",
    "Play",
    "Position",
    "Step",
    "apply_play",
    "initial_position",
    "legal_plays",
    "pip_count",
    "validate_play",
]
