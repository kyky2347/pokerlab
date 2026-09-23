from __future__ import annotations

import argparse
import json
import platform
import statistics
import time

from .cfr import RiverCFRSolver
from .domain import Card, evaluate_seven, full_deck
from .engine import PythonPokerEngine, select_engine
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


def run_range_benchmark() -> dict:
    """Fixed workload for end-to-end weighted-sampling regressions / 范围采样基准。"""
    weights = dict(
        zip(
            "AA KK QQ JJ TT 99 88 77 AKs AQs AJs ATs KQs KJs QJs JTs AKo AQo AJo KQo".split(),
            (
                1,
                1,
                0.9,
                0.8,
                0.7,
                0.6,
                0.5,
                0.4,
                1,
                0.9,
                0.8,
                0.7,
                0.8,
                0.6,
                0.5,
                0.4,
                0.9,
                0.7,
                0.5,
                0.4,
            ),
            strict=True,
        )
    )
    board = tuple(Card.parse(token) for token in ("2c", "7d", "9h"))
    engines = {engine.name: engine for engine in (PythonPokerEngine(), select_engine())}
    results = []
    for engine in engines.values():
        runs = [
            calculate_range_equity(weights, weights, board, 7, 5_000, engine.showdown)
            for _ in range(3)
        ]
        stable_results = [
            {key: value for key, value in run.items() if key != "runtime_ms"} for run in runs
        ]
        assert all(result == stable_results[0] for result in stable_results)
        results.append(
            {
                "engine": engine.name,
                "times_ms": [run["runtime_ms"] for run in runs],
                "median_ms": statistics.median(run["runtime_ms"] for run in runs),
                "result": stable_results[0],
            }
        )
    return {
        "environment": {"platform": platform.platform(), "python": platform.python_version()},
        "workload": {
            "hero_range": weights,
            "villain_range": weights,
            "board": [str(card) for card in board],
            "seed": 7,
            "samples": 5_000,
            "repeats": 3,
        },
        "results": results,
    }


def run_turn_map_benchmark() -> dict:
    """Compare exact algorithms with identical evaluators / 相同评估器的精确算法对照。"""
    hero = (Card.parse("As"), Card.parse("Ks"))
    villain = (Card.parse("Qh"), Card.parse("Qd"))
    flop = tuple(map(Card.parse, ("Js", "8s", "2c")))
    remaining = tuple(card for card in full_deck() if card not in hero + villain + flop)
    engines = {engine.name: engine for engine in (PythonPokerEngine(), select_engine())}
    results = []
    for engine in engines.values():

        def independent_turns(engine=engine):
            return [
                {
                    "card": str(turn),
                    "equity": engine.exact_equity(hero, villain, flop + (turn,))["equity"],
                }
                for turn in remaining
            ]

        algorithms = {
            "independent_turns": independent_turns,
            "shared_runouts": lambda engine=engine: engine.turn_map(hero, villain, flop),
        }
        expected = independent_turns()
        if engine.turn_map(hero, villain, flop) != expected:
            raise RuntimeError("Turn-map algorithms disagree")
        times: dict[str, list[float]] = {name: [] for name in algorithms}
        for repeat in range(5):
            order = list(algorithms) if repeat % 2 == 0 else list(reversed(algorithms))
            for name in order:
                started = time.perf_counter()
                result = algorithms[name]()
                times[name].append((time.perf_counter() - started) * 1000)
                if result != expected:
                    raise RuntimeError("Turn-map benchmark changed an exact result")
        medians = {name: statistics.median(values) for name, values in times.items()}
        results.append(
            {
                "engine": engine.name,
                "times_ms": times,
                "median_ms": medians,
                "speedup": medians["independent_turns"] / medians["shared_runouts"],
                "turns": expected,
            }
        )
    return {
        "environment": {"platform": platform.platform(), "python": platform.python_version()},
        "workload": {
            "hero": [str(card) for card in hero],
            "villain": [str(card) for card in villain],
            "flop": [str(card) for card in flop],
            "repeats": 5,
            "warmup_runs_per_algorithm": 1,
            "alternating_order": True,
            "legal_turns": 45,
            "rivers_per_turn": 44,
            "showdown_evaluations": {"independent_turns": 1980, "shared_runouts": 990},
        },
        "results": results,
    }


def run_solver_benchmark() -> dict:
    """Compare fresh solver jobs; count real evaluations / 新任务的真实摊牌评估对照。"""

    class UncachedRiverSolver(RiverCFRSolver):
        def _showdown_outcome(self, deal):
            return self.evaluator(deal.oop.cards, deal.ip.cards, self.board)

    board = tuple(map(Card.parse, ("Ah", "Kd", "7s", "3c", "2d")))
    engines = {engine.name: engine for engine in (PythonPokerEngine(), select_engine())}
    algorithms = {"uncached": UncachedRiverSolver, "cached": RiverCFRSolver}
    results = []
    for engine in engines.values():
        expected = None
        times: dict[str, list[float]] = {name: [] for name in algorithms}
        evaluations: dict[str, list[int]] = {name: [] for name in algorithms}
        for repeat in range(4):  # First pair is warmup; alternate order afterwards.
            order = list(algorithms) if repeat % 2 == 0 else list(reversed(algorithms))
            for name in order:
                calls = 0

                def evaluate(oop, ip, board, engine=engine):
                    nonlocal calls
                    calls += 1
                    return engine.showdown(oop, ip, board)

                started = time.perf_counter()
                solver = algorithms[name](board, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, evaluate)
                result = solver.solve(100)
                elapsed_ms = (time.perf_counter() - started) * 1000
                stable = {key: value for key, value in result.items() if key != "runtime_ms"}
                if expected is None:
                    expected = stable
                if stable != expected:
                    raise RuntimeError("Solver benchmark changed a strategy or convergence result")
                if repeat:
                    times[name].append(elapsed_ms)
                    evaluations[name].append(calls)
        medians = {name: statistics.median(values) for name, values in times.items()}
        results.append(
            {
                "engine": engine.name,
                "times_ms": times,
                "median_ms": medians,
                "speedup": medians["uncached"] / medians["cached"],
                "showdown_evaluations": evaluations,
                "result": expected,
            }
        )
    return {
        "environment": {"platform": platform.platform(), "python": platform.python_version()},
        "workload": {
            "board": [str(card) for card in board],
            "oop_range": {"AQo": 1},
            "ip_range": {"KQo": 1},
            "pot": 100,
            "effective_stack": 100,
            "bet_small": 0.5,
            "bet_large": 1,
            "iterations": 100,
            "repeats": 3,
            "warmup_jobs_per_algorithm": 1,
            "alternating_order": True,
            "fresh_solver_per_run": True,
        },
        "results": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PokerLab reproducible benchmarks / 可复现基准")
    workload = parser.add_mutually_exclusive_group()
    workload.add_argument(
        "--range-only", action="store_true", help="Benchmark weighted sampling / 范围采样基准"
    )
    workload.add_argument(
        "--turn-map-only", action="store_true", help="Benchmark exact turn maps / 精确转牌地图基准"
    )
    workload.add_argument(
        "--solver-only",
        action="store_true",
        help="Benchmark river solver caching / 河牌求解缓存基准",
    )
    args = parser.parse_args()
    if args.solver_only:
        benchmark = run_solver_benchmark
    elif args.turn_map_only:
        benchmark = run_turn_map_benchmark
    elif args.range_only:
        benchmark = run_range_benchmark
    else:
        benchmark = run
    print(json.dumps(benchmark(), indent=2))
