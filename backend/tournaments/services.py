"""Tournaments (CLAUDE.md §7.6): single elimination at a power-of-two capacity, seeded by ELO.

Entries go to escrow:tournament:{id}. Not full at the start time, or cancelled: every entry refunded.
At the end: total = entries x entry, rake = floor(total x rake%), each place gets floor(pool x its
percent), dust to platform:rake. Percentages such as 12.5 are handled as integer basis points, so no
float ever touches coins (§2 rule 4).
"""

import functools
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from config.errors import AppError
from game.models import Match
from settingsapp import registry
from tournaments.models import BracketSlot, Tournament, TournamentEntry
from wallet import errors as wallet_errors
from wallet import ledger
from wallet.models import TxType

logger = logging.getLogger("tournaments")


class TournamentError(AppError):
    status_code = 409
    code = "TOURNAMENT_REFUSED"
    message_key = "errors.tournaments.refused"


def _escrow(t: Tournament) -> str:
    return ledger.escrow("tournament", t.id)


def basis_points(split: list[Any]) -> list[int]:
    return [int(Decimal(str(p)) * 100) for p in split]


def create(
    *,
    name: dict[str, str],
    variant: str,
    length: int,
    entry: int,
    capacity: int,
    starts_at: datetime,
    prize_split: list[Any] | None = None,
    prize_items: list[int | None] | None = None,
    admin_id: int | None = None,
) -> Tournament:
    if capacity < 2 or capacity > 64 or capacity & (capacity - 1):
        raise TournamentError(details={"reason": "capacity"})
    if variant not in Match.Variant.values or length not in registry.get("game.allowed_lengths"):
        raise TournamentError(details={"reason": "rules"})
    split = list(prize_split if prize_split is not None else registry.get("tournament.default_prize_split"))
    if sum(basis_points(split)) != 10_000 or len(split) > capacity or any(p < 0 for p in split):
        raise TournamentError(details={"reason": "prize_split"})
    if entry < 0 or starts_at <= timezone.now():
        raise TournamentError(details={"reason": "entry_or_time"})
    return Tournament.objects.create(
        name_i18n=name,
        variant=variant,
        length=length,
        entry=entry,
        capacity=capacity,
        starts_at=starts_at,
        prize_split=split,
        prize_items=prize_items or [],
        rake_pct=registry.get("tournament.rake_pct"),
        created_by=admin_id,
    )


def join(user: User, tournament_id: int) -> TournamentEntry:
    if user.status == User.Status.SUSPENDED:
        raise wallet_errors.AccountSuspended()
    ledger.ensure_wallet(user.id)
    with transaction.atomic():
        t = Tournament.objects.select_for_update().filter(pk=tournament_id).first()
        if t is None or t.status != Tournament.Status.SCHEDULED or t.starts_at <= timezone.now():
            raise TournamentError(details={"reason": "closed"})
        existing = TournamentEntry.objects.filter(tournament=t, user=user).first()
        if existing is not None:
            return existing
        if t.entries.count() >= t.capacity:
            raise TournamentError(details={"reason": "full"})
        entry = TournamentEntry.objects.create(tournament=t, user=user)
        if t.entry:
            ledger.post(
                TxType.TOURNAMENT_ENTRY,
                [(ledger.user_account(user.id), -t.entry), (_escrow(t), t.entry)],
                idempotency_key=f"tournament_entry:{t.id}:{user.id}:{entry.id}",
                ref_type="tournament",
                ref_id=t.id,
            )
        return entry


def leave(user: User, tournament_id: int) -> None:
    with transaction.atomic():
        t = Tournament.objects.select_for_update().filter(pk=tournament_id).first()
        if t is None or t.status != Tournament.Status.SCHEDULED:
            raise TournamentError(details={"reason": "closed"})
        entry = TournamentEntry.objects.filter(tournament=t, user=user).first()
        if entry is None:
            return
        _refund_entry(t, entry)
        entry.delete()


def _refund_entry(t: Tournament, entry: TournamentEntry) -> None:
    if not t.entry:
        return
    ledger.post(
        TxType.TOURNAMENT_REFUND,
        [(_escrow(t), -t.entry), (ledger.user_account(entry.user_id), t.entry)],
        idempotency_key=f"tournament_refund:{t.id}:{entry.user_id}:{entry.id}",
        ref_type="tournament",
        ref_id=t.id,
    )


