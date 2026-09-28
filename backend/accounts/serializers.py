from typing import Any

from rest_framework import serializers

from accounts.avatars import AVATARS
from accounts.models import Otp, Session, User, default_prefs
from accounts.phone import normalize_phone


class PhoneField(serializers.CharField):
    def to_internal_value(self, data: Any) -> str:
        return normalize_phone(super().to_internal_value(data))


class OtpRequestSerializer(serializers.Serializer[Any]):
    phone = PhoneField(max_length=32)
    purpose = serializers.ChoiceField(choices=[Otp.Purpose.REGISTER, Otp.Purpose.PASSWORD_RESET])


class OtpVerifySerializer(OtpRequestSerializer):
    code = serializers.CharField(max_length=10)


class RegisterSerializer(serializers.Serializer[Any]):
    verification_token = serializers.CharField(max_length=500)
    username = serializers.CharField(max_length=40)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    age_confirmed = serializers.BooleanField()
    referrer = serializers.CharField(max_length=40, required=False, allow_blank=True)
    lang = serializers.ChoiceField(choices=User.Lang.choices, required=False)


class LoginSerializer(serializers.Serializer[Any]):
    phone = PhoneField(max_length=32)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordResetSerializer(serializers.Serializer[Any]):
    verification_token = serializers.CharField(max_length=500)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)


class PrefsSerializer(serializers.Serializer[Any]):
    graphics_lite = serializers.BooleanField(required=False)
    animations_reduced = serializers.BooleanField(required=False)
    sound = serializers.BooleanField(required=False)
    vibration = serializers.BooleanField(required=False)


class MeUpdateSerializer(serializers.Serializer[Any]):
    lang = serializers.ChoiceField(choices=User.Lang.choices, required=False)
    avatar = serializers.ChoiceField(choices=list(AVATARS), required=False)
    prefs = PrefsSerializer(required=False)


def me_payload(user: User) -> dict[str, Any]:
    """The signed-in user's own view. Only the owner ever receives their phone number."""
    return {
        "id": user.id,
        "username": user.username,
        "phone": user.phone,
        "lang": user.lang,
        "avatar": user.avatar,
        "prefs": {**default_prefs(), **(user.prefs or {})},
        "status": user.status,
        "phone_verified": user.phone_verified_at is not None,
        "elo": user.elo,
        "xp": user.xp,
        "level": user.level,
        "created_at": user.created_at.isoformat(),
    }


def public_user_payload(user: User) -> dict[str, Any]:
    """Anyone's view of a player (CLAUDE.md §2 rule 11: never the phone)."""
    return {
        "username": user.username,
        "avatar": user.avatar,
        "elo": user.elo,
        "level": user.level,
        "created_at": user.created_at.isoformat(),
    }


def session_payload(session: Session, current: Session | None) -> dict[str, Any]:
    return {
        "id": str(session.id),
        "user_agent": session.user_agent,
        "ip": session.ip,
        "created_at": session.created_at.isoformat(),
        "last_used_at": session.last_used_at.isoformat(),
        "current": current is not None and session.id == current.id,
    }
