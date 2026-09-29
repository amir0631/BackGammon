from django.db import migrations

# Default catalog (CLAUDE.md §11.2 theme states; §1 preset emojis and phrases). Prices and levels are
# placeholders the admin edits (§13 Shop). Theme assets ship with the frontends under /themes/<key>/.


def _n(fa, en):
    return {"fa": fa, "en": en}


BOARD = [
    ("walnut", _n("گردو", "Walnut"), "free", 0, 1, True),
    ("ebony", _n("آبنوس", "Ebony"), "level_locked", 0, 5, False),
    ("khatam", _n("خاتم", "Khatam"), "purchasable", 300, 1, False),
    ("marble", _n("مرمر", "Marble"), "purchasable", 500, 1, False),
]
CHECKERS = [
    ("classic", _n("کلاسیک", "Classic"), "free", 0, 1, True),
    ("pearl", _n("صدف", "Pearl"), "level_locked", 0, 3, False),
    ("brass", _n("برنج", "Brass"), "purchasable", 200, 1, False),
]
EMOJI_PACKS = [
    ("default", _n("شکلک‌ها", "Emojis"), "free", 0, 1,
     ["smile", "laugh", "wow", "sad", "angry", "thumbs_up", "clap", "fire", "think", "cool"]),
    ("celebrate", _n("جشن", "Celebrate"), "purchasable", 150, 1, ["party", "trophy", "crown", "rocket", "star", "gift"]),
    ("persian", _n("ایرانی", "Persian"), "level_locked", 0, 4, ["tea", "rose", "pomegranate", "saffron", "kite"]),
]
PHRASE_PACKS = [
    ("default", _n("جمله‌ها", "Phrases"), "free", 0, 1,
     ["hello", "good_luck", "nice_move", "well_played", "thanks", "oops", "hurry", "good_game"]),
    ("friendly", _n("دوستانه", "Friendly"), "purchasable", 150, 1, ["rematch", "great_roll", "unlucky", "my_turn_soon", "respect"]),
]
PHRASES = {
    "hello": _n("سلام!", "Hello!"),
    "good_luck": _n("موفق باشی!", "Good luck!"),
    "nice_move": _n("حرکت خوبی بود!", "Nice move!"),
    "well_played": _n("خوب بازی کردی!", "Well played!"),
    "thanks": _n("ممنون!", "Thanks!"),
    "oops": _n("اوه!", "Oops!"),
    "hurry": _n("کمی سریع‌تر لطفاً", "A bit faster, please"),
    "good_game": _n("بازی خوبی بود!", "Good game!"),
    "rematch": _n("یه دست دیگه؟", "Rematch?"),
    "great_roll": _n("عجب تاسی!", "What a roll!"),
    "unlucky": _n("بدشانسی بود", "Unlucky"),
    "my_turn_soon": _n("الان نوبت منه", "My turn now"),
    "respect": _n("احترام!", "Respect!"),
}


def seed(apps, schema_editor):
    Item = apps.get_model("shop", "Item")
    Phrase = apps.get_model("shop", "Phrase")
    for kind, rows in (("board_theme", BOARD), ("checker_theme", CHECKERS)):
        for sort, (key, name, unlock, price, level, default) in enumerate(rows):
            Item.objects.get_or_create(
                kind=kind, key=key,
                defaults={"name_i18n": name, "unlock": unlock, "price_coins": price, "unlock_level": level,
                          "is_default": default, "sort": sort, "data": {"asset": f"/themes/{kind}/{key}/"}},
            )
    for kind, rows in (("emoji_pack", EMOJI_PACKS), ("phrase_pack", PHRASE_PACKS)):
        for sort, (key, name, unlock, price, level, keys) in enumerate(rows):
            Item.objects.get_or_create(
                kind=kind, key=key,
                defaults={"name_i18n": name, "unlock": unlock, "price_coins": price, "unlock_level": level,
                          "sort": sort, "data": {"keys": keys}},
            )
    for sort in range(1, 13):
        key = f"avatar_{sort:02d}"
        Item.objects.get_or_create(kind="avatar", key=key, defaults={"name_i18n": _n(key, key), "sort": sort})
    for key, text in PHRASES.items():
        Phrase.objects.get_or_create(key=key, defaults={"text_i18n": text})


class Migration(migrations.Migration):
    dependencies = [("shop", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
