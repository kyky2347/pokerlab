"""Output-checked CFR allocation comparison / 核对完整状态的 CFR 分配对照。

Run with: uv run python -m pokerlab_api.cfr_allocation_benchmark
The reference traversals are frozen from d8d4e15. Shared helpers, evaluators,
validation, and result generation remain current; this is not a commit benchmark.
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

from . import cfr
from .cfr import InformationSet, KuhnPokerCFR, RiverCFRSolver, RiverDeal
from .domain import Card
from .engine import PythonPokerEngine, select_engine


class EagerKuhnReference(KuhnPokerCFR):
    """Original eager allocation, including the original floating-point order."""

    def _cfr(self, cards: tuple[int, int], history: str, p0: float, p1: float) -> float:
        plays = len(history)
        player = plays % 2
        opponent = 1 - player
        if plays > 1:
            terminal_pass = history[-1] == "p"
            double_bet = history[-2:] == "bb"
            higher = cards[player] > cards[opponent]
            if terminal_pass:
                return 1.0 if history.endswith("bp") else (1.0 if higher else -1.0)
            if double_bet:
                return 2.0 if higher else -2.0

        key = f"{cards[player]}{history}"
        node = self.information_sets.setdefault(key, InformationSet(key, ("p", "b")))
        strategy = node.strategy(p0 if player == 0 else p1)
        utilities = [0.0, 0.0]
        node_utility = 0.0
        for action_index, action in enumerate(node.actions):
            next_history = history + action
            if player == 0:
                utilities[action_index] = -self._cfr(
                    cards, next_history, p0 * strategy[action_index], p1
                )
            else:
                utilities[action_index] = -self._cfr(
                    cards, next_history, p0, p1 * strategy[action_index]
                )
            node_utility += strategy[action_index] * utilities[action_index]
        opponent_reach = p1 if player == 0 else p0
        for action_index in range(2):
            regret = utilities[action_index] - node_utility
            node.regret_sum[action_index] += opponent_reach * regret
        return node_utility


class EagerRiverReference(RiverCFRSolver):
    """Original eager allocation; retain the existing per-job showdown cache."""

    def _cfr(self, deal: RiverDeal, history: tuple[str, ...], p0: float, p1: float) -> float:
        if self._terminal(history):
            oop_utility = self._oop_terminal_utility(deal, history)
            next_player = 0 if len(history) == 2 else 1
            return oop_utility if next_player == 0 else -oop_utility

        player = self._player(history)
        cards = deal.oop.cards if player == 0 else deal.ip.cards
        actions = self._actions(history)
        key = f"{player}|{self._private_key(cards)}|{'/'.join(history)}"
        node = self.information_sets.setdefault(key, InformationSet(key, actions))
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


def stable_state(solver, result: dict) -> dict:
    """Compare every node, not just the public root-strategy aggregation."""
    return {
        "result": {key: value for key, value in result.items() if key != "runtime_ms"},
        "nodes": {
            key: {
                "key": node.key,
                "actions": node.actions,
                "regret_sum": list(node.regret_sum),
                "strategy_sum": list(node.strategy_sum),
                "average_strategy": node.average_strategy(),
            }
            for key, node in solver.information_sets.items()
        },
        "node_order": list(solver.information_sets),
    }


def run(*, kuhn_iterations: int = 5_000, river_iterations: int = 500, repeats: int = 5) -> dict:
    for value in (kuhn_iterations, river_iterations, repeats):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError("Benchmark iterations and repeats must be positive integers")
    board = tuple(map(Card.parse, "Ah Kd 7s 3c 2d".split()))
    engines = {engine.name: engine for engine in (PythonPokerEngine(), select_engine())}
    workloads = [
        (
            "kuhn",
            "not applicable",
            kuhn_iterations,
            {
                "eager": EagerKuhnReference,
                "lazy": KuhnPokerCFR,
            },
        ),
    ]
    for engine in engines.values():
        factories = {
            name: lambda cls=cls, engine=engine: cls(
                board, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, engine.showdown
            )
            for name, cls in (("eager", EagerRiverReference), ("lazy", RiverCFRSolver))
        }
        workloads.append(("river", engine.name, river_iterations, factories))

    results = []
    for game, engine_name, iterations, factories in workloads:
        expected = None
        counts = {}
        times = {name: [] for name in factories}

        def execute(factory, game=game, iterations=iterations):
            started = time.perf_counter()
            solver = factory()
            result = solver.train(iterations) if game == "kuhn" else solver.solve(iterations)
            elapsed_ms = (time.perf_counter() - started) * 1000
            return elapsed_ms, stable_state(solver, result)

        # Count actual constructors only in the untimed warmup. Both namespaces
        # use the same constructor; timed runs have no mocks or instrumentation.
        for name, factory in factories.items():
            calls = 0
            constructor = InformationSet

            def counted(*args, constructor=constructor, **kwargs):
                nonlocal calls
                calls += 1
                return constructor(*args, **kwargs)

            with (
                patch.object(cfr, "InformationSet", counted),
                patch(f"{__name__}.InformationSet", counted),
            ):
                _, state = execute(factory)
                counts[name] = calls
            if expected is None:
                expected = state
            if state != expected:
                raise RuntimeError("CFR benchmark changed a result or information-set state")

        for repeat in range(repeats):
            order = list(factories) if repeat % 2 == 0 else list(reversed(factories))
            for name in order:
                elapsed, state = execute(factories[name])
                if state != expected:
                    raise RuntimeError("CFR benchmark changed a result or information-set state")
                times[name].append(elapsed)
        medians = {name: statistics.median(values) for name, values in times.items()}
        results.append(
            {
                "game": game,
                "engine": engine_name,
                "iterations": iterations,
                "information_set_constructions": counts,
                "retained_information_sets": len(expected["nodes"]),
                "times_ms": times,
                "median_ms": medians,
                "speedup": medians["eager"] / medians["lazy"],
                "validated_state_sha256": hashlib.sha256(
                    json.dumps(expected, sort_keys=True, allow_nan=False).encode()
                ).hexdigest(),
                "result": expected["result"],
            }
        )
    return {
        "environment": {"platform": platform.platform(), "python": platform.python_version()},
        "method": {
            "reference_traversal_commit": "d8d4e15",
            "repeats": repeats,
            "instrumented_warmups_per_algorithm": 1,
            "timing_instrumented": False,
            "alternating_timed_order": True,
            "fresh_solver_per_run": True,
            "full_result_and_node_state_comparison": True,
        },
        "river_workload": {
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
    parser.add_argument("--kuhn-iterations", type=int, default=5_000)
    parser.add_argument("--river-iterations", type=int, default=500)
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()
    print(json.dumps(run(**vars(args)), indent=2, allow_nan=False))
