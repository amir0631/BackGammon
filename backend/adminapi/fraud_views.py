"""Anti-fraud review (CLAUDE.md §12.2, §13 Anti-fraud: flag queue with evidence, replay, account link
graph, decision with reason)."""

from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from accounts import sessions
from accounts.models import User
from adminapi import audit
from adminapi.models import AdminUser
from adminapi.views import AdminView
from antifraud.links import graph
from antifraud.models import FraudFlag
from config.errors import AppError

DECIDERS = (AdminUser.Role.SUPERADMIN, AdminUser.Role.SUPPORT)
PAGE = 50


class FlagDecided(AppError):
    status_code = 409
    code = "FLAG_ALREADY_DECIDED"
    message_key = "errors.admin.flagDecided"


def _who(user: User | None) -> dict[str, Any] | None:
    return None if user is None else {"id": user.id, "username": user.username, "status": user.status}


def flag_payload(f: FraudFlag) -> dict[str, Any]:
    return {
        "id": f.id,
        "rule": f.rule,
        "user": _who(f.user),
        "other": _who(f.other),
        "match_id": str(f.match_id) if f.match_id else None,
        "evidence": f.evidence,
        "status": f.status,
        "created_at": f.created_at.isoformat(),
        "decided_by": f.decided_by.username if f.decided_by else None,
        "decision_reason": f.decision_reason or None,
        "decided_at": f.decided_at.isoformat() if f.decided_at else None,
    }


class FlagsView(AdminView):
    """?status=open|dismissed|confirmed&rule=&user_id=&cursor= (newest first)."""

    def get(self, request: Request) -> Response:
        qs = FraudFlag.objects.select_related("user", "other", "decided_by").order_by("-id")
        p = request.query_params
        if status_filter := p.get("status"):
            qs = qs.filter(status=status_filter)
        if rule := p.get("rule"):
            qs = qs.filter(rule=rule)
        if (user_id := p.get("user_id") or "").isdigit():
            qs = qs.filter(user_id=int(user_id)) | qs.filter(other_id=int(user_id))
        if (cursor := p.get("cursor") or "").isdigit():
            qs = qs.filter(id__lt=int(cursor))
        rows = list(qs[: PAGE + 1])
        page, more = rows[:PAGE], len(rows) > PAGE
        return Response(
            {"results": [flag_payload(f) for f in page], "next": str(page[-1].id) if more else None}
        )


class DecideSerializer(serializers.Serializer[Any]):
    decision = serializers.ChoiceField(choices=["dismiss", "confirm"])
    reason = serializers.CharField(min_length=3, max_length=1000)
    action = serializers.ChoiceField(choices=["none", "suspend", "ban"], default="none")


class FlagDecideView(AdminView):
    """Dismiss (no fraud: held money is released as normal) or confirm (fraud: held pool stakes are
    refunded, a held commission is cancelled), optionally suspending or banning the flagged player."""

    admin_roles = DECIDERS

    def post(self, request: Request, flag_id: int) -> Response:
        s = DecideSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        admin = request.user
        assert isinstance(admin, AdminUser)
        with transaction.atomic():
            f = FraudFlag.objects.select_for_update().select_related("user").filter(pk=flag_id).first()
            if f is None:
                raise NotFound()
            if f.status != FraudFlag.Status.OPEN:
                raise FlagDecided(details={"status": f.status})
            before = flag_payload(f)
            dismiss = d["decision"] == "dismiss"
            self._release(f, dismiss)
            f.status = FraudFlag.Status.DISMISSED if dismiss else FraudFlag.Status.CONFIRMED
            f.decided_by = admin
            f.decision_reason = d["reason"]
            f.decided_at = timezone.now()
            f.save(update_fields=["status", "decided_by", "decision_reason", "decided_at"])
            if d["action"] != "none":
                target = User.objects.select_for_update().get(pk=f.user_id)
                target.status = User.Status.SUSPENDED if d["action"] == "suspend" else User.Status.BANNED
                target.save(update_fields=["status"])
                if target.status == User.Status.BANNED:
                    sessions.revoke_all(target)
            audit.record(
                request, "fraud.decide", "fraud_flag", str(f.id), before, flag_payload(f), d["reason"]
            )
        return Response(flag_payload(f))

    @staticmethod
    def _release(f: FraudFlag, dismiss: bool) -> None:
        if f.rule == FraudFlag.Rule.PREDICTION_COLLUSION and f.match_id:
            from predictions.models import PredictionPool
            from predictions.services import release_hold

            pool = PredictionPool.objects.filter(
                match_id=f.match_id, status=PredictionPool.Status.HELD
            ).first()
            if pool is not None:
                release_hold(pool.pk, approve=dismiss)
        elif f.rule == FraudFlag.Rule.MULTI_ACCOUNT and f.evidence.get("hold") == "signup_bonus" and dismiss:
            from wallet.services import grant_signup_bonus

            grant_signup_bonus(f.user)  # keyed by phone: paid at most once, ever (§7.10)
        elif f.rule == FraudFlag.Rule.REFERRAL_FARM and (earning := f.evidence.get("earning")):
            from referrals.services import release_held

            release_held(int(earning), pay=dismiss)


class UserLinksView(AdminView):
    def get(self, request: Request, user_id: int) -> Response:
        if not User.objects.filter(pk=user_id).exists():
            raise NotFound()
        return Response(graph(user_id))
