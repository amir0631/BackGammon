"""Accounts API (CLAUDE.md §10.2 Auth and Profile)."""

from typing import Any

from django.conf import settings
from django.core.cache import cache
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
    permission_classes = (AllowAny,)


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(PublicView):
    """Sets the `csrftoken` cookie that the API client echoes in `X-CSRFToken`."""

    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class OtpRequestView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.OtpRequestSerializer, request.data)
        otp.request_otp(data["phone"], data["purpose"], sessions.client_ip(request._request))
        return Response({"ttl_seconds": registry.get("otp.ttl_seconds")}, status=status.HTTP_202_ACCEPTED)


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
                    lang=_cookie_lang(request),
                )
                user_registered.send(sender=User, user=user)
        except IntegrityError:
            raise errors.UsernameTaken() from None
        return _signed_in(user, request, status.HTTP_201_CREATED)


class LoginView(PublicView):
    def post(self, request: Request) -> Response:
        data = _validated(serializers.LoginSerializer, request.data)
        phone = data["phone"]
        lock_key = f"login:lock:{phone}"
        if cache.get(lock_key):
            raise errors.Locked(details={"retry_after": registry.get("auth.login_lock_seconds")})
        user = User.objects.filter(phone=phone).first()
        if user is None or not user.check_password(data["password"]):
            allowed, _ = ratelimit.hit(
                f"login:fail:{phone}",
                registry.get("auth.login_max_failures") - 1,
                registry.get("auth.login_lock_seconds"),
            )
            if not allowed:
                lock = registry.get("auth.login_lock_seconds")
                cache.set(lock_key, 1, timeout=lock)
                cache.delete(f"rl:login:fail:{phone}")
                raise errors.Locked(details={"retry_after": lock})
            raise errors.InvalidCredentials()
        if not user.is_active:
            raise errors.Banned()
        cache.delete(f"rl:login:fail:{phone}")
        return _signed_in(user, request)


class RefreshView(PublicView):
    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.REFRESH_COOKIE)
        if not raw:
            raise errors.SessionInvalid()
        try:
            session, refresh = sessions.rotate(raw, request._request)
        except errors.SessionInvalid:
            body = error_body(errors.SessionInvalid.code, errors.SessionInvalid.message_key)
            response = Response(body, status=status.HTTP_401_UNAUTHORIZED)
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


class AvatarsView(PublicView):
    def get(self, request: Request) -> Response:
        return Response({"results": [{"key": key} for key in AVATARS], "next": None})
