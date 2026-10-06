from __future__ import annotations

import math
import random
import time
from array import array
from collections.abc import Callable, Sequence
from itertools import accumulate, combinations

from .domain import SUIT_CHARS, Card, full_deck, showdown
from .ranges import WeightedCombo, expand_weighted_range, range_statistics


def _build_pair_table(
    hero_combos: Sequence[WeightedCombo], villain_combos: Sequence[WeightedCombo]
) -> tuple[array, array]:
    """Store ordered, blocker-compatible pairs without a Python object per pair."""

    def mask(combo: WeightedCombo) -> int:
        first, second = combo.cards
        return (1 << (4 * (first.rank - 2) + SUIT_CHARS.index(first.suit))) | (
            1 << (4 * (second.rank - 2) + SUIT_CHARS.index(second.suit))
        )

    hero_masks = [mask(combo) for combo in hero_combos]
    villain_masks = [mask(combo) for combo in villain_combos]
    # At most 1,326 combos per player: every encoded pair fits in 32 bits.
    pair_codes, pair_weights = array("I"), array("d")
    villain_count = len(villain_combos)
    for hero_index, hero in enumerate(hero_combos):
        hero_mask = hero_masks[hero_index]
        offset = hero_index * villain_count
        for villain_index, villain in enumerate(villain_combos):
            if not hero_mask & villain_masks[villain_index]:
                pair_codes.append(offset + villain_index)
                pair_weights.append(hero.weight * villain.weight)
    return pair_codes, pair_weights


def calculate_range_equity(
    hero_weights: dict[str, float],
    villain_weights: dict[str, float],
    board: tuple[Card, ...],
    seed: int,
    samples: int,
    evaluator: Callable[[tuple[Card, Card], tuple[Card, Card], tuple[Card, ...]], float] = showdown,
) -> dict:
    if len(board) not in {0, 3, 4, 5}:
        raise ValueError("Board must contain 0, 3, 4, or 5 cards")
    if len(set(board)) != len(board):
        raise ValueError("Duplicate cards are not permitted")
    if samples < 1:
        raise ValueError("Sample count must be positive")
    started = time.perf_counter()
    hero_combos = expand_weighted_range(hero_weights, board)
    villain_combos = expand_weighted_range(villain_weights, board)
    pair_codes, pair_weights = _build_pair_table(hero_combos, villain_combos)
    villain_count = len(villain_combos)
    if not pair_codes:
        raise ValueError("No blocker-compatible combination pairs remain")
    pair_mass = sum(pair_weights)
    if pair_mass <= 0:
        raise ValueError(
            "Range weights must produce a positive representable combination-pair mass"
        )
    missing = 5 - len(board)
    total_states = len(pair_codes) * math.comb(52 - len(board) - 4, missing)
    board_blocked = set(board)
    available_deck = tuple(card for card in full_deck() if card not in board_blocked)
    win_weight = tie_weight = lose_weight = total_weight = 0.0
    if total_states <= 250_000:
        method = "exact_weighted_enumeration"
        for pair_code, pair_weight in zip(pair_codes, pair_weights, strict=True):
            hero_index, villain_index = divmod(pair_code, villain_count)
            hero, villain = hero_combos[hero_index], villain_combos[villain_index]
            blocked = set(hero.cards + villain.cards)
            deck = tuple(card for card in available_deck if card not in blocked)
            for runout in combinations(deck, missing):
                outcome = evaluator(hero.cards, villain.cards, board + runout)
                total_weight += pair_weight
                if outcome == 1:
                    win_weight += pair_weight
                elif outcome == 0.5:
                    tie_weight += pair_weight
                else:
                    lose_weight += pair_weight
        evaluated = total_states
    else:
        method = "monte_carlo_weighted_pairs"
        rng = random.Random(seed)
        # Keep random.choices' accumulation order and RNG calls unchanged so old
        # seeds reproduce exactly, but build this O(pairs) table only once.
        cumulative_weights = array("d", accumulate(pair_weights))
        for _ in range(samples):
            pair_code = rng.choices(pair_codes, cum_weights=cumulative_weights, k=1)[0]
            hero_index, villain_index = divmod(pair_code, villain_count)
            hero, villain = hero_combos[hero_index], villain_combos[villain_index]
            blocked = set(hero.cards + villain.cards)
            deck = tuple(card for card in available_deck if card not in blocked)
            runout = tuple(rng.sample(deck, missing))
            outcome = evaluator(hero.cards, villain.cards, board + runout)
            total_weight += 1
            if outcome == 1:
                win_weight += 1
            elif outcome == 0.5:
                tie_weight += 1
            else:
                lose_weight += 1
        evaluated = samples
    win = win_weight / total_weight
    tie = tie_weight / total_weight
    lose = lose_weight / total_weight
    return {
        "hero_equity": win + 0.5 * tie,
        "villain_equity": lose + 0.5 * tie,
        "win": win,
        "tie": tie,
        "lose": lose,
        "valid_combo_pairs": len(pair_codes),
        "weighted_combo_pair_mass": pair_mass,
        "evaluated_states": evaluated,
        "method": method,
        "seed": seed,
        "runtime_ms": (time.perf_counter() - started) * 1000,
        "hero_statistics": range_statistics(hero_weights, board),
        "villain_statistics": range_statistics(villain_weights, board),
    }
