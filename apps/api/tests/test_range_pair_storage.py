"""Representation-level and end-to-end compatibility with the original sampler."""

import math
import random
from array import array
from itertools import accumulate, combinations

import pytest

from pokerlab_api.domain import Card, full_deck, showdown
from pokerlab_api.range_equity import _build_pair_table, calculate_range_equity
from pokerlab_api.ranges import combo_class, expand_weighted_range

BOARDS = [(), ("2c", "7d", "9h"), ("2c", "7d", "9h", "3s"), ("2c", "7d", "9h", "3s", "Ac")]
FULL_RANGE = dict.fromkeys((combo_class(pair) for pair in combinations(full_deck(), 2)), 1.0)


def legacy_pairs(hero_combos, villain_combos):
    return [
        (hero, villain, hero.weight * villain.weight)
        for hero in hero_combos
        for villain in villain_combos
        if not set(hero.cards).intersection(villain.cards)
    ]


@pytest.mark.parametrize("board_tokens", BOARDS)
@pytest.mark.parametrize("reverse", [False, True])
def test_compact_pairs_preserve_order_weights_and_partial_underflow(board_tokens, reverse):
    board = tuple(map(Card.parse, board_tokens))
    hero_range = {"AA": 0.3, "AKo": 1e-200, "76s": 0.7, "22": 0}
    villain_range = {"KK": 1e-200, "AQo": 0.1, "76s": 0.9}
    if reverse:
        hero_range = dict(reversed(hero_range.items()))
        villain_range = dict(reversed(villain_range.items()))
    heroes = expand_weighted_range(hero_range, board)
    villains = expand_weighted_range(villain_range, board)
    expected = legacy_pairs(heroes, villains)
    codes, weights = _build_pair_table(heroes, villains)
    assert isinstance(codes, array) and codes.typecode == "I"
    assert isinstance(weights, array) and weights.typecode == "d"
    actual = [
        (heroes[code // len(villains)], villains[code % len(villains)], weight)
        for code, weight in zip(codes, weights, strict=True)
    ]
    assert actual == expected
    assert 0.0 in weights  # Keep zero-mass entries and their original positions.
    assert sum(weights) == sum(pair[2] for pair in expected)
    assert list(accumulate(weights)) == list(accumulate(pair[2] for pair in expected))


@pytest.mark.parametrize("board_tokens", BOARDS)
def test_full_range_has_every_legal_pair_in_compact_storage(board_tokens):
    board = tuple(map(Card.parse, board_tokens))
    combos = expand_weighted_range(FULL_RANGE, board)
    codes, weights = _build_pair_table(combos, combos)
    expected_count = math.comb(52 - len(board), 2) * math.comb(50 - len(board), 2)
    assert len(FULL_RANGE) == 169
    assert len(codes) == len(weights) == expected_count
    assert codes.itemsize == 4 and weights.itemsize == 8
    assert sum(weights) == expected_count
    previous = -1
    for code in codes:
        assert previous < code < len(combos) ** 2
        hero_index, villain_index = divmod(code, len(combos))
        assert (
            len(set(board + combos[hero_index].cards + combos[villain_index].cards))
            == len(board) + 4
        )
        previous = code


def test_empty_and_fully_blocked_pair_tables():
    aa = expand_weighted_range({"AA": 1}, tuple(map(Card.parse, ("Ac", "Ad"))))
    for heroes, villains in [([], aa), (aa, []), (aa, aa)]:
        codes, weights = _build_pair_table(heroes, villains)
        assert len(codes) == len(weights) == 0


def test_full_range_monte_carlo_preserves_the_original_draw_stream():
    combos = expand_weighted_range(FULL_RANGE)
    pairs = legacy_pairs(combos, combos)
    cumulative = list(accumulate(pair[2] for pair in pairs))
    rng = random.Random(2**63 - 1)
    expected = []
    for _ in range(32):
        hero, villain, _ = rng.choices(pairs, cum_weights=cumulative, k=1)[0]
        deck = tuple(card for card in full_deck() if card not in hero.cards + villain.cards)
        expected.append((hero.cards, villain.cards, tuple(rng.sample(deck, 5))))
    del pairs, cumulative
    actual = []

    def record_draw(hero, villain, board):
        actual.append((hero, villain, board))
        return showdown(hero, villain, board)

    result = calculate_range_equity(FULL_RANGE, FULL_RANGE, (), 2**63 - 1, 32, record_draw)
    assert actual == expected
    assert result["valid_combo_pairs"] == 1_624_350
    assert result["weighted_combo_pair_mass"] == 1_624_350.0
    assert result["method"] == "monte_carlo_weighted_pairs"
    assert result["evaluated_states"] == 32
    outcomes = [showdown(*draw) for draw in expected]
    assert result["win"] == outcomes.count(1) / 32
    assert result["tie"] == outcomes.count(0.5) / 32
    assert result["lose"] == outcomes.count(0) / 32


@pytest.mark.parametrize("board_tokens", BOARDS[2:])
def test_exact_path_retains_float_accumulation_order(board_tokens):
    board = tuple(map(Card.parse, board_tokens))
    hero_range, villain_range = {"AA": 0.3, "AKs": 0.1}, {"KK": 0.7, "QJs": 0.9}
    pairs = legacy_pairs(
        expand_weighted_range(hero_range, board), expand_weighted_range(villain_range, board)
    )
    win = tie = lose = total = 0.0
    evaluated = 0
    for hero, villain, weight in pairs:
        deck = tuple(card for card in full_deck() if card not in board + hero.cards + villain.cards)
        for runout in combinations(deck, 5 - len(board)):
            outcome = showdown(hero.cards, villain.cards, board + runout)
            total += weight
            if outcome == 1:
                win += weight
            elif outcome == 0.5:
                tie += weight
            else:
                lose += weight
            evaluated += 1
    result = calculate_range_equity(hero_range, villain_range, board, 7, 100)
    assert result["method"] == "exact_weighted_enumeration"
    assert result["evaluated_states"] == evaluated
    assert (result["win"], result["tie"], result["lose"]) == (
        win / total,
        tie / total,
        lose / total,
    )
    assert result["weighted_combo_pair_mass"] == sum(pair[2] for pair in pairs)
