"""Predictions API (CLAUDE.md §10.2 Predictions)."""

from typing import Any

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from predictions import services
from predictions.models import Prediction, PredictionPool
from wallet.views import idempotency_key

PAGE = 30


def _user(request: Request) -> User:
    assert isinstance(request.user, User)
    return request.user


class OpenPoolsView(APIView):
    """Pools open for predictions, with whether the caller may predict on each."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = _user(request)
        pools = PredictionPool.objects.filter(status=PredictionPool.Status.OPEN).select_related(
            "match__player_a", "match__player_b"
        )[:100]
        return Response(
            {
                "results": [
                    {
                        "match_id": str(p.match_id),
                        "players": [
                            p.match.player_a.username,
                            p.match.player_b.username if p.match.player_b else None,
                        ],
                        "entry": p.match.entry,
                        **services.pool_payload(p),
                        "max_stake_per_user": p.max_stake_per_user,
                        "blocked": services.blocked(user, p.match),
                    }
                    for p in pools
                ],
                "next": None,
            }
        )


class PlaceSerializer(serializers.Serializer[Any]):
    match_id = serializers.UUIDField()
    side = serializers.ChoiceField(choices=[0, 1])
    amount = serializers.IntegerField(min_value=1)


def prediction_payload(p: Prediction) -> dict[str, Any]:
    return {
        "id": p.id,
        "match_id": str(p.pool.match_id),
        "side": p.side,
        "amount": p.amount,
        "payout": p.payout,
        "pool_status": p.pool.status,
        "created_at": p.created_at.isoformat(),
    }


class PredictionsView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        key = idempotency_key(request)
        s = PlaceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        p = services.place(_user(request), str(d["match_id"]), d["side"], d["amount"], key)
        return Response(prediction_payload(p), status=status.HTTP_201_CREATED)


class MyPredictionsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        qs = Prediction.objects.filter(user=_user(request)).select_related("pool").order_by("-id")
        cursor = request.query_params.get("cursor") or ""
        if cursor.isdigit():
            qs = qs.filter(id__lt=int(cursor))
        rows = list(qs[: PAGE + 1])
        page, more = rows[:PAGE], len(rows) > PAGE
        return Response(
            {"results": [prediction_payload(p) for p in page], "next": str(page[-1].id) if more else None}
        )
