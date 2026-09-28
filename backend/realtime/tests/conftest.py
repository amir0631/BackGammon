from typing import Any

import pytest

from realtime import live


class Clock:
    def __init__(self) -> None:
        self.t = 1_900_000_000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture(autouse=True)
def _redis(settings):
    """Realtime tests use Redis DB 15, emptied around each test."""
    settings.REDIS_URL = "redis://localhost:6379/15"
    live._client = None
    live.r().flushdb()
    yield
    live.r().flushdb()
    live._client = None


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(live, "now", c)
    return c


@pytest.fixture
def published(monkeypatch):
    sent: list[dict[str, Any]] = []
    monkeypatch.setattr(live, "publisher", lambda match_id, envs, spect: sent.extend(envs))
    return sent
