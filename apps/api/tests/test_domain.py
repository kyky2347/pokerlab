from itertools import combinations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from pokerlab_api.domain import (
    Card,
    HandCategory,
    evaluate_five,
    evaluate_seven,
    full_deck,
    parse_cards,
)


def cards(*tokens: str):
    return tuple(Card.parse(token) for token in tokens)


def test_deck_contains_52_unique_cards():
    deck = full_deck()
    assert len(deck) == 52
    assert len(set(deck)) == 52


def test_duplicate_cards_are_rejected():
    with pytest.raises(ValueError, match="Duplicate"):
        parse_cards(["As", "As"])


def test_hand_category_ordering_and_wheel():
    straight_flush = evaluate_five(cards("As", "Ks", "Qs", "Js", "Ts"))
    quads = evaluate_five(cards("Ah", "Ad", "Ac", "As", "Kh"))
    wheel = evaluate_five(cards("As", "2d", "3c", "4h", "5s"))
    assert straight_flush > quads
    assert straight_flush[0] == HandCategory.STRAIGHT_FLUSH
    assert wheel == (HandCategory.STRAIGHT, 5)


def test_seven_card_evaluator_chooses_best_five():
    rank = evaluate_seven(cards("As", "Ks", "Qs", "Js", "Ts", "2d", "2c"))
    assert rank == (HandCategory.STRAIGHT_FLUSH, 14)


@given(st.lists(st.integers(min_value=0, max_value=51), min_size=7, max_size=7, unique=True))
def test_random_legal_seven_card_rank_is_bounded(indices: list[int]):
    rank = evaluate_seven(tuple(full_deck()[index] for index in indices))
    assert HandCategory.HIGH_CARD <= rank[0] <= HandCategory.STRAIGHT_FLUSH


@given(st.lists(st.integers(min_value=0, max_value=51), min_size=5, max_size=5, unique=True))
def test_five_card_rank_matches_seven_with_irrelevant_choice(indices: list[int]):
    hand = tuple(full_deck()[index] for index in indices)
    assert evaluate_five(hand) == max(evaluate_five(combo) for combo in combinations(hand, 5))
