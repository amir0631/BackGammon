import json
from unittest import mock

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from rest_framework.test import APIClient

from accounts import push
from accounts.models import PushSubscription
from wallet.tests.helpers import make_user

VAPID = push.b64u((12345678901234567890).to_bytes(32, "big"))


def browser_keys():
    key = ec.generate_private_key(ec.SECP256R1())
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return key, push.b64u(public), push.b64u(b"0123456789abcdef")


def decrypt(body, ua_key, ua_public_b64, auth_b64):
    """The browser side of RFC 8291, written independently of push.encrypt."""
    salt, rs, idlen = body[:16], int.from_bytes(body[16:20], "big"), body[20]
    as_public = body[21 : 21 + idlen]
    ciphertext = body[21 + idlen :]
    assert rs == 4096 and idlen == 65
    shared = ua_key.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_public)
    )
    ua_public = push.b64u_decode(ua_public_b64)

    def hkdf(s, ikm, info, n):
        return HKDF(algorithm=hashes.SHA256(), length=n, salt=s, info=info).derive(ikm)

    ikm = hkdf(push.b64u_decode(auth_b64), shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    cek = hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    plain = AESGCM(cek).decrypt(nonce, ciphertext, None)
    assert plain.endswith(b"\x02")
    return plain[:-1]


def test_encrypt_round_trip():
    key, public, auth = browser_keys()
    message = json.dumps({"type": "your_turn", "url": "/match/x"}).encode()
    assert decrypt(push.encrypt(message, public, auth), key, public, auth) == message


@pytest.mark.django_db
class TestPush:
    def test_key_endpoint_and_disabled_without_key(self, settings):
        settings.VAPID_PRIVATE_KEY = ""
        assert APIClient().get("/api/v1/push/key").json() == {"enabled": False, "key": None}
        settings.VAPID_PRIVATE_KEY = VAPID
        body = APIClient().get("/api/v1/push/key").json()
        assert body["enabled"] and len(push.b64u_decode(body["key"])) == 65

    def test_subscribe_send_and_drop_gone_subscriptions(self, settings):
        settings.VAPID_PRIVATE_KEY = VAPID
        user = make_user()
        c = APIClient()
        c.force_authenticate(user=user)
        key, public, auth = browser_keys()
        endpoint = "https://fcm.googleapis.com/fcm/send/abc"
        assert (
            c.post(
                "/api/v1/me/push-subscriptions",
                {"endpoint": endpoint, "p256dh": public, "auth": auth},
                format="json",
            ).status_code
            == 204
        )
        sent = []

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake_urlopen(request, timeout):
            sent.append(request)
            return Response()

        with mock.patch("accounts.push.urllib.request.urlopen", fake_urlopen):
            assert push.notify(user.id, {"type": "your_turn", "title": "push.yourTurn.title"}) == 1
        req = sent[0]
        assert req.full_url == endpoint and req.get_header("Content-encoding") == "aes128gcm"
        assert req.get_header("Authorization").startswith("vapid t=")
        assert json.loads(decrypt(req.data, key, public, auth))["title"] == "push.yourTurn.title"

        import urllib.error

        def gone(request, timeout):
            raise urllib.error.HTTPError(endpoint, 410, "Gone", None, None)  # type: ignore[arg-type]

        with mock.patch("accounts.push.urllib.request.urlopen", gone):
            assert push.notify(user.id, {"type": "x"}) == 0
        assert not PushSubscription.objects.exists()

    def test_unsubscribe_only_own(self):
        a, b = make_user(), make_user()
        _key, public, auth = browser_keys()
        PushSubscription.objects.create(
            user=a, endpoint="https://fcm.googleapis.com/fcm/send/1", p256dh=public, auth=auth
        )
        c = APIClient()
        c.force_authenticate(user=b)
        c.delete(
            "/api/v1/me/push-subscriptions",
            {"endpoint": "https://fcm.googleapis.com/fcm/send/1"},
            format="json",
        )
        assert PushSubscription.objects.count() == 1
        c.force_authenticate(user=a)
        c.delete(
            "/api/v1/me/push-subscriptions",
            {"endpoint": "https://fcm.googleapis.com/fcm/send/1"},
            format="json",
        )
        assert PushSubscription.objects.count() == 0


@pytest.mark.django_db
def test_only_known_push_services_are_accepted():
    """Subscriptions are user input: the server must never POST to an arbitrary host (SSRF)."""
    user = make_user()
    c = APIClient()
    c.force_authenticate(user=user)
    _key, public, auth = browser_keys()
    for bad in (
        "http://fcm.googleapis.com/x",
        "https://169.254.169.254/latest",
        "https://evil.example/fcm.googleapis.com",
    ):
        res = c.post(
            "/api/v1/me/push-subscriptions", {"endpoint": bad, "p256dh": public, "auth": auth}, format="json"
        )
        assert res.status_code == 400, bad
    assert push.allowed_endpoint("https://web.push.apple.com/abc")
    assert not push.allowed_endpoint("https://push.apple.com.evil.example/abc")
    assert not PushSubscription.objects.exists()
