import math
from unittest.mock import Mock

import pytest

from pokerlab_api.cfr import InformationSet, RiverCFRSolver, verify_kuhn
from pokerlab_api.domain import Card
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine

BOARD = tuple(map(Card.parse, "Ah Kd 7s 3c 2d".split()))


class UncachedRiverSolver(RiverCFRSolver):
    """Independent reference for the original per-terminal evaluation behavior."""

    def _showdown_outcome(self, deal):
        return self.evaluator(deal.oop.cards, deal.ip.cards, self.board)


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize(
    ("board", "oop", "ip"),
    [
        (BOARD, {"AQo": 1}, {"KQo": 1}),
        (BOARD, {"AA": 0.3, "KQs": 0.8}, {"KK": 0.6, "QJs": 0.4}),
        (tuple(map(Card.parse, "As Ks Qs Js Ts".split())), {"22": 1}, {"33": 1}),
    ],
)
def test_cached_solver_preserves_full_strategy_and_convergence(engine_type, board, oop, ip):
    evaluator = engine_type().showdown
    cached = RiverCFRSolver(board, oop, ip, 100, 100, 0.5, 1, evaluator).solve(20)
    reference = UncachedRiverSolver(board, oop, ip, 100, 100, 0.5, 1, evaluator).solve(20)
    assert {k: v for k, v in cached.items() if k != "runtime_ms"} == {
        k: v for k, v in reference.items() if k != "runtime_ms"
    }


@pytest.mark.parametrize("outcome", [0.0, 0.5, 1.0])
def test_each_solver_evaluates_each_deal_once_without_sharing_cached_results(outcome):
    evaluator = Mock(return_value=outcome)
    solver = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, evaluator)
    solver.solve(10)
    assert evaluator.call_count == len(solver.deals) == 61
    assert len({call.args for call in evaluator.call_args_list}) == 61
    other = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, evaluator)
    other.solve(10)
    assert evaluator.call_count == 122


def test_fold_utility_does_not_require_showdown_evaluation():
    evaluator = Mock(side_effect=AssertionError("Fold must not evaluate cards"))
    solver = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, evaluator)
    assert solver._oop_terminal_utility(solver.deals[0], ("bet_small", "fold")) == 50
    assert solver._oop_terminal_utility(solver.deals[0], ("check", "bet_large", "fold")) == -50
    evaluator.assert_not_called()


@pytest.mark.parametrize("outcome", [-1, 0.25, 2, float("nan"), float("inf"), None])
def test_solver_rejects_invalid_evaluator_outputs(outcome):
    solver = RiverCFRSolver(
        BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, Mock(return_value=outcome)
    )
    with pytest.raises(ValueError, match="Showdown outcome"):
        solver.solve(1)


def test_solver_rejects_underflowed_chance_mass_before_evaluation():
    evaluator = Mock()
    with pytest.raises(ValueError, match="positive representable"):
        RiverCFRSolver(BOARD, {"AQo": 1e-300}, {"KQo": 1e-300}, 100, 100, 0.5, 1, evaluator)
    evaluator.assert_not_called()


@pytest.mark.parametrize("iterations", [0, -1, 1.5, True])
def test_solver_requires_a_positive_integer_iteration_count(iterations):
    with pytest.raises(ValueError, match="positive integer"):
        RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1).solve(iterations)


def test_regret_matching_probability_normalization():
    node = InformationSet("test", ("left", "right"))
    node.regret_sum = [1, 3]
    strategy = node.strategy(1)
    assert strategy == [0.25, 0.75]
    assert math.isclose(sum(strategy), 1)


def test_kuhn_poker_converges_near_known_value():
    result = verify_kuhn(20_000)
    assert result["passed"]
    assert abs(result["game_value_player_0"] + 1 / 18) < 0.02
    assert all(
        math.isclose(sum(strategy.values()), 1) for strategy in result["strategies"].values()
    )


def test_river_solver_produces_normalized_real_strategies():
    board = tuple(Card.parse(token) for token in ("Ah", "Kd", "7s", "3c", "2d"))
    result = RiverCFRSolver(board, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1).solve(200)
    assert result["valid_combo_pairs"] > 0
    assert result["information_sets"] > 0
    for hand in result["strategy"].values():
        assert math.isclose(sum(hand["actions"].values()), 1, abs_tol=1e-8)
    assert result["convergence"][-1]["average_regret"] >= 0


def test_river_solver_rejects_reversed_or_stack_collapsed_bet_sizes():
    board = tuple(Card.parse(token) for token in ("Ah", "Kd", "7s", "3c", "2d"))
    with pytest.raises(ValueError, match="strictly ordered"):
        RiverCFRSolver(board, {"AQo": 1}, {"KQo": 1}, 100, 100, 1, 0.5)
    with pytest.raises(ValueError, match="collapses"):
        RiverCFRSolver(board, {"AQo": 1}, {"KQo": 1}, 100, 20, 0.5, 1)


def test_river_solver_uses_injected_terminal_evaluator():
    board = tuple(Card.parse(token) for token in ("Ah", "Kd", "7s", "3c", "2d"))
    solver = RiverCFRSolver(
        board,
        {"AQo": 1},
        {"KQo": 1},
        100,
        100,
        0.5,
        1,
        evaluator=lambda _oop, _ip, _board: 1.0,
    )
    assert solver._oop_terminal_utility(solver.deals[0], ("check", "check")) == 50
