"""Output-checked Python evaluator benchmark / 核对完整输出的 Python 评估器基准.

The original five/seven-card evaluators are frozen from a3237bd below. They are
benchmark/test references only; request handling never imports this module.
Card types, straight detection and engine orchestration are shared unchanged;
this comparison isolates validation placement, not two complete app versions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import random
import statistics
import time
from collections import Counter
from itertools import combinations

from .controls import validate_positive_integer, validate_seed
from .domain import (
    HandCategory,
    _straight_high,
    evaluate_five,
    evaluate_seven,
    full_deck,
    parse_cards,
    validate_showdown_state,
)
from .engine import PythonPokerEngine


def reference_five(cards):
    """Unmodified pre-refactor ranking/validation, including all kickers."""
    hand = tuple(cards)
    if len(hand) != 5 or len(set(hand)) != 5:
        raise ValueError("A five-card hand must contain five unique cards")
    ranks = [card.rank for card in hand]
    counts = Counter(ranks)
    grouped = sorted(((count, rank) for rank, count in counts.items()), reverse=True)
    flush = len({card.suit for card in hand}) == 1
    straight_high = _straight_high(ranks)

    if flush and straight_high is not None:
        return (HandCategory.STRAIGHT_FLUSH, straight_high)
    if grouped[0][0] == 4:
        quad = grouped[0][1]
        kicker = max(rank for rank in ranks if rank != quad)
        return (HandCategory.FOUR_OF_A_KIND, quad, kicker)
    if grouped[0][0] == 3 and grouped[1][0] == 2:
        return (HandCategory.FULL_HOUSE, grouped[0][1], grouped[1][1])
    if flush:
        return (HandCategory.FLUSH, *sorted(ranks, reverse=True))
    if straight_high is not None:
        return (HandCategory.STRAIGHT, straight_high)
    if grouped[0][0] == 3:
        trips = grouped[0][1]
        kickers = sorted((rank for rank in ranks if rank != trips), reverse=True)
        return (HandCategory.THREE_OF_A_KIND, trips, *kickers)
    pairs = sorted((rank for rank, count in counts.items() if count == 2), reverse=True)
    if len(pairs) == 2:
        kicker = max(rank for rank in ranks if rank not in pairs)
        return (HandCategory.TWO_PAIR, pairs[0], pairs[1], kicker)
    if len(pairs) == 1:
        pair = pairs[0]
        kickers = sorted((rank for rank in ranks if rank != pair), reverse=True)
        return (HandCategory.PAIR, pair, *kickers)
    return (HandCategory.HIGH_CARD, *sorted(ranks, reverse=True))


def reference_seven(cards):
    hand = tuple(cards)
    if len(hand) != 7 or len(set(hand)) != 7:
        raise ValueError("A seven-card hand must contain seven unique cards")
    return max(reference_five(combo) for combo in combinations(hand, 5))


class ReferenceEngine(PythonPokerEngine):
    def showdown(self, hero, villain, board):
        validate_showdown_state(hero, villain, board)
        hero_rank = reference_seven(hero + board)
        villain_rank = reference_seven(villain + board)
        if hero_rank > villain_rank:
            return 1.0
        if hero_rank == villain_rank:
            return 0.5
        return 0.0


def _stable(result):
    return (
        {key: value for key, value in result.items() if key != "runtime_ms"}
        if isinstance(result, dict)
        else result
    )


def run(*, repeats: int = 5, hand_count: int = 5000, samples: int = 10000, seed: int = 20261029):
    for name, value in (("Repeats", repeats), ("Hand count", hand_count), ("Samples", samples)):
        validate_positive_integer(value, name)
    validate_seed(seed)
    rng = random.Random(seed)
    deck = full_deck()
    hands = [tuple(rng.sample(deck, 7)) for _ in range(hand_count)]
    five_hands = [hand[:5] for hand in hands]
    hero, villain, flop = (parse_cards(tokens.split()) for tokens in ("As Ks", "Qh Qd", "Js 8s 2c"))
    engines = {"baseline": ReferenceEngine(), "candidate": PythonPokerEngine()}
    five = {"baseline": reference_five, "candidate": evaluate_five}
    seven = {"baseline": reference_seven, "candidate": evaluate_seven}
    cases = {
        "five_card_batch": lambda variant: [five[variant](hand) for hand in five_hands],
        "seven_card_batch": lambda variant: [seven[variant](hand) for hand in hands],
        "exact_flop": lambda variant: engines[variant].exact_equity(hero, villain, flop),
        "monte_carlo": lambda variant: engines[variant].monte_carlo(
            hero, villain, flop, samples, seed
        ),
        "turn_map": lambda variant: engines[variant].turn_map(hero, villain, flop),
    }
    results = []
    for name, calculate in cases.items():
        expected = _stable(calculate("baseline"))
        times = {variant: [] for variant in engines}
        for repeat in range(repeats + 1):
            order = list(engines) if repeat % 2 == 0 else list(reversed(engines))
            for variant in order:
                started = time.perf_counter()
                actual = calculate(variant)
                elapsed = (time.perf_counter() - started) * 1000
                if _stable(actual) != expected:
                    raise RuntimeError(f"{name}: {variant} disagrees with the frozen reference")
                if repeat:
                    times[variant].append(elapsed)
        medians = {variant: statistics.median(values) for variant, values in times.items()}
        results.append(
            {
                "benchmark": name,
                "times_ms": times,
                "median_ms": medians,
                "baseline_over_candidate": medians["baseline"] / medians["candidate"],
                "reference_match": True,
                "result_sha256": hashlib.sha256(
                    json.dumps(expected, sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest(),
            }
        )
    return {
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "engine": "Python reference",
        },
        "workload": {
            "baseline_commit": "a3237bde836af6d2e341652e131906ccce47af5c",
            "seed": seed,
            "hand_count": hand_count,
            "samples": samples,
            "hero": list(map(str, hero)),
            "villain": list(map(str, villain)),
            "flop": list(map(str, flop)),
            "repeats": repeats,
            "warmup_runs_per_variant": 1,
            "alternating_order": True,
            "timing_scope": (
                "Core calls; excludes input generation, output comparison, HTTP, storage and UI"
            ),
        },
        "results": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--hand-count", type=int, default=5000)
    parser.add_argument("--samples", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=20261029)
    print(json.dumps(run(**vars(parser.parse_args())), indent=2))
