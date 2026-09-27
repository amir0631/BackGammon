"""RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for admin 2FA, and at-rest encryption of the secrets."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

STEP_SECONDS = 30
DIGITS = 6


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def verify(secret: str, code: str, at: float | None = None, window: int = 1) -> bool:
    """Accepts the current step and `window` steps either side (clock drift)."""
    code = code.strip()
    if len(code) != DIGITS or not code.isdigit():
        return False
    counter = int((time.time() if at is None else at) // STEP_SECONDS)
    return any(hmac.compare_digest(_code(secret, counter + d), code) for d in range(-window, window + 1))


def provisioning_uri(secret: str, username: str, issuer: str) -> str:
    label = quote(f"{issuer}:{username}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&digits={DIGITS}&period={STEP_SECONDS}"
    )


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.ADMIN_SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
