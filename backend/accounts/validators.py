import re

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError

from accounts.errors import PasswordWeak, UsernameInvalid

_USERNAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{2,19}")

RESERVED = {
    "admin",
    "administrator",
    "root",
    "system",
    "support",
    "bot",
    "moderator",
    "staff",
    "official",
    "takhtenard",
    "backgammon",
    "null",
    "undefined",
    "me",
    "api",
    "help",
}

# Substrings rejected in usernames (CLAUDE.md §12.1). Latin transliterations of Persian profanity
# are included because usernames are Latin-only. Admins can still rename abusive accounts.
PROFANITY = {
    "fuck",
    "shit",
    "bitch",
    "cunt",
    "dick",
    "pussy",
    "whore",
    "slut",
    "nigger",
    "fag",
    "porn",
    "sex",
    "kos",
    "koon",
    "kir",
    "jende",
    "jakesh",
    "gayid",
    "madarjende",
    "haroomzade",
    "haramzade",
    "koskesh",
}


def validate_username(value: str) -> str:
    if not _USERNAME.fullmatch(value):
        raise UsernameInvalid(details={"reason": "format"})
    lowered = value.lower()
    if lowered in RESERVED:
        raise UsernameInvalid(details={"reason": "reserved"})
    if any(word in lowered for word in PROFANITY):
        raise UsernameInvalid(details={"reason": "profanity"})
    return value


def validate_password(value: str) -> str:
    try:
        password_validation.validate_password(value)
    except ValidationError as exc:
        raise PasswordWeak(details={"rules": sorted({e.code for e in exc.error_list if e.code})}) from None
    return value
