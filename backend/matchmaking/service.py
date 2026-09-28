"""Random 1v1 matchmaking (CLAUDE.md §8): one queue per (tier, variant, length); a pair forms when
|ΔELO| is within matchmaking.elo_window, widening by matchmaking.widen_step every
matchmaking.widen_seconds the longer-waiting player has waited. Linked accounts are never paired.
Entry fees move to escrow when the match is created (§7.3)."""

import json
import logging
import math
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from accounts.models import User
from antifraud.links import are_linked
from config.errors import AppError
from game.models import Match
from game.services import create_match, player_info
from realtime import live
from settingsapp import registry
from wallet import services as wallet
from wallet.ledger import WalletInsufficient, ensure_wallet

logger = logging.getLogger("matchmaking")
QUEUES = "mm:queues"


class QueueError(AppError):
    code = "QUEUE_INVALID"
    message_key = "errors.queue.invalid"


class QueueSuspended(AppError):
    status_code = 403
    code = "ACCOUNT_SUSPENDED"
    message_key = "errors.wallet.accountSuspended"


class QueueBusy(AppError):
    status_code = 409
    code = "MATCH_IN_PROGRESS"
    message_key = "errors.match.inProgress"


def queue_key(entry: int, variant: str, length: int) -> str:
    return f"mm:q:{entry}:{variant}:{length}"


def _user_key(user_id: int) -> str:
    return f"mm:u:{user_id}"


def tiers() -> list[dict[str, Any]]:
    """Table tiers from settings (§14 table.tiers): every tier offers every variant and allowed length."""
    variants = [v for v, _ in Match.Variant.choices]
    lengths = registry.get("game.allowed_lengths")
    rake_pct = registry.get("table.rake_pct")
    return [
        {
            "id": entry,
            "entry": entry,
            "variants": variants,
            "lengths": lengths,
            "waiting": _waiting(entry),
            # §7.3, shown before joining (§21.2: the cost is visible before confirming).
            "rake_pct": rake_pct,
            "pot": entry * 2,
            "payout": entry * 2 - entry * 2 * rake_pct // 100,
        }
        for entry in registry.get("table.tiers")
    ]


def _waiting(entry: int) -> int:
    total = 0
    for key in live.r().smembers(QUEUES):
        if key.startswith(f"mm:q:{entry}:"):
            total += int(live.r().zcard(key))
    return total


def status_payload(
    state: str, entry: int, variant: str, length: int, reason: str | None = None
) -> dict[str, Any]:
    return {"state": state, "tier_id": entry, "variant": variant, "length": length, "reason": reason}


def join(user: User, entry: int, variant: str, length: int) -> dict[str, Any]:
    from game.views import active_match

    if user.status == User.Status.SUSPENDED:
        raise QueueSuspended()
    if entry not in registry.get("table.tiers"):
        raise QueueError(details={"reason": "tier"})
    if length not in registry.get("game.allowed_lengths"):
        raise QueueError(details={"reason": "length"})
    if variant not in Match.Variant.values:
        raise QueueError(details={"reason": "variant"})
    if (running := active_match(user)) is not None:
        raise QueueBusy(details={"match_id": str(running.id)})
    balance = ensure_wallet(user.id).balance
    if balance < entry:
        raise WalletInsufficient(details={"balance": balance, "needed": entry})
    leave(user)
    key = queue_key(entry, variant, length)
    now = live.now()
    pipe = live.r().pipeline()
    pipe.zadd(key, {str(user.id): now})
    pipe.set(_user_key(user.id), json.dumps({"queue": key, "elo": user.elo, "joined": now}), ex=3600)
    pipe.sadd(QUEUES, key)
    pipe.execute()
    try_pair(key)
    return status_payload("waiting", entry, variant, length)


def leave(user: User) -> dict[str, Any] | None:
    raw = live.r().get(_user_key(user.id))
    if raw is None:
        return None
    info = json.loads(raw)
    live.r().zrem(info["queue"], str(user.id))
    live.r().delete(_user_key(user.id))
    _, entry, variant, length = info["queue"].split(":")[1:]
    return status_payload("left", int(entry), variant, int(length))


def _window(wait: float) -> float:
    step = registry.get("matchmaking.widen_step")
    every = registry.get("matchmaking.widen_seconds")
    return float(registry.get("matchmaking.elo_window") + step * math.floor(wait / every))


