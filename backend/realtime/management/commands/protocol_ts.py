from typing import Any

from django.core.management.base import BaseCommand

from realtime import ts


class Command(BaseCommand):
    help = "Regenerate packages/protocol/src/ws.ts from the pydantic WebSocket models."

    def handle(self, *args: Any, **options: Any) -> None:
        ts.TS_PATH.write_text(ts.generate())
        self.stdout.write(f"wrote {ts.TS_PATH}")
