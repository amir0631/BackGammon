from django.db import migrations

# CLAUDE.md §15: ledger_entry is append-only (no UPDATE or DELETE), enforced in the database.
# A deferred constraint trigger also rejects, at commit, any transaction whose entries do not
# sum to zero, so even raw SQL cannot unbalance the ledger.
FORWARD = """
CREATE FUNCTION ledger_entry_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entry is append-only';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_no_update_delete
BEFORE UPDATE OR DELETE ON ledger_entry
FOR EACH ROW EXECUTE FUNCTION ledger_entry_immutable();

CREATE FUNCTION ledger_tx_balanced() RETURNS trigger AS $$
BEGIN
    IF (SELECT COALESCE(SUM(amount), 0) FROM ledger_entry WHERE tx_id = NEW.tx_id) <> 0 THEN
        RAISE EXCEPTION 'ledger transaction % does not sum to zero', NEW.tx_id;
    END IF;
    RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced
AFTER INSERT ON ledger_entry
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ledger_tx_balanced();
"""

BACKWARD = """
DROP TRIGGER IF EXISTS ledger_entry_balanced ON ledger_entry;
DROP FUNCTION IF EXISTS ledger_tx_balanced();
DROP TRIGGER IF EXISTS ledger_entry_no_update_delete ON ledger_entry;
DROP FUNCTION IF EXISTS ledger_entry_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [("wallet", "0001_initial")]

    operations = [migrations.RunSQL(FORWARD, BACKWARD)]
