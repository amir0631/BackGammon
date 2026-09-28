"""The gateway interface (CLAUDE.md §18: the real Shaparak PSP adapter comes when a provider is chosen)."""

from dataclasses import dataclass
from datetime import date
from typing import Protocol


class GatewayError(Exception):
    """The gateway could not be reached or refused the request."""


@dataclass(frozen=True)
class Started:
    authority: str
    redirect_url: str


@dataclass(frozen=True)
class Verified:
    ok: bool
    reference: str = ""
    amount_rial: int = 0
    card_mask: str = ""
    reason: str = ""


@dataclass(frozen=True)
class ReportRow:
    authority: str
    reference: str
    amount_rial: int


class PaymentGateway(Protocol):
    name: str

    def start(self, payment_id: str, amount_rial: int, callback_url: str, description: str) -> Started:
        """Registers the payment and returns where to send the user."""
        ...

    def verify(self, authority: str, amount_rial: int) -> Verified:
        """Server-side confirmation; coins are credited only when this says ok (§7.7)."""
        ...

    def report(self, day: date) -> list[ReportRow]:
        """Settled payments of a day, for the nightly reconciliation."""
        ...
