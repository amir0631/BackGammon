"""Accounts API (CLAUDE.md §10.2 Auth and Profile)."""

from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import errors, otp, ratelimit, serializers, sessions
from accounts.authentication import OptionalCookieJWTAuthentication
from accounts.avatars import AVATARS
from accounts.cookies import clear_auth_cookies, set_auth_cookies
from accounts.models import Otp, Session, User
from accounts.signals import user_registered
from accounts.validators import validate_password, validate_username
from config.errors import error_body
from settingsapp import registry


def _validated(serializer_class: type[Any], data: Any) -> dict[str, Any]:
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return dict(serializer.validated_data)


def _signed_in(user: User, request: Request, status_code: int = 200) -> Response:
    session, refresh = sessions.create_session(user, request._request)
    response = Response(serializers.me_payload(user), status=status_code)
    set_auth_cookies(response, sessions.access_token(user.id, session.id), refresh)
    return response


def _current_session(request: Request) -> Session:
    assert isinstance(request.auth, Session)
    return request.auth


def _user(request: Request) -> User:
    assert isinstance(request.user, User)
    return request.user


def _cookie_lang(request: Request) -> str:
    value = request.COOKIES.get("NEXT_LOCALE")
    return value if value in User.Lang.values else User.Lang.FA


class PublicView(APIView):
    authentication_classes = (OptionalCookieJWTAuthentication,)
    permission_classes = (AllowAny,)


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(PublicView):
    """Sets the `csrftoken` cookie that the API client echoes in `X-CSRFToken`."""

    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class OtpRequestView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.OtpRequestSerializer, request.data)
        token = otp.request_otp(data["phone"], data["purpose"], sessions.client_ip(request._request))
        if token is not None:  # SMS is off: no code to enter
            return Response({"sms": False, "verification_token": token})
        return Response(
            {
                "sms": True,
                "expires_in": registry.get("otp.ttl_seconds"),
                "resend_after": registry.get("otp.resend_cooldown_seconds"),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class OtpVerifyView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.OtpVerifySerializer, request.data)
        token = otp.verify_otp(data["phone"], data["purpose"], data["code"].strip())
        return Response({"verification_token": token})


class RegisterView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.RegisterSerializer, request.data)
        if not data["age_confirmed"]:
            raise errors.AgeNotConfirmed()
        username = validate_username(data["username"].strip())
        validate_password(data["password"])
        referrer = None
        if data.get("referrer"):
            referrer = (
                User.objects.annotate(u=Lower("username")).filter(u=data["referrer"].strip().lower()).first()
            )
            if referrer is None:
                raise errors.ReferrerNotFound()
        if User.objects.annotate(u=Lower("username")).filter(u=username.lower()).exists():
            raise errors.UsernameTaken()

        try:
            with transaction.atomic():
                phone = otp.consume_verification(data["verification_token"], Otp.Purpose.REGISTER)
                if User.objects.filter(phone=phone).exists():
                    raise errors.PhoneTaken()
                user = User.objects.create_user(
                    phone=phone,
                    password=data["password"],
                    username=username,
                    referrer=referrer,
                    age_confirmed_at=timezone.now(),
                    phone_verified_at=timezone.now()
                    if otp.proves_phone(data["verification_token"])
                    else None,
                    lang=data.get("lang") or _cookie_lang(request),
                )
                user_registered.send(
                    sender=User,
                    user=user,
                    ip=sessions.client_ip(request._request),
                    user_agent=request.headers.get("User-Agent", ""),
                    device=request.headers.get("X-Device-Id", ""),
                )
        except IntegrityError:
            raise errors.UsernameTaken() from None
        return _signed_in(user, request, status.HTTP_201_CREATED)


class LoginView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.LoginSerializer, request.data)
        phone = data["phone"]
        key = f"login:{phone}"
        if remaining := ratelimit.locked_for(key):
            raise errors.Locked(details={"retry_after": remaining})
        user = User.objects.filter(phone=phone).first()
        if user is None or not user.check_password(data["password"]):
            lock = ratelimit.record_failure(
                key, registry.get("auth.login_max_failures"), registry.get("auth.login_lock_seconds")
            )
            if lock:
                raise errors.Locked(details={"retry_after": lock})
            raise errors.InvalidCredentials()
        # Only after the password matched, so a ban never reveals that a number is registered.
        if not user.is_active:
            raise errors.Banned()
        ratelimit.clear_failures(key)
        return _signed_in(user, request)