def try_pair(key: str) -> list[str]:
    """Pairs whoever can be paired in one queue; returns the new match ids."""
    lock = live.r().lock(f"{key}:lock", timeout=10, blocking_timeout=5)
    if not lock.acquire():
        return []
    created: list[str] = []
    try:
        members = [(int(uid), score) for uid, score in live.r().zrange(key, 0, -1, withscores=True)]
        infos = {uid: json.loads(live.r().get(_user_key(uid)) or "{}") for uid, _ in members}
        now = live.now()
        taken: set[int] = set()
        for i, (a, joined_a) in enumerate(members):
            if a in taken or not infos.get(a):
                continue
            for b, joined_b in members[i + 1 :]:
                if b in taken or not infos.get(b):
                    continue
                window = _window(now - min(joined_a, joined_b))
                if abs(infos[a]["elo"] - infos[b]["elo"]) > window or are_linked(a, b):
                    continue
                match_id = _start(key, a, b, {a: now - joined_a, b: now - joined_b})
                if match_id is not None:
                    taken |= {a, b}
                    created.append(match_id)
                break
    finally:
        try:
            lock.release()
        except Exception:  # noqa: S110 (lock expired: nothing to release)
            pass
    return created


def _start(key: str, a_id: int, b_id: int, waits: dict[int, float] | None = None) -> str | None:
    _, entry_s, variant, length_s = key.split(":")[1:]
    entry, length = int(entry_s), int(length_s)
    users = {u.id: u for u in User.objects.filter(id__in=[a_id, b_id])}
    for uid in (a_id, b_id):
        live.r().zrem(key, str(uid))
        live.r().delete(_user_key(uid))
    # Whoever can no longer pay (or was suspended) leaves the queue; the other waits on.
    for uid in (a_id, b_id):
        user = users.get(uid)
        if user is None or user.status != User.Status.ACTIVE or ensure_wallet(uid).balance < entry:
            other = b_id if uid == a_id else a_id
            if other in users:
                _requeue(key, users[other])
            if user is not None:
                _notify(uid, "queue.status", status_payload("removed", entry, variant, length, "balance"))
            return None
    a, b = users[a_id], users[b_id]
    try:
        with transaction.atomic():
            match = create_match(a, b, variant, length, entry=entry)
            wallet.escrow_match_entries(match.id, [a.id, b.id], entry)
            from predictions.services import open_pool

            open_pool(match)  # random pairing: eligible for a prediction pool (§7.5)
            if waits:
                from reports.models import QueueWait

                QueueWait.objects.bulk_create(
                    QueueWait(match=match, user_id=uid, seconds=max(0, int(wait)))
                    for uid, wait in waits.items()
                )
    except WalletInsufficient:
        logger.warning("entry escrow failed for %s", key)
        for user in (a, b):
            _notify(user.id, "queue.status", status_payload("removed", entry, variant, length, "balance"))
        return None
    pairs: list[tuple[int, User, User]] = [(0, a, b), (1, b, a)]
    for side, player, opponent in pairs:
        _notify(
            player.id,
            "match.found",
            {
                "match_id": str(match.id),
                "you": side,
                "opponent": {**player_info(opponent), "connected": False},
                "seed_commit": match.seed_commit,
                "variant": variant,
                "length": length,
                "entry": entry,
            },
        )
    return str(match.id)


def _requeue(key: str, user: User) -> None:
    now = live.now()
    live.r().zadd(key, {str(user.id): now})
    live.r().set(_user_key(user.id), json.dumps({"queue": key, "elo": user.elo, "joined": now}), ex=3600)


def _notify(user_id: int, type_: str, payload: dict[str, Any]) -> None:
    from realtime import protocol

    body = protocol.SERVER_MESSAGES[type_].model_validate(payload).model_dump(mode="json")
    envelope = {"type": type_, "match_id": body.get("match_id"), "seq": 0, "payload": body}
    notifier(user_id, envelope)


def _channel_notify(user_id: int, envelope: dict[str, Any]) -> None:
    layer = get_channel_layer()
    if layer is not None:
        async_to_sync(layer.group_send)(f"user.{user_id}", {"type": "user.message", "envelope": envelope})


notifier = _channel_notify


def tick() -> None:
    """Called by the timer worker: widening windows can pair players who were waiting."""
    for key in live.r().smembers(QUEUES):
        if live.r().zcard(key) >= 2:
            try_pair(key)
        elif live.r().zcard(key) == 0:
            live.r().srem(QUEUES, key)
