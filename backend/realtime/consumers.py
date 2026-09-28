"""The `/ws` endpoint (CLAUDE.md §10.3).

The first message must be `auth` with a token from GET /api/v1/auth/ws-token; otherwise the socket is
closed after 5 s. A player attaches to a match with `match.sync` (last_seq: 0 for a full state).
Game actions go to the live runtime, whose events come back through the match group in seq order.
"""

import asyncio
import time
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from pydantic import ValidationError

from accounts.models import Session, User
from accounts.sessions import decode_access
from realtime import live, protocol

AUTH_TIMEOUT = 5.0
RATE_PER_SECOND = 20  # §12.1
CLOSE_UNAUTHENTICATED = 4001
CLOSE_RATE = 4008


def _error(
    code: str, key: str, details: dict[str, Any] | None = None, match_id: str | None = None
) -> dict[str, Any]:
    return {
        "type": "error",
        "match_id": match_id,
        "seq": 0,
        "payload": {"code": code, "message_key": key, "details": details or {}},
    }


def _user_for(token: str) -> User | None:
    claims = decode_access(token, typ="ws")
    if claims is None:
        return None
    session = (
        Session.objects.select_related("user")
        .filter(id=claims["sid"], user_id=claims["sub"], revoked_at__isnull=True)
        .first()
    )
    if session is None or not session.user.is_active:
        return None
    return session.user


class GameConsumer(AsyncJsonWebsocketConsumer):  # type: ignore[misc]
    async def connect(self) -> None:
        self.user: User | None = None
        self.match_id: str | None = None
        self._window = (0.0, 0)
        await self.accept()
        self._auth_deadline = asyncio.get_running_loop().call_later(AUTH_TIMEOUT, self._close_if_anonymous)

    def _close_if_anonymous(self) -> None:
        if self.user is None:
            self._closing = asyncio.ensure_future(self.close(code=CLOSE_UNAUTHENTICATED))

    async def disconnect(self, code: int) -> None:
        from realtime import spectate

        self._auth_deadline.cancel()
        await spectate.leave_all(self)
        if self.user is not None:
            await self.channel_layer.group_discard(f"user.{self.user.id}", self.channel_name)
        if self.match_id is not None and self.user is not None:
            await self.channel_layer.group_discard(live.group_name(self.match_id), self.channel_name)
            await database_sync_to_async(live.disconnect)(self.match_id, self.user.id, self.channel_name)

    def _rate_ok(self) -> bool:
        start, count = self._window
        t = time.monotonic()
        if t - start >= 1.0:
            self._window = (t, 1)
            return True
        self._window = (start, count + 1)
        return count + 1 <= RATE_PER_SECOND

    async def receive_json(self, content: Any, **kwargs: Any) -> None:
        if not self._rate_ok():
            await self.close(code=CLOSE_RATE)
            return
        try:
            env = protocol.Envelope.model_validate(content)
            model = protocol.CLIENT_MESSAGES.get(env.type)
            if model is None:
                raise ValueError("unknown type")
            payload = model.model_validate(env.payload).model_dump()
        except (ValidationError, ValueError) as exc:
            await self.send_json(_error("BAD_MESSAGE", "errors.ws.badMessage", {"reason": str(exc)[:200]}))
            return

        if self.user is None:
            if env.type != "auth":
                await self.close(code=CLOSE_UNAUTHENTICATED)
                return
            user = await database_sync_to_async(_user_for)(payload["token"])
            if user is None:
                await self.close(code=CLOSE_UNAUTHENTICATED)
                return
            self.user = user
            self._auth_deadline.cancel()
            await self.channel_layer.group_add(f"user.{user.id}", self.channel_name)
            await self.send_json(
                {"type": "auth.ok", "match_id": None, "seq": 0, "payload": {"username": user.username}}
            )
            return

        if env.type == "match.sync":
            await self._attach(env.match_id, payload["last_seq"])
            return
        if env.type in {"queue.join", "queue.leave"}:
            await self._queue(env.type, payload)
            return
        if env.type.startswith("spectate."):
            await self._spectate(env.type, env.match_id, payload)
            return
        if env.match_id is None or env.match_id != self.match_id:
            await self.send_json(
                _error("MATCH_NOT_ATTACHED", "errors.match.notAttached", match_id=env.match_id)
            )
            return
        replies = await database_sync_to_async(live.handle)(
            self.match_id, self.user.id, env.type, payload, env.seq
        )
        for reply in replies:
            await self.send_json(reply)

    async def _attach(self, match_id: str | None, last_seq: int) -> None:
        assert self.user is not None
        if not match_id:
            await self.send_json(_error("MATCH_NOT_FOUND", "errors.match.notFound"))
            return
        try:
            await database_sync_to_async(live.connect)(match_id, self.user.id, self.channel_name)
        except live.LiveError as exc:
            await self.send_json(_error(exc.code, exc.message_key, exc.details, match_id))
            return
        if self.match_id and self.match_id != match_id:
            await self.channel_layer.group_discard(live.group_name(self.match_id), self.channel_name)
            await database_sync_to_async(live.disconnect)(self.match_id, self.user.id, self.channel_name)
        self.match_id = match_id
        await self.channel_layer.group_add(live.group_name(match_id), self.channel_name)
        missed = await database_sync_to_async(live.events_since)(match_id, last_seq) if last_seq else None
        if missed is None:
            await self.send_json(await database_sync_to_async(live.state_envelope)(match_id, self.user.id))
        else:
            for env in missed:
                await self.send_json(env)

    async def _queue(self, type_: str, payload: dict[str, Any]) -> None:
        # Matchmaking arrives in §17 step 8.
        await self.send_json(_error("QUEUE_UNAVAILABLE", "errors.queue.unavailable"))

    async def _spectate(self, type_: str, match_id: str | None, payload: dict[str, Any]) -> None:
        from realtime import spectate

        await spectate.handle(self, type_, match_id, payload)

    async def match_events(self, event: dict[str, Any]) -> None:
        for env in event["envelopes"]:
            await self.send_json(env)

    async def user_message(self, event: dict[str, Any]) -> None:
        """Messages for this user outside a match (match.found)."""
        await self.send_json(event["envelope"])