def cancel(tournament_id: int, reason: str) -> Tournament:
    with transaction.atomic():
        t = Tournament.objects.select_for_update().get(pk=tournament_id)
        if t.status in (Tournament.Status.FINISHED, Tournament.Status.CANCELLED):
            raise TournamentError(details={"reason": "over"})
        for entry in t.entries.all():
            _refund_entry(t, entry)
        t.status = Tournament.Status.CANCELLED
        t.cancel_reason = reason
        t.finished_at = timezone.now()
        t.save(update_fields=["status", "cancel_reason", "finished_at"])
        return t


def _bracket_order(n: int) -> list[int]:
    """Standard seeding: 1 vs n, 2 vs n-1, … with seeds 1 and 2 in opposite halves."""
    order = [1]
    while len(order) < n:
        size = len(order) * 2
        order = [x for seed in order for x in (seed, size + 1 - seed)]
    return order


def start_due(now: datetime | None = None) -> list[int]:
    """Called by the timer worker: start (or cancel, when not full) every tournament whose time came."""
    now = now or timezone.now()
    started = []
    for t_id in Tournament.objects.filter(status=Tournament.Status.SCHEDULED, starts_at__lte=now).values_list(
        "id", flat=True
    ):
        try:
            if start(t_id):
                started.append(t_id)
        except Exception:
            logger.exception("tournament %s failed to start", t_id)
    return started


