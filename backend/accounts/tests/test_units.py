import json

import pytest

from accounts.errors import PhoneInvalid
from accounts.phone import mask_phone, normalize_phone
from accounts.sms.base import SmsError
from accounts.sms.ippanel import IPPanelSmsProvider


@pytest.mark.parametrize(
    "raw",
    [
        "09121234567",
        "9121234567",
        "989121234567",
        "+989121234567",
        "00989121234567",
        "۰۹۱۲۱۲۳۴۵۶۷",
        "0912 123 4567",
    ],
)
def test_normalize_phone(raw):
    assert normalize_phone(raw) == "+989121234567"


@pytest.mark.parametrize("raw", ["", "0212345678", "+14155550000", "091212345678", "abc"])
def test_normalize_phone_rejects(raw):
    with pytest.raises(PhoneInvalid):
        normalize_phone(raw)


def test_mask_phone():
    assert mask_phone("+989121234567") == "+98912***4567"


OK = {"data": {"message_outbox_ids": [123]}, "meta": {"status": True, "message_code": "200-1"}}


class FakeTransport:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append(
            {"method": method, "url": url, "headers": headers, "body": json.loads(body) if body else None}
        )
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def provider(transport):
    return IPPanelSmsProvider(
        "https://edge.ippanel.com/v1", "KEY", "+983000505", transport=transport, sleep=lambda s: None
    )


def test_pattern_send_request_shape():
    t = FakeTransport((200, OK))
    assert provider(t).send_pattern("+989121234567", "patcode", {"code": 48213}) == "123"
    call = t.calls[0]
    assert call["method"] == "POST" and call["url"] == "https://edge.ippanel.com/v1/api/send"
    assert call["headers"]["Authorization"] == "KEY"  # raw key, no Bearer prefix
    assert call["body"] == {
        "sending_type": "pattern",
        "from_number": "+983000505",
        "code": "patcode",
        "recipients": ["+989121234567"],
        "params": {"code": 48213},
    }


def test_auth_error_is_not_retried():
    t = FakeTransport((401, {"data": None, "meta": {"status": False, "message_code": "400-1"}}))
    with pytest.raises(SmsError) as exc:
        provider(t).send_pattern("+989121234567", "p", {"code": 1})
    assert not exc.value.retryable and len(t.calls) == 1


def test_validation_error_reports_field_names_only():
    body = {
        "data": None,
        "meta": {"status": False, "message_code": "400-2", "errors": {"code": ["bad +9891212"]}},
    }
    with pytest.raises(SmsError) as exc:
        provider(FakeTransport((422, body))).send_pattern("+989121234567", "p", {"code": 1})
    assert exc.value.reason == "http_422:400-2:code"


def test_timeout_is_retried_once():
    t = FakeTransport(TimeoutError(), (200, OK))
    assert provider(t).send_pattern("+989121234567", "p", {"code": 1}) == "123"
    assert len(t.calls) == 2


def test_server_error_twice_fails():
    t = FakeTransport((502, {}), (503, {}))
    with pytest.raises(SmsError) as exc:
        provider(t).send_pattern("+989121234567", "p", {"code": 1})
    assert exc.value.retryable and len(t.calls) == 2


def test_status_false_on_http_200_is_a_failure():
    t = FakeTransport((200, {"data": None, "meta": {"status": False, "message_code": "400-9"}}))
    with pytest.raises(SmsError):
        provider(t).send_pattern("+989121234567", "p", {"code": 1})


def test_missing_key_is_rejected():
    with pytest.raises(SmsError):
        IPPanelSmsProvider("https://edge.ippanel.com/v1", "", "+983000505")
