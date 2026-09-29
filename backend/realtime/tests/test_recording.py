"""§16 recording: for many simulated matches (every variant, cube play, resigns, timeouts, forfeits),
replaying the recorded match_event log through the engine reproduces the final position, score, and
settlement exactly, and the published seed reproduces every roll.

CI plays RECORDING_MATCHES matches (default 24); set RECORDING_MATCHES=1000 for the full §16 run."""

import hashlib
import os

import pytest

from game.engine import dice as fair
from game.engine.board import Position
from game.engine.match import Match as Engine
from game.engine.match import Phase, Rules
from game.models import Match, MatchEvent
from game.services import create_match
from realtime import live
from wallet import invariants
from wallet import services as wallet
from wallet.models import Wallet
from wallet.tests.helpers import fund, make_user

MATCHES = int(os.environ.get("RECORDING_MATCHES", "24"))
VARIANTS = ("standard_cube", "standard_nocube", "traditional")
LENGTHS = (1, 3, 5)
ENTRIES = (0, 50, 100)


class Chooser:
    """Deterministic choices for the simulated players (no `random`: runs are reproducible)."""

    def __init__(self, tag: str) -> None:
        self.tag, self.n = tag, 0

    def below(self, k: int) -> int:
        self.n += 1
        return int.from_bytes(hashlib.sha256(f"{self.tag}:{self.n}".encode()).digest()[:4], "big") % k


def advance(clock, seconds):
    clock.t += seconds
    for member in live.due_timers():
        live.fire(member)


def simulate(mid, users, clock, pick):
    for _ in range(6000):
        s = live.load(mid)
        if s.status != "active":
            return
        e = s.engine
        if e.phase in (Phase.OPENING, Phase.GAME_OVER) or s.auto:
            advance(clock, 3.1)
            continue
        turn = e.turn
        assert turn is not None
        user = users[turn]
        other = users[1 - turn]
        roll = pick.below(1000)
        if roll < 2:  # a rare resignation, of the game or the whole match
            live.handle(mid, user.id, "match.resign", {"scope": "match" if roll == 0 else "game"}, s.seq)
        elif roll < 12 and e.phase in (Phase.ROLL, Phase.MOVE):  # a turn left to the clock
            advance(clock, s.settings["turn_seconds"] + s.settings["timebank_seconds"] + 1)
        elif e.phase == Phase.CUBE:
            live.handle(mid, other.id, "cube.take" if pick.below(3) else "cube.drop", {}, s.seq)
        elif e.phase == Phase.ROLL:
            if e.can_double(turn) and pick.below(8) == 0:
                live.handle(mid, user.id, "cube.offer", {}, s.seq)
            else:
                live.handle(mid, user.id, "turn.roll", {}, s.seq)
        elif e.phase == Phase.MOVE:
            plays = e.legal()
            if plays:
                chosen = plays[pick.below(len(plays))]
                live.handle(mid, user.id, "turn.move", {"moves": chosen.as_lists()}, s.seq)
            else:
                advance(clock, 2)
    raise AssertionError("match did not end")


def rebuild(match: Match, events: list[MatchEvent]) -> Engine:
    """The match from its event log alone."""
    ended = events[-1]
    seed = bytes.fromhex(ended.payload["seed"])
    mid = str(match.id)
    engine = Engine.start(Rules.for_variant(match.variant, match.length, match.rules["traditional_points"]))
    n = 0
    for ev in events:
        p = ev.payload
        if ev.type == "game.started" and p["game_no"] > 1:
            engine.next_game()
        elif ev.type == "turn.rolled":
            assert list(fair.roll(seed, mid, n)) == p["dice"]
            assert fair.throw_seed(seed, mid, n) == p["throw_seed"]
            n += 1
            if p["opening"]:
                engine.opening_roll(*p["dice"])
            else:
                engine.roll(p["player"], tuple(p["dice"]))
        elif ev.type == "turn.moved":
            engine.play(p["player"], p["moves"])
            assert engine.position == Position.decode(p["position"])
        elif ev.type == "turn.passed":
            engine.pass_turn(p["player"])
        elif ev.type == "cube.update":
            {"offer": engine.offer_double, "take": engine.take, "drop": engine.drop}[p["action"]](p["player"])
            assert engine.cube_value == p["value"] and engine.cube_owner == p["owner"]
        elif ev.type == "game.ended":
            if p["reason"] == "resign":
                engine.resign(1 - p["winner"], "game")
            assert engine.results[-1].as_dict() == {k: p[k] for k in engine.results[-1].as_dict()}
            assert engine.score == p["score"]
        elif ev.type == "match.ended" and engine.phase != Phase.MATCH_OVER:
            if p["reason"] == "resign":
                engine.resign(1 - p["winner"], "match")
            elif p["reason"].startswith("forfeit:"):
                engine.forfeit(1 - p["winner"], p["reason"].split(":", 1)[1])
    return engine


@pytest.mark.django_db
@pytest.mark.parametrize("i", range(MATCHES))
def test_event_log_reproduces_the_match(i, clock, published, django_capture_on_commit_callbacks):
    variant, length, entry = VARIANTS[i % 3], LENGTHS[(i // 3) % 3], ENTRIES[(i // 9) % 3]
    a, b = make_user(), make_user()
    for u in (a, b):
        fund(u, 1000)
    with django_capture_on_commit_callbacks(execute=True):
        match = create_match(a, b, variant, length, entry=entry)
        wallet.escrow_match_entries(match.id, [a.id, b.id], entry)
    mid = str(match.id)
    live.connect(mid, a.id, "ca")
    live.connect(mid, b.id, "cb")
    with django_capture_on_commit_callbacks(execute=True):
        simulate(mid, [a, b], clock, Chooser(f"rec:{i}"))

    match.refresh_from_db()
    events = list(MatchEvent.objects.filter(match_id=mid).order_by("seq"))
    assert [e.seq for e in events] == list(range(1, len(events) + 1))  # nothing lost
    assert events[-1].type == "match.ended"
    assert fair.verify_commit(bytes.fromhex(events[-1].payload["seed"]), match.seed_commit)

    engine = rebuild(match, events)
    assert engine.phase == Phase.MATCH_OVER
    assert engine.winner == match.winner_side == events[-1].payload["winner"]
    assert engine.score == [match.score_a, match.score_b] == events[-1].payload["score"]
    assert (engine.end_reason or "") == match.end_reason

    # The settlement follows from the rebuilt result and the snapshotted rake.
    pot = entry * 2
    rake = pot * int(match.rules["table_rake_pct"]) // 100
    winner, loser = (a, b) if engine.winner == 0 else (b, a)
    assert Wallet.objects.get(user=winner).balance == 1000 - entry + pot - rake
    assert Wallet.objects.get(user=loser).balance == 1000 - entry
    settlement = events[-1].payload["settlement"]
    assert settlement == ({"entry": entry, "pot": pot, "rake": rake, "payout": pot - rake} if entry else None)
    assert invariants.check() == []
