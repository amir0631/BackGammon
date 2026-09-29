"""Match seeds are stored encrypted at rest (CLAUDE.md §6.1)."""

import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    key = settings.SEED_ENCRYPTION_KEY
    if not key:
        # Development fallback; production sets SEED_ENCRYPTION_KEY (see .env.example).
        key = base64.urlsafe_b64encode(
            hashlib.sha256(f"seed:{settings.SECRET_KEY}".encode()).digest()
        ).decode()
    return Fernet(key.encode())


def encrypt(seed: bytes) -> str:
    return _fernet().encrypt(seed).decode()


def decrypt(token: str) -> bytes:
    return _fernet().decrypt(token.encode())
