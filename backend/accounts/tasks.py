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


@shared_task(ignore_result=True)
def push_your_turn(user_id: int, match_id: str) -> None:
    """§11.5: the player's turn came while their app was closed."""
    from accounts import push

    push.notify(
        user_id,
        {
            "type": "your_turn",
            "title": "push.yourTurn.title",
            "body": "push.yourTurn.body",
            "url": f"/match/{match_id}",
        },
        urgency="high",
    )


@shared_task(ignore_result=True)
def push_tournament_started(tournament_id: int) -> None:
    from accounts import push
    from tournaments.models import TournamentEntry

    for user_id in TournamentEntry.objects.filter(tournament_id=tournament_id).values_list(
        "user_id", flat=True
    ):
        push.notify(
            user_id,
            {
                "type": "tournament_started",
                "title": "push.tournamentStarted.title",
                "body": "push.tournamentStarted.body",
                "url": f"/tournaments/{tournament_id}",
            },
            urgency="high",
        )
