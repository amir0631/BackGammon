from django.conf import settings

from payments.gateways.base import PaymentGateway
from payments.gateways.sandbox import SandboxGateway


def sandbox_allowed() -> bool:
    """The sandbox pays without money: never in production, whatever the settings say."""
    return settings.APP_ENV != "production"


def get_gateway() -> PaymentGateway:
    if settings.PAYMENT_GATEWAY == "sandbox":
        if not sandbox_allowed():
            from payments.services import GatewayUnavailable

            raise GatewayUnavailable(details={"reason": "sandbox_in_production"})
        return SandboxGateway()
    raise RuntimeError(f"payment gateway {settings.PAYMENT_GATEWAY!r} is not implemented yet (CLAUDE.md §18)")
