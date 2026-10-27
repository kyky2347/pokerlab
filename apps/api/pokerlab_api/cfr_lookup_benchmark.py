"""Output-checked river node lookup benchmark / 核对完整状态的河牌节点查找基准。

Run with: uv run python -m pokerlab_api.cfr_lookup_benchmark
The reference traversal is frozen from e2e3985. Shared setup, terminal evaluation
and result generation remain current; this compares algorithms, not commits.
This offline module is never imported by the API.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import time
from unittest.mock import patch

from .cfr import InformationSet, RiverCFRSolver, RiverDeal
from .cfr_allocation_benchmark import stable_state
from .domain import Card
from .engine import PythonPokerEngine, select_engine


class StringLookupReference(RiverCFRSolver):
    """Pre-optimization lazy allocation with per-visit string keys."""

    def _cfr(self, deal: RiverDeal, history: tuple[str, ...], p0: float, p1: float) -> float:
        if self._terminal(history):
            oop_utility = self._oop_terminal_utility(deal, history)
            next_player = 0 if len(history) == 2 else 1
            return oop_utility if next_player == 0 else -oop_utility

        player = self._player(history)
        cards = deal.oop.cards if player == 0 else deal.ip.cards
        actions = self._actions(history)
        key = f"{player}|{self._private_key(cards)}|{'/'.join(history)}"
        node = self.information_sets.get(key)
        if node is None:
            node = self.information_sets[key] = InformationSet(key, actions)
        own_reach = p0 if player == 0 else p1
        strategy = node.strategy(own_reach * deal.chance_weight)
        utilities = [0.0] * len(actions)
        node_utility = 0.0
        for index, action in enumerate(actions):
            next_history = history + (action,)
            if player == 0:
                utilities[index] = -self._cfr(deal, next_history, p0 * strategy[index], p1)
            else:
                utilities[index] = -self._cfr(deal, next_history, p0, p1 * strategy[index])
            node_utility += strategy[index] * utilities[index]
        opponent_reach = p1 if player == 0 else p0
        for index in range(len(actions)):
            regret = deal.chance_weight * opponent_reach * (utilities[index] - node_utility)
            node.regret_sum[index] = max(0.0, node.regret_sum[index] + regret)
        return node_utility


def run(iterations: int = 500, repeats: int = 5) -> dict:
    if any(type(value) is not int or value <= 0 for value in (iterations, repeats)):
        raise ValueError("Benchmark iterations and repeats must be positive integers")
    board = tuple(map(Card.parse, "Ah Kd 7s 3c 2d".split()))
    engines = {engine.name: engine for engine in (PythonPokerEngine(), select_engine())}
    algorithms = {"string": StringLookupReference, "cached": RiverCFRSolver}
    results = []
    for engine in engines.values():
        for rounds in dict.fromkeys((1, iterations)):
            expected = None
            counts = {}
            entries = {}
            times = {name: [] for name in algorithms}

            def execute(cls, engine=engine, rounds=rounds):
                started = time.perf_counter()
                solver = cls(board, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, engine.showdown)
                result = solver.solve(rounds)
                elapsed_ms = (time.perf_counter() - started) * 1000
                return elapsed_ms, solver, stable_state(solver, result)

            def verify(state):
                nonlocal expected
                if expected is None:
                    expected = state
                elif state != expected:
                    raise RuntimeError("CFR result or information-set state changed")

            # Instrument only warmups. Timed runs use fresh instances and no mocks.
            for name, cls in algorithms.items():
                with patch.object(
                    RiverCFRSolver, "_private_key", wraps=RiverCFRSolver._private_key
                ) as format_key:
                    _, solver, state = execute(cls)
                    counts[name] = format_key.call_count
                    entries[name] = len(solver._node_lookup)
                    verify(state)
            for repeat in range(repeats):
                order = tuple(algorithms) if repeat % 2 == 0 else tuple(reversed(algorithms))
                for name in order:
                    elapsed, _, state = execute(algorithms[name])
                    verify(state)
                    times[name].append(elapsed)
            medians = {name: statistics.median(values) for name, values in times.items()}
            results.append(
                {
                    "engine": engine.name,
                    "iterations": rounds,
                    "private_key_formats": counts,
                    "lookup_entries": entries,
                    "times_ms": times,
                    "median_ms": medians,
                    "speedup": medians["string"] / medians["cached"],
                    "validated_state_sha256": hashlib.sha256(
                        json.dumps(expected, sort_keys=True, allow_nan=False).encode()
                    ).hexdigest(),
                    "result": expected["result"],
                }
            )
    return {
        "environment": {"platform": platform.platform(), "python": platform.python_version()},
        "method": {
            "reference_traversal_commit": "e2e3985",
            "repeats": repeats,
            "instrumented_warmups_per_algorithm": 1,
            "timing_instrumented": False,
            "timing_includes_constructor": True,
            "alternating_timed_order": True,
            "fresh_solver_per_run": True,
            "full_result_and_node_state_comparison": True,
        },
        "workload": {
            "board": [str(card) for card in board],
            "oop_range": {"AQo": 1},
            "ip_range": {"KQo": 1},
            "pot": 100,
            "effective_stack": 100,
            "bet_small": 0.5,
            "bet_large": 1,
        },
        "results": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=500)
    parser.add_argument("--repeats", type=int, default=5)
    print(json.dumps(run(**vars(parser.parse_args())), indent=2, allow_nan=False))
