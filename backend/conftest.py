from typing import Any

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


@pytest.fixture
def sms_on():
    """`sms.enabled` is off by default; tests of the code-by-SMS flows turn it on."""
    from unittest import mock

    with mock.patch("accounts.sms.enabled", return_value=True):
        yield


@pytest.fixture(autouse=True)
def _redis(settings):
    """Tests share Redis DB 15, emptied around each test (live matches, queues, leaderboards)."""
    from realtime import live

    settings.REDIS_URL = "redis://localhost:6379/15"
    live._client = None
    live.r().flushdb()
    yield
    live.r().flushdb()
    live._client = None


class _Clock:
    def __init__(self) -> None:
        self.t = 1_900_000_000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def clock(monkeypatch):
    """Controls the live runtime's clock: set `clock.t` and fire due timers."""
    from realtime import live

    c = _Clock()
    monkeypatch.setattr(live, "now", c)
    return c


@pytest.fixture
def published(monkeypatch):
    """Captures what the live runtime publishes to match groups."""
    from realtime import live

    sent: list[dict[str, Any]] = []
    monkeypatch.setattr(live, "publisher", lambda match_id, envs, spect: sent.extend(envs))
    return sent
