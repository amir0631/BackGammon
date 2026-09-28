"""Reference positions for CLAUDE.md §5.5 and move validation."""

import pytest

from game.engine import IllegalMove, legal_plays, validate_play
from game.engine.board import A, B, Position, initial_position, pip_count, view
from game.tests.helpers import pos


def finals(plays):
    return {p.position for p in plays}


class TestPosition:
    def test_initial_position(self):
        p = initial_position()
        assert pip_count(p, A) == pip_count(p, B) == 167
        mine, theirs = view(p, B)
        assert mine[24] == 2 and mine[13] == 5 and mine[8] == 3 and mine[6] == 5
        assert theirs[1] == 2  # A's 24-point is B's 1-point

    def test_encode_round_trip(self):
        p = pos(a={6: 3, 1: 2}, b={20: 1}, bar=(1, 2))
        assert Position.decode(p.encode()) == p
        assert len(initial_position().encode()) < 80

    @pytest.mark.parametrize("text", ["1,2,3", ",".join(["0"] * 28), ",".join(["15"] + ["0"] * 27)])
    def test_invalid_positions(self, text):
        with pytest.raises(ValueError):
            Position.decode(text)

    def test_board_needs_24_points(self):
        with pytest.raises(ValueError):
            Position((0,) * 23)


class TestOpeningMoves:
    def test_31_makes_the_five_point_among_16_plays(self):
        plays = legal_plays(initial_position(), A, (3, 1))
        assert all(len(p.steps) == 2 for p in plays)
        made_five = pos(a={24: 2, 13: 5, 8: 2, 6: 4, 5: 2}, b={24: 2, 13: 5, 8: 3, 6: 5})
        assert made_five in finals(plays)
        assert len(plays) == 16

    def test_doubles_move_four_times(self):
        plays = legal_plays(initial_position(), A, (6, 6))
        assert plays and all(len(p.steps) == 4 for p in plays)

    def test_b_moves_the_mirror_way(self):
        a_plays = legal_plays(initial_position(), A, (6, 5))
        b_plays = legal_plays(initial_position(), B, (6, 5))
        assert sorted(p.as_lists() for p in a_plays) == sorted(p.as_lists() for p in b_plays)


class TestBar:
    # A enters on absolute 25 - die, which is B's own point `die` (B's home board).

    def test_bar_checker_must_enter_first(self):
        p = pos(a={13: 14}, b={1: 13}, bar=(1, 0))
        plays = legal_plays(p, A, (4, 2))
        assert plays and all(play.steps[0].frm == 25 for play in plays)

    def test_entry_can_hit(self):
        p = pos(a={13: 14}, b={4: 1, 20: 12}, bar=(1, 0))
        play = validate_play(p, A, (4, 2), [[25, 21], [21, 19]])
        assert play.steps[0].hit and play.position.bar == (0, 1)

    def test_blocked_entry_has_no_play(self):
        p = pos(a={13: 14}, b={1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3}, bar=(1, 0))
        assert legal_plays(p, A, (6, 1)) == []
        assert validate_play(p, A, (6, 1), []).steps == ()

    def test_enter_then_play_the_other_die(self):
        p = pos(a={13: 14}, b={1: 2, 2: 2, 3: 2, 4: 2, 6: 2, 13: 5}, bar=(1, 0))  # only B's 5 open
        plays = legal_plays(p, A, (5, 3))
        assert plays and all(play.steps[0].as_list() == [25, 20] and len(play.steps) == 2 for play in plays)

    def test_two_on_bar_one_entry_point_plays_one_die(self):
        p = pos(a={13: 13}, b={1: 2, 2: 2, 3: 2, 4: 2, 6: 2, 13: 5}, bar=(2, 0))
        assert [play.as_lists() for play in legal_plays(p, A, (5, 3))] == [[[25, 20]]]

    def test_hit_sends_checker_to_the_bar(self):
        p = pos(a={13: 15}, b={13: 1, 20: 14})  # B's blot on its 13 = absolute 12
        play = validate_play(p, A, (1, 2), [[13, 12], [12, 10]])
        assert play.steps[0].hit and not play.steps[1].hit
        assert play.position.bar == (0, 1)


