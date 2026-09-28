from typing import Any

from django.dispatch import receiver

from accounts.models import User
from accounts.signals import user_registered
from wallet.services import grant_signup_bonus


@receiver(user_registered)
def on_user_registered(sender: Any, user: User, **kwargs: Any) -> None:
    # Runs inside the registration transaction: a failed grant rolls back the signup.
    grant_signup_bonus(user)
