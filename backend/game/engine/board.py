"""Board position, the mover's view of it, and the compact encoding (CLAUDE.md §5.5)."""

from dataclasses import dataclass

A = 0
B = 1
CHECKERS = 15
BAR = 25  # the bar in the mover's numbering
OFF = 0  # borne off in the mover's numbering


@dataclass(frozen=True)
class Position:
    """`board[i]`: checkers on absolute point i+1 (A's numbering); + for A, - for B."""

    board: tuple[int, ...]
    bar: tuple[int, int] = (0, 0)
    off: tuple[int, int] = (0, 0)

    def __post_init__(self) -> None:
        if len(self.board) != 24:
            raise ValueError("board needs 24 points")
        for player in (A, B):
            on_board = sum(c for c in self.board if (c > 0 if player == A else c < 0))
            total = abs(on_board) + self.bar[player] + self.off[player]
            if total != CHECKERS:
                raise ValueError(f"player {player} has {total} checkers, not {CHECKERS}")
            if self.bar[player] < 0 or self.off[player] < 0:
                raise ValueError("negative bar or off count")

    def encode(self) -> str:
        """Compact, stable text form: 24 signed counts, then A bar, B bar, A off, B off."""
        return ",".join(str(c) for c in (*self.board, *self.bar, *self.off))

    @classmethod
    def decode(cls, text: str) -> "Position":
        values = [int(v) for v in text.split(",")]
        if len(values) != 28:
            raise ValueError("encoded position needs 28 numbers")
        return cls(tuple(values[:24]), (values[24], values[25]), (values[26], values[27]))

    def winner(self) -> int | None:
        for player in (A, B):
            if self.off[player] == CHECKERS:
                return player
        return None


def initial_position() -> Position:
    board = [0] * 24
    for point, count in ((24, 2), (13, 5), (8, 3), (6, 5)):
        board[point - 1] = count  # A
        board[24 - point] = -count  # B mirrors A: its 24-point is A's 1-point
    return Position(tuple(board))


def opponent(player: int) -> int:
    return B if player == A else A


def absolute_point(player: int, point: int) -> int:
    """The mover's point (1-24) as an absolute point in A's numbering."""
    return point if player == A else 25 - point


# ---- The mover's view: mine[0] = off, mine[1..24] = my points, mine[25] = my bar; theirs[1..24] =
# opponent checkers on my numbering of the points. Used by move generation and evaluation.


def view(pos: Position, player: int) -> tuple[list[int], list[int]]:
    mine = [0] * 26
    theirs = [0] * 26
    for point in range(1, 25):
        count = pos.board[absolute_point(player, point) - 1]
        if player == B:
            count = -count
        if count > 0:
            mine[point] = count
        elif count < 0:
            theirs[point] = -count
    mine[0] = pos.off[player]
    mine[BAR] = pos.bar[player]
    theirs[0] = pos.off[opponent(player)]
    theirs[BAR] = pos.bar[opponent(player)]
    return mine, theirs


def from_view(player: int, mine: list[int], theirs: list[int]) -> Position:
    board = [0] * 24
    for point in range(1, 25):
        idx = absolute_point(player, point) - 1
        sign = 1 if player == A else -1
        if mine[point]:
            board[idx] = sign * mine[point]
        elif theirs[point]:
            board[idx] = -sign * theirs[point]
    bar = [0, 0]
    off = [0, 0]
    bar[player], bar[opponent(player)] = mine[BAR], theirs[BAR]
    off[player], off[opponent(player)] = mine[OFF], theirs[OFF]
    return Position(tuple(board), (bar[0], bar[1]), (off[0], off[1]))


def pip_count(pos: Position, player: int) -> int:
    mine, _ = view(pos, player)
    return sum(point * mine[point] for point in range(1, 26))
