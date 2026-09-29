"""Match state machine (CLAUDE.md §5.1-§5.4): opening roll, turns, doubling cube, Crawford rule, scoring,
resignation, and forfeits. Pure data plus transitions; the real-time layer supplies dice, timers, and
persistence. `to_dict`/`from_dict` round-trip the whole state for storage.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from game.engine.board import A, B, Position, initial_position, opponent, view
from game.engine.moves import Play, legal_plays, validate_play

POINTS_STANDARD = {"single": 1, "gammon": 2, "backgammon": 3}
ALLOWED_LENGTHS = (1, 3, 5, 7, 11)


class Variant(StrEnum):
    STANDARD_CUBE = "standard_cube"
    STANDARD_NOCUBE = "standard_nocube"
    TRADITIONAL = "traditional"


class Phase(StrEnum):
    OPENING = "opening"  # both players roll one die; the higher starts with those two numbers
    ROLL = "roll"  # the player on turn may double, then rolls
    MOVE = "move"  # dice rolled, the player on turn moves
    CUBE = "cube_offered"  # the opponent must take or drop
    GAME_OVER = "game_over"  # waiting for next_game()
    MATCH_OVER = "match_over"


class RuleError(Exception):
    """An action that the rules do not allow in the current state (wrong turn, phase, or cube)."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Rules:
    variant: Variant
    length: int
    points: dict[str, int]
    cube_max: int = 64

    @classmethod
    def for_variant(
        cls, variant: str, length: int, traditional_points: dict[str, int] | None = None
    ) -> "Rules":
        v = Variant(variant)
        if length not in ALLOWED_LENGTHS:
            raise ValueError(f"match length must be one of {ALLOWED_LENGTHS}")
        if v == Variant.TRADITIONAL:
            points = dict(traditional_points or {"single": 1, "gammon": 2, "backgammon": 2})
        else:
            points = dict(POINTS_STANDARD)
        return cls(v, length, points)

    @property
    def cube_enabled(self) -> bool:
        return self.variant == Variant.STANDARD_CUBE

    def as_dict(self) -> dict[str, Any]:
        return {
            "variant": str(self.variant),
            "length": self.length,
            "points": self.points,
            "cube_max": self.cube_max,
        }


@dataclass(frozen=True)
class GameResult:
    game_no: int
    winner: int
    kind: str  # single | gammon | backgammon
    cube: int
    points: int
    reason: str  # bear_off | drop | resign

    def as_dict(self) -> dict[str, Any]:
        return {
            "game_no": self.game_no,
            "winner": self.winner,
            "kind": self.kind,
            "cube": self.cube,
            "points": self.points,
            "reason": self.reason,
        }


def loss_kind(position: Position, loser: int) -> str:
    """Gammon: the loser has borne off nothing. Backgammon: also has a checker on the bar or in the
    winner's home board."""
    if position.off[loser]:
        return "single"
    winner = opponent(loser)
    _, loser_checkers = view(position, winner)
    if position.bar[loser] or any(loser_checkers[p] for p in range(1, 7)):
        return "backgammon"
    return "gammon"


