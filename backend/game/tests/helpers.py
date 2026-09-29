from game.engine.board import CHECKERS, A, B, Position, absolute_point


def pos(
    a: dict[int, int] | None = None, b: dict[int, int] | None = None, bar: tuple[int, int] = (0, 0)
) -> Position:
    """A position from each player's own numbering (A's point p is absolute p, B's point q is absolute
    25 - q). Checkers not on the board or the bar are borne off."""
    board = [0] * 24
    for player, points, sign in ((A, a or {}, 1), (B, b or {}, -1)):
        for point, count in points.items():
            idx = absolute_point(player, point) - 1
            if board[idx]:
                raise ValueError(f"both players on absolute point {idx + 1}")
            board[idx] = sign * count
    off = [CHECKERS - sum(pts.values()) - bar[p] for p, pts in ((A, a or {}), (B, b or {}))]
    return Position(tuple(board), bar, (off[0], off[1]))
