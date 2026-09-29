"""Live spectating (CLAUDE.md §20.4). Any signed-in user may watch a human-vs-human match in progress.
Spectators join their own group, never the players' group, and their sockets are read-only."""

import time
from typing import TYPE_CHECKING, Any

from channels.db import database_sync_to_async
from django.core.cache import cache

from realtime import live, reactions
from settingsapp import registry

if TYPE_CHECKING:
    from realtime.consumers import GameConsumer

COUNT_THROTTLE_SECONDS = 5.0


def _join(match_id: str, user_id: int | None) -> dict[str, Any]:
    """user_id None: an admin, hidden from players and from the count, and never turned away (§13)."""
    if user_id is None:
        state = live.load(match_id)
        if state.status != "active":
            raise live.LiveError(details={"reason": "not_live"})
        return live.state_envelope(match_id, None, spectator=True)
    cap = registry.get("live.max_spectators_per_match")
    with live.session(match_id) as state:
        if state.status != "active" or any(p["is_bot"] for p in state.players):
            raise live.LiveError(details={"reason": "not_live"})
        if state.side_of(user_id) is not None:
            raise live.LiveError(details={"reason": "player"})
        if cap == 0:
            raise live.LiveError(details={"reason": "disabled"})
        if state.spectators >= cap:
            raise live.LiveError(details={"reason": "full"})
        state.spectators += 1
        _count(state)
    return live.state_envelope(match_id, None, spectator=True)


def _leave(match_id: str, hidden: bool = False) -> None:
    if hidden:
        return
    try:
        with live.session(match_id) as state:
            state.spectators = max(0, state.spectators - 1)
            _count(state)
    except live.MatchNotFound:
        return


def _count(state: live.Live) -> None:
    if time.time() - state.spectators_sent_at >= COUNT_THROTTLE_SECONDS:
        state.spectators_sent_at = time.time()
        live.emit(state, "spectators.count", {"count": state.spectators})


def _react(match_id: str, key: str, user_id: int) -> None:
    if not registry.get("live.spectator_reactions_enabled"):
        raise live.ReactionRejected(details={"reason": "disabled"})
    if not reactions.allowed("emoji", key):
        raise live.ReactionRejected(details={"reason": "unknown"})
    if not cache.add(f"spectate:react:{user_id}", 1, timeout=reactions.RATE_SECONDS):
        raise live.ReactionRejected(details={"reason": "rate"})
    live.publish_to_spectators(match_id, "spectate.react", {"key": key})


async def handle(consumer: "GameConsumer", type_: str, match_id: str | None, payload: dict[str, Any]) -> None:
    viewer = consumer.user.id if consumer.user is not None else None  # None: a hidden admin
    if not match_id:
        await consumer.send_json(
            {
                "type": "error",
                "match_id": None,
                "seq": 0,
                "payload": {"code": "MATCH_NOT_FOUND", "message_key": "errors.match.notFound", "details": {}},
            }
        )
        return
    watching: set[str] = getattr(consumer, "watching", set())
    consumer.watching = watching
    try:
        if type_ == "spectate.join":
            if match_id in watching:
                # Already watching (e.g. the client saw a gap): send a fresh state, count unchanged.
                state = await database_sync_to_async(live.state_envelope)(match_id, None, True)
            else:
                state = await database_sync_to_async(_join)(match_id, viewer)
                watching.add(match_id)
                await consumer.channel_layer.group_add(
                    live.group_name(match_id, spectators=True), consumer.channel_name
                )
            from realtime import delay

            if (held := delay.seconds()) > 0 and viewer is not None:
                # The first state comes with the same delay as the events after it (§20.4).
                await database_sync_to_async(delay.hold)("channel", consumer.channel_name, [state], held)
            else:
                await consumer.send_json(state)
        elif type_ == "spectate.leave":
            if match_id in watching:
                watching.discard(match_id)
                await consumer.channel_layer.group_discard(
                    live.group_name(match_id, spectators=True), consumer.channel_name
                )
                await database_sync_to_async(_leave)(match_id, viewer is None)
        elif type_ == "spectate.react":
            if match_id not in watching or viewer is None:
                raise live.LiveError(details={"reason": "not_watching"})
            await database_sync_to_async(_react)(match_id, payload["emoji_key"], viewer)
    except live.LiveError as exc:
        await consumer.send_json(
            {
                "type": "error",
                "match_id": match_id,
                "seq": 0,
                "payload": {"code": exc.code, "message_key": exc.message_key, "details": exc.details},
            }
        )


async def leave_all(consumer: "GameConsumer") -> None:
    for match_id in list(getattr(consumer, "watching", set())):
        await consumer.channel_layer.group_discard(
            live.group_name(match_id, spectators=True), consumer.channel_name
        )
        await database_sync_to_async(_leave)(match_id, consumer.user is None)
