from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest

from pokerlab_api import cfr_lookup_benchmark as benchmark
from pokerlab_api.cfr import RiverCFRSolver, RiverDeal
from pokerlab_api.domain import Card
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine

BOARD = tuple(map(Card.parse, "Ah Kd 7s 3c 2d".split()))


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize(
    "tokens,oop,ip,pot,stack,small,large",
    [
        ("Ah Kd 7s 3c 2d", {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1),
        ("Ah Kd 7s 3c 2d", {"AA": 0.3, "KQs": 0.8}, {"KK": 0.6, "QJs": 0.4}, 75.5, 60, 0.25, 1.5),
        ("As Ks Qs Js Ts", {"22": 1}, {"33": 1}, 20, 100, 0.1, 2),
    ],
)
def test_lookup_preserves_every_node_and_continued_training(
    engine_type, tokens, oop, ip, pot, stack, small, large
):
    args = (tuple(map(Card.parse, tokens.split())), oop, ip, pot, stack, small, large)
    evaluate = engine_type().showdown
    actual = RiverCFRSolver(*args, evaluate)
    reference = benchmark.StringLookupReference(*args, evaluate)
    for iterations in (1, 19, 37):
        assert benchmark.stable_state(actual, actual.solve(iterations)) == benchmark.stable_state(
            reference, reference.solve(iterations)
        )


def test_node_lookup_is_bounded_by_information_sets_not_visits_or_opponents():
    solver = RiverCFRSolver(BOARD, {"AQo": 0.4}, {"KQo": 0.7, "QQ": 0.2}, 100, 100, 0.5, 1)
    with patch.object(
        RiverCFRSolver, "_private_key", wraps=RiverCFRSolver._private_key
    ) as format_key:
        solver.solve(1)
        nodes = dict(solver._node_lookup)
        assert format_key.call_count == len(nodes) == len(solver.information_sets)
        assert len(nodes) < 6 * len(solver.deals)
        for (player, cards, history), node in nodes.items():
            key = f"{player}|{''.join(sorted(map(str, cards)))}|{'/'.join(history)}"
            assert node is solver.information_sets[key]
        # No opponent cards or chance weight in lookup identity; every visit
        # must still update this same node using its current reach and strategy.
        solver.solve(40)
        assert format_key.call_count == len(nodes)
        assert solver._node_lookup == nodes
        assert all(solver._node_lookup[key] is node for key, node in nodes.items())


def test_reversed_private_card_order_still_resolves_to_the_canonical_node():
    actual = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1)
    reference = benchmark.StringLookupReference(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1)
    deal = actual.deals[0]
    reverse = type(deal.oop)(tuple(reversed(deal.oop.cards)), deal.oop.hand_class, deal.oop.weight)
    reversed_deal = RiverDeal(reverse, deal.ip, deal.chance_weight)
    for current in (deal, reversed_deal, deal):
        assert actual._cfr(current, (), 1.0, 1.0) == reference._cfr(current, (), 1.0, 1.0)
        assert benchmark.stable_state(actual, {}) == benchmark.stable_state(reference, {})


def test_same_private_cards_at_different_seats_and_histories_remain_distinct():
    solver = RiverCFRSolver(BOARD, {"QQ": 1}, {"QQ": 1}, 100, 100, 0.5, 1)
    solver.solve(1)
    cards = solver.deals[0].oop.cards
    root = solver._node_lookup[(0, cards, ())]
    checked = solver._node_lookup[(1, cards, ("check",))]
    facing = solver._node_lookup[(0, cards, ("check", "bet_small"))]
    assert len({id(root), id(checked), id(facing)}) == 3
    assert root.actions == checked.actions == ("check", "bet_small", "bet_large")
    assert facing.actions == ("fold", "call")


def test_concurrent_jobs_have_separate_lookup_nodes_and_mutable_arrays():
    def execute(_):
        solver = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1)
        return solver, benchmark.stable_state(solver, solver.solve(20))

    with ThreadPoolExecutor(max_workers=2) as pool:
        (first, state_a), (second, state_b) = pool.map(execute, range(2))
    assert state_a == state_b
    assert first._node_lookup is not second._node_lookup
    for key, node in first._node_lookup.items():
        other = second._node_lookup[key]
        assert node is not other
        assert node.regret_sum is not other.regret_sum
        assert node.strategy_sum is not other.strategy_sum


def test_benchmark_reports_real_counts_and_checks_full_state(monkeypatch):
    monkeypatch.setattr(benchmark, "select_engine", PythonPokerEngine)
    result = benchmark.run(iterations=2, repeats=1)
    control, repeated = result["results"]
    assert control["private_key_formats"] == {"string": 366, "cached": 54}
    assert repeated["private_key_formats"] == {"string": 732, "cached": 54}
    for row in result["results"]:
        assert row["lookup_entries"] == {"string": 0, "cached": 54}
        assert len(row["validated_state_sha256"]) == 64
        assert all(len(times) == 1 and times[0] > 0 for times in row["times_ms"].values())
    assert result["method"]["timing_instrumented"] is False
    assert result["method"]["timing_includes_constructor"] is True


@pytest.mark.parametrize("field", ["iterations", "repeats"])
@pytest.mark.parametrize("value", [0, -1, True, 1.5])
def test_benchmark_rejects_invalid_sizes(field, value):
    with pytest.raises(ValueError, match="positive integers"):
        benchmark.run(**{field: value})


@pytest.mark.parametrize("fault", ["result", "hidden_node"])
@pytest.mark.parametrize("stage", ["warmup", "timed"])
def test_benchmark_rejects_mismatches_before_reporting_timings(monkeypatch, fault, stage):
    original = benchmark.StringLookupReference.solve
    calls = 0

    def broken(self, iterations):
        nonlocal calls
        calls += 1
        result = original(self, iterations)
        if stage == "timed" and calls == 1:
            return result
        if fault == "result":
            result["average_regret"] += 0.1
        else:
            next(iter(self.information_sets.values())).regret_sum[0] += 0.1
        return result

    monkeypatch.setattr(benchmark.StringLookupReference, "solve", broken)
    with pytest.raises(RuntimeError, match="information-set state"):
        benchmark.run(iterations=1, repeats=1)
