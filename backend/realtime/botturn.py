"""Bot turns inside a live match (CLAUDE.md §9). Implemented in §17 step 7."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from realtime.live import Live


def act(live: "Live") -> None:
    raise NotImplementedError("bot matches arrive in §17 step 7")
