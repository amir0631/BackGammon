"""Tournaments API (CLAUDE.md §10.2 Tournaments)."""

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from tournaments import services
from tournaments.models import Tournament
from wallet.views import idempotency_key


def _user(request: Request) -> User:
    assert isinstance(request.user, User)
    return request.user


def _tournament(tournament_id: int) -> Tournament:
    t = Tournament.objects.filter(pk=tournament_id).first()
    if t is None:
        raise NotFound()
    return t


class TournamentsView(APIView):
    """?status=scheduled|running|finished|cancelled (default: scheduled and running)."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status")
        qs = Tournament.objects.order_by("starts_at")
        if wanted:
            qs = qs.filter(status=wanted)
        else:
            qs = qs.filter(status__in=[Tournament.Status.SCHEDULED, Tournament.Status.RUNNING])
        user = _user(request)
        return Response({"results": [services.tournament_payload(t, user) for t in qs[:100]], "next": None})


class TournamentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, tournament_id: int) -> Response:
        return Response(services.tournament_payload(_tournament(tournament_id), _user(request)))


class JoinView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, tournament_id: int) -> Response:
        idempotency_key(request)  # the entry is keyed per player and tournament
        services.join(_user(request), tournament_id)
        return Response(
            services.tournament_payload(_tournament(tournament_id), _user(request)),
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request: Request, tournament_id: int) -> Response:
        services.leave(_user(request), tournament_id)
        return Response(services.tournament_payload(_tournament(tournament_id), _user(request)))


class BracketView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, tournament_id: int) -> Response:
        t = _tournament(tournament_id)
        return Response(
            {"tournament": services.tournament_payload(t, _user(request)), "slots": services.bracket(t)}
        )
