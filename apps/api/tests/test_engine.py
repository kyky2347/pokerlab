import math
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from pokerlab_api.domain import Card, full_deck
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine, select_engine


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


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize(
    "tokens",
    [
        "As Ks Qh Qd Js 8s 2c",  # Flush / straight draws.
        "Ac Ad Kh Kd Ah Kc 2s",  # Competing sets / full houses.
        "As Kh Ah Ks Qs Js Ts",  # Shared ranks / frequent split pots.
    ],
)
def test_turn_map_matches_each_conditional_enumeration_and_flop_equity(engine_type, tokens):
    cards = tuple(map(card, tokens.split()))
    hero, villain, flop = cards[:2], cards[2:4], cards[4:]
    engine = engine_type()
    remaining = tuple(c for c in full_deck() if c not in cards)
    expected = [
        {"card": str(turn), "equity": engine.exact_equity(hero, villain, flop + (turn,))["equity"]}
        for turn in remaining
    ]
    actual = engine.turn_map(hero, villain, flop)
    assert actual == expected  # Includes stable deck ordering and every legal card.
    assert sum(row["equity"] for row in actual) / 45 == pytest.approx(
        engine.exact_equity(hero, villain, flop)["equity"], abs=1e-14
    )
    swapped = engine.turn_map(villain, hero, flop)
    assert [row["card"] for row in swapped] == [row["card"] for row in actual]
    for left, right in zip(actual, swapped, strict=True):
        assert left["equity"] + right["equity"] == pytest.approx(1)


@pytest.mark.parametrize("outcome", [0.0, 0.5, 1.0])
def test_turn_map_evaluates_each_unordered_runout_once_and_credits_both_turns(outcome):
    engine = PythonPokerEngine()
    with patch.object(engine, "showdown", return_value=outcome) as evaluate:
        rows = engine.turn_map(HERO, VILLAIN, FLOP)
    assert evaluate.call_count == 990
    assert len(rows) == 45
    assert all(row["equity"] == outcome for row in rows)
    runouts = [frozenset(call.args[2][3:]) for call in evaluate.call_args_list]
    assert len(set(runouts)) == 990
    for turn in (c for c in full_deck() if c not in HERO + VILLAIN + FLOP):
        assert sum(turn in runout for runout in runouts) == 44


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize(
    ("hero", "villain", "board", "message"),
    [
        ("As Ks", "As Qd", "2c 3d 5h 8c 9s", "Duplicate"),
        ("As As", "Qh Qd", "2c 3d 5h 8c 9s", "Duplicate"),
        ("As Ks", "Qh Qd", "As 3d 5h 8c 9s", "Duplicate"),
        ("As Ks", "Qh Qd", "2c 2c 5h 8c 9s", "Duplicate"),
        ("As", "Qh Qd", "2c 3d 5h 8c 9s", "exactly two"),
        ("As Ks", "Qh Qd Jd", "2c 3d 5h 8c 9s", "exactly two"),
        ("As Ks", "Qh Qd", "2c 3d 5h 8c", "five-card board"),
        ("As Ks", "Qh Qd", "2c 3d 5h 8c 9s Td", "five-card board"),
    ],
)
def test_engine_showdown_rejects_invalid_states(engine_type, hero, villain, board, message):
    with pytest.raises(ValueError, match=message):
        engine_type().showdown(
            *(tuple(map(card, tokens.split())) for tokens in (hero, villain, board))
        )


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_turn_map_validates_before_evaluation(engine_type):
    engine = engine_type()
    with patch.object(engine, "showdown") as evaluate:
        with pytest.raises(ValueError, match="Duplicate"):
            engine.turn_map(HERO, (HERO[0], VILLAIN[1]), FLOP)
        with pytest.raises(ValueError, match="exactly three"):
            engine.turn_map(HERO, VILLAIN, FLOP + (card("3d"),))
        evaluate.assert_not_called()


def test_engine_selection_falls_back_when_rust_smoke_test_fails(monkeypatch):
    broken_rust_module = SimpleNamespace(
        deck=lambda: ["As"],
        evaluate_seven=lambda _cards: [8, 14],
    )
    monkeypatch.setitem(sys.modules, "poker_core_rs", broken_rust_module)
    assert type(select_engine()) is PythonPokerEngine


def test_engine_selection_falls_back_when_rust_is_unavailable(monkeypatch):
    monkeypatch.setitem(sys.modules, "poker_core_rs", None)
    engine = select_engine()
    assert type(engine) is PythonPokerEngine
    assert engine.name == "Python reference"
    assert len(engine.turn_map(HERO, VILLAIN, FLOP)) == 45
