from django.db import migrations

# CLAUDE.md §15: match_event is append-only, enforced in the database.
FORWARD = """
CREATE FUNCTION match_event_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'match_event is append-only';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER match_event_no_update_delete
BEFORE UPDATE OR DELETE ON match_event
FOR EACH ROW EXECUTE FUNCTION match_event_immutable();
"""

BACKWARD = """
DROP TRIGGER IF EXISTS match_event_no_update_delete ON match_event;
DROP FUNCTION IF EXISTS match_event_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [("game", "0001_initial")]

    operations = [migrations.RunSQL(FORWARD, BACKWARD)]
