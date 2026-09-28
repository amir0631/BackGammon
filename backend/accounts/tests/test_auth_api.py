from unittest import mock

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from accounts import ratelimit
from accounts.models import Otp, Session, User
from accounts.signals import user_registered

# These tests cover the code-by-SMS flows; the SMS-off flows are in test_sms_off.py.
pytestmark = pytest.mark.usefixtures("sms_on")

PHONE = "+989121234567"
CODE = 48213


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def fixed_code():
    # randbelow(90000) + 10000 == CODE
    with mock.patch("accounts.otp.secrets.randbelow", return_value=CODE - 10_000):
        yield CODE


def verification(client, phone=PHONE, purpose="register", code=CODE):
    assert (
        client.post("/api/v1/auth/otp", {"phone": phone, "purpose": purpose}, format="json").status_code
        == 202
    )
    res = client.post(
        "/api/v1/auth/otp/verify", {"phone": phone, "purpose": purpose, "code": str(code)}, format="json"
    )
    assert res.status_code == 200, res.json()
    return res.json()["verification_token"]


def register(client, username="Reza_90", phone=PHONE, **extra):
    token = verification(client, phone=phone)
    body = {
        "verification_token": token,
        "username": username,
        "password": "S3cure-pass!",
        "age_confirmed": True,
    }
    return client.post("/api/v1/auth/register", {**body, **extra}, format="json")


@pytest.mark.django_db
class TestRegister:
    def test_full_signup_sets_cookies_and_returns_me(
        self, client, fixed_code, django_capture_on_commit_callbacks
    ):
        received = []
        user_registered.connect(
            lambda sender, user, **kw: received.append(user), weak=False, dispatch_uid="t"
        )
        with django_capture_on_commit_callbacks(execute=True):
            res = register(client)
        user_registered.disconnect(dispatch_uid="t")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["username"] == "Reza_90"
        assert body["phone"] == PHONE
        assert settings.ACCESS_COOKIE in res.cookies and settings.REFRESH_COOKIE in res.cookies
        assert res.cookies[settings.ACCESS_COOKIE]["httponly"]
        assert [u.username for u in received] == ["Reza_90"]
        assert client.get("/api/v1/me").json()["username"] == "Reza_90"

    def test_otp_is_stored_hashed_only(self, client, fixed_code):
        client.post("/api/v1/auth/otp", {"phone": "09121234567", "purpose": "register"}, format="json")
        otp = Otp.objects.get()
        assert otp.phone == PHONE
        assert str(CODE) not in otp.code_hash

    def test_phone_already_registered(self, client, fixed_code):
        register(client)
        res = APIClient().post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json")
        assert res.status_code == 409
        assert res.json()["code"] == "AUTH_PHONE_TAKEN"

    def test_username_is_case_insensitive_unique(self, client, fixed_code):
        register(client, username="Reza_90")
        res = register(APIClient(), username="reza_90", phone="+989121111111")
        assert res.status_code == 409
        assert res.json()["code"] == "USERNAME_TAKEN"

    @pytest.mark.parametrize("username", ["ab", "1abc", "has space", "admin", "kosmos12", "a" * 21])
    def test_invalid_usernames(self, client, fixed_code, username):
        res = register(client, username=username)
        assert res.status_code == 400
        assert res.json()["code"] == "USERNAME_INVALID"

    @pytest.mark.parametrize("password", ["short1!", "12345678901", "password"])
    def test_weak_passwords(self, client, fixed_code, password):
        token = verification(client)
        res = client.post(
            "/api/v1/auth/register",
            {"verification_token": token, "username": "Reza_90", "password": password, "age_confirmed": True},
            format="json",
        )
        assert res.json()["code"] == "PASSWORD_WEAK"

    def test_lang_at_signup(self, client, fixed_code):
        assert register(client, lang="en").json()["lang"] == "en"

    def test_expired_verification_token(self, client, fixed_code):
        token = verification(client)
        body = {
            "verification_token": token,
            "username": "Reza_90",
            "password": "S3cure-pass!",
            "age_confirmed": True,
        }
        with mock.patch("accounts.otp.VERIFICATION_MAX_AGE_SECONDS", -1):
            res = client.post("/api/v1/auth/register", body, format="json")
        assert res.json()["code"] == "AUTH_VERIFICATION_INVALID"
        assert res.json()["details"] == {"reason": "expired"}

    def test_username_availability(self, client, fixed_code):
        register(client, username="Reza_90")

        def check(username):
            return client.get("/api/v1/auth/username-available", {"username": username}).json()

        assert check("reza_90") == {"available": False, "reason": "taken"}
        assert check("Sara_1") == {"available": True, "reason": None}
        assert check("admin") == {"available": False, "reason": "reserved"}
        assert check("x") == {"available": False, "reason": "format"}

    def test_age_must_be_confirmed(self, client, fixed_code):
        assert register(client, age_confirmed=False).json()["code"] == "AGE_NOT_CONFIRMED"

    def test_verification_token_is_single_use(self, client, fixed_code):
        token = verification(client)
        body = {
            "verification_token": token,
            "username": "Reza_90",
            "password": "S3cure-pass!",
            "age_confirmed": True,
        }
        assert client.post("/api/v1/auth/register", body, format="json").status_code == 201
        body["username"] = "Other_1"
        res = APIClient().post("/api/v1/auth/register", body, format="json")
        assert res.json()["code"] == "AUTH_VERIFICATION_INVALID"

    def test_referrer_is_linked(self, client, fixed_code):
        register(client, username="Parent_1")
        res = register(APIClient(), username="Child_1", phone="+989122222222", referrer="parent_1")
        assert res.status_code == 201
        assert User.objects.get(username="Child_1").referrer_id == User.objects.get(username="Parent_1").id
        res = register(APIClient(), username="Child_2", phone="+989123333333", referrer="nobody_here")
        assert res.json()["code"] == "REFERRER_NOT_FOUND"


