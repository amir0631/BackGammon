import threading

import pytest
from django.db import DatabaseError, connection, connections, transaction
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from wallet import invariants, ledger, services
from wallet.ledger import LedgerError, WalletInsufficient, user_account
from wallet.models import BankAccount, LedgerEntry, Wallet, WithdrawalRequest
from wallet.tests.helpers import fund, make_user


@pytest.mark.django_db
class TestPost:
    def test_balanced_transaction_updates_wallets(self):
        a, b = make_user(), make_user()
        fund(a, 100)
        ledger.post("transfer", [(user_account(a.id), -30), (user_account(b.id), 30)], "k1")
        assert Wallet.objects.get(user=a).balance == 70
        assert Wallet.objects.get(user=b).balance == 30
        assert invariants.check() == []

    def test_unbalanced_is_rejected(self):
        a = make_user()
        with pytest.raises(LedgerError):
            ledger.post("transfer", [(user_account(a.id), 10), (ledger.PLATFORM_SALES, -9)], "k2")

    @pytest.mark.parametrize("amount", [0, 1.5, True])
    def test_amounts_must_be_non_zero_integers(self, amount):
        with pytest.raises(LedgerError):
            ledger.post("transfer", [(ledger.PLATFORM_SALES, amount), (ledger.PLATFORM_RAKE, -amount)], "k3")

    def test_idempotent_replay(self):
        a = make_user()
        first = ledger.post("admin_topup", [(ledger.PLATFORM_SALES, -50), (user_account(a.id), 50)], "same")
        again = ledger.post("admin_topup", [(ledger.PLATFORM_SALES, -50), (user_account(a.id), 50)], "same")
        assert first.created and not again.created and first.tx_id == again.tx_id
        assert Wallet.objects.get(user=a).balance == 50
        assert LedgerEntry.objects.filter(idempotency_key="same").count() == 2

    def test_insufficient_balance(self):
        a, b = make_user(), make_user()
        fund(a, 10)
        with pytest.raises(WalletInsufficient):
            ledger.post("transfer", [(user_account(a.id), -11), (user_account(b.id), 11)], "k4")
        assert Wallet.objects.get(user=a).balance == 10


@pytest.mark.django_db(transaction=True)
class TestDatabaseGuards:
    def test_entries_cannot_be_updated_or_deleted(self):
        a = make_user()
        fund(a, 10)
        with pytest.raises(DatabaseError), transaction.atomic():
            LedgerEntry.objects.update(amount=999)
        with pytest.raises(DatabaseError), transaction.atomic():
            LedgerEntry.objects.all().delete()

    def test_unbalanced_raw_insert_fails_at_commit(self):
        with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
            cur.execute(
                "INSERT INTO ledger_entry (tx_id, account, amount, type, ref_type, ref_id,"
                " idempotency_key, created_at)"
                " VALUES (gen_random_uuid(), 'platform:rake', 5, 'rake', '', '', 'raw', now())"
            )
        assert not LedgerEntry.objects.filter(idempotency_key="raw").exists()


# ---- Property test (CLAUDE.md §16): random operation sequences keep every §7.8 invariant ----

OPS = st.lists(
    st.tuples(
        st.sampled_from(["fund", "transfer", "withdraw", "cancel", "approve", "bonus"]),
        st.integers(0, 3),
        st.integers(0, 3),
        st.integers(1, 400),
    ),
    min_size=1,
    max_size=25,
)


@pytest.mark.django_db
@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(ops=OPS)
def test_random_operations_keep_invariants(ops):
    from settingsapp import registry

    with transaction.atomic():
        registry.set_value("transfer.daily_max_coins", 10**9)
        registry.set_value("withdraw.daily_max_coins", 10**9)
        registry.set_value("transfer.fee_pct", 3)
        registry.set_value("withdraw.fee_pct", 2)
        users = [make_user() for _ in range(4)]
        for u in users:
            BankAccount.objects.create(user=u, iban="IR000000000000000000000000", bank_code="054")
        pending: list[int] = []
        for i, (op, x, y, amount) in enumerate(ops):
            a, b = users[x], users[y]
            try:
                with transaction.atomic():
                    if op == "fund":
                        fund(a, amount)
                    elif op == "bonus":
                        services.grant_signup_bonus(a)
                    elif op == "transfer":
                        services.transfer(a, b.username, amount, "S3cure-pass!", f"t{i}")
                    elif op == "withdraw":
                        pending.append(services.request_withdrawal(a, amount, f"w{i}").id)
                    elif op == "cancel" and pending:
                        services.cancel_withdrawal(
                            WithdrawalRequest.objects.get(id=pending[0]).user, pending.pop(0)
                        )
                    elif op == "approve" and pending:
                        services.approve_withdrawal(None, pending.pop(0), "REF")
            except Exception as exc:  # business rejections are fine; the ledger must stay consistent
                assert getattr(exc, "code", None) or isinstance(exc, WalletInsufficient), exc
            assert invariants.check() == []
            for w in Wallet.objects.filter(user__in=users):
                assert w.balance >= 0 and w.locked >= 0
        transaction.set_rollback(True)


# ---- Concurrency (CLAUDE.md §16): 50 parallel settlements, no double spend, no deadlock ----


@pytest.mark.django_db(transaction=True)
def test_parallel_transfers_do_not_double_spend_or_deadlock():
    users = [make_user() for _ in range(5)]
    for u in users:
        fund(u, 100)
    errors: list[str] = []

    def worker(i: int) -> None:
        # A never equals B: the offset is 1..4.
        a, b = users[i % 5], users[(i % 5 + 1 + (i // 5) % 4) % 5]
        try:
            ledger.post("transfer", [(user_account(a.id), -30), (user_account(b.id), 30)], f"par{i}")
        except WalletInsufficient:
            pass
        except Exception as exc:
            errors.append(repr(exc))
        finally:
            connections.close_all()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(50)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads), "deadlock or hang"
    assert errors == []
    balances = list(Wallet.objects.filter(user__in=users).values_list("balance", flat=True))
    assert all(b >= 0 for b in balances)
    assert sum(balances) == 500
    assert invariants.check() == []
