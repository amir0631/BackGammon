from django.db import migrations

# CLAUDE.md §18: four placeholder packages, admin-editable.
PACKAGES = [
    (50, {"fa": "بستهٔ کوچک", "en": "Small pack"}),
    (100, {"fa": "بستهٔ متوسط", "en": "Medium pack"}),
    (500, {"fa": "بستهٔ بزرگ", "en": "Large pack"}),
    (1000, {"fa": "بستهٔ ویژه", "en": "Special pack"}),
]


def seed(apps, schema_editor):
    CoinPackage = apps.get_model("payments", "CoinPackage")
    for sort, (coins, name) in enumerate(PACKAGES):
        CoinPackage.objects.get_or_create(coins=coins, defaults={"name_i18n": name, "sort": sort})


class Migration(migrations.Migration):
    dependencies = [("payments", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
