import secrets
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from adminapi import totp
from adminapi.models import AdminSession, AdminUser


class Command(BaseCommand):
    help = "Reset an admin's password and/or authenticator, and sign out all of its sessions."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("username")
        parser.add_argument("--password", action="store_true", help="Issue a new one-time password")
        parser.add_argument("--totp", action="store_true", help="Issue a new authenticator secret")
        parser.add_argument("--deactivate", action="store_true", help="Disable the account")

    def handle(self, *args: Any, **options: Any) -> None:
        admin = AdminUser.objects.filter(username=options["username"].strip().lower()).first()
        if admin is None:
            raise CommandError("No such admin")
        if not (options["password"] or options["totp"] or options["deactivate"]):
            raise CommandError("Pass --password, --totp, and/or --deactivate")
        if options["password"]:
            password = secrets.token_urlsafe(12)
            admin.set_password(password)
            self.stdout.write(f"New password (shown once): {password}")
        if options["totp"]:
            secret = totp.new_secret()
            admin.totp_secret_encrypted = totp.encrypt(secret)
            self.stdout.write(f"New TOTP secret: {secret}")
            uri = totp.provisioning_uri(secret, admin.username, settings.APP_NAME)
            self.stdout.write(f"TOTP URI: {uri}")
        if options["deactivate"]:
            admin.is_active = False
            self.stdout.write("Account deactivated")
        admin.save()
        AdminSession.objects.filter(admin=admin, revoked_at__isnull=True).delete()
        self.stdout.write("All sessions of this admin were signed out")
