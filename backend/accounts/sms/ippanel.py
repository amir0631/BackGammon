"""IPPanel Edge adapter (sms.md). Pattern sends only."""

import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from accounts.phone import mask_phone
from accounts.sms.base import SmsError

logger = logging.getLogger("sms")

# (method, url, headers, body) -> (http_status, parsed_json)
Transport = Callable[[str, str, dict[str, str], bytes | None], tuple[int, dict[str, Any]]]

TIMEOUT_SECONDS = 10
RETRY_DELAY_SECONDS = 2.0


def urllib_transport(
    method: str, url: str, headers: dict[str, str], body: bytes | None
) -> tuple[int, dict[str, Any]]:
    if not url.startswith("https://"):
        raise SmsError("insecure_url")
    request = urllib.request.Request(url, data=body, method=method, headers=headers)  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read() or b"{}")
        except ValueError:
            payload = {}
        return exc.code, payload


class IPPanelSmsProvider:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        from_number: str,
        transport: Transport = urllib_transport,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key:
            raise SmsError("missing_api_key")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.from_number = from_number
        self.transport = transport
        self.sleep = sleep

    def _call(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        for attempt in (1, 2):
            try:
                status, payload = self.transport(method, self.base_url + path, headers, data)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                status, payload = 0, {"error": type(exc).__name__}
            meta = payload.get("meta") or {}
            if 200 <= status < 300 and meta.get("status") is True:
                return payload
            retryable = status == 0 or status >= 500
            if retryable and attempt == 1:
                self.sleep(RETRY_DELAY_SECONDS)
                continue
            # Log field names only: provider messages may echo recipient data.
            errors = sorted((meta.get("errors") or {}).keys())
            reason = f"http_{status}:{meta.get('message_code', '')}:{','.join(errors)}"
            raise SmsError(reason, retryable=retryable)
        raise SmsError("unreachable")  # pragma: no cover

    def send_pattern(self, phone: str, pattern_code: str, params: dict[str, str | int]) -> str | None:
        payload = self._call(
            "POST",
            "/api/send",
            {
                "sending_type": "pattern",
                "from_number": self.from_number,
                "code": pattern_code,
                "recipients": [phone],
                "params": params,
            },
        )
        ids = (payload.get("data") or {}).get("message_outbox_ids") or []
        logger.info("SMS sent to %s pattern=%s id=%s", mask_phone(phone), pattern_code, ids[:1])
        return str(ids[0]) if ids else None

    def credit_rial(self) -> tuple[int, int]:
        """(credit, gift credit), both in rial."""
        data = self._call("GET", "/api/payment/credit/mine").get("data") or {}
        return int(data.get("credit") or 0), int(data.get("gift") or 0)

    def pattern_status(self, pattern_code: str) -> str:
        data = self._call("GET", f"/api/patterns/{pattern_code}").get("data") or {}
        return str(data.get("pattern_status") or "unknown")
