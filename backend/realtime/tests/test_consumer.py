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


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_unauthenticated_socket_is_closed(monkeypatch):
    monkeypatch.setattr(consumers, "AUTH_TIMEOUT", 0.1)

    async def run():
        comm = await connect()
        out = await comm.receive_output(timeout=2)
        assert out["type"] == "websocket.close" and out["code"] == consumers.CLOSE_UNAUTHENTICATED

    asyncio.run(run())


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_bad_token_is_closed():
    async def run():
        comm = await connect()
        await comm.send_json_to({"type": "auth", "seq": 0, "payload": {"token": "nope"}})
        out = await comm.receive_output(timeout=2)
        assert out["type"] == "websocket.close"

    asyncio.run(run())


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
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
        # Joining again (a client re-sync after a gap) resends the state without counting twice.
        await cw.send_json_to({"type": "spectate.join", "match_id": mid, "seq": 0, "payload": {}})
        again = await until(cw, "spectate.state")
        assert again["payload"]["spectators"] == 1 and again["seq"] == spect["seq"]
        # Spectator sockets are read-only.
        await cw.send_json_to({"type": "turn.roll", "match_id": mid, "seq": spect["seq"], "payload": {}})
        err = await until(cw, "error")
        assert err["payload"]["code"] == "MATCH_NOT_ATTACHED"
        # Spectators see the players' events too.
        await ca.send_json_to(
            {"type": "react.send", "match_id": mid, "seq": 0, "payload": {"emoji_key": "clap"}}
        )
        assert (await until(cw, "react.recv"))["payload"]["key"] == "clap"
        # Spectator reactions reach spectators outside the match sequence (no gap for players).
        before = (await database_sync_to_async(live.load)(mid)).seq
        await cw.send_json_to(
            {"type": "spectate.react", "match_id": mid, "seq": 0, "payload": {"emoji_key": "fire"}}
        )
        got = await until(cw, "spectate.react")
        assert got["seq"] == 0 and got["payload"] == {"key": "fire"}
        assert (await database_sync_to_async(live.load)(mid)).seq == before
        await cw.send_json_to(
            {"type": "spectate.react", "match_id": mid, "seq": 0, "payload": {"emoji_key": "fire"}}
        )
        assert (await until(cw, "error"))["payload"]["details"] == {"reason": "rate"}
        # Unknown message types are rejected without closing.
        await ca.send_json_to({"type": "hack", "seq": 0, "payload": {}})
        assert (await until(ca, "error"))["payload"]["code"] == "BAD_MESSAGE"
        for comm in (ca, cb, cw):
            await comm.disconnect()

    asyncio.run(run())


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
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


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_admin_watches_hidden_and_read_only(clock):
    from adminapi.tests.test_admin_api import admin_client, make_admin

    a, b = make_user("Wsa_2"), make_user("Wsb_2")
    token = ws_token(a)
    match = create_match(a, b, "standard_cube", 3)
    mid = str(match.id)
    make_admin()
    admin_token = admin_client().get("/api/v1/admin/ws-token").json()["token"]

    async def run():
        ca = await connect(token)
        await ca.send_json_to({"type": "match.sync", "match_id": mid, "seq": 0, "payload": {"last_seq": 0}})
        await until(ca, "match.state")
        cadm = WebsocketCommunicator(
            app(), "/ws", headers=[(b"host", b"admin.localhost"), (b"origin", b"http://admin.localhost")]
        )
        connected, _ = await cadm.connect()
        assert connected
        await cadm.send_json_to({"type": "auth", "seq": 0, "payload": {"token": admin_token}})
        assert (await cadm.receive_json_from())["type"] == "auth.ok"
        await cadm.send_json_to({"type": "spectate.join", "match_id": mid, "seq": 0, "payload": {}})
        spect = await until(cadm, "spectate.state")
        assert spect["payload"]["spectators"] == 0  # hidden: not counted
        assert (await database_sync_to_async(live.load)(mid)).spectators == 0
        await cadm.send_json_to({"type": "turn.roll", "match_id": mid, "seq": 0, "payload": {}})
        assert (await until(cadm, "error"))["payload"]["code"] == "ADMIN_WATCH_ONLY"
        await cadm.send_json_to(
            {
                "type": "queue.join",
                "seq": 0,
                "payload": {"tier_id": 50, "variant": "standard_cube", "length": 3},
            }
        )
        assert (await until(cadm, "error"))["payload"]["code"] == "ADMIN_WATCH_ONLY"
        await cadm.disconnect()
        await ca.disconnect()
        assert (await database_sync_to_async(live.load)(mid)).spectators == 0

    asyncio.run(run())


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_spectators_are_delayed_players_are_not(clock):
    from realtime import delay
    from settingsapp import registry

    registry.set_value("live.spectator_delay_seconds", 10)
    a, b, watcher = make_user("Wsa_3"), make_user("Wsb_3"), make_user("Wsw_3")
    tokens = [ws_token(a), ws_token(b), ws_token(watcher)]
    match = create_match(a, b, "standard_cube", 3)
    mid = str(match.id)

    async def run():
        ca, cb, cw = [await connect(t) for t in tokens]
        for comm in (ca, cb):
            await comm.send_json_to(
                {"type": "match.sync", "match_id": mid, "seq": 0, "payload": {"last_seq": 0}}
            )
            await until(comm, "match.state")
        await cw.send_json_to({"type": "spectate.join", "match_id": mid, "seq": 0, "payload": {}})
        assert await cw.receive_nothing(timeout=0.3)  # the first state waits too
        clock.t += live.OPENING_DELAY
        for m in await database_sync_to_async(live.due_timers)():
            await database_sync_to_async(live.fire)(m)
        await until(ca, "turn.rolled")  # players at once
        assert await cw.receive_nothing(timeout=0.3)
        assert await database_sync_to_async(delay.flush)() == 0
        clock.t += 10
        assert await database_sync_to_async(delay.flush)() >= 2
        assert (await until(cw, "spectate.state"))["payload"]["match_id"] == mid
        assert (await until(cw, "turn.rolled"))["match_id"] == mid
        for comm in (ca, cb, cw):
            await comm.disconnect()

    asyncio.run(run())
