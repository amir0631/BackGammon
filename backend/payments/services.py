"""Checkout, callback, verify, and reconciliation (CLAUDE.md §7.7, §7.11).

The callback only records that the user came back; coins are credited only after a server-side
verify succeeds, in one `purchase` transaction keyed by the gateway reference, so a repeated callback
or a retried verify never credits twice.
"""

import logging
from datetime import date, timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from config.errors import AppError
from payments.gateways import get_gateway
from payments.models import CoinPackage, Payment
from settingsapp import registry
from wallet import ledger
from wallet.models import TxType

logger = logging.getLogger("payments")
SURFACES = ("m", "app")


class PaymentsDisabled(AppError):
    status_code = 503
    code = "PAYMENTS_DISABLED"
    message_key = "errors.payments.disabled"


class AmountInvalid(AppError):
    code = "PAYMENT_AMOUNT_INVALID"
    message_key = "errors.payments.amountInvalid"


class GatewayUnavailable(AppError):
    status_code = 502
    code = "PAYMENT_GATEWAY_UNAVAILABLE"
    message_key = "errors.payments.gatewayUnavailable"


def callback_url(surface: str) -> str:
    """Built for the surface that started the checkout, so the user returns to the same app (§11.0)."""
    return f"{settings.URL_SCHEME}://{surface}.{settings.BASE_DOMAIN}/api/v1/payments/callback"


def packages() -> list[dict[str, Any]]:
    price = registry.get("coin.price_toman")
    return [
        {"id": p.id, "coins": p.coins, "price_toman": p.coins * price, "name": p.name_i18n}
        for p in CoinPackage.objects.filter(active=True)
    ]


def _coins_for(package_id: int | None, custom_toman: int | None) -> tuple[CoinPackage | None, int]:
    price = registry.get("coin.price_toman")
    if package_id is not None:
        package = CoinPackage.objects.filter(id=package_id, active=True).first()
        if package is None:
            raise AmountInvalid(details={"reason": "package"})
        return package, package.coins
    if custom_toman is None:
        raise AmountInvalid(details={"reason": "missing"})
    low, high = registry.get("shop.custom_min_toman"), registry.get("shop.custom_max_toman")
    if not low <= custom_toman <= high:
        raise AmountInvalid(details={"reason": "range", "min": low, "max": high})
    if custom_toman % price:
        # Whole coins only: the user never pays for a fraction of a coin (§7.11).
        raise AmountInvalid(details={"reason": "multiple", "price_toman": price})
    return None, custom_toman // price


def checkout(user: User, package_id: int | None, custom_toman: int | None, surface: str, key: str) -> Payment:
    if not registry.get("payments.enabled"):
        raise PaymentsDisabled()
    if user.status == User.Status.SUSPENDED:
        from wallet import errors as wallet_errors

        raise wallet_errors.AccountSuspended()  # §12.1: a suspended account spends nothing
    if surface not in SURFACES:
        surface = "m"
    existing = Payment.objects.filter(user=user, idempotency_key=key).first()
    if existing is not None:
        return existing
    package, coins = _coins_for(package_id, custom_toman)
    price = registry.get("coin.price_toman")
    gateway = get_gateway()
    payment = Payment.objects.create(
        user=user,
        package=package,
        coins=coins,
        price_toman=price,
        amount_rial=coins * price * 10,
        gateway=gateway.name,
        surface=surface,
        idempotency_key=key,
    )
    try:
        started = gateway.start(str(payment.id), payment.amount_rial, callback_url(surface), f"{coins} coins")
    except Exception as exc:
        payment.status = Payment.Status.FAILED
        payment.failure = "start"
        payment.save(update_fields=["status", "failure", "updated_at"])
        raise GatewayUnavailable() from exc
    payment.authority = started.authority
    payment.save(update_fields=["authority", "updated_at"])
    payment.redirect_url = started.redirect_url  # type: ignore[attr-defined]
    return payment


def handle_callback(authority: str) -> Payment | None:
    """The user is back from the gateway: verify on the server, then credit exactly once."""
    with transaction.atomic():
        payment = Payment.objects.select_for_update().filter(authority=authority).first()
        if payment is None:
            return None
        if payment.status in (Payment.Status.VERIFIED, Payment.Status.FAILED):
            return payment  # a repeated callback changes nothing
        payment.status = Payment.Status.CALLBACK_RECEIVED
        payment.save(update_fields=["status", "updated_at"])
    return verify(payment.id)


def verify(payment_id: Any) -> Payment:
    gateway = get_gateway()
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(id=payment_id)
        if payment.status == Payment.Status.VERIFIED:
            return payment
        result = gateway.verify(payment.authority, payment.amount_rial)
        if not result.ok:
            payment.status = Payment.Status.FAILED
            payment.failure = result.reason[:60]
            payment.save(update_fields=["status", "failure", "updated_at"])
            return payment
        ledger.ensure_wallet(payment.user_id)
        ledger.post(
            TxType.PURCHASE,
            [(ledger.PLATFORM_SALES, -payment.coins), (ledger.user_account(payment.user_id), payment.coins)],
            idempotency_key=f"purchase:{payment.gateway}:{result.reference}",
            ref_type="payment",
            ref_id=payment.id,
        )
        payment.status = Payment.Status.VERIFIED
        payment.reference = result.reference
        payment.card_mask = result.card_mask
        payment.verified_at = timezone.now()
        payment.save(update_fields=["status", "reference", "card_mask", "verified_at", "updated_at"])
        return payment


def reconcile(day: date) -> list[str]:
    """Nightly (§7.7): verified payments against the gateway's report. Returns the mismatches."""
    gateway = get_gateway()
    report = {row.authority: row for row in gateway.report(day)}
    ours = {
        p.authority: p
        for p in Payment.objects.filter(
            status=Payment.Status.VERIFIED, verified_at__date=day, gateway=gateway.name
        )
    }
    problems = []
    for authority, payment in ours.items():
        row = report.get(authority)
        if row is None:
            problems.append(f"verified payment {payment.id} missing from the gateway report")
        elif row.amount_rial != payment.amount_rial or row.reference != payment.reference:
            problems.append(f"payment {payment.id} differs from the gateway report")
    for authority, row in report.items():
        if authority not in ours:
            problems.append(f"gateway payment {row.reference} not verified here")
    if problems:
        logger.critical("payment reconciliation %s: %s", day, problems[:50])
    from payments.models import ReconciliationRun

    ReconciliationRun.objects.update_or_create(
        day=day,
        gateway=gateway.name,
        defaults={
            "verified_count": len(ours),
            "verified_rial": sum(p.amount_rial for p in ours.values()),
            "problems": problems[:200],
        },
    )
    return problems


def expire_stale(hours: int = 2) -> int:
    """Payments never brought back are marked expired (nothing was credited)."""
    cutoff = timezone.now() - timedelta(hours=hours)
    return Payment.objects.filter(status=Payment.Status.PENDING, created_at__lt=cutoff).update(
        status=Payment.Status.EXPIRED
    )
