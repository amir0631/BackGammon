"""Admin users, wallet top-up and adjustment (§7.9, §13), and the withdrawals queue (§7.12, §13).
Specs: docs/ux/screens/admin-users-wallet.md."""

import csv
import secrets
from collections.abc import Iterable
from datetime import datetime, time
from typing import Any

from django.db import transaction
from django.db.models import Q, QuerySet
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from accounts import sessions
from accounts.models import Session, User
from accounts.phone import _DIGITS
from adminapi import audit
from adminapi.models import AdminAudit, AdminUser
from adminapi.views import AdminView
from game.models import Match
from wallet import services
from wallet.iban import BANKS, mask_iban
from wallet.ledger import user_account
from wallet.models import BankAccount, LedgerEntry, Wallet, WithdrawalRequest
from wallet.views import idempotency_key, withdrawal_payload

MONEY_ROLES = (AdminUser.Role.SUPERADMIN, AdminUser.Role.FINANCE)
ACCOUNT_ROLES = (AdminUser.Role.SUPERADMIN, AdminUser.Role.SUPPORT)
PAGE = 50


def _admin(request: Request) -> AdminUser:
    assert isinstance(request.user, AdminUser)
    return request.user


def _user_or_404(user_id: int) -> User:
    user = User.objects.filter(id=user_id).first()
    if user is None:
        raise NotFound()
    return user


def user_row(u: User, wallet: Wallet | None) -> dict[str, Any]:
    # Admins may see phone numbers; players never see each other's (CLAUDE.md §2 rule 11).
    return {
        "id": u.id,
        "username": u.username,
        "phone": u.phone,
        "status": u.status,
        "phone_verified": u.phone_verified_at is not None,
        "created_at": u.created_at.isoformat(),
        "balance": wallet.balance if wallet else 0,
    }


def _cursor(request: Request) -> int | None:
    value = request.query_params.get("cursor") or ""
    return int(value) if value.isdigit() else None


class UsersView(AdminView):
    """Search by username, phone (any common form, Persian digits too), or `#id`. Newest first."""

    def get(self, request: Request) -> Response:
        q = (request.query_params.get("q") or "").strip().translate(_DIGITS)
        qs = User.objects.order_by("-id")
        if q:
            digits = "".join(ch for ch in q if ch.isdigit())
            cond = Q(username__icontains=q)
            if q.startswith("#") and digits:
                cond = Q(id=int(digits))
            elif len(digits) >= 4:
                # Stored as +989…; a typed 0912… or 912… matches the part after the country code.
                national = digits[2:] if digits.startswith("98") else digits.lstrip("0")
                cond |= Q(phone__contains=national)
            qs = qs.filter(cond)
        if (cursor := _cursor(request)) is not None:
            qs = qs.filter(id__lt=cursor)
        users = list(qs[: PAGE + 1])
        page, more = users[:PAGE], len(users) > PAGE
        wallets = {w.user_id: w for w in Wallet.objects.filter(user_id__in=[u.id for u in page])}
        return Response(
            {
                "results": [user_row(u, wallets.get(u.id)) for u in page],
                "next": str(page[-1].id) if more else None,
            }
        )


def _ledger_rows(qs: Iterable[LedgerEntry]) -> list[dict[str, Any]]:
    return [
        {
            "id": e.id,
            "tx_id": str(e.tx_id),
            "type": e.type,
            "amount": e.amount,
            "ref_type": e.ref_type or None,
            "ref_id": e.ref_id or None,
            "created_at": e.created_at.isoformat(),
        }
        for e in qs
    ]