@pytest.mark.django_db
class TestOtp:
    def test_wrong_code_counts_attempts_then_expires(self, client, fixed_code):
        client.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json")
        for left in (4, 3, 2, 1):
            res = client.post(
                "/api/v1/auth/otp/verify",
                {"phone": PHONE, "purpose": "register", "code": "11111"},
                format="json",
            )
            assert res.json() == {
                "code": "AUTH_OTP_INVALID",
                "message_key": "errors.auth.otpInvalid",
                "details": {"attempts_left": left},
            }
        res = client.post(
            "/api/v1/auth/otp/verify", {"phone": PHONE, "purpose": "register", "code": "11111"}, format="json"
        )
        assert res.json()["code"] == "AUTH_OTP_EXPIRED"
        # even the right code no longer works
        res = client.post(
            "/api/v1/auth/otp/verify",
            {"phone": PHONE, "purpose": "register", "code": str(CODE)},
            format="json",
        )
        assert res.json()["code"] == "AUTH_OTP_EXPIRED"

    def test_expired_code(self, client, fixed_code):
        client.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json")
        Otp.objects.update(expires_at="2000-01-01T00:00:00Z")
        res = client.post(
            "/api/v1/auth/otp/verify",
            {"phone": PHONE, "purpose": "register", "code": str(CODE)},
            format="json",
        )
        assert res.json()["code"] == "AUTH_OTP_EXPIRED"

    def test_resend_cooldown(self, client):
        res = client.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json")
        assert res.json() == {"sms": True, "expires_in": 120, "resend_after": 60}
        res = client.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json")
        assert res.status_code == 429
        assert res.json()["details"]["reason"] == "cooldown"
        assert 0 < res.json()["details"]["retry_after"] <= 60

    def test_rate_limit_per_phone(self, client):
        for _ in range(3):
            ratelimit.reset(f"otp:resend:{PHONE}:register")
            assert (
                client.post(
                    "/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json"
                ).status_code
                == 202
            )
        ratelimit.reset(f"otp:resend:{PHONE}:register")
        res = client.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "register"}, format="json")
        assert res.status_code == 429
        assert res.json()["code"] == "AUTH_OTP_RATE_LIMITED"
        assert 0 < res.json()["details"]["retry_after"] <= 600

    def test_rate_limit_per_ip(self, client):
        for i in range(3):
            client.post(
                "/api/v1/auth/otp", {"phone": f"+98912000000{i}", "purpose": "register"}, format="json"
            )
        res = client.post(
            "/api/v1/auth/otp", {"phone": "+989120000009", "purpose": "register"}, format="json"
        )
        assert res.status_code == 429

    def test_reset_for_unknown_phone_looks_like_success(self, client):
        res = client.post("/api/v1/auth/otp", {"phone": PHONE, "purpose": "password_reset"}, format="json")
        assert res.status_code == 202
        assert not Otp.objects.exists()

    @pytest.mark.parametrize("phone", ["0912123456", "+14155550000", "abc", "08121234567"])
    def test_invalid_phone(self, client, phone):
        res = client.post("/api/v1/auth/otp", {"phone": phone, "purpose": "register"}, format="json")
        assert res.json()["code"] == "PHONE_INVALID"


