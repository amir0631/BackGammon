import pytest

from game.engine import dice as fair
from game.engine.board import Position, initial_position
from game.engine.match import Match as Engine
from game.engine.match import Phase, Rules
from game.models import Game, Match, MatchEvent, Move
from game.services import create_match
from realtime import live
from wallet.tests.helpers import make_user


def advance(clock, seconds):
    clock.t += seconds
    for member in live.due_timers():
        live.fire(member)


def types(events):
    return [e["type"] for e in events]


def last(events, type_):
    return next(e for e in reversed(events) if e["type"] == type_)


@pytest.fixture
def game(clock, published, django_capture_on_commit_callbacks):
    a, b = make_user("Alice_1"), make_user("Bobby_1")
    with django_capture_on_commit_callbacks(execute=True):
        match = create_match(a, b, "standard_cube", 3)
    mid = str(match.id)
    live.connect(mid, a.id, "chan-a")
    live.connect(mid, b.id, "chan-b")
    return mid, a, b


def start(clock, published, mid):
    """Fires the opening roll until someone starts; returns the starter's side."""
    for _ in range(20):
        advance(clock, live.OPENING_DELAY)
        rolled = last(published, "turn.rolled")
        if rolled["payload"]["legal"]:
            return live.load(mid).engine.turn
    raise AssertionError("no starter")


def seq(mid):
    return live.load(mid).seq


def user_of(side, a, b):
    return a if side == 0 else b


@pytest.mark.django_db
class TestFlow:
    def test_game_starts_and_opening_roll(self, game, clock, published):
        mid, a, _b = game
        assert types(published)[0] == "game.started"
        starter = start(clock, published, mid)
        opening = last(published, "turn.rolled")["payload"]
        assert opening["opening"] and opening["player"] is None and opening["dice"][0] != opening["dice"][1]
        assert starter == (0 if opening["dice"][0] > opening["dice"][1] else 1)
        state = live.state_envelope(mid, a.id)
        assert state["payload"]["phase"] == "move" and state["payload"]["you"] == 0
        assert state["payload"]["clock"]["actor"] == starter
        assert "phone" not in str(state)

    def test_move_roll_and_seq(self, game, clock, published):
        mid, a, b = game
        side = start(clock, published, mid)
        mover = user_of(side, a, b)
        legal = last(published, "turn.rolled")["payload"]["legal"]
        assert live.handle(mid, mover.id, "turn.move", {"moves": legal[0]}, seq(mid)) == []
        moved = last(published, "turn.moved")["payload"]
        assert moved["player"] == side and moved["moves"] == legal[0] and moved["auto"] is None
        # The event carries the next turn's running clock, so the roller sees their deadline (§5.4).
        assert moved["clock"]["actor"] == 1 - side and moved["clock"]["deadline"] is not None
        other = user_of(1 - side, a, b)
        # A stale seq is ignored and answered with the current state.
        replies = live.handle(mid, other.id, "turn.roll", {}, seq(mid) - 1)
        assert types(replies) == ["match.state"]
        assert live.handle(mid, other.id, "turn.roll", {}, seq(mid)) == []
        rolled = last(published, "turn.rolled")["payload"]
        assert rolled["player"] == 1 - side and len(rolled["dice"]) == 2
        assert Move.objects.filter(game__match_id=mid).count() == 1

    def test_errors_come_with_state(self, game, clock, published):
        mid, a, b = game
        side = start(clock, published, mid)
        other = user_of(1 - side, a, b)
        replies = live.handle(mid, other.id, "turn.move", {"moves": [[13, 7]]}, seq(mid))
        assert types(replies) == ["error", "match.state"]
        assert replies[0]["payload"]["details"]["reason"] == "turn"
        mover = user_of(side, a, b)
        replies = live.handle(mid, mover.id, "turn.move", {"moves": [[1, 0]]}, seq(mid))
        assert replies[0]["payload"]["details"]["reason"] in {"not_legal", "range"}
        stranger = make_user()
        assert live.handle(mid, stranger.id, "turn.roll", {}, 0)[0]["payload"]["code"] == "MATCH_NOT_A_PLAYER"

    def test_turn_timeout_plays_first_legal_move_and_forfeits_after_three(self, game, clock, published):
        mid, a, b = game
        side = start(clock, published, mid)
        state = live.load(mid)
        limit = state.settings["max_consecutive_timeouts"]
        advance(clock, 30 + 90 + 1)
        timeout = last(published, "turn.timeout")["payload"]
        assert (timeout["player"], timeout["count"], timeout["limit"]) == (side, 1, limit)
        assert last(published, "turn.moved")["payload"]["auto"] == "timeout"
        # Keep timing out only on `side`: the other player plays at once.
        for _ in range(10):
            state = live.load(mid)
            if state.status != "active":
                break
            e = state.engine
            if e.turn != side:
                other = user_of(1 - side, a, b)
                if e.phase == Phase.ROLL:
                    live.handle(mid, other.id, "turn.roll", {}, state.seq)
                state = live.load(mid)
                if state.engine.phase == Phase.MOVE and state.engine.turn == 1 - side:
                    plays = state.engine.legal()
                    if plays:
                        live.handle(mid, other.id, "turn.move", {"moves": plays[0].as_lists()}, state.seq)
                advance(clock, 2)  # forced moves and passes
                continue
            advance(clock, 30 + 1 + 90)
        ended = last(published, "match.ended")["payload"]
        assert ended["winner"] == 1 - side and ended["reason"] == "forfeit:timeouts"
        row = Match.objects.get(pk=mid)
        assert row.status == Match.Status.FINISHED and row.winner_side == 1 - side

    def test_time_bank_is_spent_beyond_turn_seconds(self, game, clock, published):
        mid, a, b = game
        side = start(clock, published, mid)
        clock.t += 40  # 10 s beyond the 30 s turn
        legal = live.load(mid).engine.legal()
        live.handle(mid, user_of(side, a, b).id, "turn.move", {"moves": legal[0].as_lists()}, seq(mid))
        assert live.load(mid).clock["bank"][side] == pytest.approx(80)


