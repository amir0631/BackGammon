from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from ranking.services import leaderboard


class LeaderboardView(APIView):
    """GET leaderboard?scope=all|weekly|monthly (§8). The prediction board arrives with predictions."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        scope = request.query_params.get("scope") or "all"
        if scope == "predict":
            from predictions.services import accuracy_board, accuracy_me

            mine = accuracy_me(request.user.id) if isinstance(request.user, User) else None
            return Response({"scope": "predict", "results": accuracy_board(), "me": mine, "period": None})
        if scope not in {"all", "weekly", "monthly"}:
            raise ValidationError({"scope": ["all, weekly, monthly, or predict"]})
        me = request.user if isinstance(request.user, User) else None
        return Response(leaderboard(scope, me=me))
