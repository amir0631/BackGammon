"""OTP request and verification (CLAUDE.md §12.1)."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from accounts import errors, ratelimit
from accounts.models import Otp, User
from accounts.tasks import send_otp_sms
from config.errors import AppError
from settingsapp import registry

VERIFICATION_SALT = "accounts.otp.verification"
VERIFICATION_MAX_AGE_SECONDS = 600


def _hash(phone: str, purpose: str, code: int) -> str:
    message = f"{phone}:{purpose}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _rate_limit(phone: str, ip: str | None) -> None:
    limit = registry.get("otp.rate_limit_count")
    window = registry.get("otp.rate_limit_window_seconds")
    for key in [f"otp:phone:{phone}", f"otp:ip:{ip}" if ip else None]:
        if key is None:
            continue
        allowed, retry_after = ratelimit.hit(key, limit, window)
        if not allowed:
            raise errors.OtpRateLimited(details={"retry_after": retry_after})


def request_otp(phone: str, purpose: str, ip: str | None) -> None:
    _rate_limit(phone, ip)
    exists = User.objects.filter(phone=phone).exists()
    if purpose == Otp.Purpose.REGISTER and exists:
        raise errors.PhoneTaken()
    if purpose in (Otp.Purpose.PASSWORD_RESET, Otp.Purpose.WITHDRAWAL) and not exists:
        return  # same response as success: do not reveal which numbers have accounts

    # 10000 to 99999: never a leading zero, which the SMS pattern's integer variable would drop.
    code = secrets.randbelow(90_000) + 10_000
    with transaction.atomic():
        otp = Otp.objects.create(
            phone=phone,
            purpose=purpose,
            code_hash=_hash(phone, purpose, code),
            expires_at=timezone.now() + timedelta(seconds=registry.get("otp.ttl_seconds")),
            ip=ip,
        )
        transaction.on_commit(lambda: send_otp_sms.delay(otp.id, code))


def verify_otp(phone: str, purpose: str, code: str) -> str:
    """Check a code; returns a short-lived verification token for register/reset/withdrawal."""
    max_attempts = registry.get("otp.max_attempts")
    failure: AppError | None = None
    # Errors are raised after the block so a wrong attempt's counter is committed, not rolled back.
    with transaction.atomic():
        otp = (
            Otp.objects.select_for_update()
            .filter(phone=phone, purpose=purpose, consumed_at__isnull=True, verified_at__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if otp is None:
            failure = errors.OtpInvalid(details={"attempts_left": 0})
        elif otp.expires_at <= timezone.now() or otp.attempts >= max_attempts:
            failure = errors.OtpExpired()
        elif not code.isdigit() or not hmac.compare_digest(otp.code_hash, _hash(phone, purpose, int(code))):
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            left = max_attempts - otp.attempts
            failure = errors.OtpExpired() if left <= 0 else errors.OtpInvalid(details={"attempts_left": left})
        else:
            otp.verified_at = timezone.now()
            otp.save(update_fields=["verified_at"])
    if failure is not None or otp is None:
        raise failure or errors.OtpInvalid()
    return signing.dumps({"otp": otp.id, "phone": phone, "purpose": purpose}, salt=VERIFICATION_SALT)


def consume_verification(token: str, purpose: str) -> str:
    """Single-use: returns the verified phone. Call inside the caller's transaction."""
    try:
        data = signing.loads(token, salt=VERIFICATION_SALT, max_age=VERIFICATION_MAX_AGE_SECONDS)
    except signing.BadSignature:
        raise errors.VerificationInvalid() from None
    if data.get("purpose") != purpose:
        raise errors.VerificationInvalid()
    updated = Otp.objects.filter(
        id=data.get("otp"),
        phone=data.get("phone"),
        purpose=purpose,
        verified_at__isnull=False,
        consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())
    if updated != 1:
        raise errors.VerificationInvalid()
    return str(data["phone"])
