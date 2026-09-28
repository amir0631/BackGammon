import logging

from celery import shared_task

from accounts import sms
from wallet import invariants
from wallet.models import WithdrawalRequest

logger = logging.getLogger("wallet")


@shared_task(ignore_result=True)
def send_withdrawal_paid_sms(withdrawal_id: int) -> None:
    req = WithdrawalRequest.objects.select_related("user").filter(id=withdrawal_id).first()
    if req is None:
        return
    amount_toman = f"{req.payout_rial // 10:,}"
    try:
        sms.send_withdrawal_paid(req.user.phone, amount_toman, req.bank_reference)
    except sms.SmsError as exc:
        logger.error("withdrawal SMS failed withdrawal=%s reason=%s", withdrawal_id, exc.reason)


@shared_task(ignore_result=True)
def check_ledger_invariants() -> None:
    """Hourly (CLAUDE.md §7.8). A violation is logged at CRITICAL for alerting."""
    problems = invariants.check()
    if problems:
        logger.critical("ledger invariant violations: %s", problems[:50])
