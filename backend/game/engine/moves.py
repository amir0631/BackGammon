"""Legal moves (CLAUDE.md §5.1): bar entry first, blocked points, hits, bear-off with a higher die, doubles
played four times, both dice if possible, the larger die when only one can be played.

Generation is deterministic in (position, player, dice). Plays that reach the same position are the
same play; each is represented by its canonical step list.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from game.engine.board import BAR, CHECKERS, OFF, Position, from_view, view


class IllegalMove(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True, order=True)
class Step:
    """One checker move in the mover's numbering (25 = bar, 0 = off)."""

    frm: int
    to: int
    die: int
    hit: bool = False

    def as_list(self) -> list[int]:
        return [self.frm, self.to]


@dataclass(frozen=True)
class Play:
    steps: tuple[Step, ...]
    position: Position

    @property
    def dice_used(self) -> tuple[int, ...]:
        return tuple(sorted((s.die for s in self.steps), reverse=True))

    def as_lists(self) -> list[list[int]]:
        return [s.as_list() for s in self.steps]


_State = tuple[tuple[int, ...], tuple[int, ...]]


def _single_step(mine: Sequence[int], theirs: Sequence[int], frm: int, die: int) -> Step | None:
    """The step moving a checker from `frm` with `die`, or None if that is not legal."""
    if mine[frm] == 0:
        return None
    if mine[BAR] and frm != BAR:
        return None
    to = frm - die
    if to >= 1:
        if theirs[to] >= 2:
            return None
        return Step(frm, to, die, hit=theirs[to] == 1)
    # Bearing off: every checker must be home (points 1-6).
    if any(mine[p] for p in range(7, 26)):
        return None
    if to == 0:
        return Step(frm, OFF, die)
    # A higher die bears off only from the highest occupied point.
    if any(mine[p] for p in range(frm + 1, 7)):
        return None
    return Step(frm, OFF, die)


def _apply(mine: list[int], theirs: list[int], step: Step) -> None:
    mine[step.frm] -= 1
    mine[step.to] += 1
    if step.hit:
        theirs[step.to] -= 1
        theirs[BAR] += 1


def _steps_for(mine: Sequence[int], theirs: Sequence[int], die: int) -> Iterable[Step]:
    for frm in range(BAR, 0, -1):
        step = _single_step(mine, theirs, frm, die)
        if step is not None:
            yield step


def _search(position: Position, player: int, dice: tuple[int, int]) -> dict[_State, list[tuple[Step, ...]]]:
    """Every final state with the step lists reaching it, using as many dice as possible."""
    d1, d2 = dice
    orders = [(d1,) * 4] if d1 == d2 else [(d1, d2), (d2, d1)]
    mine0, theirs0 = view(position, player)
    found: dict[_State, list[tuple[Step, ...]]] = {}
    seen: set[tuple[_State, int, tuple[int, ...]]] = set()

    def dfs(
        mine: list[int], theirs: list[int], order: tuple[int, ...], idx: int, steps: tuple[Step, ...]
    ) -> None:
        state = (tuple(mine), tuple(theirs))
        key = (state, idx, order)
        if d1 == d2:
            # With doubles every order is the same; one visit per (state, depth) keeps it small.
            if key in seen:
                return
            seen.add(key)
        moved = False
        if idx < len(order):
            for step in _steps_for(mine, theirs, order[idx]):
                moved = True
                m, t = list(mine), list(theirs)
                _apply(m, t, step)
                dfs(m, t, order, idx + 1, (*steps, step))
        if not moved:
            found.setdefault(state, []).append(steps)

    for order in orders:
        dfs(list(mine0), list(theirs0), order, 0, ())
    return found


