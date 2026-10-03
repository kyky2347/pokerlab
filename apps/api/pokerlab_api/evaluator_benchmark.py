"""Output-checked Rust evaluator benchmarks / 核对完整结果的 Rust 评估器基准。

An optional baseline must be a trusted, locally built PyO3 extension. It is
loaded alongside the installed candidate, so timed runs can alternate order.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import platform
import random
import statistics
import time
from pathlib import Path

from .domain import Card, evaluate_seven, full_deck
from .engine import PythonPokerEngine, RustPokerEngine


def _load_baseline(path: Path):
    spec = importlib.util.spec_from_file_location("pokerlab_baseline.poker_core_rs", path)
    if spec is None or spec.loader is None:
        raise ValueError("Baseline must be a trusted compiled poker_core_rs extension")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _stable(result):
    if isinstance(result, dict):
        return {key: value for key, value in result.items() if key not in {"runtime_ms", "engine"}}
    return result


def _digest(result) -> str:
    return hashlib.sha256(
        json.dumps(result, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def run(
    baseline_extension: Path | None = None,
    *,
    repeats: int = 5,
    seed: int = 20251003,
    hand_count: int = 5_000,
    samples: int = 10_000,
) -> dict:
    for value in (repeats, hand_count, samples):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError("Repeats, hand count, and samples must be positive integers")
    candidate = RustPokerEngine()  # Explicit benchmark: do not mislabel a fallback as Rust.
    engines = {"candidate": candidate}
    if baseline_extension is not None:
        baseline = RustPokerEngine()
        baseline._rust = _load_baseline(baseline_extension)
        engines = {"baseline": baseline, **engines}
    rng = random.Random(seed)
    deck = full_deck()
    hands = [tuple(rng.sample(deck, 7)) for _ in range(hand_count)]
    tokens = [[str(card) for card in hand] for hand in hands]
    hero = tuple(map(Card.parse, ("As", "Ks")))
    villain = tuple(map(Card.parse, ("Qh", "Qd")))
    flop = tuple(map(Card.parse, ("Js", "8s", "2c")))
    reference = PythonPokerEngine()
    cases = {
        "seven_card_batch": (
            lambda engine: [tuple(engine._rust.evaluate_seven(hand)) for hand in tokens],
            [tuple(evaluate_seven(hand)) for hand in hands],
        ),
        "exact_flop": (
            lambda engine: engine.exact_equity(hero, villain, flop),
            _stable(reference.exact_equity(hero, villain, flop)),
        ),
        "monte_carlo": (
            lambda engine: engine.monte_carlo(hero, villain, flop, samples, seed),
            _stable(reference.monte_carlo(hero, villain, flop, samples, seed)),
        ),
        "turn_map": (
            lambda engine: engine.turn_map(hero, villain, flop),
            reference.turn_map(hero, villain, flop),
        ),
    }
    results = []
    for name, (calculate, expected) in cases.items():
        times = {variant: [] for variant in engines}
        for repeat in range(repeats + 1):  # First run of each variant is warmup.
            order = list(engines) if repeat % 2 == 0 else list(reversed(engines))
            for variant in order:
                started = time.perf_counter()
                actual = calculate(engines[variant])
                elapsed = (time.perf_counter() - started) * 1000
                if _stable(actual) != expected:
                    raise RuntimeError(f"{name}: {variant} disagrees with the Python reference")
                if repeat:
                    times[variant].append(elapsed)
        medians = {variant: statistics.median(values) for variant, values in times.items()}
        result = {
            "benchmark": name,
            "times_ms": times,
            "median_ms": medians,
            "result_sha256": _digest(expected),
            "reference_match": True,
        }
        if "baseline" in engines:
            result["baseline_over_candidate"] = medians["baseline"] / medians["candidate"]
        results.append(result)
    return {
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "engine": candidate.name,
            "baseline_extension_sha256": (
                hashlib.sha256(baseline_extension.read_bytes()).hexdigest()
                if baseline_extension is not None
                else None
            ),
        },
        "workload": {
            "seed": seed,
            "hand_count": hand_count,
            "samples": samples,
            "hero": [str(card) for card in hero],
            "villain": [str(card) for card in villain],
            "flop": [str(card) for card in flop],
            "deck_order": [str(card) for card in deck],
            "repeats": repeats,
            "warmup_runs_per_variant": 1,
            "alternating_order": True,
            "timing_scope": "Core calls only; excludes reference checks, HTTP, database and UI",
        },
        "results": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--baseline-extension", type=Path, help="Trusted baseline .so / 可信基线扩展"
    )
    print(json.dumps(run(parser.parse_args().baseline_extension), indent=2))
