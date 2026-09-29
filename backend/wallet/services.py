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

from accounts import ratelimit, sms
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


def confirm_password(user: User, password: str, scope: str) -> None:
    """Password confirmation for a coin movement. Wrong passwords count toward a lock per scope,
    separate from login."""
    key = f"{scope}-pw:{user.id}"
    if remaining := ratelimit.locked_for(key):
        raise errors.PasswordLocked(details={"retry_after": remaining})
    if not user.check_password(password):
        if lock := ratelimit.record_failure(
            key, registry.get("auth.login_max_failures"), registry.get("auth.login_lock_seconds")
        ):
            raise errors.PasswordLocked(details={"retry_after": lock})
        raise errors.PasswordInvalid()
    ratelimit.clear_failures(key)


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
    """Signup-bonus coins stay non-withdrawable and non-transferable until the first purchase or
    top-up (§7.12), so bonuses from many accounts cannot be pooled into one and cashed out."""
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


def _withdraw_blocked(user: User) -> bool:
    from antifraud.rules import has_open_flag

    return has_open_flag(user.id)


def summary(user: User) -> dict[str, Any]:
    wallet = ledger.ensure_wallet(user.id)
    locked_bonus = bonus_locked(user, wallet.balance)
    return {
        "balance": wallet.balance,
        "locked": wallet.locked,
        "bonus_locked": locked_bonus,
        "withdrawable": max(0, wallet.balance - locked_bonus),
        "transferable": max(0, wallet.balance - locked_bonus),
        "transfer": {
            **transfer_window(user).as_dict(),
            "min": registry.get("transfer.min_coins"),
            "fee_pct": registry.get("transfer.fee_pct"),
        },
        "withdraw": {
            **withdraw_window(user).as_dict(),
            "min": registry.get("withdraw.min_coins"),
            "fee_pct": registry.get("withdraw.fee_pct"),
            # How the user confirms a withdrawal: an SMS code, or the password while SMS is off.
            "confirm": "sms" if sms.enabled() else "password",
            "expected_by": next_working_day(timezone.now()).isoformat(),
            # §7.12: an open anti-fraud flag blocks withdrawals; the app says so before the form.
            "blocked": _withdraw_blocked(user),
        },
        "coin_price_toman": registry.get("coin.price_toman"),
    }


# ---- Transfer (§7.13) ----


def _posted_transfer(sender_id: int, key: str) -> dict[str, Any] | None:
    """The result of a transfer already posted under `key`, or None."""
    rows = list(
        LedgerEntry.objects.filter(idempotency_key=key).values_list(
            "tx_id", "account", "amount", "created_at"
        )
    )
    if not rows:
        return None
    sender = user_account(sender_id)
    fee = sum(amount for _, account, amount, _t in rows if account == PLATFORM_RAKE)
    received = sum(
        amount for _, account, amount, _t in rows if account.startswith("user:") and account != sender
    )
    balance = Wallet.objects.get(user_id=sender_id).balance
    return {
        "tx_id": str(rows[0][0]),
        "balance": balance,
        "fee": fee,
        "received": received,
        "created_at": rows[0][3].isoformat(),
    }


