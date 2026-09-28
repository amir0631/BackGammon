"""Spectator delay (CLAUDE.md §20.4, live.spectator_delay_seconds): the spectators' copy of a match's
events, and a joining spectator's first state, are held back and delivered by the timer worker. Players
are never delayed. Spectator-only events (pool.update, spectator reactions) stay immediate."""

import json
import uuid
from typing import Any, cast

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from realtime import live
from settingsapp import registry

DELAYED = "rt:spec_delayed"


def seconds() -> int:
    return int(registry.get("live.spectator_delay_seconds"))


def hold(kind: str, target: str, envelopes: list[dict[str, Any]], delay: int) -> None:
    """kind "group" (a match's spectator group) or "channel" (one socket)."""
    item = json.dumps({"id": uuid.uuid4().hex, "kind": kind, "target": target, "envelopes": envelopes})
    live.r().zadd(DELAYED, {item: live.now() + delay})


def flush(limit: int = 500) -> int:
    """Delivers what is due; ZREM decides which worker sends each item."""
    items = cast(list[str], live.r().zrangebyscore(DELAYED, "-inf", live.now(), start=0, num=limit))
    layer = get_channel_layer()
    sent = 0
    for raw in items:
        if not live.r().zrem(DELAYED, raw) or layer is None:
            continue
        item = json.loads(raw)
        message = {"type": "match.events", "envelopes": item["envelopes"]}
        if item["kind"] == "group":
            async_to_sync(layer.group_send)(item["target"], message)
        else:
            async_to_sync(layer.send)(item["target"], message)
        sent += 1
    return sent
