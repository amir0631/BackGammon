"""What happens when a match ends: the match row, then (§17 step 8) ELO, XP, and coin settlement."""

from typing import TYPE_CHECKING, Any

from django.utils import timezone

from game.models import Match

if TYPE_CHECKING:
    from realtime.live import Live


def finish(live: "Live") -> dict[str, Any]:
    """Runs inside the live session's transaction. Returns the match.ended extras (elo, xp, settlement)."""
    e = live.engine
    assert e.winner is not None
    winner_user = live.user_ids[e.winner]
    Match.objects.filter(pk=live.match_id).update(
        status=Match.Status.FINISHED,
        winner_id=winner_user,
        winner_side=e.winner,
        score_a=e.score[0],
        score_b=e.score[1],
        end_reason=e.end_reason or "",
        ended_at=timezone.now(),
    )
    return {"elo": None, "xp": None, "settlement": None}
