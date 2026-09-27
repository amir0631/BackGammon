import logging

from celery import shared_task

from accounts import sms
from accounts.models import Otp

logger = logging.getLogger("sms")


@shared_task(ignore_result=True)
def send_otp_sms(otp_id: int, code: int) -> None:
    otp = Otp.objects.filter(id=otp_id).first()
    if otp is None:
        return
    try:
        message_id = sms.send_otp(otp.phone, code)
    except sms.SmsError as exc:
        logger.error("OTP SMS failed otp=%s reason=%s", otp_id, exc.reason)
        return
    if message_id:
        Otp.objects.filter(id=otp_id).update(provider_message_id=message_id)
