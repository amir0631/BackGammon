import re
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from adminapi import totp
from adminapi.models import AdminUser


@pytest.mark.django_db
def test_prints_a_code_that_verifies(settings):
    call_command(
        "seed_testers", count=1, password="Tester-pass-1", admin_password="Admin-pass-1", stdout=StringIO()
    )
    out = StringIO()
    call_command("admin_code", stdout=out)
    code = out.getvalue().split()[0]
    assert re.fullmatch(r"\d{6}", code)
    admin = AdminUser.objects.get(username="admin")
    assert totp.verify(totp.decrypt(admin.totp_secret_encrypted), code)
    settings.APP_ENV = "production"
    with pytest.raises(CommandError):
        call_command("admin_code", stdout=StringIO())
