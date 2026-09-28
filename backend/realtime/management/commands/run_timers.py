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
        logger.info("timer worker started")
        while True:
            close_old_connections()
            for member in live.due_timers():
                try:
                    live.fire(member)
                except Exception:
                    logger.exception("timer failed: %s", member)
            time.sleep(POLL_SECONDS)
