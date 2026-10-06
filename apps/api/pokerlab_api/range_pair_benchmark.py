"""Reproducible range-pair setup benchmark / 可复现的范围组合对准备基准。

Compare the original object table with compact storage, independently of any
showdown engine. Timing and traced Python allocation peaks are separate runs.
"""

from __future__ import annotations

import argparse
import gc
import json
import platform
import statistics
import time
import tracemalloc
from array import array
from itertools import accumulate, combinations

from .domain import Card, full_deck
from .range_equity import _build_pair_table
from .ranges import combo_class, expand_weighted_range


def _legacy(heroes, villains):
    pairs = [
        (hero, villain, hero.weight * villain.weight)
        for hero in heroes
        for villain in villains
        if not set(hero.cards).intersection(villain.cards)
    ]
    mass = sum(pair[2] for pair in pairs)
    return pairs, list(accumulate(pair[2] for pair in pairs)), mass


def _compact(heroes, villains):
    codes, weights = _build_pair_table(heroes, villains)
    mass = sum(weights)
    return codes, weights, array("d", accumulate(weights)), mass


def _verify_and_warm(heroes, villains):
    old_pairs, old_cumulative, old_mass = _legacy(heroes, villains)
    codes, weights, cumulative, mass = _compact(heroes, villains)
    if len(old_pairs) != len(codes) or mass != old_mass:
        raise ValueError("Pair count or mass differs from the original implementation")
    for index, (hero, villain, weight) in enumerate(old_pairs):
        hero_index, villain_index = divmod(codes[index], len(villains))
        if (
            heroes[hero_index] != hero
            or villains[villain_index] != villain
            or weights[index] != weight
            or cumulative[index] != old_cumulative[index]
        ):
            raise ValueError(f"Pair or cumulative weight mismatch at index {index}")
    return len(codes), mass


def measure(hero_range, villain_range, board, repeats=5):
    if isinstance(repeats, bool) or not isinstance(repeats, int) or repeats < 1:
        raise ValueError("Repeats must be a positive integer")
    if tracemalloc.is_tracing():
        raise ValueError("Run without an existing tracemalloc session")
    heroes = expand_weighted_range(hero_range, board)
    villains = expand_weighted_range(villain_range, board)
    count, mass = _verify_and_warm(heroes, villains)
    builders = {"legacy": _legacy, "compact": _compact}
    timings = {name: [] for name in builders}
    peaks = {}
    for repeat in range(repeats):
        order = list(builders) if repeat % 2 == 0 else list(reversed(builders))
        for name in order:
            gc.collect()
            started = time.perf_counter()
            result = builders[name](heroes, villains)
            timings[name].append((time.perf_counter() - started) * 1000)
            if len(result[0]) != count or result[-1] != mass:
                raise ValueError("Timed result count or mass changed")
            del result
    # Expanded combos and validation are outside tracing. Nothing from any
    # previous table remains live; timing above never enables tracemalloc.
    for name, builder in builders.items():
        gc.collect()
        tracemalloc.start()
        try:
            result = builder(heroes, villains)
            peaks[name] = tracemalloc.get_traced_memory()[1]
        finally:
            tracemalloc.stop()
        del result
    return {
        "inputs": {
            "hero_range": hero_range,
            "villain_range": villain_range,
            "board": list(map(str, board)),
        },
        "hero_combos": len(heroes),
        "villain_combos": len(villains),
        "valid_combo_pairs": count,
        "weighted_combo_pair_mass": mass,
        "complete_table_and_cumulative_weights_match": True,
        "timings_ms": timings,
        "median_ms": {name: statistics.median(values) for name, values in timings.items()},
        "peak_traced_python_bytes": peaks,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()
    full_range = dict.fromkeys((combo_class(pair) for pair in combinations(full_deck(), 2)), 1.0)
    broad_range = {
        label: (index % 4 + 1) / 4
        for index, label in enumerate(
            "AA KK QQ JJ TT 99 88 77 AKs AQs AJs ATs KQs KJs QJs JTs AKo AQo AJo KQo".split()
        )
    }
    print(
        json.dumps(
            {
                "environment": {
                    "platform": platform.platform(),
                    "python": platform.python_version(),
                },
                "method": {
                    "warmups": 1,
                    "timed_repeats": args.repeats,
                    "alternating_order": True,
                    "memory_runs_per_variant": 1,
                    "scope": "Pair table, mass sum, and cumulative weights only; not RSS or equity",
                    "randomness": "None: deterministic preparation of the complete ordered table",
                },
                "workloads": {
                    "20_class_flop": measure(
                        broad_range,
                        broad_range,
                        tuple(map(Card.parse, ("2c", "7d", "9h"))),
                        args.repeats,
                    ),
                    "169_class_preflop": measure(full_range, full_range, (), args.repeats),
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
