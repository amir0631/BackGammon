from typing import Any

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from wallet import ledger
from wallet.models import TxType


def load_phone(i: int) -> str:
    return f"+98901{i:07d}"


class Command(BaseCommand):
    help = (
        "Create the players the load test signs in as (load0001…, phones 0901…), all with one password "
        "and a coin balance for table entries (CLAUDE.md §16 Load). Re-running tops balances back up to "
        "--coins. Refused in production."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--count", type=int, default=1000, help="Number of players (default 1000)")
        parser.add_argument("--coins", type=int, default=100_000, help="Balance for each player")
        parser.add_argument("--password", required=True, help="Password for every load player")

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.APP_ENV == "production":
            raise CommandError("seed_load is refused when APP_ENV=production")
        count, coins = options["count"], options["coins"]
        if not 1 <= count <= 9_999_999 or coins < 0:
            raise CommandError("--count must be 1..9999999 and --coins >= 0")
        # One hash for all: Argon2 salts are per hash, and hashing thousands of times is slow.
        password = make_password(options["password"])
        now = timezone.now()
        created = 0
        for i in range(1, count + 1):
            with transaction.atomic():
                user = User.objects.filter(phone=load_phone(i)).first()
                if user is None:
                    user = User.objects.create_user(
                        phone=load_phone(i),
                        username=f"load{i:04d}",
                        lang="en",
                        phone_verified_at=now,
                    )
                    created += 1
                user.password = password
                user.status = User.Status.ACTIVE
                user.save(update_fields=["password", "status"])
                balance = ledger.ensure_wallet(user.id).balance
                if balance < coins:
                    missing = coins - balance
                    ledger.post(
                        TxType.ADMIN_TOPUP,
                        [(ledger.PLATFORM_SALES, -missing), (ledger.user_account(user.id), missing)],
                        idempotency_key=f"seed_load:{user.id}:{now.isoformat()}",
                        ref_type="seed",
                        ref_id=user.id,
                    )
        self.stdout.write(
            f"{count} load players ready ({created} new), phones {load_phone(1)}…{load_phone(count)}, "
            f"{coins} coins each."
        )
