from django.dispatch import Signal

# Sent inside the registration transaction with `user`, `ip`, `user_agent`, and `device` (the
# X-Device-Id header or ""). The wallet app (§17 step 3) grants the
# signup bonus (CLAUDE.md §7.10) from its receiver, so a failed grant rolls back the signup.
user_registered = Signal()