def transfer(sender: User, username: str, amount: Any, password: str, idempotency_key: str) -> dict[str, Any]:
    key = f"transfer:{sender.id}:{idempotency_key}"
    # A retry returns the original result (§2 rule 5), even if the limit, the recipient, or the
    # sender's status changed since. It moves nothing, so it needs no password check.
    if (done := _posted_transfer(sender.id, key)) is not None:
        return done
    _require_active(sender)
    amount = _positive_int(amount)
    confirm_password(sender, password, "transfer")

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
    from antifraud.links import link_reasons
    from antifraud.rules import Rule, flag

    if reasons := link_reasons(sender.id, recipient.id):
        # §7.13: transfers between accounts anti-fraud links are refused and flagged.
        flag(Rule.LINKED_TRANSFER, sender, recipient, evidence={"reason": reasons, "amount": amount})
        raise errors.TransferLinked()
    minimum = registry.get("transfer.min_coins")
    if amount < minimum:
        raise errors.TransferBelowMin(details={"min": minimum})
    fee = amount * registry.get("transfer.fee_pct") // 100
    ledger.ensure_wallet(sender.id)
    ledger.ensure_wallet(recipient.id)

    with transaction.atomic():
        # Lock both wallets before the rolling-limit check, so two concurrent transfers cannot both
        # pass it, and in the ledger's order, so A→B and B→A at once cannot deadlock.
        ledger.lock_wallets([sender.id, recipient.id])
        # A concurrent retry may have posted while this request waited for the locks.
        if (done := _posted_transfer(sender.id, key)) is not None:
            return done
        balance = Wallet.objects.get(user_id=sender.id).balance
        transferable = max(0, balance - bonus_locked(sender, balance))
        if transferable < amount <= balance:  # beyond the balance: the ledger's WALLET_INSUFFICIENT
            raise errors.TransferNotTransferable(
                details={"transferable": transferable, "bonus_locked": balance - transferable}
            )
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
        ledger.post(TxType.TRANSFER, entries, idempotency_key=key, ref_type="user", ref_id=recipient.id)
        result = _posted_transfer(sender.id, key)
    assert result is not None
    return result


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


def check_withdrawal(user: User, amount: Any, balance: int | None = None) -> int:
    """Every withdrawal rule except the confirmation. The view calls it before using the SMS code or
    password (so a refused amount does not burn a code); the service repeats it under the lock."""
    value = _positive_int(amount)
    from antifraud.rules import has_open_flag

    if has_open_flag(user.id):
        raise errors.WithdrawUnderReview()  # §7.12: an open anti-fraud flag blocks withdrawals
    if not BankAccount.objects.filter(user=user).exists():
        raise errors.NoBankAccount()
    minimum = registry.get("withdraw.min_coins")
    if value < minimum:
        raise errors.WithdrawBelowMin(details={"min": minimum})
    window = withdraw_window(user)
    if value > window.remaining:
        raise errors.WithdrawLimit(
            details={
                "remaining": window.remaining,
                "next_available_at": window.next_available_at.isoformat()
                if window.next_available_at
                else None,
            }
        )
    if balance is None:
        balance = ledger.ensure_wallet(user.id).balance
    withdrawable = max(0, balance - bonus_locked(user, balance))
    if value > withdrawable:
        raise errors.WithdrawNotWithdrawable(details={"withdrawable": withdrawable})
    return value


