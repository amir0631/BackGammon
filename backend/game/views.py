"""Match API (CLAUDE.md §10.2 Matches)."""

from typing import Any

from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from game import errors
from game.models import Match
from game.services import create_match
from settingsapp import registry


def _user(request: Request) -> User:
    assert isinstance(request.user, User)
    return request.user


def active_match(user: User) -> Match | None:
    return (
        Match.objects.filter(Q(player_a=user) | Q(player_b=user), status=Match.Status.ACTIVE)
        .order_by("-created_at")
        .first()
    )


class BotMatchSerializer(serializers.Serializer[Any]):
    level = serializers.ChoiceField(choices=["easy", "medium", "hard"])
    variant = serializers.ChoiceField(choices=Match.Variant.choices)
    length = serializers.IntegerField()


class BotMatchView(APIView):
    """Start a match against a bot (§9): no entry fee, never rated, always labeled as a bot."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        user = _user(request)
        if user.status == User.Status.SUSPENDED:
            raise errors.AccountSuspended()
        s = BotMatchSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["length"] not in registry.get("game.allowed_lengths"):
            raise errors.LengthNotAllowed(details={"allowed": registry.get("game.allowed_lengths")})
        if (running := active_match(user)) is not None:
            raise errors.MatchInProgress(details={"match_id": str(running.id)})
        match = create_match(user, None, d["variant"], d["length"], bot_level=d["level"])
        return Response(
            {"match_id": str(match.id), "seed_commit": match.seed_commit}, status=status.HTTP_201_CREATED
        )


class ActiveMatchView(APIView):
    """The player's running match, if any, so the app can offer to rejoin it."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        match = active_match(_user(request))
        return Response({"match_id": str(match.id) if match else None})


# ---- History, details, replay (§10.2 Matches, §20) ----

HISTORY_PAGE = 20


def _side_names(match: Match) -> list[dict[str, Any]]:
    out = []
    for user, is_bot in ((match.player_a, False), (match.player_b, match.is_bot)):
        if user is not None:
            out.append(
                {
                    "username": user.username,
                    "avatar": user.avatar,
                    "elo": user.elo,
                    "is_bot": False,
                    "bot_level": None,
                }
            )
        else:
            out.append(
                {
                    "username": f"bot_{match.bot_level}",
                    "avatar": "bot",
                    "elo": 0,
                    "is_bot": is_bot,
                    "bot_level": match.bot_level,
                }
            )
    return out


def match_summary(match: Match, you: int | None = None) -> dict[str, Any]:
    ended = match.status != Match.Status.ACTIVE
    return {
        "id": str(match.id),
        "variant": match.variant,
        "length": match.length,
        "entry": match.entry,
        "status": match.status,
        "is_bot": match.is_bot,
        "players": _side_names(match),
        "you": you,
        "winner": match.winner_side,
        "score": [match.score_a, match.score_b],
        "end_reason": match.end_reason or None,
        "seed_commit": match.seed_commit,
        "created_at": match.created_at.isoformat(),
        "ended_at": match.ended_at.isoformat() if match.ended_at and ended else None,
    }


class MyMatchesView(APIView):
    """The player's match history, newest first (cursor = created_at of the last row)."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = _user(request)
        qs = (
            Match.objects.filter(Q(player_a=user) | Q(player_b=user))
            .select_related("player_a", "player_b")
            .order_by("-created_at", "-id")
        )
        if cursor := request.query_params.get("cursor"):
            qs = qs.filter(created_at__lt=cursor)
        rows = list(qs[: HISTORY_PAGE + 1])
        page, more = rows[:HISTORY_PAGE], len(rows) > HISTORY_PAGE
        return Response(
            {
                "results": [match_summary(m, m.side_of(user.id)) for m in page],
                "next": page[-1].created_at.isoformat() if more else None,
            }
        )


def _match_or_404(match_id: str) -> Match:
    from django.core.exceptions import ValidationError as DjangoValidationError
    from rest_framework.exceptions import NotFound

    try:
        match = Match.objects.select_related("player_a", "player_b").filter(pk=match_id).first()
    except DjangoValidationError:
        match = None
    if match is None:
        raise NotFound()
    return match


class MatchDetailView(APIView):
    """A match summary; the seed is only in the replay once the match is over."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, match_id: str) -> Response:
        match = _match_or_404(match_id)
        return Response(match_summary(match, match.side_of(_user(request).id)))


def replay_payload(match: Match) -> dict[str, Any]:
    from game.models import MatchEvent
    from realtime import seeds

    events = [
        {
            "seq": e.seq,
            "type": e.type,
            "actor": e.actor,
            "payload": e.payload,
            "server_ts": e.server_ts.isoformat(),
        }
        for e in MatchEvent.objects.filter(match=match).order_by("seq")
    ]
    finished = match.status != Match.Status.ACTIVE
    return {
        **match_summary(match),
        "seed": seeds.decrypt(match.seed_encrypted).hex() if finished else None,
        "events": events,
    }


class MatchReplayView(APIView):
    """§2 rule 13, §20.2: only the two players (and admins, through the admin API) get a replay; every
    access is logged."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, match_id: str) -> Response:
        from rest_framework.exceptions import PermissionDenied

        from game.models import ReplayView

        user = _user(request)
        match = _match_or_404(match_id)
        if match.side_of(user.id) is None:
            raise PermissionDenied()
        ReplayView.objects.create(match=match, viewer_id=user.id, viewer_role=ReplayView.Role.PLAYER)
        return Response(replay_payload(match))


class LiveMatchesView(APIView):
    """Human-vs-human matches in progress (§20.4). ?tier=&variant=&sort=spectators|pool|elo"""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        from realtime import live

        rows = []
        for match_id in live.r().smembers(live.LIVE_SET):
            try:
                state = live.load(match_id)
            except live.MatchNotFound:
                live.r().srem(live.LIVE_SET, match_id)
                continue
            if state.status != "active":
                continue
            rows.append(
                {
                    "match_id": match_id,
                    "variant": state.variant,
                    "length": state.length,
                    "entry": state.entry,
                    "tier_id": state.entry,
                    "players": [
                        {
                            "username": p["username"],
                            "avatar": p["avatar"],
                            "elo": p["elo"],
                            "level": p["level"],
                        }
                        for p in state.players
                    ],
                    "score": list(state.engine.score),
                    "game_no": state.engine.game_no,
                    "spectators": state.spectators,
                    "pool": 0,
                    "avg_elo": sum(p["elo"] for p in state.players) // 2,
                    "tournament_id": state.tournament_id,
                }
            )
        p = request.query_params
        if (tier := p.get("tier") or "").isdigit():
            rows = [r for r in rows if r["entry"] == int(tier)]
        if variant := p.get("variant"):
            rows = [r for r in rows if r["variant"] == variant]
        if (tournament := p.get("tournament") or "").isdigit():
            rows = [r for r in rows if r["tournament_id"] == int(tournament)]
        # Tournament matches first (§20.4: highlighted), then the chosen sort.
        sort = {"spectators": "spectators", "pool": "pool", "elo": "avg_elo"}.get(
            p.get("sort") or "", "spectators"
        )
        rows.sort(key=lambda r: (r["tournament_id"] is None, -r[sort], r["match_id"]))
        return Response({"results": rows[:100], "next": None})


class TiersView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        from matchmaking.service import tiers

        return Response({"results": tiers(), "next": None})
