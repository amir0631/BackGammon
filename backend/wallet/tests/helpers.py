import itertools

from accounts.models import User
from wallet import ledger

_seq = itertools.count(1000)


def make_user(username: str | None = None, password: str = "S3cure-pass!", status: str = "active") -> User:
    n = next(_seq)
    user = User.objects.create_user(
        phone=f"+98912{n:07d}", password=password, username=username or f"player_{n}", status=status
    )
    ledger.ensure_wallet(user.id)
    return user


def fund(user: User, amount: int, key: str | None = None) -> None:
    """Credit coins the way an admin top-up does."""
    ledger.post(
        "admin_topup",
        [(ledger.PLATFORM_SALES, -amount), (ledger.user_account(user.id), amount)],
        idempotency_key=key or f"test-fund:{user.id}:{next(_seq)}",
    )


def make_iban(bank: str = "054", account: str = "0102680020817909") -> str:
    """A checksum-valid Iranian IBAN for tests: IR + check digits + bank + 1 + account (22 digits BBAN)."""
    bban = f"{bank}{'0'}{account}".ljust(22, "0")[:22]
    check = 98 - int(f"{bban}182700") % 97
    return f"IR{check:02d}{bban}"
