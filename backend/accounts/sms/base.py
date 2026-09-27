from typing import Protocol


class SmsError(Exception):
    """The provider did not accept the message. `retryable` is False for configuration errors."""

    def __init__(self, reason: str, *, retryable: bool = False) -> None:
        super().__init__(reason)
        self.reason = reason
        self.retryable = retryable


class SmsProvider(Protocol):
    def send_pattern(self, phone: str, pattern_code: str, params: dict[str, str | int]) -> str | None:
        """Send one pre-approved pattern message. Returns the provider message id, if any."""
        ...
