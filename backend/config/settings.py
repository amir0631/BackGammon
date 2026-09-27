"""Django settings. Every deploy-specific value comes from the environment (see .env.example)."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise ImproperlyConfigured(f"Missing environment variable {name}")
    return value


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, "true" if default else "false").lower() in {"1", "true", "yes"}


DEBUG = env_bool("DJANGO_DEBUG")
SECRET_KEY = env("DJANGO_SECRET_KEY", "insecure-dev-key" if DEBUG else None)

BASE_DOMAIN = env("BASE_DOMAIN", "localhost")
URL_SCHEME = env("URL_SCHEME", "http")
APP_NAME = env("APP_NAME", "Takhte Nard")
DESKTOP_ENABLED = env_bool("DESKTOP_ENABLED")
SURFACE_HOSTS = [f"m.{BASE_DOMAIN}", f"app.{BASE_DOMAIN}", BASE_DOMAIN]
ADMIN_HOST = f"admin.{BASE_DOMAIN}"

ALLOWED_HOSTS = [*SURFACE_HOSTS, ADMIN_HOST, "backend", "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = [f"{URL_SCHEME}://{h}" for h in [*SURFACE_HOSTS, ADMIN_HOST]]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "channels",
    "accounts",
    "settingsapp",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"
TEMPLATES: list[dict[str, object]] = []

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "backgammon"),
        "USER": env("POSTGRES_USER", "backgammon"),
        "PASSWORD": env("POSTGRES_PASSWORD", "backgammon"),
        "HOST": env("POSTGRES_HOST", "postgres"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

REDIS_URL = env("REDIS_URL", "redis://redis:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "bg",
    }
}
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = None
CELERY_TASK_ACKS_LATE = True
CELERY_TIMEZONE = "UTC"

PASSWORD_HASHERS = ["django.contrib.auth.hashers.Argon2PasswordHasher"]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "EXCEPTION_HANDLER": "config.errors.exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# User cookies are shared by `app.` and `m.` through `.BASE_DOMAIN` (CLAUDE.md §3, §12.1).
# Browsers reject Domain=localhost, so local development uses host-only cookies.
COOKIE_DOMAIN = None if BASE_DOMAIN == "localhost" else f".{BASE_DOMAIN}"
SECURE_COOKIES = URL_SCHEME == "https"
CSRF_COOKIE_DOMAIN = COOKIE_DOMAIN
CSRF_COOKIE_SECURE = SECURE_COOKIES
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = SECURE_COOKIES

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True

LANGUAGE_CODE = "fa"
LANGUAGES = [("fa", "Persian"), ("en", "English")]
USE_I18N = True
USE_TZ = True
TIME_ZONE = "UTC"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

SEED_ENCRYPTION_KEY = env("SEED_ENCRYPTION_KEY", "")
SMS_PROVIDER = env("SMS_PROVIDER", "console")
PAYMENT_GATEWAY = env("PAYMENT_GATEWAY", "sandbox")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "config.logging.JsonFormatter"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
