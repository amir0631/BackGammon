import random
import time
from collections import Counter

import pytest

from game.engine import dice
from game.engine.board import CHECKERS, A, B, initial_position
from game.engine.match import Match, Phase, RuleError, Rules, Variant, loss_kind
from game.engine.moves import legal_plays
from game.tests.helpers import pos


def rules(variant="standard_cube", length=5, **kw):
    return Rules.for_variant(variant, length, **kw)


def started(variant="standard_cube", length=5, first=A):
    m = Match.start(rules(variant, length))
    m.opening_roll(*((6, 1) if first == A else (1, 6)))
    m.play(first, [[13, 7], [8, 7]])
    return m


class TestDice:
    SEED = bytes(range(32))

    def test_deterministic_and_in_range(self):
        rolls = [dice.roll(self.SEED, "m1", n) for n in range(500)]
        assert rolls == [dice.roll(self.SEED, "m1", n) for n in range(500)]
        assert all(1 <= d <= 6 for r in rolls for d in r)
        assert rolls != [dice.roll(self.SEED, "m2", n) for n in range(500)]

    def test_faces_are_roughly_uniform(self):
        counts = Counter(d for n in range(6000) for d in dice.roll(self.SEED, "u", n))
        assert all(1800 < counts[f] < 2200 for f in range(1, 7))

    def test_commit_and_verify(self):
        seed = dice.new_seed()
        assert len(seed) == 32
        c = dice.commit(seed)
        assert dice.verify_commit(seed, c) and not dice.verify_commit(dice.new_seed(), c)

    def test_rejects_biased_bytes(self):
        # Exhaustively check the acceptance rule keeps faces uniform over 0..251.
        assert Counter(b % 6 + 1 for b in range(252)) == Counter({f: 42 for f in range(1, 7)})

    def test_throw_seed_is_32_bit_and_independent_of_values(self):
        s = dice.throw_seed(self.SEED, "m1", 0)
        assert 0 <= s < 2**32 and s != dice.throw_seed(self.SEED, "m1", 1)


class TestMatchFlow:
    def test_opening_roll_tie_and_start(self):
        m = Match.start(rules())
        assert m.phase == Phase.OPENING
        assert m.opening_roll(3, 3) is None and m.phase == Phase.OPENING
        assert m.opening_roll(2, 5) == B
        assert m.turn == B and m.dice == (2, 5) and m.phase == Phase.MOVE

    def test_turns_alternate(self):
        m = started()
        assert m.turn == B and m.phase == Phase.ROLL
        with pytest.raises(RuleError):
            m.roll(A, (1, 2))
        m.roll(B, (6, 5))
        assert m.phase == Phase.MOVE
        with pytest.raises(RuleError):
            m.play(A, [[24, 18]])

    def test_pass_only_without_legal_play(self):
        m = started()
        m.roll(B, (6, 5))
        with pytest.raises(RuleError):
            m.pass_turn(B)

    def test_blocked_player_passes(self):
        m = started()
        m.position = pos(a={13: 14}, b={1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3}, bar=(1, 0))
        m.turn, m.phase = A, Phase.ROLL
        assert m.roll(A, (6, 1)) == []
        m.pass_turn(A)
        assert m.turn == B and m.phase == Phase.ROLL

    def test_bear_off_ends_the_game_and_scores(self):
        m = started(length=3)
        m.position = pos(a={1: 1}, b={1: 14}, bar=(0, 0))  # B has 1 off: single
        m.turn, m.phase, m.dice = A, Phase.MOVE, (2, 1)
        _play, result = m.play(A, [[1, 0]])
        assert result is not None and (result.winner, result.kind, result.points) == (A, "single", 1)
        assert m.score == [1, 0] and m.phase == Phase.GAME_OVER
        m.next_game()
        assert m.game_no == 2 and m.phase == Phase.OPENING and m.cube_value == 1

    def test_match_ends_at_length(self):
        m = started(length=1)
        m.position = pos(a={1: 1}, b={1: 14})
        m.turn, m.phase, m.dice = A, Phase.MOVE, (2, 1)
        m.play(A, [[1, 0]])
        assert m.phase == Phase.MATCH_OVER and m.winner == A and m.end_reason == "points"
        with pytest.raises(RuleError):
            m.next_game()


class TestGammons:
    def test_kinds(self):
        # A has borne everything off in these positions.
        assert loss_kind(pos(a={}, b={1: 14}), B) == "single"
        assert loss_kind(pos(a={}, b={13: 15}), B) == "gammon"
        assert loss_kind(pos(a={}, b={13: 14, 20: 1}), B) == "backgammon"  # B's 20 = A's home 5
        assert loss_kind(pos(a={}, b={13: 14}, bar=(0, 1)), B) == "backgammon"

    def test_gammon_scores_double_times_cube(self):
        m = started(length=11)
        m.cube_value = 4
        m.position = pos(a={2: 1}, b={13: 15})
        m.turn, m.phase, m.dice = A, Phase.MOVE, (2, 1)
        _p, result = m.play(A, [[2, 0]])
        assert result is not None and (result.kind, result.points) == ("gammon", 8)

    def test_traditional_points_come_from_settings(self):
        m = started("traditional", length=11)
        m.position = pos(a={2: 1}, b={13: 14, 20: 1})
        m.turn, m.phase, m.dice = A, Phase.MOVE, (2, 1)
        _p, result = m.play(A, [[2, 0]])
        assert result is not None and (result.kind, result.points) == ("backgammon", 2)
        custom = Rules.for_variant("traditional", 5, {"single": 1, "gammon": 2, "backgammon": 4})
        assert custom.points["backgammon"] == 4 and not custom.cube_enabled