def request_withdrawal(user: User, amount: Any, idempotency_key: str) -> WithdrawalRequest:
    """Call after the SMS code or password was confirmed. Holds the coins in escrow."""
    existing = WithdrawalRequest.objects.filter(user=user, idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing
    ledger.ensure_wallet(user.id)
    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(user_id=user.id)
        amount = check_withdrawal(user, amount, wallet.balance)
        bank = BankAccount.objects.get(user=user)
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


def _check_claim(req: WithdrawalRequest, admin: Any) -> None:
    if req.claimed_by_id is not None and req.claimed_by_id != admin.id:
        raise errors.WithdrawalClaimed(
            details={"claimed_by": req.claimed_by.username if req.claimed_by else None}
        )


def claim_withdrawal(admin: Any, withdrawal_id: int) -> WithdrawalRequest:
    with transaction.atomic():
        req = _pending(withdrawal_id)
        _check_claim(req, admin)
        req.claimed_by = admin
        req.claimed_at = timezone.now()
        req.save(update_fields=["claimed_by", "claimed_at"])
        return req


def reject_withdrawal(admin: Any, withdrawal_id: int, reason: str) -> WithdrawalRequest:
    with transaction.atomic():
        req = _pending(withdrawal_id)
        _check_claim(req, admin)
        return _refund(req, WithdrawalRequest.Status.REJECTED, reason, admin)


def approve_withdrawal(admin: Any, withdrawal_id: int, bank_reference: str) -> WithdrawalRequest:
    with transaction.atomic():
        req = _pending(withdrawal_id)
        _check_claim(req, admin)
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
        if sms.enabled():
            transaction.on_commit(lambda: send_withdrawal_paid_sms.delay(req.id))
    return req


# ---- Match entry, refund, and settlement (§7.3) ----


def escrow_match_entries(match_id: object, user_ids: list[int], entry: int) -> None:
    """Both entry fees into escrow:match:{id} in one transaction; WalletInsufficient names no one, so
    callers check balances first to tell the players apart."""
    if entry <= 0:
        return
    for uid in user_ids:
        ledger.ensure_wallet(uid)
    ledger.post(
        TxType.MATCH_ENTRY,
        [
            *((user_account(uid), -entry) for uid in user_ids),
            (ledger.escrow("match", match_id), entry * len(user_ids)),
        ],
        idempotency_key=f"match_entry:{match_id}",
        ref_type="match",
        ref_id=match_id,
    )


def refund_match(match_id: object, user_ids: list[int], entry: int) -> None:
    """Aborted before the first roll: full refund, no rake."""
    if entry <= 0:
        return
    ledger.post(
        TxType.MATCH_REFUND,
        [
            (ledger.escrow("match", match_id), -entry * len(user_ids)),
            *((user_account(uid), entry) for uid in user_ids),
        ],
        idempotency_key=f"match_refund:{match_id}",
        ref_type="match",
        ref_id=match_id,
    )


def settle_match(match_id: object, winner_id: int, entry: int, rake_pct: int) -> dict[str, int]:
    """pot = entry * 2; rake = floor(pot * rake_pct / 100); the winner gets the rest."""
    if entry <= 0:
        return {"entry": 0, "pot": 0, "rake": 0, "payout": 0}
    pot = entry * 2
    rake = pot * rake_pct // 100
    payout = pot - rake
    entries = [(ledger.escrow("match", match_id), -pot), (user_account(winner_id), payout)]
    if rake:
        entries.append((PLATFORM_RAKE, rake))
    ledger.post(
        TxType.MATCH_PAYOUT,
        entries,
        idempotency_key=f"match_settle:{match_id}",
        ref_type="match",
        ref_id=match_id,
    )
    return {"entry": entry, "pot": pot, "rake": rake, "payout": payout}


def settle_bot_match(match_id: object, user_id: int, entry: int, prize: int, won: bool) -> dict[str, int]:
    """§9 bot entry: a win returns the entry plus the fixed prize from platform:rewards; a loss leaves
    the entry to platform:rewards, which funds these prizes."""
    if entry <= 0:
        return {"entry": 0, "prize": 0, "payout": 0}
    escrow = ledger.escrow("match", match_id)
    if won:
        entries = [(escrow, -entry), (PLATFORM_REWARDS, -prize), (user_account(user_id), entry + prize)]
    else:
        entries = [(escrow, -entry), (PLATFORM_REWARDS, entry)]
    ledger.post(
        TxType.MATCH_PAYOUT,
        entries,
        idempotency_key=f"match_settle:{match_id}",
        ref_type="match",
        ref_id=match_id,
    )
    return {"entry": entry, "prize": prize if won else 0, "payout": entry + prize if won else 0}


# ---- Admin adjustment (§13 Users: manual balance adjustment with reason) ----


def admin_adjust(user: User, amount: Any, idempotency_key: str, admin_id: int) -> tuple[int, int, bool]:
    """Signed correction: a credit comes from platform:rewards, a debit goes to platform:sinks. Returns
    (balance before, balance after, created)."""
    if not isinstance(amount, int) or isinstance(amount, bool) or amount == 0:
        raise errors.AmountInvalid()
    ledger.ensure_wallet(user.id)
    source = PLATFORM_REWARDS if amount > 0 else ledger.PLATFORM_SINKS
    with transaction.atomic():
        before = Wallet.objects.select_for_update().get(user_id=user.id).balance
        posted = ledger.post(
            TxType.ADMIN_ADJUSTMENT,
            [(source, -amount), (user_account(user.id), amount)],
            idempotency_key=f"admin_adjust:{user.id}:{idempotency_key}",
            ref_type="admin",
            ref_id=admin_id,
        )
        after = Wallet.objects.get(user_id=user.id).balance
    return before, after, posted.created


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
            idempotency_key=f"admin_topup:{user.id}:{idempotency_key}",
            ref_type="admin",
            ref_id=admin_id,
        )
        after = Wallet.objects.get(user_id=user.id).balance
    return before, after, posted.created
