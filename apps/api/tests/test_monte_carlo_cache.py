import random
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pokerlab_api.domain import Card, full_deck
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine
from pokerlab_api.main import app, current_engine
from pokerlab_api.monte_carlo_benchmark import (
    CountingEngine,
    run,
    stable_result,
    uncached_monte_carlo,
)

HERO = tuple(map(Card.parse, ("As", "Ks")))
VILLAIN = tuple(map(Card.parse, ("Qh", "Qd")))
BOARD = tuple(map(Card.parse, ("Js", "8s", "2c", "3d", "4h")))


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize("size", [0, 3, 4, 5])
@pytest.mark.parametrize("seed", [0, 7, 2**63 - 1])
@pytest.mark.parametrize("samples", [1, 2, 257])
def test_complete_seeded_results_match_the_original_loop(engine_type, size, seed, samples):
    engine = engine_type()
    board = BOARD[:size]
    expected = uncached_monte_carlo(engine, HERO, VILLAIN, board, samples, seed)
    actual = engine.monte_carlo(HERO, VILLAIN, board, samples, seed)
    assert stable_result(actual) == stable_result(expected)


@pytest.mark.parametrize("size,bound", [(3, 990), (4, 44), (5, 1)])
def test_every_draw_is_preserved_but_each_unique_runout_is_evaluated_once(size, bound):
    board, samples, seed = BOARD[:size], 10_000, 7
    known = set(HERO + VILLAIN + board)
    remaining = tuple(card for card in full_deck() if card not in known)
    rng = random.Random(seed)
    expected_draws = [tuple(rng.sample(remaining, 5 - size)) for _ in range(samples)]
    first_seen = {}
    for draw in expected_draws:
        first_seen.setdefault(frozenset(draw), board + draw)

    class RecordingRandom(random.Random):
        draws = []

        def sample(self, population, k):
            draw = super().sample(population, k)
            self.draws.append(tuple(draw))
            return draw

    engine = RustPokerEngine()
    with (
        patch("pokerlab_api.engine.random.Random", RecordingRandom),
        patch.object(engine, "showdown", wraps=engine.showdown) as evaluate,
    ):
        result = engine.monte_carlo(HERO, VILLAIN, board, samples, seed)
    assert RecordingRandom.draws == expected_draws
    assert [call.args[2] for call in evaluate.call_args_list] == list(first_seen.values())
    assert evaluate.call_count == len(first_seen) <= bound
    assert result["samples"] == samples
    assert result["convergence"][-1]["samples"] == samples


@pytest.mark.parametrize("outcome", [0.0, 0.5, 1.0])
def test_reversed_and_repeated_runouts_reuse_all_outcomes_without_deduplicating_trials(outcome):
    draws = [(BOARD[3], BOARD[4]), (BOARD[4], BOARD[3])] * 3
    engine = PythonPokerEngine()
    with (
        patch("pokerlab_api.engine.random.Random.sample", side_effect=draws) as sample,
        patch.object(engine, "showdown", return_value=outcome) as evaluate,
    ):
        result = engine.monte_carlo(HERO, VILLAIN, BOARD[:3], len(draws), 7)
    assert sample.call_count == len(draws)
    assert evaluate.call_count == 1
    assert result["equity"] == outcome
    assert result["samples"] == len(draws)
    assert result["standard_error"] == 0
    assert result["ci_low"] < result["ci_high"]


