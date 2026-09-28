import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from reports import dice
from settingsapp import registry

logger = logging.getLogger("reports")


@shared_task(ignore_result=True)
def weekly_dice_test() -> None:
    end = timezone.now()
    test = dice.run(end - timedelta(days=7), end)
    if test.dice and test.p_value * 1_000_000 < registry.get("reports.dice_alert_ppm"):
        logger.critical("dice chi-square p=%.6f over %s dice: %s", test.p_value, test.dice, test.counts)
