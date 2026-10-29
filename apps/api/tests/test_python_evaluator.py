"""Preserve full rank vectors and strict public boundaries while reusing validation."""

import random
from collections import Counter
from itertools import combinations, permutations

import pytest

from pokerlab_api import domain
from pokerlab_api import python_evaluator_benchmark as benchmark
from pokerlab_api.domain import Card, evaluate_five, evaluate_seven, full_deck, parse_cards
from pokerlab_api.engine import PythonPokerEngine
from pokerlab_api.python_evaluator_benchmark import ReferenceEngine, reference_five, reference_seven


def stable(result):
    return {key: value for key, value in result.items() if key != "runtime_ms"}


def test_every_physical_five_card_hand_matches_original_rank_and_category_counts():
    categories = Counter()
    for hand in combinations(full_deck(), 5):
        actual = evaluate_five(hand)
        assert actual == reference_five(hand)
        categories[int(actual[0])] += 1
    assert categories == {
        0: 1_302_540,
        1: 1_098_240,
        2: 123_552,
        3: 54_912,
        4: 10_200,
        5: 5_108,
        6: 3_744,
        7: 624,
        8: 40,
    }
    assert categories.total() == 2_598_960


def test_seeded_seven_card_ranks_match_original_with_suit_and_order_permutations():
    rng = random.Random(20261029)
    deck = full_deck()
    for _ in range(1000):
        hand = rng.sample(deck, 7)
        expected = reference_seven(hand)
        assert evaluate_seven(hand) == expected
        rng.shuffle(hand)
        suits = list("cdhs")
        rng.shuffle(suits)
        relabel = dict(zip("cdhs", suits, strict=True))
        assert evaluate_seven(Card(card.rank, relabel[card.suit]) for card in hand) == expected


def test_every_order_of_seven_card_kicker_case_matches_original():
    hand = parse_cards("Ah Ad Kh Kd Qh Qd Js".split())
    expected = reference_seven(hand)
    assert expected == (2, 14, 13, 12)
    for ordered in permutations(hand):
        assert evaluate_seven(ordered) == expected


@pytest.mark.parametrize("size,evaluate", [(5, evaluate_five), (7, evaluate_seven)])
@pytest.mark.parametrize("container", [tuple, list, iter])
def test_public_evaluators_reject_every_duplicate_position_before_ranking(
    size, evaluate, container, monkeypatch
):
    def unexpected_rank(_hand):
        pytest.fail("Invalid cards reached the trusted ranker")

    monkeypatch.setattr(domain, "_rank_five", unexpected_rank)
    original = full_deck()[:size]
    for first, second in combinations(range(size), 2):
        hand = list(original)
        hand[second] = hand[first]
        with pytest.raises(ValueError, match="unique cards"):
            evaluate(container(hand))


@pytest.mark.parametrize("size,evaluate", [(5, evaluate_five), (7, evaluate_seven)])
@pytest.mark.parametrize("container", [tuple, list, iter])
def test_public_evaluators_reject_wrong_lengths_before_ranking(
    size, evaluate, container, monkeypatch
):
    def unexpected_rank(_hand):
        pytest.fail("Wrong hand length reached the trusted ranker")

    monkeypatch.setattr(domain, "_rank_five", unexpected_rank)
    for count in range(10):
        if count != size:
            with pytest.raises(ValueError, match="unique cards"):
                evaluate(container(full_deck()[:count]))


@pytest.mark.parametrize(
    "size,evaluate,reference",
    [(5, evaluate_five, reference_five), (7, evaluate_seven, reference_seven)],
)
def test_validation_hashes_each_input_card_once(size, evaluate, reference, monkeypatch):
    original_hash = Card.__hash__
    hashes = 0

    def counted_hash(card):
        nonlocal hashes
        hashes += 1
        return original_hash(card)

    hand = full_deck()[:size]
    monkeypatch.setattr(Card, "__hash__", counted_hash)
    expected = reference(hand)
    assert hashes == (5 if size == 5 else 112)
    hashes = 0
    assert evaluate(iter(hand)) == expected
    assert hashes == size


def test_seven_card_evaluation_still_ranks_every_subset(monkeypatch):
    hand = parse_cards("As Ks Qs Js Ts 2d 3c".split())
    original_rank = domain._rank_five
    seen = []

    def record_rank(subset):
        seen.append(subset)
        return original_rank(subset)

    monkeypatch.setattr(domain, "_rank_five", record_rank)
    assert evaluate_seven(iter(hand)) == reference_seven(hand)
    assert seen == list(combinations(hand, 5))


@pytest.mark.parametrize("seed", [0, 7, 2**63 - 1])
@pytest.mark.parametrize("board_length", [0, 3, 4, 5])
def test_complete_python_monte_carlo_outputs_match_original(seed, board_length):
    dealt = tuple(random.Random(seed).sample(full_deck(), 9))
    hero, villain, board = dealt[:2], dealt[2:4], dealt[4 : 4 + board_length]
    expected = ReferenceEngine().monte_carlo(hero, villain, board, 257, seed)
    actual = PythonPokerEngine().monte_carlo(hero, villain, board, 257, seed)
    assert stable(actual) == stable(expected)


def test_exact_flop_and_conditional_turn_map_match_original():
    hero, villain, flop = (parse_cards(tokens.split()) for tokens in ("As Ks", "Qh Qd", "Js 8s 2c"))
    baseline, candidate = ReferenceEngine(), PythonPokerEngine()
    assert stable(candidate.exact_equity(hero, villain, flop)) == stable(
        baseline.exact_equity(hero, villain, flop)
    )
    assert candidate.turn_map(hero, villain, flop) == baseline.turn_map(hero, villain, flop)


def test_benchmark_checks_complete_results_and_reports_workload():
    result = benchmark.run(repeats=1, hand_count=7, samples=9)
    assert result["environment"]["engine"] == "Python reference"
    assert result["workload"]["alternating_order"] is True
    assert [row["benchmark"] for row in result["results"]] == [
        "five_card_batch",
        "seven_card_batch",
        "exact_flop",
        "monte_carlo",
        "turn_map",
    ]
    for row in result["results"]:
        assert row["reference_match"] is True
        assert len(row["result_sha256"]) == 64
        for variant in ("baseline", "candidate"):
            assert len(row["times_ms"][variant]) == 1
            assert row["median_ms"][variant] > 0


@pytest.mark.parametrize("field", ["evaluate_five", "evaluate_seven"])
def test_benchmark_rejects_changed_full_rank_vectors(field, monkeypatch):
    monkeypatch.setattr(benchmark, field, lambda _cards: (8, 14))
    with pytest.raises(RuntimeError, match="disagrees with the frozen reference"):
        benchmark.run(repeats=1, hand_count=7, samples=9)


def test_benchmark_rejects_changed_uncertainty_even_when_equity_matches(monkeypatch):
    original = PythonPokerEngine.monte_carlo

    def changed_interval(self, *args, **kwargs):
        result = original(self, *args, **kwargs)
        if type(self) is PythonPokerEngine:
            result["convergence"][0]["ci_low"] = -1
        return result

    monkeypatch.setattr(PythonPokerEngine, "monte_carlo", changed_interval)
    with pytest.raises(RuntimeError, match="monte_carlo: candidate disagrees"):
        benchmark.run(repeats=1, hand_count=7, samples=9)


@pytest.mark.parametrize(
    "parameters", [{"repeats": 0}, {"hand_count": True}, {"samples": 1.5}, {"seed": -1}]
)
def test_benchmark_rejects_invalid_controls(parameters):
    with pytest.raises(ValueError):
        benchmark.run(**parameters)