@pytest.mark.django_db
class TestDisconnect:
    def test_state_carries_rules_and_grace_deadlines(
        self, clock, published, django_capture_on_commit_callbacks
    ):
        a, b = make_user(), make_user()
        with django_capture_on_commit_callbacks(execute=True):
            match = create_match(a, b, "traditional", 3)
        mid = str(match.id)
        live.connect(mid, a.id, "chan-a")
        body = live.state_envelope(mid, a.id)["payload"]
        assert body["rules"]["points"] == {"single": 1, "gammon": 2, "backgammon": 2}
        assert body["rules"]["reconnect_grace_seconds"] == 90 and body["rules"]["payout"] == 0
        # a joined; b has until the deadline to come, or the match aborts.
        assert body["grace"][0] is None
        assert body["grace"][1] == int((clock.t + 90) * 1000)

    def test_grace_then_forfeit(self, game, clock, published):
        mid, _a, b = game
        live.disconnect(mid, b.id, "chan-b")
        dis = last(published, "opponent.disconnected")["payload"]
        assert dis == {"player": 1, "grace_seconds": 90}
        advance(clock, 91)
        ended = last(published, "match.ended")["payload"]
        assert ended["winner"] == 0 and ended["reason"] == "forfeit:disconnect"

    def test_reconnect_within_grace(self, game, clock, published):
        mid, _a, b = game
        live.disconnect(mid, b.id, "chan-b")
        clock.t += 30
        live.connect(mid, b.id, "chan-b2")
        assert last(published, "opponent.back")["payload"] == {"player": 1}
        advance(clock, 120)
        assert "match.ended" not in types(published)

    def test_never_connecting_aborts_with_refund(self, clock, published, django_capture_on_commit_callbacks):
        """No opening roll until both players are in; a no-show ends the match before the first roll,
        so both entries come back and nothing is rated (§7.3)."""
        from wallet import services as wallet_services
        from wallet.models import Wallet
        from wallet.tests.helpers import fund

        a, b = make_user(), make_user()
        fund(a, 100)
        fund(b, 100)
        with django_capture_on_commit_callbacks(execute=True):
            match = create_match(a, b, "standard_nocube", 1, entry=50)
            wallet_services.escrow_match_entries(match.id, [a.id, b.id], 50)
        mid = str(match.id)
        live.connect(mid, a.id, "chan-a")
        advance(clock, 30)
        assert "turn.rolled" not in types(published)
        advance(clock, 61)
        ended = last(published, "match.ended")["payload"]
        assert ended["winner"] is None and ended["reason"] == "aborted:forfeit:disconnect"
        assert ended["settlement"] == {"refund": 50} and ended["elo"] is None
        assert Match.objects.get(pk=mid).status == Match.Status.ABORTED
        assert [Wallet.objects.get(user=u).balance for u in (a, b)] == [100, 100]

    def test_sync_returns_missed_events(self, game, clock, published):
        mid, _a, _b = game
        start(clock, published, mid)
        missed = live.events_since(mid, 1)
        assert missed and missed[0]["seq"] == 2 and missed[-1]["seq"] == seq(mid)
        assert live.events_since(mid, seq(mid)) == []


