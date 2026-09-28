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