def start(tournament_id: int) -> bool:
    with transaction.atomic():
        t = Tournament.objects.select_for_update().get(pk=tournament_id)
        if t.status != Tournament.Status.SCHEDULED:
            return False
        entries = list(t.entries.select_related("user"))
        if len(entries) < t.capacity:
            cancel(t.id, "not_filled")
            return False
        entries.sort(key=lambda e: (-e.user.elo, e.created_at, e.user_id))
        for seed, e in enumerate(entries, start=1):
            e.seed = seed
            e.save(update_fields=["seed"])
        by_seed = {e.seed: e.user for e in entries}
        order = _bracket_order(t.capacity)
        t.status = Tournament.Status.RUNNING
        t.round = 1
        t.save(update_fields=["status", "round"])
        for position in range(t.capacity // 2):
            a, b = by_seed[order[2 * position]], by_seed[order[2 * position + 1]]
            slot = BracketSlot.objects.create(
                tournament=t, round=1, position=position, player_a=a, player_b=b
            )
            _start_match(t, slot)
        from accounts.tasks import push_tournament_started

        transaction.on_commit(lambda: push_tournament_started.delay(tournament_id))  # §11.5
        return True


def _start_match(t: Tournament, slot: BracketSlot) -> None:
    from game.services import create_match, player_info
    from matchmaking.service import _notify
    from realtime.live import join_deadline_ms

    a, b = slot.player_a, slot.player_b
    assert a is not None and b is not None
    match = create_match(a, b, t.variant, t.length, entry=0, tournament_id=t.id)
    slot.match = match
    slot.save(update_fields=["match"])
    for side, player, opponent in ((0, a, b), (1, b, a)):
        payload = {
            "match_id": str(match.id),
            "you": side,
            "opponent": {**player_info(opponent), "connected": False},
            "seed_commit": match.seed_commit,
            "variant": t.variant,
            "length": t.length,
            "entry": 0,
            "join_deadline": join_deadline_ms(match.rules),
            "tournament": {"id": t.id, "name": t.name_i18n, "round": slot.round, "rounds": rounds(t)},
        }
        transaction.on_commit(functools.partial(_notify, player.id, "match.found", payload))


def rounds(t: Tournament) -> int:
    return t.capacity.bit_length() - 1


def on_match_end(match: Match, winner_side: int) -> None:
    """In the match's settlement transaction: advance the winner, or finish the tournament."""
    slot = BracketSlot.objects.select_for_update().filter(match=match).first()
    if slot is None or slot.winner_id is not None:
        return
    t = Tournament.objects.select_for_update().get(pk=slot.tournament_id)
    if t.status != Tournament.Status.RUNNING:
        return
    winner = slot.player_a if winner_side == 0 else slot.player_b
    loser = slot.player_b if winner_side == 0 else slot.player_a
    assert winner is not None and loser is not None
    slot.winner = winner
    slot.save(update_fields=["winner"])
    TournamentEntry.objects.filter(tournament=t, user=loser).update(eliminated_round=slot.round)
    if slot.round == rounds(t):
        _finish(t, winner, loser)
        return
    nxt, _ = BracketSlot.objects.get_or_create(
        tournament=t, round=slot.round + 1, position=slot.position // 2
    )
    if slot.position % 2 == 0:
        nxt.player_a = winner
    else:
        nxt.player_b = winner
    nxt.save(update_fields=["player_a", "player_b"])
    if nxt.player_a_id and nxt.player_b_id and nxt.match_id is None:
        if t.round < nxt.round:
            t.round = nxt.round
            t.save(update_fields=["round"])
        _start_match(t, nxt)


def _finish(t: Tournament, champion: User, runner_up: User) -> None:
    """Places: 1 champion, 2 runner-up, then losers of each earlier round share the next places
    (3-4 for the semi-finals, 5-8 for the quarter-finals, …), in seed order."""
    entries = {e.user_id: e for e in t.entries.all()}
    placed: list[int] = [champion.id, runner_up.id]
    for rnd in range(rounds(t) - 1, 0, -1):
        losers = sorted((e for e in entries.values() if e.eliminated_round == rnd), key=lambda e: e.seed or 0)
        placed += [e.user_id for e in losers]
    total = t.entry * len(entries)
    rake = total * t.rake_pct // 100
    pool = total - rake
    bps = basis_points(t.prize_split)
    ledger_entries: list[tuple[str, int]] = []
    paid = 0
    for index, user_id in enumerate(placed):
        e = entries[user_id]
        e.place = index + 1
        e.prize = pool * bps[index] // 10_000 if index < len(bps) else 0
        e.save(update_fields=["place", "prize"])
        if e.prize:
            ledger_entries.append((ledger.user_account(user_id), e.prize))
            paid += e.prize
        if index < len(t.prize_items) and t.prize_items[index]:
            _grant_item(user_id, t.prize_items[index])
    if total:
        leftover = total - paid  # rake plus dust
        if leftover:
            ledger_entries.append((ledger.PLATFORM_RAKE, leftover))
        ledger.post(
            TxType.TOURNAMENT_PRIZE,
            [(_escrow(t), -total), *ledger_entries],
            idempotency_key=f"tournament_prize:{t.id}",
            ref_type="tournament",
            ref_id=t.id,
        )
    t.status = Tournament.Status.FINISHED
    t.finished_at = timezone.now()
    t.save(update_fields=["status", "finished_at"])


def _grant_item(user_id: int, item_id: int) -> None:
    from shop.models import UserItem

    UserItem.objects.get_or_create(
        user_id=user_id, item_id=item_id, defaults={"source": UserItem.Source.PRIZE}
    )


def tournament_payload(t: Tournament, user: User | None = None) -> dict[str, Any]:
    count = t.entries.count()
    entry = t.entries.filter(user=user).first() if user else None
    total = t.entry * t.capacity
    pool = total - total * t.rake_pct // 100
    return {
        "id": t.id,
        "name": t.name_i18n,
        "variant": t.variant,
        "length": t.length,
        "entry": t.entry,
        "capacity": t.capacity,
        "entries": count,
        "starts_at": t.starts_at.isoformat(),
        "status": t.status,
        "round": t.round,
        "rounds": rounds(t),
        "prize_split": t.prize_split,
        # Prizes when full (the tournament only starts full).
        "prizes": [pool * bp // 10_000 for bp in basis_points(t.prize_split)],
        "joined": entry is not None,
        "cancel_reason": t.cancel_reason or None,
        "rake_pct": t.rake_pct,
        "prize_items": t.prize_items,
        # The viewer's own result once decided (null until then).
        "my_place": entry.place if entry else None,
        "my_prize": entry.prize if entry and entry.place else None,
    }


def bracket(t: Tournament) -> list[dict[str, Any]]:
    slots = BracketSlot.objects.filter(tournament=t).select_related("player_a", "player_b", "winner", "match")
    return [
        {
            "round": s.round,
            "position": s.position,
            "players": [
                s.player_a.username if s.player_a else None,
                s.player_b.username if s.player_b else None,
            ],
            "winner": s.winner.username if s.winner else None,
            "match_id": str(s.match_id) if s.match_id else None,
            "score": [s.match.score_a, s.match.score_b] if s.match else None,
            "live": bool(s.match and s.match.status == Match.Status.ACTIVE),
        }
        for s in slots.order_by("round", "position")
    ]
