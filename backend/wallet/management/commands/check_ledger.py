from typing import Any

from django.core.management.base import BaseCommand, CommandError

from wallet import invariants


class Command(BaseCommand):
    help = "Check the ledger invariants of CLAUDE.md §7.8; exits non-zero on any violation."

    def handle(self, *args: Any, **options: Any) -> None:
        problems = invariants.check()
        if problems:
            raise CommandError("\n".join(problems))
        self.stdout.write("Ledger invariants hold.")
