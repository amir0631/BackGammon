import logging
import time
from typing import Any

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from realtime import live

logger = logging.getLogger("realtime.timers")
POLL_SECONDS = 0.25  # §10.4


class Command(BaseCommand):
    help = "Fire due match timers (turn deadlines, reconnect grace, automatic moves, bot turns)."

    def handle(self, *args: Any, **options: Any) -> None:
        from matchmaking import service as matchmaking

        logger.info("timer worker started")
        loops = 0
        while True:
            close_old_connections()
            for member in live.due_timers():
                try:
                    live.fire(member)
                except Exception:
                    logger.exception("timer failed: %s", member)
            if loops % 4 == 0:  # about once a second: widening ELO windows (§8)
                try:
                    matchmaking.tick()
                except Exception:
                    logger.exception("matchmaking tick failed")
            if loops % 20 == 0:  # every 5 s: tournaments whose start time came
                from tournaments.services import start_due

                start_due()
            loops += 1
            time.sleep(POLL_SECONDS)
