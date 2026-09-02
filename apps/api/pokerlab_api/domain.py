"""Canonical cards and the production reference Hold'em evaluator."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from enum import IntEnum
from itertools import combinations

RANK_CHARS = "23456789TJQKA"
SUIT_CHARS = "cdhs"
RANK_VALUE = {rank: value for value, rank in enumerate(RANK_CHARS, start=2)}


class HandCategory(IntEnum):
    HIGH_CARD = 0
    PAIR = 1
    TWO_PAIR = 2
    THREE_OF_A_KIND = 3
    STRAIGHT = 4
    FLUSH = 5
    FULL_HOUSE = 6
    FOUR_OF_A_KIND = 7
    STRAIGHT_FLUSH = 8


@dataclass(frozen=True, order=True, slots=True)
class Card:
    rank: int
    suit: str

    def __post_init__(self) -> None:
        if self.rank not in range(2, 15) or self.suit not in SUIT_CHARS:
            raise ValueError("Invalid card")

    @classmethod
    def parse(cls, token: str) -> Card:
        normalized = token.strip()
        if len(normalized) != 2:
            raise ValueError(f"Card must use two-character notation, received {token!r}")
        rank, suit = normalized[0].upper(), normalized[1].lower()
        if rank not in RANK_VALUE or suit not in SUIT_CHARS:
            raise ValueError(f"Unknown card {token!r}; use rank 2-A and suit c/d/h/s")
        return cls(RANK_VALUE[rank], suit)

    def __str__(self) -> str:
        return f"{RANK_CHARS[self.rank - 2]}{self.suit}"


HandRank = tuple[int, ...]


def full_deck() -> tuple[Card, ...]:
    return tuple(Card(rank, suit) for rank in range(2, 15) for suit in SUIT_CHARS)


def parse_cards(tokens: Iterable[str]) -> tuple[Card, ...]:
    cards = tuple(Card.parse(token) for token in tokens)
    if len(set(cards)) != len(cards):
        raise ValueError("Duplicate cards are not permitted")
    return cards


def validate_holdem_state(
    hero: Iterable[Card], villain: Iterable[Card], board: Iterable[Card]
) -> None:
    hero_cards, villain_cards, board_cards = tuple(hero), tuple(villain), tuple(board)
    if len(hero_cards) != 2 or len(villain_cards) != 2:
        raise ValueError("Hero and villain must each have exactly two cards")
    if len(board_cards) not in {0, 3, 4, 5}:
        raise ValueError("Board must contain 0, 3, 4, or 5 cards")
    all_cards = hero_cards + villain_cards + board_cards
    if len(set(all_cards)) != len(all_cards):
        raise ValueError("Duplicate cards are not permitted")


def _straight_high(ranks: Iterable[int]) -> int | None:
    unique = set(ranks)
    if 14 in unique:
        unique.add(1)
    ordered = sorted(unique)
    run = 1
    best: int | None = None
    for previous, current in zip(ordered, ordered[1:], strict=False):
        if current == previous + 1:
            run += 1
            if run >= 5:
                best = current
        else:
            run = 1
    return best


def evaluate_five(cards: Iterable[Card]) -> HandRank:
    hand = tuple(cards)
    if len(hand) != 5 or len(set(hand)) != 5:
        raise ValueError("A five-card hand must contain five unique cards")
    ranks = [card.rank for card in hand]
    counts = Counter(ranks)
    grouped = sorted(((count, rank) for rank, count in counts.items()), reverse=True)
    flush = len({card.suit for card in hand}) == 1
    straight_high = _straight_high(ranks)

    if flush and straight_high is not None:
        return (HandCategory.STRAIGHT_FLUSH, straight_high)
    if grouped[0][0] == 4:
        quad = grouped[0][1]
        kicker = max(rank for rank in ranks if rank != quad)
        return (HandCategory.FOUR_OF_A_KIND, quad, kicker)
    if grouped[0][0] == 3 and grouped[1][0] == 2:
        return (HandCategory.FULL_HOUSE, grouped[0][1], grouped[1][1])
    if flush:
        return (HandCategory.FLUSH, *sorted(ranks, reverse=True))
    if straight_high is not None:
        return (HandCategory.STRAIGHT, straight_high)
    if grouped[0][0] == 3:
        trips = grouped[0][1]
        kickers = sorted((rank for rank in ranks if rank != trips), reverse=True)
        return (HandCategory.THREE_OF_A_KIND, trips, *kickers)
    pairs = sorted((rank for rank, count in counts.items() if count == 2), reverse=True)
    if len(pairs) == 2:
        kicker = max(rank for rank in ranks if rank not in pairs)
        return (HandCategory.TWO_PAIR, pairs[0], pairs[1], kicker)
    if len(pairs) == 1:
        pair = pairs[0]
        kickers = sorted((rank for rank in ranks if rank != pair), reverse=True)
        return (HandCategory.PAIR, pair, *kickers)
    return (HandCategory.HIGH_CARD, *sorted(ranks, reverse=True))


def evaluate_seven(cards: Iterable[Card]) -> HandRank:
    hand = tuple(cards)
    if len(hand) != 7 or len(set(hand)) != 7:
        raise ValueError("A seven-card hand must contain seven unique cards")
    return max(evaluate_five(combo) for combo in combinations(hand, 5))


def showdown(hero: tuple[Card, Card], villain: tuple[Card, Card], board: tuple[Card, ...]) -> float:
    if len(board) != 5:
        raise ValueError("Showdown requires a five-card board")
    hero_rank = evaluate_seven(hero + board)
    villain_rank = evaluate_seven(villain + board)
    if hero_rank > villain_rank:
        return 1.0
    if hero_rank == villain_rank:
        return 0.5
    return 0.0