def _match_rows(user: User) -> list[dict[str, Any]]:
    rows = (
        Match.objects.filter(Q(player_a=user) | Q(player_b=user))
        .select_related("player_a", "player_b")
        .order_by("-created_at")[:20]
    )
    out = []
    for m in rows:
        side = m.side_of(user.id)
        other = m.player_b if side == 0 else m.player_a
        out.append(
            {
                "id": str(m.id),
                "opponent": (other.username if other else None)
                or (f"bot_{m.bot_level}" if m.is_bot else None),
                "variant": m.variant,
                "length": m.length,
                "entry": m.entry,
                "status": m.status,
                "won": None if m.winner_side is None else m.winner_side == side,
                "score": [m.score_a, m.score_b] if side == 0 else [m.score_b, m.score_a],
                "end_reason": m.end_reason or None,
                "created_at": m.created_at.isoformat(),
            }
        )
    return out


class UserDetailView(AdminView):
    def get(self, request: Request, user_id: int) -> Response:
        user = _user_or_404(user_id)
        admin = _admin(request)
        bank = BankAccount.objects.filter(user=user).first()
        live_sessions = Session.objects.filter(
            user=user, revoked_at__isnull=True, expires_at__gt=timezone.now()
        )
        last_session = live_sessions.order_by("-last_used_at").first()
        withdrawals = (
            WithdrawalRequest.objects.filter(user=user).select_related("decided_by").order_by("-id")[:20]
        )
        return Response(
            {
                **user_row(user, Wallet.objects.filter(user_id=user.id).first()),
                "elo": user.elo,
                "level": user.level,
                "xp": user.xp,
                "lang": user.lang,
                "referrer": user.referrer.username if user.referrer_id and user.referrer else None,
                "wallet": services.summary(user),
                "ledger": _ledger_rows(
                    LedgerEntry.objects.filter(account=user_account(user.id)).order_by("-id")[:PAGE]
                ),
                "ledger_next": None,
                "bank_account": None
                if bank is None
                else {
                    "iban": bank.iban if admin.role in MONEY_ROLES else mask_iban(bank.iban),
                    "bank_code": bank.bank_code,
                    "bank": dict(zip(("fa", "en"), BANKS.get(bank.bank_code, ("", "")), strict=True)),
                },
                "withdrawals": [_admin_withdrawal(w, admin) for w in withdrawals],
                "sessions": {
                    "active": live_sessions.count(),
                    "last_used_at": last_session.last_used_at.isoformat() if last_session else None,
                },
                "matches": _match_rows(user),
            }
        )


class UserLedgerView(AdminView):
    def get(self, request: Request, user_id: int) -> Response:
        user = _user_or_404(user_id)
        qs = LedgerEntry.objects.filter(account=user_account(user.id)).order_by("-id")
        if (cursor := _cursor(request)) is not None:
            qs = qs.filter(id__lt=cursor)
        if date_from := request.query_params.get("from"):
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to := request.query_params.get("to"):
            qs = qs.filter(created_at__date__lte=date_to)
        rows = list(qs[: PAGE + 1])
        page, more = rows[:PAGE], len(rows) > PAGE
        return Response({"results": _ledger_rows(page), "next": str(page[-1].id) if more else None})


class StatusSerializer(serializers.Serializer[Any]):
    status = serializers.ChoiceField(choices=User.Status.choices)
    reason = serializers.CharField(min_length=3, max_length=500)


class UserStatusView(AdminView):
    """Suspend, ban, or reactivate (§12.1). A ban signs the player out everywhere."""

    admin_roles = ACCOUNT_ROLES

    def post(self, request: Request, user_id: int) -> Response:
        s = StatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            user = User.objects.select_for_update().filter(id=user_id).first()
            if user is None:
                raise NotFound()
            before = user.status
            user.status = s.validated_data["status"]
            user.save(update_fields=["status"])
            revoked = sessions.revoke_all(user) if user.status == User.Status.BANNED else 0
            audit.record(
                request,
                "user.status",
                "user",
                str(user.id),
                {"status": before},
                {"status": user.status, "sessions_revoked": revoked},
                s.validated_data["reason"],
            )
        return Response(user_row(user, Wallet.objects.filter(user_id=user.id).first()))


class ReasonSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(min_length=3, max_length=500)


