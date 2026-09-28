"""Wallet API (CLAUDE.md §10.2 Wallet)."""

from typing import Any

from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import otp, sms
from accounts.models import Otp, User
from accounts.sessions import client_ip
from settingsapp import registry
from wallet import errors, services
from wallet.iban import BANKS, mask_iban, validate_iban
from wallet.ledger import user_account
from wallet.models import BankAccount, LedgerEntry, WithdrawalRequest

PAGE_SIZE = 30
HIDDEN_REFS = {"admin", "seed"}


def idempotency_key(request: Request) -> str:
    """Every coin-moving write carries an Idempotency-Key header (CLAUDE.md §10.1)."""
    key = (request.headers.get("Idempotency-Key") or "").strip()
    if not key or len(key) > 100:
        raise errors.IdempotencyKeyRequired()
    return key


def _user(request: Request) -> User:
    assert isinstance(request.user, User)
    return request.user


def bank_payload(iban: str, code: str, id_: int | None = None) -> dict[str, Any]:
    fa, en = BANKS.get(code, ("", ""))
    return {"id": id_, "iban": mask_iban(iban), "bank_code": code, "bank": {"fa": fa, "en": en}}


def withdrawal_payload(w: WithdrawalRequest) -> dict[str, Any]:
    return {
        "id": w.id,
        "amount": w.coins,
        "fee": w.fee_coins,
        "payout_toman": w.payout_rial // 10,
        "status": w.status,
        "expected_by": w.expected_by.isoformat(),
        "bank": bank_payload(w.iban, w.bank_code),
        "bank_reference": w.bank_reference or None,
        "reject_reason": w.reject_reason or None,
        "created_at": w.created_at.isoformat(),
        "decided_at": w.decided_at.isoformat() if w.decided_at else None,
    }


class AuthedView(APIView):
    permission_classes = (IsAuthenticated,)


class WalletView(AuthedView):
    def get(self, request: Request) -> Response:
        return Response(services.summary(_user(request)))


class LedgerView(AuthedView):
    """The user's own entries, newest first. Cursor = the last seen entry id."""

    def get(self, request: Request) -> Response:
        user = _user(request)
        account = user_account(user.id)
        qs = LedgerEntry.objects.filter(account=account).order_by("-id")
        cursor = request.query_params.get("cursor")
        if cursor and cursor.isdigit():
            qs = qs.filter(id__lt=int(cursor))
        rows = list(qs[: PAGE_SIZE + 1])
        page, more = rows[:PAGE_SIZE], len(rows) > PAGE_SIZE

        # Counterparty usernames for transfers (never phone numbers, §2 rule 11).
        tx_ids = [r.tx_id for r in page if r.type == "transfer"]
        others = LedgerEntry.objects.filter(tx_id__in=tx_ids, account__startswith="user:").exclude(
            account=account
        )
        other_ids = {o.tx_id: int(o.account.split(":")[1]) for o in others}
        names = dict(User.objects.filter(id__in=other_ids.values()).values_list("id", "username"))
        return Response(
            {
                "results": [
                    {
                        "id": r.id,
                        "tx_id": str(r.tx_id),
                        "type": r.type,
                        "amount": r.amount,
                        "created_at": r.created_at.isoformat(),
                        "counterparty": names.get(other_ids.get(r.tx_id, 0)),
                        # Which admin topped up an account is not the player's business.
                        "ref_type": None if r.ref_type in HIDDEN_REFS else r.ref_type or None,
                        "ref_id": None if r.ref_type in HIDDEN_REFS else r.ref_id or None,
                    }
                    for r in page
                ],
                "next": str(page[-1].id) if more else None,
            }
        )


class TransferSerializer(serializers.Serializer[Any]):
    username = serializers.CharField(max_length=40)
    amount = serializers.IntegerField()
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class TransferView(AuthedView):
    def post(self, request: Request) -> Response:
        key = idempotency_key(request)
        s = TransferSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        return Response(services.transfer(_user(request), d["username"], d["amount"], d["password"], key))


