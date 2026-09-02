from __future__ import annotations

import math
import random
import time
from itertools import combinations

from .domain import Card, full_deck, showdown
from .ranges import expand_weighted_range, range_statistics


def calculate_range_equity(
    hero_weights: dict[str, float],
    villain_weights: dict[str, float],
    board: tuple[Card, ...],
    seed: int,
    samples: int,
) -> dict:
    if len(board) not in {0, 3, 4, 5}:
        raise ValueError("Board must contain 0, 3, 4, or 5 cards")
    if len(set(board)) != len(board):
        raise ValueError("Duplicate cards are not permitted")
    started = time.perf_counter()
    hero_combos = expand_weighted_range(hero_weights, board)
    villain_combos = expand_weighted_range(villain_weights, board)
    valid_pairs = [
        (hero, villain, hero.weight * villain.weight)
        for hero in hero_combos
        for villain in villain_combos
        if not set(hero.cards).intersection(villain.cards)
    ]
    if not valid_pairs:
        raise ValueError("No blocker-compatible combination pairs remain")
    missing = 5 - len(board)
    total_states = sum(
        math.comb(52 - len(board) - 4, missing) for _hero, _villain, _weight in valid_pairs
    )
    win_weight = tie_weight = lose_weight = total_weight = 0.0
    if total_states <= 250_000:
        method = "exact_weighted_enumeration"
        for hero, villain, pair_weight in valid_pairs:
            blocked = set(board + hero.cards + villain.cards)
            deck = tuple(card for card in full_deck() if card not in blocked)
            for runout in combinations(deck, missing):
                outcome = showdown(hero.cards, villain.cards, board + runout)
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
        pair_weights = [pair[2] for pair in valid_pairs]
        for _ in range(samples):
            hero, villain, _ = rng.choices(valid_pairs, weights=pair_weights, k=1)[0]
            blocked = set(board + hero.cards + villain.cards)
            deck = tuple(card for card in full_deck() if card not in blocked)
            runout = tuple(rng.sample(deck, missing))
            outcome = showdown(hero.cards, villain.cards, board + runout)
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
        "valid_combo_pairs": len(valid_pairs),
        "weighted_combo_pair_mass": sum(pair[2] for pair in valid_pairs),
        "evaluated_states": evaluated,
        "method": method,
        "seed": seed,
        "runtime_ms": (time.perf_counter() - started) * 1000,
        "hero_statistics": range_statistics(hero_weights, board),
        "villain_statistics": range_statistics(villain_weights, board),
    }
