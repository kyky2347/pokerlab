"""PokerEngine interface with deterministic reference and optional Rust implementations."""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass
from itertools import combinations
from typing import Protocol

from .domain import Card, full_deck, showdown, validate_holdem_state


@dataclass(slots=True)
class EquityCounts:
    wins: int = 0
    ties: int = 0
    losses: int = 0

    @property
    def total(self) -> int:
        return self.wins + self.ties + self.losses

    def add(self, outcome: float) -> None:
        if outcome == 1:
            self.wins += 1
        elif outcome == 0.5:
            self.ties += 1
        else:
            self.losses += 1

    def probabilities(self) -> dict[str, float]:
        if not self.total:
            raise ValueError("No outcomes were evaluated")
        return {
            "equity": (self.wins + 0.5 * self.ties) / self.total,
            "win": self.wins / self.total,
            "tie": self.ties / self.total,
            "lose": self.losses / self.total,
        }


class PokerEngine(Protocol):
    name: str

    def showdown(
        self, hero: tuple[Card, Card], villain: tuple[Card, Card], board: tuple[Card, ...]
    ) -> float: ...

    def exact_equity(
        self, hero: tuple[Card, Card], villain: tuple[Card, Card], board: tuple[Card, ...]
    ) -> dict: ...

    def monte_carlo(
        self,
        hero: tuple[Card, Card],
        villain: tuple[Card, Card],
        board: tuple[Card, ...],
        samples: int,
        seed: int,
    ) -> dict: ...


class PythonPokerEngine:
    name = "Python reference"

    def showdown(
        self, hero: tuple[Card, Card], villain: tuple[Card, Card], board: tuple[Card, ...]
    ) -> float:
        return showdown(hero, villain, board)

    def exact_equity(
        self, hero: tuple[Card, Card], villain: tuple[Card, Card], board: tuple[Card, ...]
    ) -> dict:
        validate_holdem_state(hero, villain, board)
        started = time.perf_counter()
        known = set(hero + villain + board)
        remaining = tuple(card for card in full_deck() if card not in known)
        missing = 5 - len(board)
        states = math.comb(len(remaining), missing)
        if states > 2_000_000:
            raise ValueError(
                f"Exact enumeration would require {states:,} runouts; use Monte Carlo instead"
            )
        counts = EquityCounts()
        for runout in combinations(remaining, missing):
            counts.add(self.showdown(hero, villain, board + runout))
        result = counts.probabilities()
        result.update(
            {
                "method": "exact",
                "states": counts.total,
                "runtime_ms": (time.perf_counter() - started) * 1000,
                "engine": self.name,
            }
        )
        return result

    def monte_carlo(
        self,
        hero: tuple[Card, Card],
        villain: tuple[Card, Card],
        board: tuple[Card, ...],
        samples: int,
        seed: int,
    ) -> dict:
        validate_holdem_state(hero, villain, board)
        if samples < 1:
            raise ValueError("Sample count must be positive")
        started = time.perf_counter()
        rng = random.Random(seed)
        known = set(hero + villain + board)
        remaining = tuple(card for card in full_deck() if card not in known)
        missing = 5 - len(board)
        counts = EquityCounts()
        sum_x = 0.0
        sum_x2 = 0.0
        convergence: list[dict[str, float | int]] = []
        interval = max(1, samples // 80)
        for index in range(1, samples + 1):
            runout = tuple(rng.sample(remaining, missing))
            outcome = self.showdown(hero, villain, board + runout)
            counts.add(outcome)
            sum_x += outcome
            sum_x2 += outcome * outcome
            if index == 1 or index == samples or index % interval == 0:
                mean = sum_x / index
                variance = max(0.0, (sum_x2 - index * mean * mean) / max(1, index - 1))
                se = math.sqrt(variance / index)
                convergence.append(
                    {
                        "samples": index,
                        "estimate": mean,
                        "ci_low": max(0.0, mean - 1.96 * se),
                        "ci_high": min(1.0, mean + 1.96 * se),
                    }
                )
        probabilities = counts.probabilities()
        mean = probabilities["equity"]
        variance = max(0.0, (sum_x2 - samples * mean * mean) / max(1, samples - 1))
        se = math.sqrt(variance / samples)
        probabilities.update(
            {
                "method": "monte_carlo",
                "samples": samples,
                "sample_variance": variance,
                "standard_error": se,
                "ci_low": max(0.0, mean - 1.96 * se),
                "ci_high": min(1.0, mean + 1.96 * se),
                "seed": seed,
                "runtime_ms": (time.perf_counter() - started) * 1000,
                "engine": self.name,
                "convergence": convergence,
            }
        )
        return probabilities

    def turn_map(
        self, hero: tuple[Card, Card], villain: tuple[Card, Card], flop: tuple[Card, ...]
    ) -> list[dict[str, float | str]]:
        if len(flop) != 3:
            raise ValueError("Conditional turn explorer requires exactly three flop cards")
        validate_holdem_state(hero, villain, flop)
        blocked = set(hero + villain + flop)
        values: list[dict[str, float | str]] = []
        for turn in full_deck():
            if turn in blocked:
                continue
            result = self.exact_equity(hero, villain, flop + (turn,))
            values.append({"card": str(turn), "equity": result["equity"]})
        return values


class RustPokerEngine(PythonPokerEngine):
    """Uses Rust for terminal evaluation while preserving reference orchestration."""

    name = "Rust accelerated"

    def __init__(self) -> None:
        import poker_core_rs  # type: ignore[import-not-found]

        self._rust = poker_core_rs
        deck = self._rust.deck()
        if len(deck) != 52 or len(set(deck)) != 52:
            raise ValueError("Rust evaluator returned an invalid deck")
        rank = self._rust.evaluate_seven(["As", "Ks", "Qs", "Js", "Ts", "2d", "3c"])
        if tuple(rank) != (8, 14):
            raise ValueError("Rust evaluator failed its startup smoke test")

    def showdown(
        self, hero: tuple[Card, Card], villain: tuple[Card, Card], board: tuple[Card, ...]
    ) -> float:
        hero_rank = tuple(self._rust.evaluate_seven([str(card) for card in hero + board]))
        villain_rank = tuple(self._rust.evaluate_seven([str(card) for card in villain + board]))
        if hero_rank > villain_rank:
            return 1.0
        if hero_rank == villain_rank:
            return 0.5
        return 0.0


def select_engine() -> PokerEngine:
    try:
        return RustPokerEngine()
    except (ImportError, OSError, AttributeError, RuntimeError, TypeError, ValueError):
        return PythonPokerEngine()
