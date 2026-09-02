"""Hold'em starting-hand classes, physical combos, weights, and blockers."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from itertools import combinations

from .domain import RANK_CHARS, RANK_VALUE, SUIT_CHARS, Card


@dataclass(frozen=True, slots=True)
class WeightedCombo:
    cards: tuple[Card, Card]
    hand_class: str
    weight: float


def normalize_hand_class(label: str) -> str:
    text = label.strip().upper()
    if len(text) == 2 and text[0] == text[1] and text[0] in RANK_CHARS:
        return text
    if len(text) != 3 or text[0] not in RANK_CHARS or text[1] not in RANK_CHARS:
        raise ValueError(f"Invalid hand class {label!r}")
    if text[0] == text[1] or text[2].lower() not in {"s", "o"}:
        raise ValueError(f"Invalid hand class {label!r}")
    first, second = sorted((text[0], text[1]), key=RANK_CHARS.index, reverse=True)
    return f"{first}{second}{text[2].lower()}"


def expand_hand_class(label: str) -> tuple[tuple[Card, Card], ...]:
    normalized = normalize_hand_class(label)
    first, second = RANK_VALUE[normalized[0]], RANK_VALUE[normalized[1]]
    if len(normalized) == 2:
        return tuple((Card(first, a), Card(first, b)) for a, b in combinations(SUIT_CHARS, 2))
    if normalized[2] == "s":
        return tuple((Card(first, suit), Card(second, suit)) for suit in SUIT_CHARS)
    return tuple(
        (Card(first, first_suit), Card(second, second_suit))
        for first_suit in SUIT_CHARS
        for second_suit in SUIT_CHARS
        if first_suit != second_suit
    )


def combo_class(cards: tuple[Card, Card]) -> str:
    first, second = sorted(cards, key=lambda card: card.rank, reverse=True)
    rank_a, rank_b = RANK_CHARS[first.rank - 2], RANK_CHARS[second.rank - 2]
    if first.rank == second.rank:
        return f"{rank_a}{rank_b}"
    return f"{rank_a}{rank_b}{'s' if first.suit == second.suit else 'o'}"


def expand_weighted_range(
    weights: Mapping[str, float], blocked: Iterable[Card] = ()
) -> tuple[WeightedCombo, ...]:
    blocked_set = set(blocked)
    combos: list[WeightedCombo] = []
    for label, raw_weight in weights.items():
        weight = float(raw_weight)
        if not 0 <= weight <= 1:
            raise ValueError("Range weights must be between 0 and 1")
        if weight == 0:
            continue
        normalized = normalize_hand_class(label)
        combos.extend(
            WeightedCombo(cards, normalized, weight)
            for cards in expand_hand_class(normalized)
            if not blocked_set.intersection(cards)
        )
    return tuple(combos)


def range_statistics(
    weights: Mapping[str, float], blocked: Iterable[Card] = ()
) -> dict[str, float | int]:
    all_combos = expand_weighted_range(weights)
    available = expand_weighted_range(weights, blocked)
    return {
        "hand_classes": sum(1 for weight in weights.values() if weight > 0),
        "physical_combos": len(all_combos),
        "range_percent": 100 * len(all_combos) / 1326,
        "blocker_adjusted_combos": len(available),
        "weighted_combos": sum(combo.weight for combo in available),
    }