class UserPasswordResetView(AdminView):
    """Issues a one-time password (shown once) and signs the player out everywhere. The only way to
    restore access while password reset by SMS is off."""

    admin_roles = ACCOUNT_ROLES

    def post(self, request: Request, user_id: int) -> Response:
        s = ReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        password = secrets.token_urlsafe(9)
        with transaction.atomic():
            user = User.objects.select_for_update().filter(id=user_id).first()
            if user is None:
                raise NotFound()
            user.set_password(password)
            user.save(update_fields=["password"])
            revoked = sessions.revoke_all(user)
            audit.record(
                request,
                "user.password_reset",
                "user",
                str(user.id),
                None,
                {"sessions_revoked": revoked},
                s.validated_data["reason"],
            )
        return Response({"password": password, "sessions_revoked": revoked})


class TopupSerializer(serializers.Serializer[Any]):
    amount = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(min_length=3, max_length=500)


def _replayed(action: str, user: User, key: str) -> dict[str, Any] | None:
    record = (
        AdminAudit.objects.filter(action=action, target_type="user", target_id=str(user.id), after__key=key)
        .order_by("-id")
        .first()
    )
    if record is None or not isinstance(record.before, dict) or not isinstance(record.after, dict):
        return None
    return {
        "balance_before": record.before.get("balance"),
        "balance_after": record.after.get("balance"),
        "created": False,
    }


class TopupView(AdminView):
    admin_roles = MONEY_ROLES

    def post(self, request: Request, user_id: int) -> Response:
        key = idempotency_key(request)
        user = _user_or_404(user_id)
        s = TopupSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            before, after, created = services.admin_topup(
                user, s.validated_data["amount"], key, _admin(request).id
            )
            if not created:
                # A retry: report the original balances, not today's.
                return Response(
                    _replayed("wallet.topup", user, key)
                    or {"balance_before": before, "balance_after": after, "created": False}
                )
            audit.record(
                request,
                "wallet.topup",
                "user",
                str(user.id),
                {"balance": before},
                {"balance": after, "amount": s.validated_data["amount"], "key": key},
                s.validated_data["reason"],
            )
        return Response({"balance_before": before, "balance_after": after, "created": True})


class AdjustSerializer(serializers.Serializer[Any]):
    amount = serializers.IntegerField()
    reason = serializers.CharField(min_length=3, max_length=500)

    def validate_amount(self, value: int) -> int:
        if value == 0:
            raise serializers.ValidationError("non-zero")
        return value


class AdjustView(AdminView):
    """Manual balance adjustment with a reason (§13), e.g. to reverse a mistaken top-up."""

    admin_roles = MONEY_ROLES

    def post(self, request: Request, user_id: int) -> Response:
        key = idempotency_key(request)
        user = _user_or_404(user_id)
        s = AdjustSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            before, after, created = services.admin_adjust(
                user, s.validated_data["amount"], key, _admin(request).id
            )
            if not created:
                return Response(
                    _replayed("wallet.adjust", user, key)
                    or {"balance_before": before, "balance_after": after, "created": False}
                )
            audit.record(
                request,
                "wallet.adjust",
                "user",
                str(user.id),
                {"balance": before},
                {"balance": after, "amount": s.validated_data["amount"], "key": key},
                s.validated_data["reason"],
            )
        return Response({"balance_before": before, "balance_after": after, "created": True})


# ---- Withdrawals ----


def _admin_withdrawal(w: WithdrawalRequest, admin: AdminUser) -> dict[str, Any]:
    return {
        **withdrawal_payload(w),
        # The full Sheba is needed to make the bank transfer; support sees it masked.
        "iban": w.iban if admin.role in MONEY_ROLES else mask_iban(w.iban),
        "payout_rial": w.payout_rial,
        "user": {
            "id": w.user_id,
            "username": w.user.username,
            "phone": w.user.phone,
            "status": w.user.status,
        },
        "decided_by": w.decided_by.username if w.decided_by_id and w.decided_by else None,
        "claimed_by": w.claimed_by.username if w.claimed_by_id and w.claimed_by else None,
        "claimed_at": w.claimed_at.isoformat() if w.claimed_at else None,
    }


