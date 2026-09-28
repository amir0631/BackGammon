import pytest


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True, scope="session")
def _celery_eager():
    """Tasks run in-process, so the suite needs no broker and task errors fail the test."""
    from config.celery import app

    app.conf.update(task_always_eager=True, task_eager_propagates=True)


@pytest.fixture(autouse=True)
def _console_sms(settings):
    settings.SMS_PROVIDER = "console"