@pytest.mark.django_db
class TestCubeResignReact:
    def _to_roll_phase(self, game, clock, published):
        mid, a, b = game
        side = start(clock, published, mid)
        legal = live.load(mid).engine.legal()
        live.handle(mid, user_of(side, a, b).id, "turn.move", {"moves": legal[0].as_lists()}, seq(mid))
        return mid, 1 - side, user_of(1 - side, a, b), user_of(side, a, b)

    def test_double_take(self, game, clock, published):
        mid, side, doubler, taker = self._to_roll_phase(game, clock, published)
        assert live.state_envelope(mid, doubler.id)["payload"]["can_double"]
        live.handle(mid, doubler.id, "cube.offer", {}, seq(mid))
        assert last(published, "cube.update")["payload"]["action"] == "offer"
        assert live.load(mid).clock["actor"] == 1 - side  # the taker's decision time
        live.handle(mid, taker.id, "cube.take", {}, seq(mid))
        cube = last(published, "cube.update")["payload"]
        assert (cube["action"], cube["value"], cube["owner"]) == ("take", 2, 1 - side)

    def test_double_drop_ends_game(self, game, clock, published):
        mid, side, doubler, taker = self._to_roll_phase(game, clock, published)
        live.handle(mid, doubler.id, "cube.offer", {}, seq(mid))
        live.handle(mid, taker.id, "cube.drop", {}, seq(mid))
        ended = last(published, "game.ended")["payload"]
        assert (ended["winner"], ended["points"], ended["reason"]) == (side, 1, "drop")
        advance(clock, live.NEXT_GAME_DELAY)
        assert last(published, "game.started")["payload"]["game_no"] == 2
        assert Game.objects.filter(match_id=mid).count() == 2

    def test_unanswered_double_is_taken_on_timeout(self, game, clock, published):
        mid, _side, doubler, _taker = self._to_roll_phase(game, clock, published)
        live.handle(mid, doubler.id, "cube.offer", {}, seq(mid))
        advance(clock, 30 + 90 + 1)
        assert last(published, "cube.update")["payload"]["action"] == "take"

    def test_resign_match(self, game, clock, published):
        mid, a, _b = game
        start(clock, published, mid)
        live.handle(mid, a.id, "match.resign", {"scope": "match"}, 0)
        ended = last(published, "match.ended")["payload"]
        assert ended["winner"] == 1 and ended["reason"] == "resign"
        seed = bytes.fromhex(ended["seed"])
        assert fair.verify_commit(seed, Match.objects.get(pk=mid).seed_commit)
        assert live.handle(mid, a.id, "turn.roll", {}, seq(mid))[0]["payload"]["details"]["reason"] == "ended"

    def test_reactions(self, game, clock, published):
        mid, a, _b = game
        assert live.handle(mid, a.id, "react.send", {"emoji_key": "smile"}, 0) == []
        assert last(published, "react.recv")["payload"] == {"key": "smile", "kind": "emoji", "sender": 0}
        # Player A's own events are recorded as player_a, not system.
        assert MatchEvent.objects.filter(match_id=mid, type="react.recv").get().actor == "player_a"
        rate = live.handle(mid, a.id, "react.send", {"phrase_key": "hello"}, 0)
        assert rate[0]["payload"]["details"]["reason"] == "rate"
        clock.t += 3
        unknown = live.handle(mid, a.id, "react.send", {"phrase_key": "free text!"}, 0)
        assert unknown[0]["payload"]["details"]["reason"] == "unknown"


def play_out(mid, a, b, clock, published):
    """Plays a match to the end with the first legal play every turn."""
    for _ in range(3000):
        state = live.load(mid)
        if state.status != "active":
            return
        e = state.engine
        if e.phase in (Phase.OPENING, Phase.GAME_OVER) or state.auto:
            advance(clock, 3.1)
            continue
        user = user_of(e.turn, a, b)
        if e.phase == Phase.ROLL:
            live.handle(mid, user.id, "turn.roll", {}, state.seq)
        elif e.phase == Phase.MOVE:
            plays = e.legal()
            if plays:
                live.handle(mid, user.id, "turn.move", {"moves": plays[0].as_lists()}, state.seq)
            else:
                advance(clock, 2)
    raise AssertionError("match did not end")


@pytest.mark.django_db
def test_recorded_events_replay_to_the_final_state(clock, published, django_capture_on_commit_callbacks):
    """§16 recording: the match_event log alone rebuilds the final position and score, and the published
    seed reproduces every roll."""
    a, b = make_user(), make_user()
    with django_capture_on_commit_callbacks(execute=True):
        match = create_match(a, b, "standard_nocube", 3)
    mid = str(match.id)
    live.connect(mid, a.id, "ca")
    live.connect(mid, b.id, "cb")
    play_out(mid, a, b, clock, published)

    events = list(MatchEvent.objects.filter(match_id=mid).order_by("seq"))
    assert [e.seq for e in events] == list(range(1, len(events) + 1))
    ended = events[-1]
    assert ended.type == "match.ended"
    seed = bytes.fromhex(ended.payload["seed"])

    engine = Engine.start(Rules.for_variant("standard_nocube", 3))
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
    assert engine.score == ended.payload["score"]
    assert engine.winner == ended.payload["winner"]
    assert engine.position != initial_position()


@pytest.mark.django_db
def test_match_event_is_append_only(game):
    from django.db import DatabaseError, transaction

    mid, _a, _b = game
    with pytest.raises(DatabaseError), transaction.atomic():
        MatchEvent.objects.filter(match_id=mid).update(type="x")
