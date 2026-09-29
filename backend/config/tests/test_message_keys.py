"""§2 rule 8: every error the API can return carries a message_key that exists in both catalogs
(packages/i18n/messages/{fa,en}.json, admin errors in admin.{fa,en}.json)."""

import importlib
import json
import pkgutil
import re
from pathlib import Path

from django.apps import apps

from config.errors import AppError

BACKEND = Path(__file__).resolve().parents[2]
MESSAGES = BACKEND.parent / "packages" / "i18n" / "messages"


def _import_all() -> None:
    for config in apps.get_app_configs():
        if not str(config.path).startswith(str(BACKEND)):
            continue
        for info in pkgutil.walk_packages([config.path], f"{config.name}."):
            if any(p in info.name for p in (".tests", ".migrations", ".management")):
                continue
            importlib.import_module(info.name)


def _subclasses(cls: type[AppError]) -> set[type[AppError]]:
    out: set[type[AppError]] = set()
    for sub in cls.__subclasses__():
        out |= {sub, *_subclasses(sub)}
    return out


def used_keys() -> set[str]:
    _import_all()
    keys = {c.message_key for c in _subclasses(AppError)}
    for path in BACKEND.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        keys |= set(re.findall(r'"(errors\.[A-Za-z0-9_]+\.[A-Za-z0-9_.]+)"', path.read_text()))
    return keys


def _has(tree: dict[str, object], key: str) -> bool:
    node: object = tree
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return isinstance(node, str)


def test_every_error_key_is_translated():
    keys = used_keys()
    assert "errors.wallet.insufficient" in keys  # the scan sees the error modules
    for lang in ("fa", "en"):
        player = json.loads((MESSAGES / f"{lang}.json").read_text())
        admin = json.loads((MESSAGES / f"admin.{lang}.json").read_text())
        missing = sorted(k for k in keys if not (_has(player, k) or _has(admin, k)))
        assert missing == [], f"{lang}: {missing}"
