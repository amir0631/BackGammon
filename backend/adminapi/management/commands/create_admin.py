import secrets
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from adminapi import totp
from adminapi.models import AdminUser


class Command(BaseCommand):
    help = "Create an admin user and print its one-time password and TOTP enrolment URI."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("username")
        parser.add_argument("--role", choices=AdminUser.Role.values, default=AdminUser.Role.SUPERADMIN)

    def handle(self, *args: Any, **options: Any) -> None:
        username = options["username"].strip().lower()
        if AdminUser.objects.filter(username=username).exists():
            raise CommandError(f"Admin {username!r} already exists")
        password = secrets.token_urlsafe(12)
        secret = totp.new_secret()
        admin = AdminUser(username=username, role=options["role"], totp_secret_encrypted=totp.encrypt(secret))
        admin.set_password(password)
        admin.save()
        self.stdout.write(f"Admin: {username} ({admin.role})")
        self.stdout.write(f"Password (shown once, change it later): {password}")
        self.stdout.write(f"TOTP secret: {secret}")
        uri = totp.provisioning_uri(secret, username, settings.APP_NAME)
        self.stdout.write(f"TOTP URI (scan in an authenticator app): {uri}")