@dataclass
class Match:
    rules: Rules
    score: list[int] = field(default_factory=lambda: [0, 0])
    game_no: int = 0
    crawford_played: bool = False
    crawford_game: bool = False
    position: Position = field(default_factory=initial_position)
    turn: int | None = None
    phase: Phase = Phase.GAME_OVER
    dice: tuple[int, int] | None = None
    cube_value: int = 1
    cube_owner: int | None = None  # None: centered
    winner: int | None = None
    end_reason: str | None = None  # points | resign | forfeit:<reason>
    results: list[GameResult] = field(default_factory=list)

    # ---- lifecycle ----

    @classmethod
    def start(cls, rules: Rules) -> "Match":
        match = cls(rules)
        match.next_game()
        return match

    def next_game(self) -> None:
        if self.phase != Phase.GAME_OVER:
            raise RuleError("phase")
        length = self.rules.length
        at_edge = [s == length - 1 for s in self.score]
        self.crawford_game = self.rules.cube_enabled and not self.crawford_played and at_edge[A] != at_edge[B]
        if self.crawford_game:
            self.crawford_played = True
        self.game_no += 1
        self.position = initial_position()
        self.turn = None
        self.phase = Phase.OPENING
        self.dice = None
        self.cube_value = 1
        self.cube_owner = None

    def opening_roll(self, die_a: int, die_b: int) -> int | None:
        """Each player's single die. Returns the starter, or None on a tie (roll again)."""
        self._require(Phase.OPENING)
        if die_a == die_b:
            return None
        self.turn = A if die_a > die_b else B
        self.dice = (die_a, die_b)
        self.phase = Phase.MOVE
        return self.turn

    # ---- turn actions ----

    def can_double(self, player: int) -> bool:
        return (
            self.rules.cube_enabled
            and self.phase == Phase.ROLL
            and self.turn == player
            and not self.crawford_game
            and self.cube_owner in (None, player)
            and self.cube_value < self.rules.cube_max
        )

    def offer_double(self, player: int) -> None:
        if not self.can_double(player):
            raise RuleError("cube")
        self.phase = Phase.CUBE

    def take(self, player: int) -> None:
        self._require(Phase.CUBE)
        if player == self.turn:
            raise RuleError("turn")
        self.cube_value *= 2
        self.cube_owner = player
        self.phase = Phase.ROLL

    def drop(self, player: int) -> GameResult:
        self._require(Phase.CUBE)
        if player == self.turn:
            raise RuleError("turn")
        return self._end_game(opponent(player), "single", "drop")

    def roll(self, player: int, dice: tuple[int, int]) -> list[Play]:
        """Records the server's dice and returns the legal plays (empty: the turn must pass)."""
        self._require(Phase.ROLL, player)
        self.dice = dice
        self.phase = Phase.MOVE
        return self.legal()

    def legal(self) -> list[Play]:
        self._require(Phase.MOVE)
        assert self.turn is not None and self.dice is not None
        return legal_plays(self.position, self.turn, self.dice)

    def play(self, player: int, moves: list[list[int]]) -> tuple[Play, GameResult | None]:
        """Validates and applies a full move. Returns the play and the game result if it ended the game."""
        self._require(Phase.MOVE, player)
        assert self.dice is not None
        chosen = validate_play(self.position, player, self.dice, moves)
        self.position = chosen.position
        if self.position.winner() == player:
            return chosen, self._end_game(player, loss_kind(self.position, opponent(player)), "bear_off")
        self._pass()
        return chosen, None

    def pass_turn(self, player: int) -> None:
        """Only when the roll has no legal play."""
        self._require(Phase.MOVE, player)
        if self.legal():
            raise RuleError("must_move")
        self._pass()

    def resign(self, player: int, scope: str) -> GameResult | None:
        """`game`: the opponent gets the current game's full value (gammon or backgammon if the position
        shows one, times the cube). `match`: the opponent wins the match."""
        if self.phase == Phase.MATCH_OVER:
            raise RuleError("phase")
        if scope == "match":
            self._end_match(opponent(player), "resign")
            return None
        if scope != "game" or self.phase == Phase.GAME_OVER:
            raise RuleError("scope")
        return self._end_game(opponent(player), loss_kind(self.position, player), "resign")

    def forfeit(self, player: int, reason: str) -> None:
        """Timeouts or an expired reconnect grace (§5.4): the opponent wins the match."""
        if self.phase == Phase.MATCH_OVER:
            raise RuleError("phase")
        self._end_match(opponent(player), f"forfeit:{reason}")

    # ---- helpers ----

    def _require(self, phase: Phase, player: int | None = None) -> None:
        if self.phase != phase:
            raise RuleError("phase")
        if player is not None and self.turn != player:
            raise RuleError("turn")

    def _pass(self) -> None:
        assert self.turn is not None
        self.turn = opponent(self.turn)
        self.dice = None
        self.phase = Phase.ROLL

    def _end_game(self, winner: int, kind: str, reason: str) -> GameResult:
        points = self.rules.points[kind] * self.cube_value
        result = GameResult(self.game_no, winner, kind, self.cube_value, points, reason)
        self.results.append(result)
        self.score[winner] += points
        self.dice = None
        self.phase = Phase.GAME_OVER
        if self.score[winner] >= self.rules.length:
            self._end_match(winner, "points")
        return result

    def _end_match(self, winner: int, reason: str) -> None:
        self.winner = winner
        self.end_reason = reason
        self.phase = Phase.MATCH_OVER
        self.dice = None

    # ---- storage ----

    def to_dict(self) -> dict[str, Any]:
        return {
            "rules": self.rules.as_dict(),
            "score": list(self.score),
            "game_no": self.game_no,
            "crawford_played": self.crawford_played,
            "crawford_game": self.crawford_game,
            "position": self.position.encode(),
            "turn": self.turn,
            "phase": str(self.phase),
            "dice": list(self.dice) if self.dice else None,
            "cube_value": self.cube_value,
            "cube_owner": self.cube_owner,
            "winner": self.winner,
            "end_reason": self.end_reason,
            "results": [r.as_dict() for r in self.results],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Match":
        r = d["rules"]
        rules = Rules(Variant(r["variant"]), r["length"], dict(r["points"]), r.get("cube_max", 64))
        dice = d.get("dice")
        return cls(
            rules=rules,
            score=list(d["score"]),
            game_no=d["game_no"],
            crawford_played=d["crawford_played"],
            crawford_game=d["crawford_game"],
            position=Position.decode(d["position"]),
            turn=d["turn"],
            phase=Phase(d["phase"]),
            dice=(dice[0], dice[1]) if dice else None,
            cube_value=d["cube_value"],
            cube_owner=d["cube_owner"],
            winner=d["winner"],
            end_reason=d.get("end_reason"),
            results=[GameResult(**x) for x in d.get("results", [])],
        )
