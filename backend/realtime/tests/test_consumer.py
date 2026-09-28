import asyncio
import json

import pytest
from asgiref.testing import ApplicationCommunicator
from channels.db import database_sync_to_async
from rest_framework.test import APIClient

from game.services import create_match
from realtime import consumers, live
from wallet.tests.helpers import make_user


@pytest.fixture(autouse=True)
def _in_memory_layer(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    from channels.layers import channel_layers

    channel_layers.backends.clear()


class WebsocketCommunicator(ApplicationCommunicator):
    """Minimal WebSocket test client (channels.testing needs daphne, which this project does not use)."""

    def __init__(self, application, path, headers):
        super().__init__(
            application, {"type": "websocket", "path": path, "headers": headers, "subprotocols": []}
        )

    async def connect(self, timeout=2):
        await self.send_input({"type": "websocket.connect"})
        out = await self.receive_output(timeout)
        return out["type"] == "websocket.accept", out

    async def send_json_to(self, data):
        await self.send_input({"type": "websocket.receive", "text": json.dumps(data)})

    async def receive_json_from(self, timeout=2):
        out = await self.receive_output(timeout)
        assert out["type"] == "websocket.send", out
        return json.loads(out["text"])

    async def disconnect(self, code=1000, timeout=2):
        await self.send_input({"type": "websocket.disconnect", "code": code})
        await self.wait(timeout)


def app():
    from config.asgi import application

    return application


def ws_token(user):
    c = APIClient()
    res = c.post("/api/v1/auth/login", {"phone": user.phone, "password": "S3cure-pass!"}, format="json")
    assert res.status_code == 200
    return c.get("/api/v1/auth/ws-token").json()["token"]


async def connect(token: str | None = None) -> WebsocketCommunicator:
    comm = WebsocketCommunicator(
        app(), "/ws", headers=[(b"host", b"m.localhost"), (b"origin", b"http://m.localhost")]
    )
    connected, _ = await comm.connect()
    assert connected
    if token:
        await comm.send_json_to({"type": "auth", "seq": 0, "payload": {"token": token}})
        ok = await comm.receive_json_from()
        assert ok["type"] == "auth.ok"
    return comm


async def until(comm, type_, limit=20):
    for _ in range(limit):
        msg = await comm.receive_json_from(timeout=5)
        if msg["type"] == type_:
            return msg
    raise AssertionError(f"no {type_}")


@pytest.mark.django_db(transaction=True)
def test_unauthenticated_socket_is_closed(monkeypatch):
    monkeypatch.setattr(consumers, "AUTH_TIMEOUT", 0.1)

    async def run():
        comm = await connect()
        out = await comm.receive_output(timeout=2)
        assert out["type"] == "websocket.close" and out["code"] == consumers.CLOSE_UNAUTHENTICATED

    asyncio.run(run())


@pytest.mark.django_db(transaction=True)
def test_bad_token_is_closed():
    async def run():
        comm = await connect()
        await comm.send_json_to({"type": "auth", "seq": 0, "payload": {"token": "nope"}})
        out = await comm.receive_output(timeout=2)
        assert out["type"] == "websocket.close"

    asyncio.run(run())


@pytest.mark.django_db(transaction=True)
def test_players_play_and_spectator_watches(clock):
    a, b, watcher = make_user("Wsa_1"), make_user("Wsb_1"), make_user("Wsw_1")
    tokens = [ws_token(a), ws_token(b), ws_token(watcher)]
    match = create_match(a, b, "standard_cube", 3)  # transaction=True: on_commit runs at once
    mid = str(match.id)

    async def run():
        ca, cb, cw = [await connect(t) for t in tokens]
        for comm in (ca, cb):
            await comm.send_json_to(
                {"type": "match.sync", "match_id": mid, "seq": 0, "payload": {"last_seq": 0}}
            )
            state = await until(comm, "match.state")
            assert state["payload"]["phase"] == "opening"
        # Opening rolls until someone starts.
        for _ in range(20):
            clock.t += live.OPENING_DELAY
            for m in await database_sync_to_async(live.due_timers)():
                await database_sync_to_async(live.fire)(m)
            rolled = await until(ca, "turn.rolled")
            if rolled["payload"]["legal"]:
                break
        state = await database_sync_to_async(live.load)(mid)
        mover = ca if state.engine.turn == 0 else cb
        await mover.send_json_to(
            {
                "type": "turn.move",
                "match_id": mid,
                "seq": rolled["seq"],
                "payload": {"moves": rolled["payload"]["legal"][0]},
            }
        )
        moved_a = await until(ca, "turn.moved")
        moved_b = await until(cb, "turn.moved")
        assert moved_a == moved_b

        await cw.send_json_to({"type": "spectate.join", "match_id": mid, "seq": 0, "payload": {}})
        spect = await until(cw, "spectate.state")
        assert spect["payload"]["you"] is None and spect["payload"]["spectators"] == 1
        # Spectator sockets are read-only.
        await cw.send_json_to({"type": "turn.roll", "match_id": mid, "seq": spect["seq"], "payload": {}})
        err = await until(cw, "error")
        assert err["payload"]["code"] == "MATCH_NOT_ATTACHED"
        # Spectators see the players' events too.
        await ca.send_json_to(
            {"type": "react.send", "match_id": mid, "seq": 0, "payload": {"emoji_key": "clap"}}
        )
        assert (await until(cw, "react.recv"))["payload"]["key"] == "clap"
        # Unknown message types are rejected without closing.
        await ca.send_json_to({"type": "hack", "seq": 0, "payload": {}})
        assert (await until(ca, "error"))["payload"]["code"] == "BAD_MESSAGE"
        for comm in (ca, cb, cw):
            await comm.disconnect()

    asyncio.run(run())


@pytest.mark.django_db(transaction=True)
def test_rate_limit_closes_flooding_socket():
    user = make_user()
    token = ws_token(user)

    async def run():
        comm = await connect(token)
        for _ in range(consumers.RATE_PER_SECOND + 5):
            await comm.send_json_to({"type": "queue.leave", "seq": 0, "payload": {}})
        closed = False
        for _ in range(60):
            out = await comm.receive_output(timeout=2)
            if out["type"] == "websocket.close":
                closed = out["code"] == consumers.CLOSE_RATE
                break
        assert closed

    asyncio.run(run())
