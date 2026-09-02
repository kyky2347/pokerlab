import math

from pokerlab_api.domain import Card
from pokerlab_api.engine import PythonPokerEngine


def card(token: str) -> Card:
    return Card.parse(token)


HERO = (card("As"), card("Ks"))
VILLAIN = (card("Qh"), card("Qd"))
FLOP = (card("Js"), card("8s"), card("2c"))


def test_exact_equity_invariants_and_swap_symmetry():
    engine = PythonPokerEngine()
    result = engine.exact_equity(HERO, VILLAIN, FLOP)
    swapped = engine.exact_equity(VILLAIN, HERO, FLOP)
    assert 0 <= result["equity"] <= 1
    assert math.isclose(result["win"] + result["tie"] + result["lose"], 1)
    assert math.isclose(result["equity"] + swapped["equity"], 1)
    assert result["states"] == 990


def test_exact_enumeration_is_deterministic():
    engine = PythonPokerEngine()
    first = engine.exact_equity(HERO, VILLAIN, FLOP)
    second = engine.exact_equity(HERO, VILLAIN, FLOP)
    for key in ("equity", "win", "tie", "lose", "states"):
        assert first[key] == second[key]


def test_monte_carlo_seed_is_reproducible_and_ci_contains_estimate():
    engine = PythonPokerEngine()
    first = engine.monte_carlo(HERO, VILLAIN, FLOP, 2_000, 19)
    second = engine.monte_carlo(HERO, VILLAIN, FLOP, 2_000, 19)
    different = engine.monte_carlo(HERO, VILLAIN, FLOP, 2_000, 20)
    assert first["equity"] == second["equity"]
    assert first["convergence"] == second["convergence"]
    assert first["equity"] != different["equity"] or first["win"] != different["win"]
    assert first["ci_low"] <= first["equity"] <= first["ci_high"]


def test_monte_carlo_approaches_exact_with_statistical_tolerance():
    engine = PythonPokerEngine()
    exact = engine.exact_equity(HERO, VILLAIN, FLOP)
    simulated = engine.monte_carlo(HERO, VILLAIN, FLOP, 15_000, 73)
    tolerance = max(0.025, 4 * simulated["standard_error"])
    assert abs(simulated["equity"] - exact["equity"]) < tolerance


def test_turn_map_has_every_legal_turn():
    values = PythonPokerEngine().turn_map(HERO, VILLAIN, FLOP)
    assert len(values) == 45
    assert all(0 <= row["equity"] <= 1 for row in values)
