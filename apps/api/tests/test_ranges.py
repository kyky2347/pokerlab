import math
import random
from collections import Counter
from itertools import combinations
from unittest.mock import patch

import pytest

from pokerlab_api.domain import Card, full_deck, showdown
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


BROAD_RANGE = {
    label: (index % 4 + 1) / 4
    for index, label in enumerate(
        "AA KK QQ JJ TT 99 88 77 AKs AQs AJs ATs KQs KJs QJs JTs AKo AQo AJo KQo".split()
    )
}


@pytest.mark.parametrize("board_tokens", [(), ("2c", "7d", "9h"), ("2c", "7d", "9h", "3s")])
@pytest.mark.parametrize("seed", [0, 7, 2**63 - 1])
def test_weighted_sampler_preserves_every_seeded_pair_and_runout(board_tokens, seed):
    """Compare the complete draw stream with the original weights-based sampler."""
    board = tuple(Card.parse(token) for token in board_tokens)
    combos = expand_weighted_range(BROAD_RANGE, board)
    pairs = [
        (hero, villain, hero.weight * villain.weight)
        for hero in combos
        for villain in combos
        if not set(hero.cards).intersection(villain.cards)
    ]
    rng = random.Random(seed)
    expected = []
    for _ in range(100):
        hero, villain, _ = rng.choices(pairs, weights=[pair[2] for pair in pairs], k=1)[0]
        blocked = set(board + hero.cards + villain.cards)
        deck = tuple(card for card in full_deck() if card not in blocked)
        expected.append(
            (hero.cards, villain.cards, board + tuple(rng.sample(deck, 5 - len(board))))
        )

    actual = []

    def record_draw(hero, villain, final_board):
        assert len(set(hero + villain + final_board)) == 9
        actual.append((hero, villain, final_board))
        return 0.5

    result = calculate_range_equity(BROAD_RANGE, BROAD_RANGE, board, seed, 100, record_draw)
    assert result["method"] == "monte_carlo_weighted_pairs"
    assert result["evaluated_states"] == 100
    assert result["hero_equity"] == result["villain_equity"] == 0.5
    assert actual == expected


def test_sampler_builds_the_cumulative_distribution_and_deck_once(monkeypatch):
    original_choices = random.Random.choices
    distributions = []

    def checked_choices(self, population, weights=None, *, cum_weights=None, k=1):
        assert weights is None
        assert cum_weights is not None
        distributions.append(cum_weights)
        return original_choices(self, population, cum_weights=cum_weights, k=k)

    monkeypatch.setattr(random.Random, "choices", checked_choices)
    with patch("pokerlab_api.range_equity.full_deck", wraps=full_deck) as deck_factory:
        calculate_range_equity({"AA": 0.3}, {"KK": 0.8}, (), 7, 100, lambda *_: 0.5)
    assert deck_factory.call_count == 1
    assert len(distributions) == 100
    assert all(distribution is distributions[0] for distribution in distributions)


@pytest.mark.parametrize("board_tokens", [("Ah", "Kd", "7s", "3c"), ("Ah", "Kd", "7s", "3c", "2d")])
def test_exact_weighted_equity_matches_independent_enumeration(board_tokens):
    board = tuple(Card.parse(token) for token in board_tokens)
    hero_range, villain_range = {"AQs": 0.2, "AA": 1}, {"KQs": 0.7, "KK": 0.4}
    counts = Counter()
    evaluated = 0
    for hero in expand_weighted_range(hero_range, board):
        for villain in expand_weighted_range(villain_range, board):
            if set(hero.cards).intersection(villain.cards):
                continue
            deck = tuple(
                card for card in full_deck() if card not in board + hero.cards + villain.cards
            )
            for runout in combinations(deck, 5 - len(board)):
                counts[showdown(hero.cards, villain.cards, board + runout)] += (
                    hero.weight * villain.weight
                )
                evaluated += 1
    result = calculate_range_equity(hero_range, villain_range, board, 7, 100)
    assert result["method"] == "exact_weighted_enumeration"
    assert result["evaluated_states"] == evaluated
    assert result["hero_equity"] == pytest.approx((counts[1] + counts[0.5] / 2) / counts.total())


@pytest.mark.parametrize("board_tokens", [(), ("2c", "7d", "9h", "3s", "4c")])
def test_unrepresentable_pair_mass_is_rejected_cleanly(board_tokens):
    board = tuple(Card.parse(token) for token in board_tokens)
    with pytest.raises(ValueError, match="representable"):
        calculate_range_equity({"AA": 1e-200}, {"KK": 1e-200}, board, 7, 100)