@pytest.mark.django_db
class TestLoginAndSessions:
    def test_login_logout(self, client, fixed_code):
        register(client)
        c2 = APIClient()
        res = c2.post(
            "/api/v1/auth/login", {"phone": "۰۹۱۲۱۲۳۴۵۶۷", "password": "S3cure-pass!"}, format="json"
        )
        assert res.status_code == 200
        assert c2.get("/api/v1/me").status_code == 200
        assert c2.post("/api/v1/auth/logout").status_code == 204
        c2.cookies[settings.ACCESS_COOKIE] = res.cookies[settings.ACCESS_COOKIE].value
        assert c2.get("/api/v1/me").json()["code"] == "AUTH_SESSION_INVALID"

    def test_stale_access_cookie_does_not_block_public_endpoints(self, client, fixed_code):
        register(client)
        c2 = APIClient()
        c2.cookies[settings.ACCESS_COOKIE] = "expired-or-garbage"
        res = c2.post("/api/v1/auth/login", {"phone": PHONE, "password": "S3cure-pass!"}, format="json")
        assert res.status_code == 200
        c2.cookies[settings.ACCESS_COOKIE] = "expired-or-garbage"
        assert c2.post("/api/v1/auth/refresh").status_code == 200
        assert c2.get("/api/v1/me").status_code == 200

    def test_wrong_password_never_says_which_part(self, client, fixed_code):
        register(client)
        wrong_pass = APIClient().post(
            "/api/v1/auth/login", {"phone": PHONE, "password": "nope-nope"}, format="json"
        )
        no_user = APIClient().post(
            "/api/v1/auth/login", {"phone": "+989129999999", "password": "x"}, format="json"
        )
        assert wrong_pass.json() == no_user.json()
        assert wrong_pass.json()["code"] == "AUTH_INVALID_CREDENTIALS"

    def test_five_failures_lock_the_account(self, client, fixed_code):
        register(client)
        codes = [
            APIClient()
            .post("/api/v1/auth/login", {"phone": PHONE, "password": "bad-pass"}, format="json")
            .json()["code"]
            for _ in range(5)
        ]
        assert codes == ["AUTH_INVALID_CREDENTIALS"] * 4 + ["AUTH_LOCKED"]
        res = APIClient().post(
            "/api/v1/auth/login", {"phone": PHONE, "password": "S3cure-pass!"}, format="json"
        )
        assert res.json()["code"] == "AUTH_LOCKED"
        assert 0 < res.json()["details"]["retry_after"] <= 900

    def test_banned_user_cannot_log_in(self, client, fixed_code):
        register(client)
        User.objects.update(status=User.Status.BANNED)
        res = APIClient().post(
            "/api/v1/auth/login", {"phone": PHONE, "password": "S3cure-pass!"}, format="json"
        )
        assert res.json()["code"] == "AUTH_BANNED"
        # a wrong password never reveals the ban
        res = APIClient().post(
            "/api/v1/auth/login", {"phone": PHONE, "password": "wrong-pass"}, format="json"
        )
        assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"
        assert client.get("/api/v1/me").status_code == 401
        assert client.post("/api/v1/auth/refresh").json()["code"] == "AUTH_BANNED"

    def test_refresh_rotates_and_detects_reuse(self, client, fixed_code):
        register(client)
        old_refresh = client.cookies[settings.REFRESH_COOKIE].value
        res = client.post("/api/v1/auth/refresh")
        assert res.status_code == 200
        assert client.cookies[settings.REFRESH_COOKIE].value != old_refresh
        attacker = APIClient()
        attacker.cookies[settings.REFRESH_COOKIE] = old_refresh
        assert attacker.post("/api/v1/auth/refresh").status_code == 401
        # reuse revoked the whole session, so the legitimate client is signed out too
        assert client.post("/api/v1/auth/refresh").status_code == 401

    def test_sessions_list_and_sign_out_others(self, client, fixed_code):
        register(client)
        other = APIClient()
        other.post("/api/v1/auth/login", {"phone": PHONE, "password": "S3cure-pass!"}, format="json")
        rows = client.get("/api/v1/me/sessions").json()["results"]
        assert len(rows) == 2 and sum(r["current"] for r in rows) == 1
        assert client.delete("/api/v1/me/sessions").json() == {"revoked": 1}
        assert other.get("/api/v1/me").status_code == 401
        assert client.get("/api/v1/me").status_code == 200

    def test_password_reset_signs_in_here_and_out_everywhere_else(self, client, fixed_code):
        register(client)
        device = APIClient()
        token = verification(device, purpose="password_reset")
        res = device.post(
            "/api/v1/auth/password/reset",
            {"verification_token": token, "new_password": "N3w-pass-word"},
            format="json",
        )
        assert res.status_code == 200
        assert device.get("/api/v1/me").status_code == 200
        assert client.get("/api/v1/me").status_code == 401
        assert Session.objects.filter(revoked_at__isnull=True).count() == 1
        login = APIClient().post(
            "/api/v1/auth/login", {"phone": PHONE, "password": "N3w-pass-word"}, format="json"
        )
        assert login.status_code == 200