def _withdrawals(request: Request) -> QuerySet[WithdrawalRequest]:
    qs = WithdrawalRequest.objects.select_related("user", "decided_by", "claimed_by")
    p = request.query_params
    if status_filter := p.get("status"):
        qs = qs.filter(status=status_filter)
    if (user_id := p.get("user_id") or "").isdigit():
        qs = qs.filter(user_id=int(user_id))
    tz = timezone.get_current_timezone()
    if date_from := p.get("from"):
        qs = qs.filter(
            created_at__gte=timezone.make_aware(
                datetime.combine(datetime.fromisoformat(date_from), time.min), tz
            )
        )
    if date_to := p.get("to"):
        qs = qs.filter(
            created_at__lte=timezone.make_aware(
                datetime.combine(datetime.fromisoformat(date_to), time.max), tz
            )
        )
    return qs


class WithdrawalsAdminView(AdminView):
    """Oldest first by default (the queue). ?status=&user_id=&from=&to=&order=desc&cursor=&export=csv"""

    admin_roles = MONEY_ROLES

    def get(self, request: Request) -> Response | HttpResponse:
        admin = _admin(request)
        qs = _withdrawals(request)
        desc = request.query_params.get("order") == "desc"
        qs = qs.order_by("-id" if desc else "id")
        if request.query_params.get("export") == "csv":
            return _csv(qs)
        total = qs.count()
        if (cursor := _cursor(request)) is not None:
            qs = qs.filter(id__lt=cursor) if desc else qs.filter(id__gt=cursor)
        rows = list(qs[: PAGE + 1])
        page, more = rows[:PAGE], len(rows) > PAGE
        return Response(
            {
                "results": [_admin_withdrawal(w, admin) for w in page],
                "next": str(page[-1].id) if more else None,
                "count": total,
            }
        )


def _csv(qs: QuerySet[WithdrawalRequest]) -> HttpResponse:
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="withdrawals.csv"'
    response.write("﻿")  # Excel opens UTF-8 correctly with a BOM
    writer = csv.writer(response)
    writer.writerow(
        [
            "id",
            "created_at",
            "user_id",
            "username",
            "coins",
            "fee",
            "payout_rial",
            "iban",
            "bank_code",
            "status",
            "bank_reference",
            "decided_by",
            "decided_at",
            "reject_reason",
        ]
    )
    for w in qs.iterator():
        writer.writerow(
            [
                w.id,
                w.created_at.isoformat(),
                w.user_id,
                w.user.username,
                w.coins,
                w.fee_coins,
                w.payout_rial,
                w.iban,
                w.bank_code,
                w.status,
                w.bank_reference,
                w.decided_by.username if w.decided_by else "",
                w.decided_at.isoformat() if w.decided_at else "",
                w.reject_reason,
            ]
        )
    return response


class WithdrawalDetailAdminView(AdminView):
    admin_roles = MONEY_ROLES

    def get(self, request: Request, withdrawal_id: int) -> Response:
        w = (
            WithdrawalRequest.objects.select_related("user", "decided_by", "claimed_by")
            .filter(id=withdrawal_id)
            .first()
        )
        if w is None:
            raise NotFound()
        return Response(_admin_withdrawal(w, _admin(request)))


class WithdrawalClaimView(AdminView):
    admin_roles = MONEY_ROLES

    def post(self, request: Request, withdrawal_id: int) -> Response:
        with transaction.atomic():
            req = services.claim_withdrawal(_admin(request), withdrawal_id)
            audit.record(request, "withdrawal.claim", "withdrawal", str(req.id), None, {"claimed": True})
        req.refresh_from_db()
        return Response(_admin_withdrawal(req, _admin(request)))


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
        return Response(_admin_withdrawal(req, _admin(request)))


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
        return Response(_admin_withdrawal(req, _admin(request)))
