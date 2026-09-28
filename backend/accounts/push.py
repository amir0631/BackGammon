"""Web Push (CLAUDE.md §11.5): RFC 8291 message encryption (aes128gcm) and RFC 8292 VAPID, with the
standard library for HTTP. Payloads carry i18n keys, never text; the service worker renders them in the
user's locale. Disabled until VAPID_PRIVATE_KEY is configured."""

import base64
import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlsplit

import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

logger = logging.getLogger("accounts.push")
RECORD_SIZE = 4096
TTL_SECONDS = 3600


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64u_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def _raw_public(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def encrypt(payload: bytes, ua_public_b64: str, auth_b64: str, salt: bytes | None = None) -> bytes:
    """The aes128gcm body for one push message (a single record)."""
    ua_public = b64u_decode(ua_public_b64)
    auth_secret = b64u_decode(auth_b64)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    as_private = ec.generate_private_key(ec.SECP256R1())
    as_public = _raw_public(as_private.public_key())
    shared = as_private.exchange(ec.ECDH(), ua_key)
    ikm = _hkdf(auth_secret, shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    salt = salt or os.urandom(16)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    ciphertext = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(as_public)]) + as_public
    return header + ciphertext


def _vapid_key() -> ec.EllipticCurvePrivateKey | None:
    raw = getattr(settings, "VAPID_PRIVATE_KEY", "")
    if not raw:
        return None
    return ec.derive_private_key(int.from_bytes(b64u_decode(raw), "big"), ec.SECP256R1())


def public_key() -> str | None:
    """The application server key the browser subscribes with (base64url, uncompressed point)."""
    key = _vapid_key()
    return b64u(_raw_public(key.public_key())) if key else None


def enabled() -> bool:
    return _vapid_key() is not None


def _vapid_header(endpoint: str) -> str:
    key = _vapid_key()
    assert key is not None
    parts = urlsplit(endpoint)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": int(time.time()) + 12 * 3600,
        "sub": settings.VAPID_SUBJECT,
    }
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    token = jwt.encode(claims, pem, algorithm="ES256")
    return f"vapid t={token}, k={public_key()}"


def allowed_endpoint(endpoint: str) -> bool:
    """HTTPS to a known browser push service only (a leading dot allows subdomains)."""
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not host:
        return False
    return any(
        host.endswith(allowed) if allowed.startswith(".") else host == allowed
        for allowed in settings.PUSH_ALLOWED_HOSTS
    )


def send(subscription: Any, message: dict[str, Any], urgency: str = "normal") -> bool:
    """Returns False when the subscription is gone (404/410) or not allowed, so the caller removes it."""
    if not allowed_endpoint(subscription.endpoint):
        return False
    body = encrypt(
        json.dumps(message, separators=(",", ":")).encode(), subscription.p256dh, subscription.auth
    )
    request = urllib.request.Request(  # noqa: S310 (https to an allowed push service, checked above)
        subscription.endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": _vapid_header(subscription.endpoint),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": str(TTL_SECONDS),
            "Urgency": urgency,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10):  # noqa: S310 (browser push service URL)
            return True
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 410):
            return False
        logger.warning("push failed status=%s", exc.code)
        return True
    except OSError as exc:
        logger.warning("push failed: %s", exc)
        return True


def notify(user_id: int, message: dict[str, Any], urgency: str = "normal") -> int:
    """Sends to every subscription of the user; drops the ones the push service says are gone."""
    from accounts.models import PushSubscription

    if not enabled():
        return 0
    sent = 0
    for sub in PushSubscription.objects.filter(user_id=user_id):
        if send(sub, message, urgency):
            sent += 1
        else:
            sub.delete()
    return sent
