"""Anti-fraud rules (CLAUDE.md §12.2). Each rule raises a flag with evidence for the admin review queue;
some also act at once (hold a pool, hold a commission, refuse a transfer)."""

import logging
from datetime import timedelta
from typing import Any

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from antifraud.links import link_reasons
from antifraud.models import DeviceFingerprint, FraudFlag
from settingsapp import registry

logger = logging.getLogger("antifraud")
Rule = FraudFlag.Rule


def flag(
    rule: str, user: Any, other: Any = None, match: Any = None, evidence: dict[str, Any] | None = None
) -> FraudFlag:
    """One open flag per (rule, pair, match): repeated signals add to it rather than piling up."""
    uid = user if isinstance(user, int) else user.id
    oid = other if other is None or isinstance(other, int) else other.id
    existing = FraudFlag.objects.filter(
        rule=rule, user_id=uid, other_id=oid, match=match, status=FraudFlag.Status.OPEN
    ).first()
    if existing is not None:
        return existing
    logger.warning("fraud flag %s user=%s other=%s", rule, uid, oid)
    return FraudFlag.objects.create(
        rule=rule, user_id=uid, other_id=oid, match=match, evidence=evidence or {}
    )


def has_open_flag(user_id: int, rules: list[str] | None = None) -> bool:
    qs = FraudFlag.objects.filter(Q(user_id=user_id) | Q(other_id=user_id), status=FraudFlag.Status.OPEN)
    if rules:
        qs = qs.filter(rule__in=rules)
    return qs.exists()


# ---- devices ----


def record_device(user: User, fingerprint: str, ip: str | None, user_agent: str) -> None:
    """Called on authenticated requests carrying X-Device-Id (throttled). A device shared with another
    account raises multi_account (§12.2)."""
    fingerprint = fingerprint.strip()[:64]
    if not fingerprint:
        return
    key = f"af:dev:{user.id}:{fingerprint}"
    if cache.get(key):
        return
    cache.set(key, 1, timeout=3600)
    DeviceFingerprint.objects.update_or_create(
        user=user, fingerprint=fingerprint, defaults={"ip": ip, "user_agent": user_agent[:255]}
    )
    others = (
        DeviceFingerprint.objects.filter(fingerprint=fingerprint)
        .exclude(user=user)
        .values_list("user_id", flat=True)
    )
    for other in set(others):
        a, b = sorted((user.id, other))
        flag(Rule.MULTI_ACCOUNT, a, b, evidence={"reason": "device", "fingerprint": fingerprint[:12]})


# ---- after a match ----


def check_match(match: Any) -> None:
    """chip_dumping (§12.2): repeated one-sided results between the same two accounts, with early
    resigns as evidence. Also multi_account when the two players are linked."""
    from game.models import Match

    if match.is_bot or match.player_b_id is None or match.status != Match.Status.FINISHED:
        return
    a, b = sorted((match.player_a_id, match.player_b_id))
    if reasons := link_reasons(a, b):
        flag(Rule.MULTI_ACCOUNT, a, b, evidence={"reason": reasons, "match": str(match.id)})
    since = timezone.now() - timedelta(days=registry.get("antifraud.chip_window_days"))
    pair = Match.objects.filter(
        Q(player_a_id=a, player_b_id=b) | Q(player_a_id=b, player_b_id=a),
        status=Match.Status.FINISHED,
        created_at__gte=since,
    )
    total = pair.count()
    if total < registry.get("antifraud.chip_min_matches"):
        return
    wins_a = pair.filter(winner_id=a).count()
    top = max(wins_a, total - wins_a)
    if top * 100 >= registry.get("antifraud.chip_one_sided_pct") * total:
        from django.db.models import Count

        resigned = pair.filter(end_reason="resign").annotate(n=Count("games__moves"))
        early = registry.get("antifraud.early_resign_moves")
        flag(
            Rule.CHIP_DUMPING,
            a,
            b,
            evidence={
                "matches": total,
                "wins": {str(a): wins_a, str(b): total - wins_a},
                "resigns": resigned.count(),
                "early_resigns": sum(1 for m in resigned if m.n <= early),
            },
        )


def check_pool(match: Any, winner_side: int) -> bool:
    """prediction_collusion (§12.2): a large prediction shortly before an abnormal loss (a resignation or
    a forfeit). Holds the pool and flags; returns True when held."""
    from predictions.models import Prediction, PredictionPool

    pool = PredictionPool.objects.filter(match=match, status=PredictionPool.Status.CLOSED).first()
    if pool is None:
        return False
    abnormal = match.end_reason == "resign" or (match.end_reason or "").startswith("forfeit")
    total = pool.total_a + pool.total_b
    if not abnormal or not total:
        return False
    share = registry.get("antifraud.collusion_stake_pct")
    big = [
        p for p in Prediction.objects.filter(pool=pool, side=winner_side) if p.amount * 100 >= share * total
    ]
    if not big:
        return False
    PredictionPool.objects.filter(pk=pool.pk).update(
        status=PredictionPool.Status.HELD, hold_reason="prediction_collusion"
    )
    for p in big:
        flag(
            Rule.PREDICTION_COLLUSION,
            p.user_id,
            match=match,
            evidence={"stake": p.amount, "pool": total, "end_reason": match.end_reason},
        )
    return True


def check_engine_assist(user_id: int, recent_matches: int = 5) -> FraudFlag | None:
    """engine_assist (§12.2): the share of a player's choices (among several legal plays) that equal the
    strong bot's, over their recent human matches. Needs the bot (service or in-process)."""
    from game.engine.board import Position, initial_position
    from game.engine.moves import legal_plays, validate_play
    from game.models import Match

    matches = list(
        Match.objects.filter(
            Q(player_a_id=user_id) | Q(player_b_id=user_id), is_bot=False, status=Match.Status.FINISHED
        ).order_by("-ended_at")[:recent_matches]
    )
    agree = considered = 0
    for m in matches:
        side = m.side_of(user_id)
        for game in m.games.order_by("number"):
            position = initial_position()
            for mv in game.moves.order_by("seq"):
                if mv.moves_json and mv.player == side and len(mv.dice) == 2:
                    dice = (mv.dice[0], mv.dice[1])
                    if len(legal_plays(position, side, dice)) > 1:
                        best = _bot_choice(position, side, dice)
                        if best is not None:
                            considered += 1
                            played = validate_play(position, side, dice, mv.moves_json).position
                            agree += validate_play(position, side, dice, best).position == played
                if mv.position_after:
                    position = Position.decode(mv.position_after)
    if considered < registry.get("antifraud.engine_min_moves"):
        return None
    pct = agree * 100 // considered
    if pct >= registry.get("antifraud.engine_agreement_pct"):
        return flag(
            Rule.ENGINE_ASSIST,
            user_id,
            evidence={"agreement_pct": pct, "moves": considered, "matches": len(matches)},
        )
    return None


def _bot_choice(position: Any, side: int, dice: tuple[int, int]) -> list[list[int]] | None:
    from django.conf import settings

    from realtime import botturn

    if getattr(settings, "BOT_URL", ""):
        answer = botturn._call(
            "/move",
            {"position": position.encode(), "player": side, "dice": list(dice), "level": "hard", "seed": 0},
        )
        if answer is not None:
            return [list(m) for m in answer["moves"]]
    brain = botturn._local()
    return brain.choose_move(position, side, dice, "hard") if brain is not None else None
