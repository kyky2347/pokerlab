import random

import poker_core_rs
import pytest

from pokerlab_api.domain import Card, evaluate_seven, full_deck
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine


def test_rust_evaluator_matches_python_reference_on_seeded_sample():
    """Keep the accelerator honest against the independently implemented reference."""
    rng = random.Random(0xC0FFEE)
    deck = full_deck()

    for _ in range(5_000):
        hand = rng.sample(deck, 7)
        python_rank = tuple(int(value) for value in evaluate_seven(hand))
        rust_rank = tuple(poker_core_rs.evaluate_seven([str(card) for card in hand]))
        assert rust_rank == python_rank


@pytest.mark.parametrize(
    ("tokens", "expected"),
    [
        ("As Ks Qs Js Ts 2d 3c", (8, 14)),
        ("As 2s 3s 4s 5s Kd Qc", (8, 5)),
        ("Ah Ad Ac As Kh Kd 2c", (7, 14, 13)),
        ("Ah Ad Ac Kh Kd Kc 2s", (6, 14, 13)),  # Two triples.
        ("Ah Ad Ac Kh Kd Qh Qd", (6, 14, 13)),  # Triple and two pairs.
        ("Ah Jh 9h 6h 4h 2h Ks", (5, 14, 11, 9, 6, 4)),
        ("As 2d 3c 4h 5s 6d Kc", (4, 6)),  # Wheel must not mask six-high.
        ("As 2d 3c 4h 5s Kd Qc", (4, 5)),
        ("Ah Ad Ac Ks Qh 9d 2s", (3, 14, 13, 12)),
        ("Ah Ad Kh Kd Qh Qd Js", (2, 14, 13, 12)),  # Third pair supplies kicker.
        ("Ah Ad Ks Qd Jh 8c 2s", (1, 14, 13, 12, 11)),
        ("As Kd Qh 9c 7s 5d 2c", (0, 14, 13, 12, 9, 7)),
    ],
)
def test_rust_complete_rank_vectors_cover_categories_and_kicker_edges(tokens, expected):
    hand = tokens.split()
    assert tuple(poker_core_rs.evaluate_seven(hand)) == expected
    assert tuple(evaluate_seven(tuple(map(Card.parse, hand)))) == expected


@pytest.mark.parametrize(
    "tokens",
    [
        [],
        ["As", "Ks", "Qs", "Js", "Ts", "2d"],
        ["As", "Ks", "Qs", "Js", "Ts", "2d", "3c", "4c"],
        ["As", "Ks", "Qs", "Js", "Ts", "2d", "As"],
        ["As", "Ks", "Qs", "Js", "Ts", "2d", "aS"],
        ["As", "Ks", "Qs", "Js", "Ts", "2d", "10c"],
        ["As", "Ks", "Qs", "Js", "Ts", "2d", "♠"],
    ],
)
def test_rust_extension_rejects_invalid_public_inputs(tokens):
    with pytest.raises(ValueError):
        poker_core_rs.evaluate_seven(tokens)


@pytest.mark.parametrize("seed", [0, 7, 20251003])
@pytest.mark.parametrize("board_count", [0, 3, 4, 5])
def test_complete_seeded_monte_carlo_result_is_identical_between_engines(seed, board_count):
    rng = random.Random(seed)
    dealt = tuple(rng.sample(full_deck(), 9))
    results = [
        engine.monte_carlo(dealt[:2], dealt[2:4], dealt[4 : 4 + board_count], 257, seed)
        for engine in (PythonPokerEngine(), RustPokerEngine())
    ]
    stable = [
        {key: value for key, value in result.items() if key not in {"runtime_ms", "engine"}}
        for result in results
    ]
    assert stable[0] == stable[1]


def test_rust_ranks_ignore_card_order_and_bijective_suit_relabeling():
    rng = random.Random(20251003)
    deck = full_deck()
    for _ in range(50):
        hand = rng.sample(deck, 7)
        expected = tuple(evaluate_seven(hand))
        for _ in range(5):
            rng.shuffle(hand)
            suits = list("cdhs")
            rng.shuffle(suits)
            suit_map = dict(zip("cdhs", suits, strict=True))
            tokens = [str(card)[0] + suit_map[card.suit] for card in hand]
            assert tuple(poker_core_rs.evaluate_seven(tokens)) == expected


def test_turn_map_rust_matches_python_on_seeded_legal_flops():
    rng = random.Random(0x7A12)
    python_engine, rust_engine = PythonPokerEngine(), RustPokerEngine()
    for _ in range(5):
        dealt = tuple(rng.sample(full_deck(), 7))
        hero, villain, flop = dealt[:2], dealt[2:4], dealt[4:]
        assert rust_engine.turn_map(hero, villain, flop) == python_engine.turn_map(
            hero, villain, flop
        )