@pytest.mark.django_db
class TestProfile:
    def test_update_me(self, client, fixed_code):
        register(client)
        res = client.patch(
            "/api/v1/me", {"lang": "en", "avatar": "avatar_05", "prefs": {"sound": False}}, format="json"
        )
        body = res.json()
        assert body["lang"] == "en" and body["avatar"] == "avatar_05"
        assert body["prefs"] == {
            "graphics_lite": False,
            "animations_reduced": False,
            "sound": False,
            "vibration": True,
        }
        assert client.patch("/api/v1/me", {"avatar": "nope"}, format="json").status_code == 400

    def test_public_profile_never_exposes_phone(self, client, fixed_code):
        register(client)
        body = APIClient().get("/api/v1/users/reza_90").json()
        assert body["username"] == "Reza_90"
        assert "phone" not in body and PHONE not in str(body)
        assert APIClient().get("/api/v1/users/ghost").status_code == 404

    def test_me_requires_auth(self, client):
        assert client.get("/api/v1/me").status_code == 401

    def test_avatars(self, client):
        assert len(client.get("/api/v1/avatars").json()["results"]) == 12


@pytest.mark.django_db
def test_csrf_is_enforced_on_writes():
    strict = APIClient(enforce_csrf_checks=True)
    res = strict.post("/api/v1/auth/login", {"phone": PHONE, "password": "x"}, format="json")
    assert res.status_code == 403 and res.json()["code"] == "CSRF_FAILED"
    strict.get("/api/v1/auth/csrf")
    token = strict.cookies["csrftoken"].value
    res = strict.post(
        "/api/v1/auth/login", {"phone": PHONE, "password": "x"}, format="json", HTTP_X_CSRFTOKEN=token
    )
    assert res.json()["code"] == "AUTH_INVALID_CREDENTIALS"
