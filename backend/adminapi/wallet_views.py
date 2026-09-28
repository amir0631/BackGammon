"""Admin users, wallet top-up (§7.9), and the withdrawals queue (§7.12, §13)."""

from typing import Any

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from adminapi import audit
from adminapi.models import AdminUser
from adminapi.views import AdminView
from wallet import services
from wallet.ledger import user_account
from wallet.models import LedgerEntry, Wallet, WithdrawalRequest
from wallet.views import idempotency_key, withdrawal_payload

MONEY_ROLES = (AdminUser.Role.SUPERADMIN, AdminUser.Role.FINANCE)


def _admin(request: Request) -> AdminUser:
    assert isinstance(request.user, AdminUser)
    return request.user


def user_row(u: User, wallet: Wallet | None) -> dict[str, Any]:
    # Admins may see phone numbers; players never see each other's (CLAUDE.md §2 rule 11).
    return {
        "id": u.id,
        "username": u.username,
        "phone": u.phone,
        "status": u.status,
        "created_at": u.created_at.isoformat(),
        "balance": wallet.balance if wallet else 0,
    }


class UsersView(AdminView):
    def get(self, request: Request) -> Response:
        q = (request.query_params.get("q") or "").strip()
        qs = User.objects.order_by("-id")
        if q:
            digits = "".join(ch for ch in q if ch.isdigit())
            cond = Q(username__icontains=q)
            if len(digits) >= 4:
                cond |= Q(phone__contains=digits[-10:])
            qs = qs.filter(cond)
        users = list(qs[:50])
        wallets = {w.user_id: w for w in Wallet.objects.filter(user_id__in=[u.id for u in users])}
        return Response({"results": [user_row(u, wallets.get(u.id)) for u in users], "next": None})


class UserDetailView(AdminView):
    def get(self, request: Request, user_id: int) -> Response:
        user = User.objects.filter(id=user_id).first()
        if user is None:
            raise NotFound()
        summary = services.summary(user)
        entries = LedgerEntry.objects.filter(account=user_account(user.id)).order_by("-id")[:50]
        return Response(
            {
                **user_row(user, Wallet.objects.filter(user_id=user.id).first()),
                "elo": user.elo,
                "level": user.level,
                "lang": user.lang,
                "wallet": summary,
                "ledger": [
                    {"id": e.id, "type": e.type, "amount": e.amount, "created_at": e.created_at.isoformat()}
                    for e in entries
                ],
            }
        )


class TopupSerializer(serializers.Serializer[Any]):
    amount = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(min_length=3, max_length=500)


class TopupView(AdminView):
    admin_roles = MONEY_ROLES

    def post(self, request: Request, user_id: int) -> Response:
        key = idempotency_key(request)
        user = User.objects.filter(id=user_id).first()
        if user is None:
            raise NotFound()
        s = TopupSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            before, after, created = services.admin_topup(
                user, s.validated_data["amount"], key, _admin(request).id
            )
            if created:
                audit.record(
                    request,
                    "wallet.topup",
                    "user",
                    str(user.id),
                    {"balance": before},
                    {"balance": after, "amount": s.validated_data["amount"]},
                    s.validated_data["reason"],
                )
        return Response({"balance_before": before, "balance_after": after, "created": created})


class WithdrawalsAdminView(AdminView):
    admin_roles = MONEY_ROLES

    def get(self, request: Request) -> Response:
        qs = WithdrawalRequest.objects.select_related("user").order_by("created_at")
        if status_filter := request.query_params.get("status"):
            qs = qs.filter(status=status_filter)
        rows = list(qs[:200])
        return Response(
            {
                "results": [
                    {
                        **withdrawal_payload(w),
                        # The full Sheba is needed to make the bank transfer.
                        "iban": w.iban,
                        "user": {"id": w.user_id, "username": w.user.username, "phone": w.user.phone},
                    }
                    for w in rows
                ],
                "next": None,
            }
        )


class ApproveSerializer(serializers.Serializer[Any]):
    bank_reference = serializers.CharField(min_length=3, max_length=64)


class RejectSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(min_length=3, max_length=500)


class WithdrawalApproveView(AdminView):
    admin_roles = MONEY_ROLES

    def post(self, request: Request, withdrawal_id: int) -> Response:
        s = ApproveSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            req = services.approve_withdrawal(
                _admin(request), withdrawal_id, s.validated_data["bank_reference"]
            )
            audit.record(
                request,
                "withdrawal.approve",
                "withdrawal",
                str(req.id),
                {"status": "pending"},
                {"status": req.status, "bank_reference": req.bank_reference},
            )
        return Response(withdrawal_payload(req))


class WithdrawalRejectView(AdminView):
    admin_roles = MONEY_ROLES

    def post(self, request: Request, withdrawal_id: int) -> Response:
        s = RejectSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            req = services.reject_withdrawal(_admin(request), withdrawal_id, s.validated_data["reason"])
            audit.record(
                request,
                "withdrawal.reject",
                "withdrawal",
                str(req.id),
                {"status": "pending"},
                {"status": req.status},
                s.validated_data["reason"],
            )
        return Response(withdrawal_payload(req))
