"""SMS sending (sms.md). Business code calls the helpers here, never an adapter directly."""

from django.conf import settings

from accounts.sms.base import SmsError, SmsProvider
from accounts.sms.console import ConsoleSmsProvider
from accounts.sms.ippanel import IPPanelSmsProvider
from settingsapp import registry

__all__ = [
    "SmsError",
    "SmsProvider",
    "enabled",
    "get_provider",
    "ippanel",
    "send_otp",
    "send_withdrawal_paid",
]


def enabled() -> bool:
    """`sms.enabled` switch: while off, nothing is sent (the flows that need a code adapt)."""
    return bool(registry.get("sms.enabled"))


def ippanel() -> IPPanelSmsProvider:
    return IPPanelSmsProvider(
        base_url=settings.IPPANEL_BASE_URL,
        api_key=settings.IPPANEL_API_KEY,
        from_number=registry.get("sms.from_number"),
    )


def get_provider() -> SmsProvider:
    if settings.SMS_PROVIDER == "ippanel":
        return ippanel()
    return ConsoleSmsProvider()


def send_otp(phone: str, code: int) -> str | None:
    return get_provider().send_pattern(phone, registry.get("sms.pattern_otp"), {"code": code})


def send_withdrawal_paid(phone: str, amount_toman: str, reference: str) -> str | None:
    return get_provider().send_pattern(
        phone, registry.get("sms.pattern_withdrawal_paid"), {"amount": amount_toman, "ref": reference}
    )
