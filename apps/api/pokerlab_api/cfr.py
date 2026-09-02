"""From-scratch CFR fixtures and a finite educational Hold'em river solver."""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from itertools import permutations

from .domain import Card, showdown
from .ranges import WeightedCombo, combo_class, expand_weighted_range


@dataclass(slots=True)
class InformationSet:
    key: str
    actions: tuple[str, ...]
    regret_sum: list[float] = field(init=False)
    strategy_sum: list[float] = field(init=False)

    def __post_init__(self) -> None:
        self.regret_sum = [0.0] * len(self.actions)
        self.strategy_sum = [0.0] * len(self.actions)

    def strategy(self, reach_probability: float) -> list[float]:
        positive = [max(0.0, regret) for regret in self.regret_sum]
        normalizer = sum(positive)
        if normalizer > 0:
            strategy = [regret / normalizer for regret in positive]
        else:
            strategy = [1 / len(self.actions)] * len(self.actions)
        for index, probability in enumerate(strategy):
            self.strategy_sum[index] += reach_probability * probability
        return strategy

    def average_strategy(self) -> list[float]:
        normalizer = sum(self.strategy_sum)
        if normalizer <= 0:
            return [1 / len(self.actions)] * len(self.actions)
        return [value / normalizer for value in self.strategy_sum]


class KuhnPokerCFR:
    """Deterministic full-deal CFR for the canonical three-card Kuhn game."""

    def __init__(self) -> None:
        self.information_sets: dict[str, InformationSet] = {}

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

    def train(self, iterations: int = 20_000) -> dict:
        utility = 0.0
        deals = tuple(permutations((1, 2, 3), 2))
        for _ in range(iterations):
            for deal in deals:
                utility += self._cfr(deal, "", 1.0, 1.0)
        strategies = {
            key: dict(zip(node.actions, node.average_strategy(), strict=True))
            for key, node in sorted(self.information_sets.items())
        }
        return {
            "iterations": iterations,
            "game_value_player_0": utility / (iterations * len(deals)),
            "known_value_player_0": -1 / 18,
            "strategies": strategies,
        }


@dataclass(frozen=True, slots=True)
class RiverDeal:
    oop: WeightedCombo
    ip: WeightedCombo
    chance_weight: float


