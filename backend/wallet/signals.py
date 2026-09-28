from typing import Any

from django.dispatch import receiver

from accounts.models import User
from accounts.signals import user_registered
from wallet.services import grant_signup_bonus


@receiver(user_registered)
def on_user_registered(sender: Any, user: User, **kwargs: Any) -> None:
    # Runs inside the registration transaction: a failed grant rolls back the signup. Only a number
    # proven by SMS gets the bonus (§7.10); while SMS is off, new accounts start without it.
    from antifraud.rules import signup_links
    from wallet.ledger import ensure_wallet

    ensure_wallet(user.id)
    linked = signup_links(user, kwargs.get("ip"), kwargs.get("user_agent") or "", kwargs.get("device") or "")
    if user.phone_verified_at is None:
        return
    if linked:
        return  # §7.10: a multi_account match holds the bonus for review (paid if the flag is dismissed)
    grant_signup_bonus(user)
