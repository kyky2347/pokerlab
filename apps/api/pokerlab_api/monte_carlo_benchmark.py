"""Output-checked fixed-hand sampling benchmark / 核对完整输出的固定手牌采样基准.

The uncached loop is frozen from 26720ac for benchmarks/tests only. Both variants
use the same current showdown evaluator; no historical binary is loaded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import random
import statistics
import time

from .domain import Card, full_deck, validate_holdem_state
from .engine import EquityCounts, PythonPokerEngine, select_engine
from .uncertainty import (
    CONFIDENCE_LEVEL,
    CONFIDENCE_METHOD,
    CONFIDENCE_SCOPE,
    hoeffding_interval,
)


def uncached_monte_carlo(engine, hero, villain, board, samples, seed):
    """Original sampling/aggregation loop; never called by a production endpoint."""
    validate_holdem_state(hero, villain, board)
    if samples < 1:
        raise ValueError("Sample count must be positive")
    started = time.perf_counter()
    rng = random.Random(seed)
    known = set(hero + villain + board)
    remaining = tuple(card for card in full_deck() if card not in known)
    missing = 5 - len(board)
    counts = EquityCounts()
    sum_x = sum_x2 = 0.0
    convergence = []
    interval = max(1, samples // 80)
    for index in range(1, samples + 1):
        runout = tuple(rng.sample(remaining, missing))
        outcome = engine.showdown(hero, villain, board + runout)
        counts.add(outcome)
        sum_x += outcome
        sum_x2 += outcome * outcome
        if index == 1 or index == samples or index % interval == 0:
            mean = sum_x / index
            ci_low, ci_high = hoeffding_interval(mean, index)
            convergence.append(
                {"samples": index, "estimate": mean, "ci_low": ci_low, "ci_high": ci_high}
            )
    probabilities = counts.probabilities()
    mean = probabilities["equity"]
    variance = max(0.0, (sum_x2 - samples * mean * mean) / (samples - 1)) if samples > 1 else None
    se = math.sqrt(variance / samples) if variance is not None else None
    ci_low, ci_high = hoeffding_interval(mean, samples)
    probabilities.update(
        {
            "method": "monte_carlo",
            "samples": samples,
            "sample_variance": variance,
            "standard_error": se,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "confidence_level": CONFIDENCE_LEVEL,
            "confidence_method": CONFIDENCE_METHOD,
            "confidence_scope": CONFIDENCE_SCOPE,
            "seed": seed,
            "runtime_ms": (time.perf_counter() - started) * 1000,
            "engine": engine.name,
            "convergence": convergence,
        }
    )
    return probabilities


def stable_result(result):
    return {key: value for key, value in result.items() if key != "runtime_ms"}


class CountingEngine(PythonPokerEngine):
    def __init__(self, backend):
        self.backend = backend
        self.name = backend.name
        self.evaluations = 0

    def showdown(self, hero, villain, board):
        self.evaluations += 1
        return self.backend.showdown(hero, villain, board)


def run(*, repeats=3, samples=10_000, seed=7):
    if type(repeats) is not int or not 1 <= repeats <= 20:
        raise ValueError("Repeats must be an integer from 1 to 20")
    if type(samples) is not int or not 1 <= samples <= 500_000:
        raise ValueError("Samples must be an integer from 1 to 500000")
    if type(seed) is not int or not 0 <= seed <= 2**63 - 1:
        raise ValueError("Seed must be an integer from 0 to 2^63 - 1")
    hero = tuple(map(Card.parse, ("As", "Ks")))
    villain = tuple(map(Card.parse, ("Qh", "Qd")))
    full_board = tuple(map(Card.parse, ("Js", "8s", "2c", "3d", "4h")))
    engines = {engine.name: engine for engine in (PythonPokerEngine(), select_engine())}
    rows = []
    for backend in engines.values():
        for stage, size in (("preflop", 0), ("flop", 3), ("turn", 4), ("river", 5)):
            board = full_board[:size]
            expected = None
            timings = {name: [] for name in ("uncached", "request_cache")}
            evaluations = {}
            for repeat in range(repeats + 1):
                order = list(timings) if repeat % 2 == 0 else list(reversed(timings))
                for name in order:
                    # Count only during warmup: instrumentation must not inflate
                    # the cost of the variant with more evaluator calls.
                    engine = CountingEngine(backend) if repeat == 0 else backend
                    started = time.perf_counter()
                    result = (
                        uncached_monte_carlo(engine, hero, villain, board, samples, seed)
                        if name == "uncached"
                        else engine.monte_carlo(hero, villain, board, samples, seed)
                    )
                    elapsed_ms = (time.perf_counter() - started) * 1000
                    stable = stable_result(result)
                    if expected is None:
                        expected = stable
                    if stable != expected:
                        raise RuntimeError("Monte Carlo result differs from the uncached reference")
                    if repeat:
                        timings[name].append(elapsed_ms)
                    else:
                        evaluations[name] = engine.evaluations
            medians = {name: statistics.median(values) for name, values in timings.items()}
            rows.append(
                {
                    "engine": backend.name,
                    "stage": stage,
                    "board": list(map(str, board)),
                    "times_ms": timings,
                    "median_ms": medians,
                    "uncached_over_request_cache": medians["uncached"] / medians["request_cache"],
                    "showdown_evaluations": evaluations,
                    "complete_result_match": True,
                    "result_sha256": hashlib.sha256(
                        json.dumps(expected, sort_keys=True, separators=(",", ":")).encode()
                    ).hexdigest(),
                    "equity": expected["equity"],
                    "ci_low": expected["ci_low"],
                    "ci_high": expected["ci_high"],
                }
            )
    return {
        "environment": {"platform": platform.platform(), "python": platform.python_version()},
        "workload": {
            "hero": list(map(str, hero)),
            "villain": list(map(str, villain)),
            "samples": samples,
            "seed": seed,
            "repeats": repeats,
            "warmup_runs_per_variant": 1,
            "alternating_order": True,
            "fresh_request_cache_per_run": True,
            "evaluation_counts_from_warmup_only": True,
            "cache_entry_bounds": {"preflop": 0, "flop": 990, "turn": 44, "river": 1},
            "baseline": "Uncached sampling loop frozen from 26720ac; same current evaluator",
            "scope": (
                "Validation, sampling, showdown, aggregation and result construction; "
                "no counting wrapper during timed runs. Excludes HTTP, database and UI. "
                "Preflop is an uncached control, not an optimized workload."
            ),
        },
        "results": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--samples", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    print(json.dumps(run(repeats=args.repeats, samples=args.samples, seed=args.seed), indent=2))


if __name__ == "__main__":
    main()
