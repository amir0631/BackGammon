import logging
from datetime import timedelta

from celery import shared_task
from django.db import connection, transaction
from django.utils import timezone

logger = logging.getLogger("game")
BATCH = 500


@shared_task(ignore_result=True)
def purge_replays() -> int:
    """§20.1: delete the event logs of matches that ended more than replay.retention_days ago (0 keeps
    them forever), except matches under an open fraud flag. Moves and results stay."""
    from antifraud.models import FraudFlag
    from game.models import Match, MatchEvent
    from settingsapp import registry

    days = registry.get("replay.retention_days")
    if days <= 0:
        return 0
    cutoff = timezone.now() - timedelta(days=days)
    held = FraudFlag.objects.filter(status=FraudFlag.Status.OPEN, match__isnull=False).values("match_id")
    ids = list(
        Match.objects.filter(ended_at__lt=cutoff, replay_purged_at__isnull=True)
        .exclude(status=Match.Status.ACTIVE)
        .exclude(id__in=held)
        .values_list("id", flat=True)[:BATCH]
    )
    if not ids:
        return 0
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL bg.replay_purge = 'on'")
        MatchEvent.objects.filter(match_id__in=ids).delete()
        Match.objects.filter(id__in=ids).update(replay_purged_at=timezone.now())
    logger.info("purged %s replays older than %s days", len(ids), days)
    return len(ids)
