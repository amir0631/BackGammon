from realtime import protocol, ts


def test_typescript_types_match_the_pydantic_models():
    """CLAUDE.md §10.3: TS and pydantic message definitions stay in sync. Fix: manage.py protocol_ts."""
    assert ts.TS_PATH.read_text() == ts.generate()


def test_every_envelope_type_has_a_model():
    assert "turn.move" in protocol.CLIENT_MESSAGES and "turn.moved" in protocol.SERVER_MESSAGES
    assert set(protocol.CLIENT_MESSAGES).isdisjoint({"error", "match.state"})
