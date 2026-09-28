from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from referrals import services
from referrals.models import ReferralEarning

PAGE = 30


class ReferralView(APIView):
    """GET me/referral: the player's invite code and link, and totals (§10.2 Referral)."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        assert isinstance(request.user, User)
        return Response(services.summary(request.user))


class EarningsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        assert isinstance(request.user, User)
        qs = ReferralEarning.objects.filter(referrer=request.user).select_related("referee").order_by("-id")
        cursor = request.query_params.get("cursor") or ""
        if cursor.isdigit():
            qs = qs.filter(id__lt=int(cursor))
        rows = list(qs[: PAGE + 1])
        page, more = rows[:PAGE], len(rows) > PAGE
        return Response(
            {
                "results": [
                    {
                        "id": e.id,
                        "referee": e.referee.username,
                        "amount": e.amount,
                        "status": e.status,  # paid, held (anti-fraud review), or cancelled
                        "match_id": str(e.match_id),
                        "created_at": e.created_at.isoformat(),
                    }
                    for e in page
                ],
                "next": str(page[-1].id) if more else None,
            }
        )