class RefreshView(PublicView):
    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.REFRESH_COOKIE)
        if not raw:
            raise errors.SessionInvalid()
        try:
            session, refresh = sessions.rotate(raw, request._request)
        except (errors.SessionInvalid, errors.Banned) as exc:
            response = Response(error_body(exc.code, exc.message_key), status=exc.status_code)
            clear_auth_cookies(response)
            return response
        response = Response(serializers.me_payload(session.user))
        set_auth_cookies(response, sessions.access_token(session.user_id, session.id), refresh)
        return response


class LogoutView(PublicView):
    def post(self, request: Request) -> Response:
        if isinstance(request.auth, Session):
            sessions.revoke(request.auth)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_auth_cookies(response)
        return response


class PasswordResetView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.PasswordResetSerializer, request.data)
        validate_password(data["new_password"])
        with transaction.atomic():
            phone = otp.consume_verification(data["verification_token"], Otp.Purpose.PASSWORD_RESET)
            user = User.objects.select_for_update().filter(phone=phone).first()
            if user is None:
                raise errors.VerificationInvalid()
            if not user.is_active:
                raise errors.Banned()
            user.set_password(data["new_password"])
            user.save(update_fields=["password"])
            sessions.revoke_all(user)  # CLAUDE.md §12.1: reset signs out every other device
        return _signed_in(user, request)


class WsTokenView(APIView):
    """A short-lived token for the WebSocket `auth` message (CLAUDE.md §10.3). The access token itself
    stays in its HttpOnly cookie, out of reach of page scripts."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        session = _current_session(request)
        token = sessions.access_token(
            _user(request).id, session.id, typ="ws", ttl=sessions.WS_TOKEN_TTL_SECONDS
        )
        return Response({"token": token, "expires_in": sessions.WS_TOKEN_TTL_SECONDS})


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        return Response(serializers.me_payload(_user(request)))

    def patch(self, request: Request) -> Response:
        data = _validated(serializers.MeUpdateSerializer, request.data)
        user = _user(request)
        fields = []
        if "lang" in data:
            user.lang = data["lang"]
            fields.append("lang")
        if "avatar" in data:
            user.avatar = data["avatar"]
            fields.append("avatar")
        if "prefs" in data:
            user.prefs = {**(user.prefs or {}), **data["prefs"]}
            fields.append("prefs")
        if fields:
            user.save(update_fields=fields)
        return Response(serializers.me_payload(user))


class SessionsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        current = _current_session(request)
        rows = Session.objects.filter(
            user=_user(request), revoked_at__isnull=True, expires_at__gt=timezone.now()
        ).order_by("-last_used_at")
        return Response({"results": [serializers.session_payload(s, current) for s in rows], "next": None})

    def delete(self, request: Request) -> Response:
        """Sign out every other device."""
        revoked = sessions.revoke_all(_user(request), except_session=_current_session(request))
        return Response({"revoked": revoked})


class UserProfileView(PublicView):
    def get(self, request: Request, username: str) -> Response:
        user = (
            User.objects.annotate(u=Lower("username"))
            .filter(u=username.lower())
            .exclude(status=User.Status.BANNED)
            .first()
        )
        if user is None:
            raise NotFound()
        return Response(serializers.public_user_payload(user))


class UsernameAvailableView(PublicView):
    """Live check while typing. The final word is still the register call (a race can take it)."""

    def get(self, request: Request) -> Response:
        username = (request.query_params.get("username") or "").strip()
        try:
            validate_username(username)
        except errors.UsernameInvalid as exc:
            return Response({"available": False, "reason": exc.details.get("reason", "format")})
        taken = User.objects.annotate(u=Lower("username")).filter(u=username.lower()).exists()
        return Response({"available": not taken, "reason": "taken" if taken else None})


class AvatarsView(PublicView):
    def get(self, request: Request) -> Response:
        return Response({"results": [{"key": key} for key in AVATARS], "next": None})
