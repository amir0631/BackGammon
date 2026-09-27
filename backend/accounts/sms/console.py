import logging

from accounts.phone import mask_phone

logger = logging.getLogger("sms")


class ConsoleSmsProvider:
    """Development adapter: logs instead of sending. Never enabled in production."""

    def send_pattern(self, phone: str, pattern_code: str, params: dict[str, str | int]) -> str | None:
        logger.info("SMS to %s pattern=%s params=%s", mask_phone(phone), pattern_code, params)
        return None
