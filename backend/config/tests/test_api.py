import pytest
from rest_framework.test import APIClient

from config.errors import AppError, exception_handler


@pytest.mark.django_db
def test_health_reports_ok():
    response = APIClient().get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": True, "redis": True}}


@pytest.mark.django_db
def test_unknown_route_is_404():
    assert APIClient().get("/api/v1/does-not-exist").status_code == 404


def test_app_error_uses_stable_code_and_message_key():
    exc = AppError("WALLET_INSUFFICIENT", "errors.wallet.insufficient", {"needed": 50}, status_code=409)
    response = exception_handler(exc, {})
    assert response is not None
    assert response.status_code == 409
    assert response.data == {
        "code": "WALLET_INSUFFICIENT",
        "message_key": "errors.wallet.insufficient",
        "details": {"needed": 50},
    }


def test_drf_errors_are_mapped():
    from rest_framework.exceptions import NotAuthenticated, ValidationError

    body = exception_handler(ValidationError({"phone": ["required"]}), {}).data  # type: ignore[union-attr]
    assert body["code"] == "VALIDATION"
    assert body["message_key"] == "errors.validation"
    assert "phone" in body["details"]["fields"]

    body = exception_handler(NotAuthenticated(), {}).data  # type: ignore[union-attr]
    assert body == {"code": "UNAUTHENTICATED", "message_key": "errors.unauthenticated", "details": {}}


@pytest.mark.django_db
def test_public_config_is_readable_signed_out():
    body = APIClient().get("/api/v1/config").json()
    assert body["sms_enabled"] is False and body["payments_enabled"] is False
    assert body["username_change"] == {"cost": 200, "cooldown_days": 30}
    assert "phone" not in str(body)