class RiverCFRSolver:
    """CFR+ over a deliberately finite no-raise river betting tree."""

    def __init__(
        self,
        board: tuple[Card, ...],
        oop_weights: dict[str, float],
        ip_weights: dict[str, float],
        pot: float,
        effective_stack: float,
        bet_small: float,
        bet_large: float,
        evaluator: Callable[
            [tuple[Card, Card], tuple[Card, Card], tuple[Card, ...]], float
        ] = showdown,
    ) -> None:
        if len(board) != 5 or len(set(board)) != 5:
            raise ValueError("River solver requires five unique board cards")
        if pot <= 0 or effective_stack <= 0:
            raise ValueError("Pot and effective stack must be positive")
        if not 0 < bet_small < bet_large:
            raise ValueError("Solver bet sizes must be positive and strictly ordered")
        self.board = board
        self.pot = pot
        self.evaluator = evaluator
        small_amount = min(effective_stack, pot * bet_small)
        large_amount = min(effective_stack, pot * bet_large)
        if math.isclose(small_amount, large_amount):
            raise ValueError("Effective stack collapses the two solver bet sizes")
        self.bet_sizes = {"bet_small": small_amount, "bet_large": large_amount}
        oop_combos = expand_weighted_range(oop_weights, board)
        ip_combos = expand_weighted_range(ip_weights, board)
        self.deals = tuple(
            RiverDeal(oop, ip, oop.weight * ip.weight)
            for oop in oop_combos
            for ip in ip_combos
            if not set(oop.cards).intersection(ip.cards)
        )
        if not self.deals:
            raise ValueError("Solver ranges have no blocker-compatible combo pairs")
        mass = sum(deal.chance_weight for deal in self.deals)
        self.deals = tuple(
            RiverDeal(deal.oop, deal.ip, deal.chance_weight / mass) for deal in self.deals
        )
        self.information_sets: dict[str, InformationSet] = {}

    @staticmethod
    def _player(history: tuple[str, ...]) -> int:
        if not history:
            return 0
        if history == ("check",):
            return 1
        if history[0].startswith("bet") and len(history) == 1:
            return 1
        if len(history) == 2 and history[0] == "check" and history[1].startswith("bet"):
            return 0
        raise ValueError(f"No actor for terminal history {history}")

    @staticmethod
    def _actions(history: tuple[str, ...]) -> tuple[str, ...]:
        if not history or history == ("check",):
            return ("check", "bet_small", "bet_large")
        return ("fold", "call")

    @staticmethod
    def _terminal(history: tuple[str, ...]) -> bool:
        return history in {
            ("check", "check"),
            ("bet_small", "fold"),
            ("bet_small", "call"),
            ("bet_large", "fold"),
            ("bet_large", "call"),
            ("check", "bet_small", "fold"),
            ("check", "bet_small", "call"),
            ("check", "bet_large", "fold"),
            ("check", "bet_large", "call"),
        }

    def _oop_terminal_utility(self, deal: RiverDeal, history: tuple[str, ...]) -> float:
        if history == ("check", "check"):
            stake = self.pot / 2
            outcome = self.evaluator(deal.oop.cards, deal.ip.cards, self.board)
            return (outcome * 2 - 1) * stake
        bet_action = next(action for action in history if action.startswith("bet"))
        bet = self.bet_sizes[bet_action]
        bettor = 0 if history[0].startswith("bet") else 1
        response = history[-1]
        if response == "fold":
            return self.pot / 2 if bettor == 0 else -self.pot / 2
        outcome = self.evaluator(deal.oop.cards, deal.ip.cards, self.board)
        return (outcome * 2 - 1) * (self.pot / 2 + bet)

    @staticmethod
    def _private_key(cards: tuple[Card, Card]) -> str:
        return "".join(sorted(str(card) for card in cards))

    def _cfr(
        self,
        deal: RiverDeal,
        history: tuple[str, ...],
        p0: float,
        p1: float,
    ) -> float:
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

    def _root_strategy(self) -> dict[str, dict[str, float | int | dict[str, float]]]:
        aggregate: dict[str, list[list[float]]] = {}
        combo_counts: dict[str, set[str]] = {}
        for key, node in self.information_sets.items():
            player, private, history = key.split("|", 2)
            if player != "0" or history:
                continue
            first, second = private[:2], private[2:]
            label = combo_class((Card.parse(first), Card.parse(second)))
            aggregate.setdefault(label, []).append(node.average_strategy())
            combo_counts.setdefault(label, set()).add(private)
        result: dict[str, dict[str, float | int | dict[str, float]]] = {}
        for label, strategies in aggregate.items():
            averaged = [sum(row[i] for row in strategies) / len(strategies) for i in range(3)]
            result[label] = {
                "combo_count": len(combo_counts[label]),
                "actions": dict(zip(("check", "bet_small", "bet_large"), averaged, strict=True)),
            }
        return result

    def solve(self, iterations: int) -> dict:
        started = time.perf_counter()
        convergence: list[dict[str, float | int]] = []
        checkpoint = max(10, iterations // 40)
        previous: dict[str, list[float]] = {}
        for iteration in range(1, iterations + 1):
            for deal in self.deals:
                self._cfr(deal, (), 1.0, 1.0)
            if iteration == iterations or iteration % checkpoint == 0:
                current = {
                    key: node.average_strategy() for key, node in self.information_sets.items()
                }
                if previous:
                    changes = [
                        abs(probability - previous[key][index])
                        for key, strategy in current.items()
                        if key in previous
                        for index, probability in enumerate(strategy)
                    ]
                    strategy_change = sum(changes) / max(1, len(changes))
                else:
                    strategy_change = 1.0
                positive_regret = sum(
                    sum(max(0.0, regret) for regret in node.regret_sum)
                    for node in self.information_sets.values()
                )
                average_regret = positive_regret / (
                    iteration * max(1, len(self.information_sets)) * max(1.0, self.pot)
                )
                convergence.append(
                    {
                        "iteration": iteration,
                        "average_regret": average_regret,
                        "strategy_change": strategy_change,
                    }
                )
                previous = current
        return {
            "iterations": iterations,
            "average_regret": convergence[-1]["average_regret"],
            "strategy_stability": 1 - min(1.0, convergence[-1]["strategy_change"]),
            "convergence": convergence,
            "strategy": self._root_strategy(),
            "valid_combo_pairs": len(self.deals),
            "information_sets": len(self.information_sets),
            "runtime_ms": (time.perf_counter() - started) * 1000,
            "tree": {
                "oop_root": ["check", "bet_small", "bet_large"],
                "ip_after_check": ["check", "bet_small", "bet_large"],
                "facing_bet": ["fold", "call"],
                "raises": False,
            },
            "disclaimer": "Educational approximate finite river solver; not a full GTO solver.",
        }


def verify_kuhn(iterations: int = 20_000) -> dict:
    result = KuhnPokerCFR().train(iterations)
    result["value_error"] = abs(result["game_value_player_0"] - result["known_value_player_0"])
    result["passed"] = result["value_error"] < 0.02 and math.isclose(
        sum(result["strategies"]["1"][action] for action in ("p", "b")), 1.0, abs_tol=1e-9
    )
    return result