def _keep_legal(
    found: dict[_State, list[tuple[Step, ...]]], dice: tuple[int, int]
) -> dict[_State, list[tuple[Step, ...]]]:
    most = max(len(s) for lists in found.values() for s in lists)
    kept = {st: [s for s in lists if len(s) == most] for st, lists in found.items()}
    kept = {st: lists for st, lists in kept.items() if lists}
    if most == 1 and dice[0] != dice[1]:
        larger = max(dice)
        with_larger = {st: [s for s in lists if s[0].die == larger] for st, lists in kept.items()}
        with_larger = {st: lists for st, lists in with_larger.items() if lists}
        if with_larger:
            kept = with_larger
    return kept


def _canonical(steps: tuple[Step, ...]) -> tuple[tuple[int, int, int], ...]:
    # Highest points first, then the longer move: a stable, readable order for the step list.
    return tuple((-s.frm, s.to, -s.die) for s in steps)


def legal_plays(position: Position, player: int, dice: tuple[int, int]) -> list[Play]:
    """All distinct legal plays, in canonical order. Empty when the player cannot move."""
    if not all(1 <= d <= 6 for d in dice):
        raise ValueError("dice must be 1..6")
    kept = _keep_legal(_search(position, player, dice), dice)
    plays = []
    for (mine, theirs), lists in kept.items():
        if not lists[0]:
            continue  # no dice usable: no play
        steps = min(lists, key=_canonical)
        plays.append(Play(steps, from_view(player, list(mine), list(theirs))))
    plays.sort(key=lambda p: _canonical(p.steps))
    return plays


def apply_play(position: Position, player: int, steps: Sequence[Step]) -> Position:
    mine, theirs = view(position, player)
    for step in steps:
        _apply(mine, theirs, step)
    return from_view(player, mine, theirs)


def validate_play(
    position: Position, player: int, dice: tuple[int, int], moves: Sequence[Sequence[int]]
) -> Play:
    """Checks a client's move list ([from, to] pairs in the mover's numbering, in order) and returns the
    play it makes. Raises IllegalMove. An empty list is legal only when no move is possible."""
    legal = _keep_legal(_search(position, player, dice), dice)
    allowed: dict[_State, set[tuple[int, ...]]] = {
        st: {tuple(sorted((s.die for s in steps), reverse=True)) for steps in lists}
        for st, lists in legal.items()
    }
    pool = [dice[0]] * 4 if dice[0] == dice[1] else list(dice)
    for pair in moves:
        if len(pair) != 2 or not all(isinstance(v, int) and not isinstance(v, bool) for v in pair):
            raise IllegalMove("format")
        if not (1 <= pair[0] <= BAR and OFF <= pair[1] < pair[0]):
            raise IllegalMove("range")

    mine0, theirs0 = view(position, player)
    result: Play | None = None

    def assign(
        mine: list[int], theirs: list[int], i: int, remaining: list[int], steps: tuple[Step, ...]
    ) -> None:
        nonlocal result
        if result is not None:
            return
        if i == len(moves):
            state = (tuple(mine), tuple(theirs))
            used = tuple(sorted((s.die for s in steps), reverse=True))
            # Bearing off the last checker ends the game, however many dice that took.
            if used in allowed.get(state, set()) or (state in allowed and mine[OFF] == CHECKERS):
                result = Play(steps, from_view(player, mine, theirs))
            return
        frm, to = moves[i]
        # The die is implied by the distance, except when bearing off with a higher die.
        candidates = sorted(set(remaining)) if to == OFF else [frm - to]
        for die in candidates:
            if die not in remaining or (to != OFF and frm - die != to) or (to == OFF and die < frm):
                continue
            step = _single_step(mine, theirs, frm, die)
            if step is None or step.to != to:
                continue
            m, t = list(mine), list(theirs)
            _apply(m, t, step)
            rest = list(remaining)
            rest.remove(die)
            assign(m, t, i + 1, rest, (*steps, step))

    assign(list(mine0), list(theirs0), 0, pool, ())
    if result is None:
        raise IllegalMove("not_legal")
    return result
