import random

import poker_core_rs

from pokerlab_api.domain import evaluate_seven, full_deck
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine


def test_rust_evaluator_matches_python_reference_on_seeded_sample():
    """Keep the accelerator honest against the independently implemented reference."""
    rng = random.Random(0xC0FFEE)
    deck = full_deck()

    for _ in range(250):
        hand = rng.sample(deck, 7)
        python_rank = tuple(int(value) for value in evaluate_seven(hand))
        rust_rank = tuple(poker_core_rs.evaluate_seven([str(card) for card in hand]))
        assert rust_rank == python_rank


def test_turn_map_rust_matches_python_on_seeded_legal_flops():
    rng = random.Random(0x7A12)
    python_engine, rust_engine = PythonPokerEngine(), RustPokerEngine()
    for _ in range(5):
        dealt = tuple(rng.sample(full_deck(), 7))
        hero, villain, flop = dealt[:2], dealt[2:4], dealt[4:]
        assert rust_engine.turn_map(hero, villain, flop) == python_engine.turn_map(
            hero, villain, flop
        )
