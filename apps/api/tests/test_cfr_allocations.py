from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pokerlab_api import cfr
from pokerlab_api import cfr_allocation_benchmark as benchmark
from pokerlab_api.cfr import InformationSet, KuhnPokerCFR, RiverCFRSolver
from pokerlab_api.domain import Card
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine
from pokerlab_api.main import app, current_engine

BOARD = tuple(map(Card.parse, "Ah Kd 7s 3c 2d".split()))


@pytest.mark.parametrize("iterations", [1, 2, 37, 500])
def test_kuhn_preserves_every_node_and_full_result(iterations):
    actual, reference = KuhnPokerCFR(), benchmark.EagerKuhnReference()
    assert benchmark.stable_state(actual, actual.train(iterations)) == benchmark.stable_state(
        reference, reference.train(iterations)
    )
    # Continued training must keep existing accumulated regrets and averages.
    assert benchmark.stable_state(actual, actual.train(10)) == benchmark.stable_state(
        reference, reference.train(10)
    )


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize("iterations", [1, 19, 100])
@pytest.mark.parametrize(
    ("board_tokens", "oop", "ip", "pot", "stack", "small", "large"),
    [
        ("Ah Kd 7s 3c 2d", {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1),
        ("Ah Kd 7s 3c 2d", {"AA": 0.3, "KQs": 0.8}, {"KK": 0.6, "QJs": 0.4}, 75.5, 60, 0.25, 1.5),
        ("As Ks Qs Js Ts", {"22": 1}, {"33": 1}, 20, 100, 0.1, 2),
    ],
)
def test_river_preserves_all_nodes_regrets_and_convergence(
    engine_type, iterations, board_tokens, oop, ip, pot, stack, small, large
):
    board = tuple(map(Card.parse, board_tokens.split()))
    args = (board, oop, ip, pot, stack, small, large, engine_type().showdown)
    actual, reference = RiverCFRSolver(*args), benchmark.EagerRiverReference(*args)
    assert benchmark.stable_state(actual, actual.solve(iterations)) == benchmark.stable_state(
        reference, reference.solve(iterations)
    )
    assert benchmark.stable_state(actual, actual.solve(10)) == benchmark.stable_state(
        reference, reference.solve(10)
    )


@pytest.mark.parametrize("game", ["kuhn", "river"])
def test_only_one_allocation_per_information_set_even_when_training_continues(game, monkeypatch):
    constructor = Mock(wraps=InformationSet)
    monkeypatch.setattr(cfr, "InformationSet", constructor)
    if game == "kuhn":
        solver = KuhnPokerCFR()
        train = solver.train
    else:
        solver = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1)
        train = solver.solve
    train(1)
    nodes = dict(solver.information_sets)
    assert constructor.call_count == len(nodes)
    train(40)
    assert constructor.call_count == len(nodes)
    assert all(solver.information_sets[key] is node for key, node in nodes.items())
    assert len({id(node.regret_sum) for node in nodes.values()}) == len(nodes)
    assert len({id(node.strategy_sum) for node in nodes.values()}) == len(nodes)


@pytest.mark.parametrize("game", ["kuhn", "river"])
def test_concurrent_jobs_do_not_share_mutable_information_sets(game):
    def execute(_):
        if game == "kuhn":
            solver = KuhnPokerCFR()
            result = solver.train(20)
        else:
            solver = RiverCFRSolver(BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1)
            result = solver.solve(20)
        return solver, benchmark.stable_state(solver, result)

    with ThreadPoolExecutor(max_workers=2) as pool:
        (first, first_state), (second, second_state) = pool.map(execute, range(2))
    assert first_state == second_state
    for key, node in first.information_sets.items():
        other = second.information_sets[key]
        assert node is not other
        assert node.regret_sum is not other.regret_sum
        assert node.strategy_sum is not other.strategy_sum


def test_benchmark_reports_actual_allocations_and_uninstrumented_timings(monkeypatch):
    monkeypatch.setattr(benchmark, "select_engine", PythonPokerEngine)
    result = benchmark.run(kuhn_iterations=2, river_iterations=2, repeats=1)
    kuhn, river = result["results"]
    assert kuhn["information_set_constructions"] == {"eager": 48, "lazy": 12}
    assert river["information_set_constructions"] == {"eager": 732, "lazy": 54}
    for row in result["results"]:
        assert row["retained_information_sets"] == row["information_set_constructions"]["lazy"]
        assert len(row["validated_state_sha256"]) == 64
        assert set(row["times_ms"]) == {"eager", "lazy"}
        assert all(len(times) == 1 and times[0] > 0 for times in row["times_ms"].values())
    assert result["method"]["timing_instrumented"] is False
    assert cfr.InformationSet is benchmark.InformationSet is InformationSet


@pytest.mark.parametrize("field", ["kuhn_iterations", "river_iterations", "repeats"])
@pytest.mark.parametrize("value", [0, -1, True, 1.5])
def test_benchmark_rejects_invalid_workload_sizes(field, value):
    with pytest.raises(ValueError, match="positive integers"):
        benchmark.run(**{field: value})


@pytest.mark.parametrize("fault", ["result", "hidden_node"])
@pytest.mark.parametrize("stage", ["warmup", "timed"])
def test_benchmark_fails_on_any_math_or_hidden_node_mismatch(monkeypatch, fault, stage):
    original = benchmark.EagerKuhnReference.train
    calls = 0

    def broken(self, iterations):
        nonlocal calls
        calls += 1
        result = original(self, iterations)
        if stage == "timed" and calls == 1:
            return result
        if fault == "result":
            result["game_value_player_0"] += 0.1
        else:
            self.information_sets["1"].regret_sum[0] += 0.1
        return result

    monkeypatch.setattr(benchmark.EagerKuhnReference, "train", broken)
    with pytest.raises(RuntimeError, match="information-set state"):
        benchmark.run(kuhn_iterations=1, river_iterations=1, repeats=1)
    assert cfr.InformationSet is benchmark.InformationSet is InformationSet


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_solver_api_persists_exact_reference_output(storage_db, monkeypatch, engine_type):
    engine = engine_type()
    monkeypatch.setitem(app.dependency_overrides, current_engine, lambda: engine)
    payload = {
        "board": [str(card) for card in BOARD],
        "oop_range": {"AQo": 1},
        "ip_range": {"KQo": 1},
        "pot": 100,
        "effective_stack": 100,
        "bet_small": 0.5,
        "bet_large": 1,
        "iterations": 100,
    }
    expected = benchmark.EagerRiverReference(
        BOARD, {"AQo": 1}, {"KQo": 1}, 100, 100, 0.5, 1, engine.showdown
    ).solve(100)
    expected.pop("runtime_ms")
    expected["engine"] = engine.name
    with TestClient(app) as client:
        response = client.post("/solver/jobs", json=payload)
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "completed"
        assert {
            k: v for k, v in result.items() if k not in {"id", "status", "runtime_ms"}
        } == expected
    # A new application lifespan/session reads the durable job, not in-memory nodes.
    with TestClient(app) as client:
        response = client.get(f"/solver/jobs/{result['id']}")
        assert response.status_code == 200
        stored = response.json()
        assert stored["status"] == "completed"
        assert stored["parameters"] == payload
        assert {k: v for k, v in stored["results"].items() if k != "runtime_ms"} == expected
