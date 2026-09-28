"""The only way coins move (CLAUDE.md §2 rules 3-5, §7.1).

`post()` writes one balanced transaction: entries sum to zero, the idempotency key makes replays
return the original transaction, and every `user:{id}` wallet involved is locked in ascending id
order (so concurrent settlements cannot deadlock) and kept equal to the ledger sum.
"""

import uuid
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from django.db import connection, transaction
from django.db.models import F

from config.errors import AppError
from wallet.models import LedgerEntry, TxType, Wallet


class WalletInsufficient(AppError):
    status_code = 409
    code = "WALLET_INSUFFICIENT"
    message_key = "errors.wallet.insufficient"


class LedgerError(Exception):
    """A programming error: unbalanced or malformed transaction. Never shown to users."""


def user_account(user_id: int) -> str:
    return f"user:{user_id}"


def escrow(kind: str, ref_id: object) -> str:
    return f"escrow:{kind}:{ref_id}"


PLATFORM_RAKE = "platform:rake"
PLATFORM_REWARDS = "platform:rewards"
PLATFORM_SALES = "platform:sales"
PLATFORM_SINKS = "platform:sinks"
PLATFORM_PAYOUTS = "platform:payouts"


def _user_id(account: str) -> int | None:
    kind, _, rest = account.partition(":")
    return int(rest) if kind == "user" else None


@dataclass(frozen=True)
class Posted:
    tx_id: uuid.UUID
    created: bool  # False when the idempotency key had already been used


def post(
    tx_type: TxType | str,
    entries: list[tuple[str, int]],
    idempotency_key: str,
    ref_type: str = "",
    ref_id: object = "",
) -> Posted:
    if not entries or any(not isinstance(a, int) or isinstance(a, bool) or a == 0 for _, a in entries):
        raise LedgerError("entries must be non-zero integers")
    if sum(a for _, a in entries) != 0:
        raise LedgerError("entries must sum to zero")
    merged: dict[str, int] = defaultdict(int)
    for account, amount in entries:
        merged[account] += amount
    if len(merged) != len(entries) or any(v == 0 for v in merged.values()):
        raise LedgerError("each account appears once per transaction")

    with transaction.atomic():
        # Serialise concurrent attempts with the same key, then check whether it was used.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", [idempotency_key])
        existing = (
            LedgerEntry.objects.filter(idempotency_key=idempotency_key)
            .values_list("tx_id", flat=True)
            .first()
        )
        if existing is not None:
            return Posted(existing, created=False)

        user_ids = sorted(uid for a in merged if (uid := _user_id(a)) is not None)
        wallets = lock_wallets(user_ids)
        for uid in user_ids:
            wallet = wallets.get(uid)
            if wallet is None:
                raise LedgerError(f"wallet missing for user {uid}")
            delta = merged[user_account(uid)]
            if wallet.balance + delta < 0:
                raise WalletInsufficient(details={"balance": wallet.balance, "needed": -delta})

        tx_id = uuid.uuid4()
        LedgerEntry.objects.bulk_create(
            LedgerEntry(
                tx_id=tx_id,
                account=account,
                amount=amount,
                type=str(tx_type),
                ref_type=ref_type,
                ref_id=str(ref_id),
                idempotency_key=idempotency_key,
            )
            for account, amount in merged.items()
        )
        for uid in user_ids:
            Wallet.objects.filter(user_id=uid).update(
                balance=F("balance") + merged[user_account(uid)], version=F("version") + 1
            )
        return Posted(tx_id, created=True)


def lock_wallets(user_ids: Iterable[int]) -> dict[int, Wallet]:
    """Row-lock wallets in ascending user id: the one order every caller must use (§7.1).

    A service that locks wallets before calling `post` (to check a limit under the lock) must lock
    all of them here, or two opposite transfers can deadlock.
    """
    ids = sorted(set(user_ids))
    return {
        w.user_id: w for w in Wallet.objects.select_for_update().filter(user_id__in=ids).order_by("user_id")
    }


def ensure_wallet(user_id: int) -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(user_id=user_id)
    return wallet
