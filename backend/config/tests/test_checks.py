from config import checks

GOOD = {
    "APP_ENV": "production",
    "DEBUG": False,
    "URL_SCHEME": "https",
    "SECRET_KEY": "a" * 40,
    "JWT_SIGNING_KEY": "b" * 40,
    "ADMIN_SECRET_KEY": "c" * 40,
    "SEED_ENCRYPTION_KEY": "k",
}


def test_production_with_distinct_strong_keys_passes(settings):
    for name, value in GOOD.items():
        setattr(settings, name, value)
    assert checks.production_problems() == []
    assert checks.check_production() == []


def test_production_refuses_insecure_configuration(settings):
    for name, value in GOOD.items():
        setattr(settings, name, value)
    settings.DEBUG = True
    settings.URL_SCHEME = "http"
    settings.JWT_SIGNING_KEY = settings.SECRET_KEY  # the default fallback
    settings.ADMIN_SECRET_KEY = "change-me"
    settings.SEED_ENCRYPTION_KEY = ""
    problems = " ".join(checks.production_problems())
    for fragment in (
        "DJANGO_DEBUG",
        "https",
        "ADMIN_SECRET_KEY must be",
        "must all differ",
        "SEED_ENCRYPTION_KEY",
    ):
        assert fragment in problems
    assert {e.id for e in checks.check_production()} == {"config.E001"}


def test_other_environments_are_not_checked(settings):
    settings.APP_ENV = "staging"
    settings.DEBUG = True
    assert checks.production_problems() == []
