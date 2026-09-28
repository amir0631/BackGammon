from typing import Any

from django.core.management.base import BaseCommand

from game import ts_fixtures


class Command(BaseCommand):
    help = "Regenerate packages/game-core/fixtures/legal.json from the engine."

    def handle(self, *args: Any, **options: Any) -> None:
        ts_fixtures.PATH.write_text(ts_fixtures.generate())
        self.stdout.write(f"wrote {ts_fixtures.PATH}")