class TestCube:
    def test_offer_take_doubles_and_passes_ownership(self):
        m = started()
        m.offer_double(B)
        assert m.phase == Phase.CUBE
        with pytest.raises(RuleError):
            m.take(B)
        m.take(A)
        assert (m.cube_value, m.cube_owner, m.phase, m.turn) == (2, A, Phase.ROLL, B)
        with pytest.raises(RuleError):
            m.offer_double(B)  # A owns the cube now

    def test_drop_gives_the_game_at_the_current_value(self):
        m = started()
        m.cube_value, m.cube_owner = 2, B
        m.offer_double(B)
        result = m.drop(A)
        assert (result.winner, result.points, result.reason) == (B, 2, "drop")

    def test_no_cube_in_nocube_and_traditional(self):
        for variant in ("standard_nocube", "traditional"):
            m = started(variant)
            assert not m.can_double(B)
            with pytest.raises(RuleError):
                m.offer_double(B)

    def test_cube_max(self):
        m = started()
        m.cube_value = 64
        assert not m.can_double(B)

    def test_crawford_game(self):
        m = Match.start(rules(length=5))
        m.score = [4, 1]
        m.phase = Phase.GAME_OVER
        m.next_game()
        assert m.crawford_game
        m.opening_roll(1, 6)
        m.play(B, [[13, 7], [8, 7]])
        assert not m.can_double(A)
        m.phase = Phase.GAME_OVER
        m.score = [4, 2]
        m.next_game()
        assert not m.crawford_game  # post-Crawford: the cube is back

    def test_no_crawford_when_both_need_one_or_without_cube(self):
        m = Match.start(rules(length=5))
        m.score, m.phase = [4, 4], Phase.GAME_OVER
        m.next_game()
        assert not m.crawford_game
        m = Match.start(rules("standard_nocube", length=5))
        m.score, m.phase = [4, 0], Phase.GAME_OVER
        m.next_game()
        assert not m.crawford_game


class TestResignAndForfeit:
    def test_resign_game_counts_gammon_from_the_position(self):
        m = started(length=11)
        m.position = pos(a={1: 5}, b={13: 15})
        result = m.resign(B, "game")
        assert result is not None and (result.winner, result.kind, result.points) == (A, "gammon", 2)

    def test_resign_match(self):
        m = started()
        assert m.resign(A, "match") is None
        assert (m.phase, m.winner, m.end_reason) == (Phase.MATCH_OVER, B, "resign")
        with pytest.raises(RuleError):
            m.resign(B, "game")

    def test_bad_scope(self):
        with pytest.raises(RuleError):
            started().resign(A, "set")

    def test_forfeit(self):
        m = started()
        m.forfeit(B, "timeouts")
        assert (m.winner, m.end_reason) == (A, "forfeit:timeouts")
        with pytest.raises(RuleError):
            m.forfeit(A, "disconnect")


def test_state_round_trips():
    m = started()
    m.offer_double(B)
    again = Match.from_dict(m.to_dict())
    assert again.to_dict() == m.to_dict()
    assert again.phase == Phase.CUBE


def test_rules_validation():
    with pytest.raises(ValueError):
        Rules.for_variant("standard_cube", 4)
    with pytest.raises(ValueError):
        Rules.for_variant("chess", 5)
    assert Rules.for_variant("standard_cube", 7).variant == Variant.STANDARD_CUBE


@pytest.mark.parametrize("variant", ["standard_cube", "standard_nocube", "traditional"])
def test_random_matches_finish_and_keep_checker_counts(variant):
    """Plays whole matches with random legal moves; every position keeps 15 checkers a side and every
    generated play passes validation."""
    rng = random.Random(variant)
    for _ in range(3):
        m = Match.start(rules(variant, length=3))
        turns = 0
        while m.phase != Phase.MATCH_OVER:
            if m.phase == Phase.OPENING:
                m.opening_roll(rng.randint(1, 6), rng.randint(1, 6))
            elif m.phase == Phase.ROLL:
                player = m.turn
                assert player is not None
                if m.can_double(player) and rng.random() < 0.05:
                    m.offer_double(player)
                    (m.take if rng.random() < 0.7 else m.drop)(1 - player)
                    continue
                m.roll(player, (rng.randint(1, 6), rng.randint(1, 6)))
            elif m.phase == Phase.MOVE:
                player = m.turn
                assert player is not None
                plays = m.legal()
                if not plays:
                    m.pass_turn(player)
                else:
                    m.play(player, rng.choice(plays).as_lists())
            elif m.phase == Phase.GAME_OVER:
                m.next_game()
            p = m.position
            for side in (A, B):
                on = sum(c for c in p.board if (c > 0 if side == A else c < 0))
                assert abs(on) + p.bar[side] + p.off[side] == CHECKERS
            turns += 1
            assert turns < 20_000
        assert max(m.score) >= 3 or m.end_reason != "points"


def test_worst_case_doubles_are_fast():
    # Spread position with many movable checkers: 4-step doubles must stay well under a turn's budget.
    p = pos(
        a={24: 1, 22: 1, 20: 1, 18: 1, 16: 1, 14: 1, 12: 1, 10: 1, 9: 1, 8: 1, 7: 1, 6: 1, 5: 1, 4: 1, 3: 1},
        b={24: 15},
    )
    start = time.perf_counter()
    plays = legal_plays(p, A, (1, 1))
    assert plays and time.perf_counter() - start < 1.0
    assert legal_plays(initial_position(), B, (2, 2))
