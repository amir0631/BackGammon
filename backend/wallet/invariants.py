"""Ledger invariants (CLAUDE.md §7.8), run hourly and in tests."""

from django.db import connection


def check() -> list[str]:
    problems: list[str] = []
    with connection.cursor() as cursor:
        # 1. Every transaction sums to zero.
        cursor.execute("SELECT tx_id FROM ledger_entry GROUP BY tx_id HAVING SUM(amount) <> 0 LIMIT 100")
        problems += [f"unbalanced tx {row[0]}" for row in cursor.fetchall()]

        # 2. Every wallet equals the sum of its user account.
        cursor.execute(
            """
            SELECT w.user_id, w.balance, COALESCE(l.total, 0)
            FROM wallet w
            LEFT JOIN (
                SELECT account, SUM(amount) AS total FROM ledger_entry
                WHERE account LIKE 'user:%%' GROUP BY account
            ) l ON l.account = 'user:' || w.user_id
            WHERE w.balance <> COALESCE(l.total, 0)
            LIMIT 100
            """
        )
        problems += [f"wallet {uid} balance {bal} != ledger {total}" for uid, bal, total in cursor.fetchall()]

        # A user account with ledger rows but no wallet row is also a mismatch.
        cursor.execute(
            """
            SELECT DISTINCT l.account FROM ledger_entry l
            LEFT JOIN wallet w ON l.account = 'user:' || w.user_id
            WHERE l.account LIKE 'user:%%' AND w.user_id IS NULL LIMIT 100
            """
        )
        problems += [f"ledger account {row[0]} has no wallet" for row in cursor.fetchall()]

        # 3. Conservation: issued coins (sales + rewards outflows) minus sinks, rake, and payouts
        #    equal user balances plus open escrows. With every tx balanced this is the same as the
        #    whole ledger summing to zero, checked explicitly as a guard against direct SQL edits.
        cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM ledger_entry")
        total = cursor.fetchone()[0]
        if total != 0:
            problems.append(f"ledger total {total} != 0")
    return problems
