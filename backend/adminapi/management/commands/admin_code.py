import time
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from adminapi import totp
from adminapi.models import AdminUser


class Command(BaseCommand):
    help = (
        "Print an admin's current two-step sign-in code, for signing in to a local or staging admin "
        "panel without an authenticator app. Refused in production."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("username", nargs="?", default="admin")

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.APP_ENV == "production":
            raise CommandError("admin_code is refused when APP_ENV=production")
        admin = AdminUser.objects.filter(username=options["username"].strip().lower()).first()
        if admin is None:
            raise CommandError("No such admin")
        now = time.time()
        code = totp._code(totp.decrypt(admin.totp_secret_encrypted), int(now // totp.STEP_SECONDS))
        left = int(totp.STEP_SECONDS - now % totp.STEP_SECONDS)
        self.stdout.write(f"{code}  (valid for about {left + totp.STEP_SECONDS} s)")
