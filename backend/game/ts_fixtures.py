"""Fixtures for packages/game-core: engine positions with their legal plays, so the TypeScript turn
builder is tested against the Python rules. Regenerate with `manage.py engine_fixtures`; a test fails
when the file is out of date."""

import hashlib
import json
from pathlib import Path
from typing import Any

from game.engine.board import A, B, initial_position
from game.engine.moves import legal_plays

PATH = Path(__file__).resolve().parents[2] / "packages" / "game-core" / "fixtures" / "legal.json"
GAMES = 12
MAX_CASES = 100


def _die(tag: str) -> int:
    return hashlib.sha256(tag.encode()).digest()[0] % 6 + 1


def generate() -> str:
    cases: list[dict[str, Any]] = []
    for g in range(GAMES):
        position = initial_position()
        player = A if g % 2 == 0 else B
        for turn in range(400):
            dice = (_die(f"{g}:{turn}:0"), _die(f"{g}:{turn}:1"))
            plays = legal_plays(position, player, dice)
            if turn % 3 == 0 or len(plays) <= 1 or dice[0] == dice[1]:
                cases.append(
                    {
                        "position": position.encode(),
                        "player": player,
                        "dice": list(dice),
                        "legal": [p.as_lists() for p in plays],
                        "finals": sorted(p.position.encode() for p in plays),
                    }
                )
            if plays:
                choice = hashlib.sha256(f"{g}:{turn}:pick".encode()).digest()[0] % len(plays)
                position = plays[choice].position
            if position.winner() is not None:
                break
            player = B if player == A else A
    return json.dumps(cases[:MAX_CASES], separators=(",", ":")) + "\n"
