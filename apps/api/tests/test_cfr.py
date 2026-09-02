import math

from pokerlab_api.cfr import InformationSet, RiverCFRSolver, verify_kuhn
from pokerlab_api.domain import Card


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
