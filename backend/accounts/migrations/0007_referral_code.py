from django.db import migrations, models

import accounts.models


def backfill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    taken: set[str] = set()
    for user in User.objects.filter(referral_code__isnull=True).only("id"):
        code = accounts.models.new_referral_code()
        while code in taken or User.objects.filter(referral_code=code).exists():
            code = accounts.models.new_referral_code()
        taken.add(code)
        User.objects.filter(pk=user.pk).update(referral_code=code)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_push_subscription")]

    operations = [
        migrations.AddField(
            model_name="user", name="referral_code", field=models.CharField(max_length=12, null=True)
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="referral_code",
            field=models.CharField(default=accounts.models.new_referral_code, max_length=12, unique=True),
        ),
    ]
