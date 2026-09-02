from __future__ import annotations

import json
import platform
import time

from .cfr import RiverCFRSolver
from .domain import Card, evaluate_seven
from .engine import PythonPokerEngine
from .range_equity import calculate_range_equity


def timed(name: str, count: int, function) -> dict:
    started = time.perf_counter()
    function()
    elapsed = time.perf_counter() - started
    return {
        "benchmark": name,
        "operations": count,
        "seconds": elapsed,
        "per_second": count / elapsed,
    }


def run() -> dict:
    engine = PythonPokerEngine()
    hero = (Card.parse("As"), Card.parse("Ks"))
    villain = (Card.parse("Qh"), Card.parse("Qd"))
    flop = (Card.parse("Js"), Card.parse("8s"), Card.parse("2c"))
    seven = hero + flop + (Card.parse("3d"), Card.parse("4h"))
    board = tuple(Card.parse(token) for token in ("Ah", "Kd", "7s", "3c", "2d"))
    solver = RiverCFRSolver(board, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1.0)
    results = [
        timed(
            "seven-card evaluations", 10_000, lambda: [evaluate_seven(seven) for _ in range(10_000)]
        ),
        timed(
            "exact flop scenarios",
            3,
            lambda: [engine.exact_equity(hero, villain, flop) for _ in range(3)],
        ),
        timed(
            "Monte Carlo samples",
            10_000,
            lambda: engine.monte_carlo(hero, villain, flop, 10_000, 7),
        ),
        timed(
            "range-vs-range scenario",
            1,
            lambda: calculate_range_equity({"AQo": 1}, {"KQo": 1}, board, 7, 1000),
        ),
        timed("CFR iterations", 500, lambda: solver.solve(500)),
    ]
    return {
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "processor": platform.processor() or platform.machine(),
            "engine": engine.name,
        },
        "results": results,
    }


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
