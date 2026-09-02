import math

import pytest

from pokerlab_api.domain import Card
from pokerlab_api.range_equity import calculate_range_equity
from pokerlab_api.ranges import expand_hand_class, expand_weighted_range, range_statistics


def test_physical_combo_counts():
    assert len(expand_hand_class("AA")) == 6
    assert len(expand_hand_class("AKs")) == 4
    assert len(expand_hand_class("AKo")) == 12


def test_blockers_remove_impossible_combos():
    combos = expand_weighted_range({"AA": 1}, (Card.parse("As"),))
    assert len(combos) == 3
    assert all(Card.parse("As") not in combo.cards for combo in combos)


def test_weighted_range_statistics():
    stats = range_statistics({"AA": 1, "AKs": 0.5})
    assert stats["physical_combos"] == 10
    assert math.isclose(stats["weighted_combos"], 8)


def test_range_equity_respects_blockers_and_normalizes():
    board = tuple(Card.parse(token) for token in ("Ah", "Kd", "7s", "3c", "2d"))
    result = calculate_range_equity({"AQo": 1}, {"KQo": 1}, board, 7, 1000)
    assert result["valid_combo_pairs"] > 0
    assert math.isclose(result["win"] + result["tie"] + result["lose"], 1)
    assert math.isclose(result["hero_equity"] + result["villain_equity"], 1)


def test_range_equity_uses_the_selected_engine_evaluator():
    board = tuple(Card.parse(token) for token in ("Ah", "Kd", "7s", "3c", "2d"))
    calls = 0

    def hero_always_wins(_hero, _villain, _board):
        nonlocal calls
        calls += 1
        return 1.0

    result = calculate_range_equity(
        {"AQo": 1}, {"KQo": 1}, board, 7, 1000, evaluator=hero_always_wins
    )
    assert result["hero_equity"] == 1
    assert calls == result["valid_combo_pairs"]


def test_duplicate_aliases_and_non_finite_weights_are_rejected():
    with pytest.raises(ValueError, match="Duplicate canonical"):
        expand_weighted_range({"AKs": 1, "KAs": 0.5})
    with pytest.raises(ValueError, match="between 0 and 1"):
        expand_weighted_range({"AKs": math.nan})


def test_range_equity_rejects_non_positive_direct_sample_count():
    with pytest.raises(ValueError, match="positive"):
        calculate_range_equity({"22": 1}, {"33": 1}, (), 7, 0)