def test_preflop_is_not_cached_even_when_a_runout_repeats():
    engine = CountingEngine(PythonPokerEngine())
    with patch("pokerlab_api.engine.random.Random.sample", return_value=list(BOARD)):
        engine.monte_carlo(HERO, VILLAIN, (), 5, 7)
    assert engine.evaluations == 5


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_cache_is_request_local_and_does_not_leak_across_hands(engine_type):
    engine = engine_type()
    with patch.object(engine, "showdown", wraps=engine.showdown) as evaluate:
        first = engine.monte_carlo(HERO, VILLAIN, BOARD, 5, 7)
        second = engine.monte_carlo(VILLAIN, HERO, BOARD, 5, 7)
        repeated = engine.monte_carlo(HERO, VILLAIN, BOARD, 5, 7)
    assert evaluate.call_count == 3
    assert first["equity"] + second["equity"] == 1
    assert stable_result(first) == stable_result(repeated)


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_real_split_pots_preserve_half_win_scores_and_uncertainty(engine_type):
    engine = CountingEngine(engine_type())
    hero = tuple(map(Card.parse, ("2c", "3d")))
    villain = tuple(map(Card.parse, ("4c", "5d")))
    board = tuple(map(Card.parse, ("Ts", "Js", "Qs", "Ks", "As")))
    result = engine.monte_carlo(hero, villain, board, 100, 7)
    assert engine.evaluations == 1
    assert result["equity"] == 0.5
    assert result["tie"] == 1
    assert result["win"] == result["lose"] == 0
    assert result["ci_low"] < 0.5 < result["ci_high"]
    assert stable_result(result) == stable_result(
        uncached_monte_carlo(engine, hero, villain, board, 100, 7)
    )


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_concurrent_requests_on_the_shared_engine_remain_isolated(engine_type):
    engine = engine_type()
    inputs = [(HERO, VILLAIN, BOARD[:3], 257, 7), (VILLAIN, HERO, BOARD[:4], 257, 0)]
    expected = [stable_result(uncached_monte_carlo(engine, *args)) for args in inputs]
    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(lambda args: engine.monte_carlo(*args), inputs))
    assert list(map(stable_result, results)) == expected


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_duplicate_cards_are_rejected_before_a_cache_can_hide_them(engine_type):
    engine = engine_type()
    with patch.object(engine, "showdown") as evaluate:
        with pytest.raises(ValueError, match="Duplicate"):
            engine.monte_carlo(HERO, (HERO[0], VILLAIN[1]), BOARD, 100, 7)
    evaluate.assert_not_called()


@pytest.mark.parametrize("endpoint", ["/equity/monte-carlo", "/research/monte-carlo"])
@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_cached_api_results_and_exports_preserve_the_reference(storage_db, endpoint, engine_type):
    engine = engine_type()
    expected = stable_result(uncached_monte_carlo(engine, HERO, VILLAIN, BOARD[:4], 257, 2**63 - 1))
    app.dependency_overrides[current_engine] = lambda: engine
    try:
        with TestClient(app) as client:
            response = client.post(
                endpoint,
                json={
                    "hero": list(map(str, HERO)),
                    "villain": list(map(str, VILLAIN)),
                    "board": list(map(str, BOARD[:4])),
                    "samples": 257,
                    "seed": 2**63 - 1,
                },
            )
            assert response.status_code == 200
            result = response.json()
            record_id = result.pop("experiment_id")
            assert stable_result(result) == expected
            exported = client.get(f"/experiments/{record_id}/export").json()
            assert exported["results"] == result
            assert exported["seed"] == 2**63 - 1
    finally:
        app.dependency_overrides.pop(current_engine, None)


def test_benchmark_reports_measured_calls_and_checks_complete_outputs():
    with patch(
        "pokerlab_api.monte_carlo_benchmark.CountingEngine", wraps=CountingEngine
    ) as counter:
        result = run(repeats=1, samples=9, seed=7)
    # Only one counted warmup per variant, never a counted timed repeat.
    assert counter.call_count == 2 * len(result["results"])
    assert result["workload"]["fresh_request_cache_per_run"] is True
    assert result["workload"]["evaluation_counts_from_warmup_only"] is True
    assert {row["engine"] for row in result["results"]} == {
        "Python reference",
        "Rust accelerated",
    }
    for row in result["results"]:
        assert row["complete_result_match"] is True
        assert len(row["result_sha256"]) == 64
        assert row["showdown_evaluations"]["uncached"] == 9
        if row["stage"] == "river":
            assert row["showdown_evaluations"]["request_cache"] == 1
        assert all(len(times) == 1 for times in row["times_ms"].values())


def test_benchmark_fails_when_a_complete_result_changes():
    original = PythonPokerEngine.monte_carlo

    def corrupt(self, *args):
        result = original(self, *args)
        result["convergence"][0]["ci_low"] = -1
        return result

    with patch.object(PythonPokerEngine, "monte_carlo", corrupt):
        with pytest.raises(RuntimeError, match="differs from the uncached reference"):
            run(repeats=1, samples=2)


def test_benchmark_does_not_label_python_fallback_as_rust():
    with patch(
        "pokerlab_api.monte_carlo_benchmark.select_engine", return_value=PythonPokerEngine()
    ):
        result = run(repeats=1, samples=1)
    assert len(result["results"]) == 4
    assert {row["engine"] for row in result["results"]} == {"Python reference"}


@pytest.mark.parametrize(
    "parameters",
    [
        {"repeats": 0},
        {"repeats": 21},
        {"repeats": True},
        {"samples": 0},
        {"samples": 1.5},
        {"samples": 500001},
        {"seed": -1},
        {"seed": 2**63},
        {"seed": True},
    ],
)
def test_benchmark_rejects_invalid_workloads(parameters):
    with pytest.raises(ValueError, match="must be an integer"):
        run(**parameters)