class TestBearOff:
    def test_exact_dice_bear_off(self):
        p = pos(a={6: 1, 3: 1}, b={24: 15})
        assert validate_play(p, A, (6, 3), [[6, 0], [3, 0]]).position.winner() == A

    def test_higher_die_only_from_the_highest_point(self):
        p = pos(a={4: 1, 2: 1}, b={24: 15})
        assert [pl.as_lists() for pl in legal_plays(p, A, (6, 5))] == [[[4, 0], [2, 0]]]
        with pytest.raises(IllegalMove):
            validate_play(
                p, A, (6, 5), [[2, 0], [4, 0]]
            )  # a 2 cannot go off with a 5 or 6 while 4 is occupied

    def test_cannot_bear_off_with_a_checker_outside(self):
        p = pos(a={7: 1, 2: 1}, b={24: 15})
        with pytest.raises(IllegalMove):
            validate_play(p, A, (6, 2), [[2, 0], [7, 1]])

    def test_bear_off_after_coming_home_in_the_same_turn(self):
        p = pos(a={7: 1, 2: 1}, b={13: 15})
        assert validate_play(p, A, (6, 2), [[7, 1], [2, 0]]).position.off[A] == 14

    def test_small_doubles_move_inside_all_four(self):
        p = pos(a={6: 2}, b={24: 15})
        assert all(len(pl.steps) == 4 for pl in legal_plays(p, A, (1, 1)))


class TestDiceUsage:
    def test_doubles_partial_use(self):
        # 24/18 is open, 18/12 is blocked (B's 13 = absolute 12); the checkers on 1 cannot move.
        p = pos(a={24: 1, 1: 14}, b={13: 2, 3: 13})
        assert [pl.as_lists() for pl in legal_plays(p, A, (6, 6))] == [[[24, 18]]]

    def test_must_use_both_dice_when_possible(self):
        # 20/14 is blocked (B's 11 = absolute 14), so the 5 must go first: 20/15/9.
        p = pos(a={20: 1, 1: 14}, b={11: 2, 20: 13})
        assert [pl.as_lists() for pl in legal_plays(p, A, (6, 5))] == [[[20, 15], [15, 9]]]
        with pytest.raises(IllegalMove):
            validate_play(p, A, (6, 5), [[20, 15]])

    def test_only_one_die_playable_must_be_the_larger(self):
        # 8/2 or 8/3 alone are possible; after either, the other die cannot be played (the 24s are
        # blocked on absolute 18 and 19 and A cannot bear off with a checker on 24).
        p = pos(a={8: 1, 24: 14}, b={7: 2, 6: 2, 12: 11})
        assert {pl.dice_used for pl in legal_plays(p, A, (6, 5))} == {(6,)}
        with pytest.raises(IllegalMove):
            validate_play(p, A, (6, 5), [[8, 3]])
        assert validate_play(p, A, (6, 5), [[8, 2]]).position.board[1] == 1

    def test_dice_out_of_range(self):
        with pytest.raises(ValueError):
            legal_plays(initial_position(), A, (0, 7))


class TestValidation:
    def test_every_generated_play_validates(self):
        for dice in [(6, 5), (3, 3), (2, 1), (4, 4)]:
            for play in legal_plays(initial_position(), A, dice):
                assert validate_play(initial_position(), A, dice, play.as_lists()).position == play.position

    def test_order_of_steps_can_differ(self):
        p = initial_position()
        one = validate_play(p, A, (6, 1), [[13, 7], [8, 7]])
        two = validate_play(p, A, (6, 1), [[8, 7], [13, 7]])
        assert one.position == two.position

    @pytest.mark.parametrize(
        "moves",
        [
            [[13, 7]],  # uses one die when two are playable
            [[13, 7], [13, 7]],  # 6 twice without doubles
            [[24, 18], [18, 13]],  # 5 not rolled
            [[6, 0], [8, 7]],  # bearing off while checkers are outside
            [["13", 7], [8, 7]],
            [[13, 7, 1]],
            [[5, 9], [8, 7]],  # backwards
        ],
    )
    def test_illegal(self, moves):
        with pytest.raises(IllegalMove):
            validate_play(initial_position(), A, (6, 1), moves)

    def test_blocked_point(self):
        with pytest.raises(IllegalMove):
            validate_play(initial_position(), A, (5, 1), [[24, 19], [19, 18]])  # B holds A's 19 (its 6)

    def test_empty_move_when_a_move_exists(self):
        with pytest.raises(IllegalMove):
            validate_play(initial_position(), A, (6, 1), [])


def test_engine_has_no_django_imports():
    """CLAUDE.md §4: game/engine is pure Python so the bot service can reuse it."""
    import pathlib

    for path in pathlib.Path(__file__).resolve().parents[1].joinpath("engine").glob("*.py"):
        text = path.read_text()
        assert "django" not in text and "rest_framework" not in text, path.name
