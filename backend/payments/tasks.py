from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from payments import services


@shared_task(ignore_result=True)
def reconcile_yesterday() -> None:
    services.reconcile((timezone.now() - timedelta(days=1)).date())


@shared_task(ignore_result=True)
def expire_stale_payments() -> None:
    services.expire_stale()
