import secrets
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from accounts.models import User
from adminapi import totp
from adminapi.models import AdminSession, AdminUser
from wallet import ledger, services
from wallet.models import TxType, Wallet


class Command(BaseCommand):
    help = (
        "Create test players (with coins) and an admin for manual testing, and print their credentials. "
        "Re-running issues new passwords and keeps coins and the admin's authenticator. "
        "Refused in production."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--count", type=int, default=5, help="Number of test players (default 5)")
        parser.add_argument("--coins", type=int, default=1000, help="Coins for each player (default 1000)")
        parser.add_argument("--password", help="Use this password for every player instead of random ones")
        parser.add_argument("--admin", default="admin", help="Admin username (default admin)")
        parser.add_argument("--admin-password", help="Use this admin password instead of a random one")

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.APP_ENV == "production":
            raise CommandError("seed_testers is refused when APP_ENV=production")
        count, coins = options["count"], options["coins"]
        if not 1 <= count <= 50 or coins < 0:
            raise CommandError("--count must be 1..50 and --coins >= 0")

        rows = []
        for i in range(1, count + 1):
            username = f"tester{i}"
            password = options["password"] or secrets.token_urlsafe(9)
            with transaction.atomic():
                user = User.objects.filter(username=username).first()
                if user is None:
                    user = User.objects.create_user(
                        phone=f"+98900000{i:04d}", password=password, username=username, lang="fa"
                    )
                else:
                    user.set_password(password)
                    user.status = User.Status.ACTIVE
                    user.save(update_fields=["password", "status"])
                services.grant_signup_bonus(user)
                if coins:
                    # Keyed per user and amount: re-running with the same --coins adds nothing.
                    ledger.post(
                        TxType.ADMIN_TOPUP,
                        [(ledger.PLATFORM_SALES, -coins), (ledger.user_account(user.id), coins)],
                        idempotency_key=f"seed_testers:{user.id}:{coins}",
                        ref_type="seed",
                        ref_id=user.id,
                    )
            balance = Wallet.objects.get(user_id=user.id).balance
            rows.append((username, "0" + user.phone[3:], password, balance))

        self.stdout.write("Test players (log in with the phone number and password):")
        self.stdout.write(f"{'username':<10} {'phone':<12} {'password':<14} coins")
        for username, phone, password, balance in rows:
            self.stdout.write(f"{username:<10} {phone:<12} {password:<14} {balance}")

        admin_name = options["admin"].strip().lower()
        admin_password = options["admin_password"] or secrets.token_urlsafe(12)
        admin = AdminUser.objects.filter(username=admin_name).first()
        if admin is None:
            secret = totp.new_secret()
            admin = AdminUser(
                username=admin_name,
                role=AdminUser.Role.SUPERADMIN,
                totp_secret_encrypted=totp.encrypt(secret),
            )
        else:
            secret = totp.decrypt(admin.totp_secret_encrypted) or totp.new_secret()
            admin.totp_secret_encrypted = totp.encrypt(secret)
            admin.is_active = True
        admin.set_password(admin_password)
        admin.save()
        AdminSession.objects.filter(admin=admin, revoked_at__isnull=True).delete()

        self.stdout.write("")
        self.stdout.write(f"Admin ({admin.role}) at admin.{settings.BASE_DOMAIN}:")
        self.stdout.write(f"  username: {admin_name}")
        self.stdout.write(f"  password: {admin_password}")
        self.stdout.write(f"  authenticator secret: {secret}")
        self.stdout.write(
            f"  authenticator URI: {totp.provisioning_uri(secret, admin_name, settings.APP_NAME)}"
        )
