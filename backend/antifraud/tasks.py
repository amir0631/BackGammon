from celery import shared_task

from antifraud import rules


@shared_task(ignore_result=True)
def check_finished_match(match_id: str) -> None:
    """After every human match: chip dumping and links for the pair, engine assist for each player."""
    from game.models import Match

    match = Match.objects.filter(pk=match_id).first()
    if match is None or match.is_bot:
        return
    rules.check_match(match)
    for user_id in (match.player_a_id, match.player_b_id):
        if user_id is not None:
            rules.check_engine_assist(user_id)
