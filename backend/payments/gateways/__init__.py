from django.conf import settings

from payments.gateways.base import PaymentGateway
from payments.gateways.sandbox import SandboxGateway


def get_gateway() -> PaymentGateway:
    if settings.PAYMENT_GATEWAY == "sandbox":
        return SandboxGateway()
    raise RuntimeError(f"payment gateway {settings.PAYMENT_GATEWAY!r} is not implemented yet (CLAUDE.md §18)")
