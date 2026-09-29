"""Refuses an insecure production configuration (CLAUDE.md §12.1, §22.1). Django runs system checks
before `migrate`, so a production deploy with any of these problems stops before it starts."""

from typing import Any

from django.conf import settings
from django.core.checks import Error, register

WEAK_SECRETS = {"", "insecure-dev-key", "change-me", "change-me-to-a-long-random-string"}


def production_problems() -> list[str]:
    if settings.APP_ENV != "production":
        return []
    problems = []
    if settings.DEBUG:
        problems.append("DJANGO_DEBUG must be false")
    if settings.URL_SCHEME != "https":
        problems.append("URL_SCHEME must be https (secure cookies, HSTS)")
    keys = {
        "DJANGO_SECRET_KEY": settings.SECRET_KEY,
        "JWT_SIGNING_KEY": settings.JWT_SIGNING_KEY,
        "ADMIN_SECRET_KEY": settings.ADMIN_SECRET_KEY,
    }
    for name, value in keys.items():
        if (value or "") in WEAK_SECRETS or len(value or "") < 32:
            problems.append(f"{name} must be a random string of at least 32 characters")
    # Separate keys: a leaked user-token key must not also sign admin tokens (§12.1).
    if len(set(keys.values())) < len(keys):
        problems.append("DJANGO_SECRET_KEY, JWT_SIGNING_KEY and ADMIN_SECRET_KEY must all differ")
    if not settings.ADMIN_2FA_REQUIRED:
        problems.append("ADMIN_2FA_REQUIRED must be true (admin two-step sign-in, §12.1)")
    if not settings.SEED_ENCRYPTION_KEY:
        problems.append("SEED_ENCRYPTION_KEY must be set (match seeds are encrypted at rest, §6)")
    return problems


@register()
def check_production(app_configs: Any = None, **kwargs: Any) -> list[Error]:
    return [Error(p, id="config.E001") for p in production_problems()]
