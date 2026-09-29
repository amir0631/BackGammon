"""Bot HTTP service (CLAUDE.md §3 "Bot: separate Python service"). A bare ASGI app, run with
`uvicorn bot.service:app --host 0.0.0.0 --port 8100`.

POST /move {"position": "<28 numbers>", "player": 0|1, "dice": [d1, d2], "level": "...", "seed": int}
     -> {"moves": [[from, to], ...]}
POST /cube {"position": "...", "player": 0|1, "level": "...", "seed": int} -> {"double": bool, "take": bool}
GET  /health -> {"status": "ok"}
"""

import json
from collections.abc import Awaitable, Callable
from typing import Any

from bot import brain
from game.engine.board import Position

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]
MAX_BODY = 4096


class UnknownPath(Exception):
    pass


def handle(path: str, body: dict[str, Any]) -> dict[str, Any]:
    position = Position.decode(str(body["position"]))
    player = int(body["player"])
    if player not in (0, 1):
        raise ValueError("player")
    level = str(body["level"])
    seed = int(body.get("seed", 0))
    if path == "/move":
        d1, d2 = (int(d) for d in body["dice"])
        return {"moves": brain.choose_move(position, player, (d1, d2), level, seed)}
    if path == "/cube":
        decision = brain.cube_decision(position, player, level, seed)
        return {"double": decision.double, "take": decision.take}
    raise UnknownPath(path)


async def _reply(send: Send, status: int, payload: dict[str, Any]) -> None:
    data = json.dumps(payload).encode()
    await send(
        {"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]}
    )
    await send({"type": "http.response.body", "body": data})


async def app(scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] != "http":
        return
    if scope["method"] == "GET" and scope["path"] == "/health":
        await _reply(send, 200, {"status": "ok"})
        return
    if scope["method"] != "POST":
        await _reply(send, 405, {"error": "method"})
        return
    raw = b""
    while True:
        message = await receive()
        raw += message.get("body", b"")
        if len(raw) > MAX_BODY:
            await _reply(send, 413, {"error": "too_large"})
            return
        if not message.get("more_body"):
            break
    try:
        await _reply(send, 200, handle(scope["path"], json.loads(raw or b"{}")))
    except UnknownPath:
        await _reply(send, 404, {"error": "not_found"})
    except (ValueError, KeyError, TypeError) as exc:
        await _reply(send, 400, {"error": "bad_request", "detail": str(exc)[:200]})
