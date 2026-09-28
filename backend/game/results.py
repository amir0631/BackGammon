"""What happens when a match ends (CLAUDE.md §7.3, §8, §10.4): the match row, then coin settlement, ELO,
and XP, all in the live session's transaction, before match.ended is emitted."""

from typing import TYPE_CHECKING, Any

from django.utils import timezone

from accounts.models import User
from game.models import Match
from predictions import services as predictions
from ranking import services as ranking
from referrals import services as referrals
from settingsapp import registry
from wallet import services as wallet

if TYPE_CHECKING:
    from realtime.live import Live


def finish(live: "Live") -> dict[str, Any]:
    """Returns {"aborted": bool, "elo", "xp", "settlement"} for match.ended."""
    e = live.engine
    match = Match.objects.select_for_update().get(pk=live.match_id)
    humans = [uid for uid in live.user_ids if uid is not None]
    now = timezone.now()

    if live.roll_n == 0 and match.tournament_id is None:
        # Ended before the first roll (a player never came): full refund, unrated (§7.3).
        wallet.refund_match(match.id, humans, match.entry)
        predictions.settle(match, None)
        match.status = Match.Status.ABORTED
        match.end_reason = f"aborted:{e.end_reason or ''}"
        match.ended_at = now
        match.save(update_fields=["status", "end_reason", "ended_at"])
        refund = {"refund": match.entry} if match.entry else None
        return {"aborted": True, "elo": None, "xp": None, "settlement": refund}

    assert e.winner is not None
    match.status = Match.Status.FINISHED
    match.winner_id = live.user_ids[e.winner]
    match.winner_side = e.winner
    match.score_a, match.score_b = e.score[0], e.score[1]
    match.end_reason = e.end_reason or ""
    match.ended_at = now
    match.save()

    if match.is_bot:
        return {"aborted": False, "elo": None, "xp": None, "settlement": None}  # never rated (§8)

    assert match.player_b_id is not None
    a, b = User.objects.get(pk=match.player_a_id), User.objects.get(pk=match.player_b_id)
    winner = a if e.winner == 0 else b
    settlement = None
    if match.entry:
        settlement = wallet.settle_match(
            match.id, winner.id, match.entry, int(match.rules.get("table_rake_pct", 0))
        )
        referrals.pay_commissions(match, [a, b], settlement["rake"])  # from the rake (§7.4)
    predictions.settle(match, e.winner)
    if match.tournament_id is not None:
        from tournaments.services import on_match_end

        on_match_end(match, e.winner)  # a no-show forfeits: the bracket always gets a winner
    elo = ranking.rate_match(match, a, b, e.winner)
    per_match, per_win = registry.get("xp.per_match"), registry.get("xp.per_win")
    xp = {
        "a": per_match + (per_win if e.winner == 0 else 0),
        "b": per_match + (per_win if e.winner == 1 else 0),
    }
    ranking.grant_xp(a, xp["a"], "match", match)
    ranking.grant_xp(b, xp["b"], "match", match)
    return {"aborted": False, "elo": elo, "xp": xp, "settlement": settlement}
