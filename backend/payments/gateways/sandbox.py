"""Sandbox gateway for development and staging: the "bank page" is our own
/api/v1/payments/sandbox/<authority> with Pay and Cancel. State lives in Redis."""

import json
import secrets
from datetime import date
from typing import Any
from urllib.parse import urlsplit

from payments.gateways.base import ReportRow, Started, Verified

TTL = 3600


def _r() -> Any:
    from realtime.live import r

    return r()


class SandboxGateway:
    name = "sandbox"

    def start(self, payment_id: str, amount_rial: int, callback_url: str, description: str) -> Started:
        authority = "SB" + secrets.token_hex(12)
        _r().set(
            f"pay:sb:{authority}",
            json.dumps(
                {"payment": payment_id, "amount": amount_rial, "callback": callback_url, "state": "open"}
            ),
            ex=TTL,
        )
        # The sandbox "bank page" is served on the same surface as the callback.
        parts = urlsplit(callback_url)
        return Started(authority, f"{parts.scheme}://{parts.netloc}/api/v1/payments/sandbox/{authority}")

    def get(self, authority: str) -> dict[str, object] | None:
        raw = _r().get(f"pay:sb:{authority}")
        return json.loads(raw) if raw else None

    def decide(self, authority: str, paid: bool) -> None:
        data = self.get(authority)
        if data is None or data["state"] != "open":
            return
        data["state"] = "paid" if paid else "cancelled"
        if paid:
            data["reference"] = f"SBREF{secrets.randbelow(10**9):09d}"
            row = {"authority": authority, "reference": data["reference"], "amount": data["amount"]}
            _r().rpush(f"pay:sb:report:{date.today().isoformat()}", json.dumps(row))
        _r().set(f"pay:sb:{authority}", json.dumps(data), ex=TTL)

    def verify(self, authority: str, amount_rial: int) -> Verified:
        data = self.get(authority)
        if data is None:
            return Verified(False, reason="unknown")
        if data["state"] != "paid":
            return Verified(False, reason=str(data["state"]))
        if data["amount"] != amount_rial:
            return Verified(False, reason="amount")
        return Verified(
            True, reference=str(data["reference"]), amount_rial=amount_rial, card_mask="6037-99**-****-1234"
        )

    def report(self, day: date) -> list[ReportRow]:
        rows = [json.loads(x) for x in _r().lrange(f"pay:sb:report:{day.isoformat()}", 0, -1)]
        return [ReportRow(r["authority"], r["reference"], r["amount"]) for r in rows]
