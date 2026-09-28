"""Admin tournaments (CLAUDE.md §13 Tournaments: create, schedule, prize split, cancel with refund)."""

from typing import Any

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from adminapi import audit
from adminapi.models import AdminUser
from adminapi.views import AdminView
from tournaments import services
from tournaments.models import Tournament

ROLES = (AdminUser.Role.SUPERADMIN,)


class CreateSerializer(serializers.Serializer[Any]):
    name = serializers.DictField(child=serializers.CharField(max_length=80))
    variant = serializers.CharField()
    length = serializers.IntegerField()
    entry = serializers.IntegerField(min_value=0)
    capacity = serializers.IntegerField()
    starts_at = serializers.DateTimeField()
    prize_split = serializers.ListField(child=serializers.FloatField(), required=False)
    prize_items = serializers.ListField(child=serializers.IntegerField(allow_null=True), required=False)


class AdminTournamentsView(AdminView):
    def get(self, request: Request) -> Response:
        qs = Tournament.objects.order_by("-starts_at")[:200]
        return Response({"results": [services.tournament_payload(t) for t in qs], "next": None})

    def post(self, request: Request) -> Response:
        if not isinstance(request.user, AdminUser) or request.user.role not in ROLES:
            from adminapi.auth import AdminForbidden

            raise AdminForbidden(details={"reason": "role"})
        s = CreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        with transaction.atomic():
            t = services.create(
                name=d["name"],
                variant=d["variant"],
                length=d["length"],
                entry=d["entry"],
                capacity=d["capacity"],
                starts_at=d["starts_at"],
                prize_split=d.get("prize_split"),
                prize_items=d.get("prize_items"),
                admin_id=request.user.id,
            )
            audit.record(
                request, "tournament.create", "tournament", str(t.id), None, services.tournament_payload(t)
            )
        return Response(services.tournament_payload(t), status=status.HTTP_201_CREATED)


class CancelSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(min_length=3, max_length=500)


class AdminTournamentCancelView(AdminView):
    admin_roles = ROLES

    def post(self, request: Request, tournament_id: int) -> Response:
        s = CancelSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if not Tournament.objects.filter(pk=tournament_id).exists():
            raise NotFound()
        with transaction.atomic():
            before = Tournament.objects.get(pk=tournament_id).status
            t = services.cancel(tournament_id, s.validated_data["reason"])
            audit.record(
                request,
                "tournament.cancel",
                "tournament",
                str(t.id),
                {"status": before},
                {"status": t.status},
                s.validated_data["reason"],
            )
        return Response(services.tournament_payload(t))


class AdminBracketView(AdminView):
    """The live bracket for the admin panel (§13 Tournaments), whoever is signed in."""

    def get(self, request: Request, tournament_id: int) -> Response:
        t = Tournament.objects.filter(pk=tournament_id).first()
        if t is None:
            raise NotFound()
        return Response({"tournament": services.tournament_payload(t), "slots": services.bracket(t)})
