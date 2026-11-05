"""Output-checked single-call Rust showdown benchmark / 核对输出的 Rust 单次摊牌调用基准。"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import random
import statistics
import time

from .controls import validate_seed
from .domain import full_deck, parse_cards, validate_showdown_state
from .engine import PythonPokerEngine, RustPokerEngine
from .range_equity import calculate_range_equity


class LegacyRustEngine(RustPokerEngine):
    """Frozen abbd202 two-call bridge; benchmarks/tests only, same rank kernel."""

    def showdown(self, hero, villain, board):
        validate_showdown_state(hero, villain, board)
        hero_rank = tuple(self._rust.evaluate_seven([str(card) for card in hero + board]))
        villain_rank = tuple(self._rust.evaluate_seven([str(card) for card in villain + board]))
        if hero_rank > villain_rank:
            return 1.0
        if hero_rank == villain_rank:
            return 0.5
        return 0.0


def stable_result(result):
    return (
        {key: value for key, value in result.items() if key not in {"runtime_ms", "engine"}}
        if isinstance(result, dict)
        else result
    )


def run(*, repeats=5, deals=5000, samples=10000, seed=20261105):
    for name, value, ceiling in (
        ("Repeats", repeats, 20),
        ("Deals", deals, 100_000),
        ("Samples", samples, 100_000),
    ):
        if type(value) is not int or not 1 <= value <= ceiling:
            raise ValueError(f"{name} must be an integer between 1 and {ceiling}")
    validate_seed(seed)
    engines = {"two_calls": LegacyRustEngine(), "native_showdown": RustPokerEngine()}
    if not callable(getattr(engines["native_showdown"]._rust, "showdown", None)):
        raise RuntimeError("Rebuild poker-core-rs before benchmarking native showdown")
    rng = random.Random(seed)
    deck = full_deck()
    inputs = [tuple(rng.sample(deck, 9)) for _ in range(deals)]
    hero, villain = parse_cards(["As", "Ks"]), parse_cards(["Qh", "Qd"])
    flop = parse_cards(["Js", "8s", "2c"])
    reference = PythonPokerEngine()
    workloads = {
        "showdown_batch": lambda engine: [
            engine.showdown(deal[:2], deal[2:4], deal[4:]) for deal in inputs
        ],
        "exact_flop": lambda engine: engine.exact_equity(hero, villain, flop),
        "monte_carlo_preflop": lambda engine: engine.monte_carlo(hero, villain, (), samples, seed),
        "monte_carlo_flop": lambda engine: engine.monte_carlo(hero, villain, flop, samples, seed),
        "turn_map": lambda engine: engine.turn_map(hero, villain, flop),
        "range_preflop": lambda engine: calculate_range_equity(
            {"AA": 0.25, "AKs": 1}, {"KK": 1, "QJs": 0.75}, (), seed, samples, engine.showdown
        ),
    }
    results = []
    for name, calculate in workloads.items():
        expected = stable_result(calculate(reference))
        timings = {variant: [] for variant in engines}
        for repeat in range(repeats + 1):
            order = list(engines) if repeat % 2 == 0 else list(reversed(engines))
            for variant in order:
                started = time.perf_counter()
                actual = calculate(engines[variant])
                elapsed_ms = (time.perf_counter() - started) * 1000
                if stable_result(actual) != expected:
                    raise RuntimeError(f"{name}: {variant} differs from the Python reference")
                if repeat:
                    timings[variant].append(elapsed_ms)
        medians = {variant: statistics.median(values) for variant, values in timings.items()}
        results.append(
            {
                "workload": name,
                "times_ms": timings,
                "median_ms": medians,
                "two_calls_over_native": medians["two_calls"] / medians["native_showdown"],
                "complete_result_match": True,
                "result_sha256": hashlib.sha256(
                    json.dumps(expected, sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest(),
            }
        )
    return {
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "engine": engines["native_showdown"].name,
        },
        "method": {
            "baseline": "Two-call Rust bridge frozen from abbd202; same current Rust rank kernel",
            "seed": seed,
            "deals": deals,
            "samples": samples,
            "repeats": repeats,
            "warmups_per_variant": 1,
            "alternating_order": True,
            "scope": "Full core calls; excludes generation, reference checks, HTTP, DB and UI",
            "hero": list(map(str, hero)),
            "villain": list(map(str, villain)),
            "flop": list(map(str, flop)),
        },
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--deals", type=int, default=5000)
    parser.add_argument("--samples", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=20261105)
    print(json.dumps(run(**vars(parser.parse_args())), indent=2))


if __name__ == "__main__":
    main()