class BankAccountSerializer(serializers.Serializer[Any]):
    iban = serializers.CharField(max_length=64)


class BankAccountsView(AuthedView):
    def get(self, request: Request) -> Response:
        account = BankAccount.objects.filter(user=_user(request)).first()
        results = [bank_payload(account.iban, account.bank_code, account.id)] if account else []
        return Response({"results": results, "next": None})

    def post(self, request: Request) -> Response:
        s = BankAccountSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        iban, bank = validate_iban(s.validated_data["iban"])
        account = services.set_bank_account(_user(request), iban, bank)
        return Response(
            bank_payload(account.iban, account.bank_code, account.id), status=status.HTTP_201_CREATED
        )


class BankAccountDetailView(AuthedView):
    def delete(self, request: Request, account_id: int) -> Response:
        if not BankAccount.objects.filter(id=account_id, user=_user(request)).exists():
            raise NotFound()
        services.delete_bank_account(_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class WithdrawalOtpView(AuthedView):
    """Sends a code to the user's own phone for confirming a withdrawal."""

    def post(self, request: Request) -> Response:
        otp.request_otp(_user(request).phone, Otp.Purpose.WITHDRAWAL, client_ip(request._request))
        return Response(
            {
                "sms": True,
                "expires_in": registry.get("otp.ttl_seconds"),
                "resend_after": registry.get("otp.resend_cooldown_seconds"),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class WithdrawalCreateSerializer(serializers.Serializer[Any]):
    amount = serializers.IntegerField()
    # An SMS code, or the account password while SMS is off (`withdraw.confirm` in GET wallet).
    code = serializers.CharField(max_length=10, required=False)
    password = serializers.CharField(max_length=128, trim_whitespace=False, required=False)


class WithdrawalsView(AuthedView):
    def get(self, request: Request) -> Response:
        qs = WithdrawalRequest.objects.filter(user=_user(request)).order_by("-id")
        cursor = request.query_params.get("cursor")
        if cursor and cursor.isdigit():
            qs = qs.filter(id__lt=int(cursor))
        rows = list(qs[: PAGE_SIZE + 1])
        page, more = rows[:PAGE_SIZE], len(rows) > PAGE_SIZE
        return Response(
            {"results": [withdrawal_payload(w) for w in page], "next": str(page[-1].id) if more else None}
        )

    def post(self, request: Request) -> Response:
        key = idempotency_key(request)
        user = _user(request)
        existing = WithdrawalRequest.objects.filter(user=user, idempotency_key=key).first()
        if existing is not None:
            return Response(withdrawal_payload(existing))
        s = WithdrawalCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        # Every rule first, so a refused amount does not burn the SMS code or count a password try.
        amount = services.check_withdrawal(user, s.validated_data["amount"])
        if sms.enabled():
            code = s.validated_data.get("code")
            if not code:
                raise ValidationError({"code": ["This field is required."]})
            token = otp.verify_otp(user.phone, Otp.Purpose.WITHDRAWAL, code.strip())
            otp.consume_verification(token, Otp.Purpose.WITHDRAWAL)
        else:
            password = s.validated_data.get("password")
            if not password:
                raise ValidationError({"password": ["This field is required."]})
            services.confirm_password(user, password, "withdraw")
        req = services.request_withdrawal(user, amount, key)
        return Response(withdrawal_payload(req), status=status.HTTP_201_CREATED)


class WithdrawalDetailView(AuthedView):
    def get(self, request: Request, withdrawal_id: int) -> Response:
        req = WithdrawalRequest.objects.filter(Q(id=withdrawal_id) & Q(user=_user(request))).first()
        if req is None:
            raise NotFound()
        return Response(withdrawal_payload(req))

    def delete(self, request: Request, withdrawal_id: int) -> Response:
        return Response(withdrawal_payload(services.cancel_withdrawal(_user(request), withdrawal_id)))


class BanksView(APIView):
    """Known banks by Sheba bank code, for showing the bank while the user types (§7.12)."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        return Response(
            {"results": [{"code": c, "name": {"fa": fa, "en": en}} for c, (fa, en) in BANKS.items()]}
        )
