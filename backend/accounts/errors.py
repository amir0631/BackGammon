"""Stable error codes for the accounts API (CLAUDE.md §10.1). Message keys live in packages/i18n."""

from config.errors import AppError


def _err(code: str, key: str, status: int = 400) -> type[AppError]:
    return type(code, (AppError,), {"code": code, "message_key": f"errors.auth.{key}", "status_code": status})


PhoneInvalid = _err("PHONE_INVALID", "phoneInvalid")
PhoneTaken = _err("AUTH_PHONE_TAKEN", "phoneTaken", 409)
OtpRateLimited = _err("AUTH_OTP_RATE_LIMITED", "otpRateLimited", 429)
OtpInvalid = _err("AUTH_OTP_INVALID", "otpInvalid")
OtpExpired = _err("AUTH_OTP_EXPIRED", "otpExpired")
VerificationInvalid = _err("AUTH_VERIFICATION_INVALID", "verificationInvalid")
UsernameInvalid = _err("USERNAME_INVALID", "usernameInvalid")
UsernameTaken = _err("USERNAME_TAKEN", "usernameTaken", 409)
PasswordWeak = _err("PASSWORD_WEAK", "passwordWeak")
AgeNotConfirmed = _err("AGE_NOT_CONFIRMED", "ageNotConfirmed")
ReferrerNotFound = _err("REFERRER_NOT_FOUND", "referrerNotFound")
InvalidCredentials = _err("AUTH_INVALID_CREDENTIALS", "invalidCredentials", 401)
Locked = _err("AUTH_LOCKED", "locked", 429)
Banned = _err("AUTH_BANNED", "banned", 403)
SessionInvalid = _err("AUTH_SESSION_INVALID", "sessionInvalid", 401)
AvatarInvalid = _err("AVATAR_INVALID", "avatarInvalid")
SmsUnavailable = _err("SMS_UNAVAILABLE", "smsUnavailable", 503)
PushEndpointInvalid = _err("PUSH_ENDPOINT_INVALID", "pushEndpointInvalid")
