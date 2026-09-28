"""Wallet operations (CLAUDE.md §7.9-§7.13). Every coin movement goes through `ledger.post`."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Lower
from django.utils import timezone
from rest_framework.exceptions import NotFound

from accounts import errors as auth_errors
from accounts import ratelimit
from accounts.models import User
from settingsapp import registry
from wallet import errors, ledger
from wallet.ledger import PLATFORM_PAYOUTS, PLATFORM_RAKE, PLATFORM_REWARDS, PLATFORM_SALES, user_account
from wallet.models import BankAccount, LedgerEntry, TxType, Wallet, WithdrawalRequest
from wallet.tasks import send_withdrawal_paid_sms

TEHRAN = ZoneInfo("Asia/Tehran")
WINDOW = timedelta(hours=24)
FRIDAY = 4  # date.weekday(); the Iranian weekend day


def _positive_int(amount: Any) -> int:
    if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
        raise errors.AmountInvalid()
    return amount


def _require_active(user: User) -> None:
    if user.status == User.Status.SUSPENDED:
        raise errors.AccountSuspended()


# ---- Signup bonus (§7.10) ----


def grant_signup_bonus(user: User) -> None:
    ledger.ensure_wallet(user.id)
    amount = registry.get("bonus.signup_coins")
    if amount <= 0:
        return
    # Keyed by phone: a number that ever received the bonus never gets it again.
    ledger.post(
        TxType.SIGNUP_BONUS,
        [(PLATFORM_REWARDS, -amount), (user_account(user.id), amount)],
        idempotency_key=f"signup_bonus:phone:{user.phone}",
        ref_type="user",
        ref_id=user.id,
    )


# ---- Balances and rolling limits ----


def bonus_locked(user: User, balance: int) -> int:
    """Signup-bonus coins stay non-withdrawable until the first purchase or top-up (§7.12)."""
    account = user_account(user.id)
    funded = LedgerEntry.objects.filter(
        account=account, type__in=[TxType.PURCHASE, TxType.ADMIN_TOPUP], amount__gt=0
    ).exists()
    if funded:
        return 0
    bonus = (
        LedgerEntry.objects.filter(account=account, type=TxType.SIGNUP_BONUS).aggregate(s=Sum("amount"))["s"]
        or 0
    )
    return min(balance, bonus)


@dataclass(frozen=True)
class Window:
    daily_max: int
    used_24h: int
    remaining: int
    next_available_at: datetime | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "daily_max": self.daily_max,
            "used_24h": self.used_24h,
            "remaining": self.remaining,
            "next_available_at": self.next_available_at.isoformat() if self.next_available_at else None,
        }


def _window(events: list[tuple[datetime, int]], daily_max: int) -> Window:
    """Rolling 24 hours: `events` are (time, amount) inside the window, oldest first."""
    used = sum(a for _, a in events)
    remaining = max(0, daily_max - used)
    next_at = events[0][0] + WINDOW if events and remaining < daily_max else None
    return Window(daily_max, used, remaining, next_at)


def transfer_window(user: User) -> Window:
    since = timezone.now() - WINDOW
    rows = (
        LedgerEntry.objects.filter(
            account=user_account(user.id), type=TxType.TRANSFER, amount__lt=0, created_at__gte=since
        )
        .order_by("created_at")
        .values_list("created_at", "amount")
    )
    return _window([(t, -a) for t, a in rows], registry.get("transfer.daily_max_coins"))


def withdraw_window(user: User) -> Window:
    since = timezone.now() - WINDOW
    rows = (
        WithdrawalRequest.objects.filter(user=user, created_at__gte=since)
        .exclude(status__in=[WithdrawalRequest.Status.CANCELLED, WithdrawalRequest.Status.REJECTED])
        .order_by("created_at")
        .values_list("created_at", "coins")
    )
    return _window(list(rows), registry.get("withdraw.daily_max_coins"))


def summary(user: User) -> dict[str, Any]:
    wallet = ledger.ensure_wallet(user.id)
    locked_bonus = bonus_locked(user, wallet.balance)
    return {
        "balance": wallet.balance,
        "locked": wallet.locked,
        "bonus_locked": locked_bonus,
        "withdrawable": max(0, wallet.balance - locked_bonus),
        "transfer": {
            **transfer_window(user).as_dict(),
            "min": registry.get("transfer.min_coins"),
            "fee_pct": registry.get("transfer.fee_pct"),
        },
        "withdraw": {
            **withdraw_window(user).as_dict(),
            "min": registry.get("withdraw.min_coins"),
            "fee_pct": registry.get("withdraw.fee_pct"),
        },
        "coin_price_toman": registry.get("coin.price_toman"),
    }


# ---- Transfer (§7.13) ----


def transfer(sender: User, username: str, amount: Any, password: str, idempotency_key: str) -> dict[str, Any]:
    _require_active(sender)
    amount = _positive_int(amount)
    # Wrong passwords here count toward their own lock, separate from login.
    pw_key = f"transfer-pw:{sender.id}"
    if remaining := ratelimit.locked_for(pw_key):
        raise auth_errors.Locked(details={"retry_after": remaining})
    if not sender.check_password(password):
        if lock := ratelimit.record_failure(
            pw_key, registry.get("auth.login_max_failures"), registry.get("auth.login_lock_seconds")
        ):
            raise auth_errors.Locked(details={"retry_after": lock})
        raise auth_errors.InvalidCredentials()
    ratelimit.clear_failures(pw_key)

    recipient = (
        User.objects.annotate(u=Lower("username"))
        .filter(u=username.strip().lower())
        .exclude(status=User.Status.BANNED)
        .first()
    )
    if recipient is None:
        raise errors.TransferRecipientNotFound()
    if recipient.id == sender.id:
        raise errors.TransferSelf()
    minimum = registry.get("transfer.min_coins")
    if amount < minimum:
        raise errors.TransferBelowMin(details={"min": minimum})
    fee = amount * registry.get("transfer.fee_pct") // 100
    ledger.ensure_wallet(recipient.id)

    with transaction.atomic():
        # Lock the sender first so two concurrent transfers cannot both pass the rolling limit.
        Wallet.objects.select_for_update().get(user_id=sender.id)
        window = transfer_window(sender)
        if amount > window.remaining:
            raise errors.TransferLimit(
                details={
                    "remaining": window.remaining,
                    "next_available_at": window.next_available_at.isoformat()
                    if window.next_available_at
                    else None,
                }
            )
        entries = [(user_account(sender.id), -amount), (user_account(recipient.id), amount - fee)]
        if fee:
            entries.append((PLATFORM_RAKE, fee))
        posted = ledger.post(
            TxType.TRANSFER,
            entries,
            idempotency_key=f"transfer:{sender.id}:{idempotency_key}",
            ref_type="user",
            ref_id=recipient.id,
        )
    wallet = Wallet.objects.get(user_id=sender.id)
    return {"tx_id": str(posted.tx_id), "balance": wallet.balance, "fee": fee, "received": amount - fee}


# ---- Bank account and withdrawals (§7.12) ----


def next_working_day(now: datetime) -> date:
    """One Iranian working day after `now` (Friday is skipped; official holidays are not modelled)."""
    day = now.astimezone(TEHRAN).date() + timedelta(days=1)
    while day.weekday() == FRIDAY:
        day += timedelta(days=1)
    return day


def set_bank_account(user: User, iban: str, bank_code: str) -> BankAccount:
    with transaction.atomic():
        if WithdrawalRequest.objects.filter(user=user, status=WithdrawalRequest.Status.PENDING).exists():
            raise errors.BankAccountLocked()
        account, _ = BankAccount.objects.update_or_create(
            user=user, defaults={"iban": iban, "bank_code": bank_code}
        )
        return account


def delete_bank_account(user: User) -> None:
    with transaction.atomic():
        if WithdrawalRequest.objects.filter(user=user, status=WithdrawalRequest.Status.PENDING).exists():
            raise errors.BankAccountLocked()
        BankAccount.objects.filter(user=user).delete()


def request_withdrawal(user: User, amount: Any, idempotency_key: str) -> WithdrawalRequest:
    """Call after the SMS code was verified. Holds the coins in escrow."""
    amount = _positive_int(amount)
    existing = WithdrawalRequest.objects.filter(user=user, idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing
    bank = BankAccount.objects.filter(user=user).first()
    if bank is None:
        raise errors.NoBankAccount()
    minimum = registry.get("withdraw.min_coins")
    if amount < minimum:
        raise errors.WithdrawBelowMin(details={"min": minimum})

    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(user_id=user.id)
        window = withdraw_window(user)
        if amount > window.remaining:
            raise errors.WithdrawLimit(
                details={
                    "remaining": window.remaining,
                    "next_available_at": window.next_available_at.isoformat()
                    if window.next_available_at
                    else None,
                }
            )
        withdrawable = max(0, wallet.balance - bonus_locked(user, wallet.balance))
        if amount > withdrawable:
            raise errors.WithdrawNotWithdrawable(details={"withdrawable": withdrawable})
        price = registry.get("coin.price_toman")
        fee = amount * registry.get("withdraw.fee_pct") // 100
        req = WithdrawalRequest.objects.create(
            user=user,
            coins=amount,
            fee_coins=fee,
            price_toman=price,
            payout_rial=(amount - fee) * price * 10,
            iban=bank.iban,
            bank_code=bank.bank_code,
            expected_by=next_working_day(timezone.now()),
            idempotency_key=idempotency_key,
        )
        ledger.post(
            TxType.WITHDRAWAL_HOLD,
            [(user_account(user.id), -amount), (ledger.escrow("withdrawal", req.id), amount)],
            idempotency_key=f"withdrawal_hold:{req.id}",
            ref_type="withdrawal",
            ref_id=req.id,
        )
        Wallet.objects.filter(user_id=user.id).update(locked=wallet.locked + amount)
    return req


def _pending(withdrawal_id: int, user: User | None = None) -> WithdrawalRequest:
    qs = WithdrawalRequest.objects.select_for_update().filter(id=withdrawal_id)
    if user is not None:
        qs = qs.filter(user=user)
    req = qs.first()
    if req is None:
        raise NotFound()
    if req.status != WithdrawalRequest.Status.PENDING:
        raise errors.WithdrawalNotPending(details={"status": req.status})
    return req


def _release(req: WithdrawalRequest) -> None:
    wallet = Wallet.objects.select_for_update().get(user_id=req.user_id)
    Wallet.objects.filter(user_id=req.user_id).update(locked=max(0, wallet.locked - req.coins))


def _refund(req: WithdrawalRequest, status: str, reason: str = "", admin: Any = None) -> WithdrawalRequest:
    ledger.post(
        TxType.WITHDRAWAL_REFUND,
        [(ledger.escrow("withdrawal", req.id), -req.coins), (user_account(req.user_id), req.coins)],
        idempotency_key=f"withdrawal_refund:{req.id}",
        ref_type="withdrawal",
        ref_id=req.id,
    )
    _release(req)
    req.status = status
    req.reject_reason = reason
    req.decided_by = admin
    req.decided_at = timezone.now()
    req.save(update_fields=["status", "reject_reason", "decided_by", "decided_at"])
    return req


def cancel_withdrawal(user: User, withdrawal_id: int) -> WithdrawalRequest:
    with transaction.atomic():
        return _refund(_pending(withdrawal_id, user), WithdrawalRequest.Status.CANCELLED)


def reject_withdrawal(admin: Any, withdrawal_id: int, reason: str) -> WithdrawalRequest:
    with transaction.atomic():
        return _refund(_pending(withdrawal_id), WithdrawalRequest.Status.REJECTED, reason, admin)


def approve_withdrawal(admin: Any, withdrawal_id: int, bank_reference: str) -> WithdrawalRequest:
    with transaction.atomic():
        req = _pending(withdrawal_id)
        entries = [
            (ledger.escrow("withdrawal", req.id), -req.coins),
            (PLATFORM_PAYOUTS, req.coins - req.fee_coins),
        ]
        if req.fee_coins:
            entries.append((PLATFORM_RAKE, req.fee_coins))
        ledger.post(
            TxType.WITHDRAWAL_PAYOUT,
            entries,
            idempotency_key=f"withdrawal_payout:{req.id}",
            ref_type="withdrawal",
            ref_id=req.id,
        )
        _release(req)
        req.status = WithdrawalRequest.Status.PAID
        req.bank_reference = bank_reference
        req.decided_by = admin
        req.decided_at = timezone.now()
        req.save(update_fields=["status", "bank_reference", "decided_by", "decided_at"])
        transaction.on_commit(lambda: send_withdrawal_paid_sms.delay(req.id))
    return req


# ---- Admin top-up (§7.9) ----


def admin_topup(user: User, amount: Any, idempotency_key: str, admin_id: int) -> tuple[int, int, bool]:
    """Returns (balance before, balance after, created). Caller records the audit entry."""
    amount = _positive_int(amount)
    cap = registry.get("admin.topup_max_amount")
    if cap and amount > cap:
        raise errors.TopupAboveCap(details={"cap": cap})
    ledger.ensure_wallet(user.id)
    with transaction.atomic():
        before = Wallet.objects.select_for_update().get(user_id=user.id).balance
        posted = ledger.post(
            TxType.ADMIN_TOPUP,
            [(PLATFORM_SALES, -amount), (user_account(user.id), amount)],
            idempotency_key=f"admin_topup:{idempotency_key}",
            ref_type="admin",
            ref_id=admin_id,
        )
        after = Wallet.objects.get(user_id=user.id).balance
    return before, after, posted.created
