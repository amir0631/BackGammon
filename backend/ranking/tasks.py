from celery import shared_task

from ranking.services import rebuild_leaderboards


@shared_task(ignore_result=True)
def rebuild_leaderboards_nightly() -> None:
    rebuild_leaderboards()
